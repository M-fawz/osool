import { db } from '@/lib/db'
import { attachDocuments, resolveDocumentChecklist } from '@/lib/rules/documents'
import {
  isEnabled,
  numberParam,
  severityOf,
  type Detector,
  type DetectorContext,
  type SignalCandidate,
} from './types'

/**
 * The detectors.
 *
 * Each one asks the register a question that a paper file cannot be asked, and
 * returns facts. None of them concludes anything: 00-VISION §7 principle 8 —
 * "Signals inform humans; they never decide" — and CLAUDE.md rule 8 says the
 * same. The wording of every summary below is written to that: it states what
 * was observed and stops.
 *
 * They are ordered as 00-VISION §5 orders them, and each names the signal
 * number it implements so the two can be read side by side.
 *
 * Every detector is *incremental* where it can be: it looks at recent or
 * currently-interesting rows rather than the whole register, because these run
 * on a schedule and a detector that gets slower as the register grows is one
 * that will eventually be switched off.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Against the process — 00-VISION §5 signals 11–18
// ═══════════════════════════════════════════════════════════════════════════

/** Signal 11 — approved while mandatory documents were absent. */
const approvedWithDocumentsMissing: Detector = {
  key: 'APPROVED_WITH_DOCUMENTS_MISSING',
  looksFor:
    'An application that reached APPROVED while a document the DOC_CHECKLIST marks required was not on file.',
  async run(context) {
    if (!isEnabled(context, this.key)) return []

    const decided = await db.application.findMany({
      where: {
        status: { in: ['APPROVED', 'AWAITING_PAYMENT', 'CARD_ISSUED', 'ACTIVE'] },
        decidedAt: { not: null },
        archivedAt: null,
      },
      select: {
        id: true,
        applicantCapacity: true,
        submittedAt: true,
        decidedAt: true,
        entityData: { select: { establishmentType: true } },
        documents: {
          where: { archivedAt: null, kind: 'APPLICANT_UPLOAD' },
          include: { supersededBy: { select: { id: true } } },
        },
      },
      orderBy: { decidedAt: 'desc' },
      take: 500,
    })

    const found: SignalCandidate[] = []

    for (const application of decided) {
      // Judged against the checklist as it stood when the file was submitted,
      // not today's. A decree that added a document in October must not make
      // every March approval look irregular.
      const checklist = await resolveDocumentChecklist(
        {
          establishmentType: application.entityData?.establishmentType ?? 'NATURAL_PERSON',
          capacity: application.applicantCapacity,
        },
        { asOf: application.submittedAt ?? context.now },
      )

      const withDocuments = attachDocuments(checklist, application.documents)
      const missing = withDocuments.filter((item) => item.required && !item.document)

      if (missing.length === 0) continue

      found.push({
        signalType: this.key,
        family: 'PROCESS_INTEGRITY',
        severity: severityOf(context, this.key),
        applicationId: application.id,
        evidence: {
          missingCount: missing.length,
          missingKeys: missing.map((m) => m.key),
          decidedAt: application.decidedAt?.toISOString() ?? null,
          checklistVersion: checklist.ruleSetVersion,
        },
        summaryAr: `تمت الموافقة على هذا الطلب بينما ${missing.length} من المستندات المقررة غير مرفوعة على الملف.`,
        summaryEn: `This application was approved while ${missing.length} document(s) the checklist marks as required were not on the file.`,
      })
    }

    return found
  },
}

/** Signal 12 — a decision faster than the file could have been read. */
const implausibleDecisionSpeed: Detector = {
  key: 'IMPLAUSIBLE_DECISION_SPEED',
  looksFor:
    'A decision recorded fewer than N minutes after the file arrived on the reviewer’s desk.',
  async run(context) {
    if (!isEnabled(context, this.key)) return []
    const minimumMinutes = numberParam(context, this.key, 'minimumReviewMinutes', 3)

    // The two events that bound the reading: arriving at review, and the
    // decision. Read from ApplicationEvent rather than from timestamps on the
    // application, because the application only remembers the latest of each.
    const decisions = await db.applicationEvent.findMany({
      where: { action: { in: ['approve', 'reject'] } },
      select: { applicationId: true, occurredAt: true, actorUserId: true, action: true },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    })

    const found: SignalCandidate[] = []

    for (const decision of decisions) {
      const arrival = await db.applicationEvent.findFirst({
        where: {
          applicationId: decision.applicationId,
          toState: 'UNDER_REVIEW',
          occurredAt: { lt: decision.occurredAt },
        },
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true },
      })

      if (!arrival) continue

      const minutes = (decision.occurredAt.getTime() - arrival.occurredAt.getTime()) / 60_000
      if (minutes >= minimumMinutes) continue

      found.push({
        signalType: this.key,
        family: 'PROCESS_INTEGRITY',
        severity: severityOf(context, this.key),
        applicationId: decision.applicationId,
        evidence: {
          minutesOnDesk: Number(minutes.toFixed(2)),
          parameterMinutes: minimumMinutes,
          decision: decision.action,
          arrivedAt: arrival.occurredAt.toISOString(),
          decidedAt: decision.occurredAt.toISOString(),
          // Named so an investigator knows whose file to open. Not an
          // accusation: a fast decision has innocent explanations, including a
          // reviewer who read the file yesterday and clicked today.
          actorUserId: decision.actorUserId,
        },
        summaryAr: `اتُخذ القرار بعد ${minutes.toFixed(1)} دقيقة من وصول الملف إلى المراجعة، وهي مدة أقل من الحد التشغيلي المقرر (${minimumMinutes} دقيقة).`,
        summaryEn: `The decision was recorded ${minutes.toFixed(1)} minute(s) after the file reached review, below the operational floor of ${minimumMinutes} minute(s).`,
      })
    }

    return found
  },
}

/** Signal 13 — the same examiner repeatedly assigned to the same applicant. */
const repeatedExaminerPairing: Detector = {
  key: 'REPEATED_EXAMINER_PAIRING',
  looksFor: 'One examiner assigned to the same firm’s applications N times or more.',
  async run(context) {
    if (!isEnabled(context, this.key)) return []
    const threshold = numberParam(context, this.key, 'pairingThreshold', 3)

    const pairings = await db.application.groupBy({
      by: ['examinerId', 'brokerEntityId'],
      where: { examinerId: { not: null }, archivedAt: null },
      _count: { _all: true },
      having: { examinerId: { _count: { gte: threshold } } },
    })

    const found: SignalCandidate[] = []

    for (const pairing of pairings) {
      if (!pairing.examinerId) continue

      const [examiner, entity] = await Promise.all([
        db.user.findUnique({ where: { id: pairing.examinerId }, select: { name: true, nameAr: true } }),
        db.brokerEntity.findUnique({
          where: { id: pairing.brokerEntityId },
          select: { tradeNameAr: true },
        }),
      ])

      found.push({
        signalType: this.key,
        family: 'PROCESS_INTEGRITY',
        severity: severityOf(context, this.key),
        subjectType: 'ExaminerFirmPairing',
        subjectId: `${pairing.examinerId}:${pairing.brokerEntityId}`,
        evidence: {
          examinerUserId: pairing.examinerId,
          examinerName: examiner?.nameAr ?? examiner?.name ?? null,
          brokerEntityId: pairing.brokerEntityId,
          firmName: entity?.tradeNameAr ?? null,
          applicationCount: pairing._count._all,
          parameterThreshold: threshold,
        },
        summaryAr: `أُحيلت ${pairing._count._all} من طلبات المنشأة نفسها إلى الفاحص نفسه. الإحالة تُسجَّل ولا تكون اختياراً ذاتياً، وتكرار الاقتران يستحق النظر.`,
        summaryEn: `${pairing._count._all} of this firm’s applications were assigned to the same examiner. Assignment is recorded rather than self-selected, and a repeated pairing is worth looking at.`,
      })
    }

    return found
  },
}

/** Signal 14 — an attempt to decide a file the officer examined. */
const segregationOfDutiesAttempt: Detector = {
  key: 'SEGREGATION_OF_DUTIES_ATTEMPT',
  looksFor:
    'A refusal recorded because the acting officer was the examiner of the file they tried to decide.',
  async run(context) {
    if (!isEnabled(context, this.key)) return []

    // The system refuses the act three times over — transition engine, CHECK
    // constraint, and the decision step itself. What none of those do is tell
    // anybody it happened, and an attempt is exactly what 00-VISION §5 signal
    // 14 asks to see.
    const attempts = await db.auditEvent.findMany({
      where: { action: 'SEGREGATION_OF_DUTIES_REFUSED' },
      select: { entityId: true, actorUserId: true, occurredAt: true },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    })

    return attempts
      .filter((attempt) => attempt.entityId !== null)
      .map((attempt) => ({
        signalType: this.key,
        family: 'PROCESS_INTEGRITY' as const,
        severity: severityOf(context, this.key),
        applicationId: attempt.entityId,
        evidence: {
          actorUserId: attempt.actorUserId,
          attemptedAt: attempt.occurredAt.toISOString(),
        },
        summaryAr:
          'حاول موظف اتخاذ قرار في طلب هو فاحصه. رفض النظام الإجراء ولم يُنفَّذ؛ هذه الإشارة تسجّل وقوع المحاولة فقط.',
        summaryEn:
          'An officer attempted to decide an application they examined. The system refused it and nothing was carried out; this signal records only that the attempt was made.',
      }))
  },
}

/** Signal 15 — rounds of completions, then approval with nothing new uploaded. */
const completionsThenSuddenApproval: Detector = {
  key: 'COMPLETIONS_THEN_SUDDEN_APPROVAL',
  looksFor:
    'An application with two or more completion rounds that was approved without a document being uploaded after the last round.',
  async run(context) {
    if (!isEnabled(context, this.key)) return []
    const minimumRounds = numberParam(context, this.key, 'minimumRounds', 2)

    const applications = await db.application.findMany({
      where: {
        status: { in: ['APPROVED', 'AWAITING_PAYMENT', 'CARD_ISSUED', 'ACTIVE'] },
        decidedAt: { not: null },
        archivedAt: null,
        completions: { some: {} },
      },
      select: {
        id: true,
        decidedAt: true,
        completions: { select: { round: true, requestedAt: true }, orderBy: { round: 'desc' } },
        documents: {
          where: { kind: 'APPLICANT_UPLOAD' },
          select: { uploadedAt: true },
          orderBy: { uploadedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { decidedAt: 'desc' },
      take: 300,
    })

    const found: SignalCandidate[] = []

    for (const application of applications) {
      const rounds = Math.max(...application.completions.map((c) => c.round))
      if (rounds < minimumRounds) continue

      const lastRequest = application.completions[0]?.requestedAt
      const lastUpload = application.documents[0]?.uploadedAt
      if (!lastRequest) continue

      // A document uploaded after the final round of completions is the
      // ordinary, innocent shape. Its absence is the shape worth reading.
      if (lastUpload && lastUpload.getTime() > lastRequest.getTime()) continue

      found.push({
        signalType: this.key,
        family: 'PROCESS_INTEGRITY',
        severity: severityOf(context, this.key),
        applicationId: application.id,
        evidence: {
          completionRounds: rounds,
          lastCompletionRequestedAt: lastRequest.toISOString(),
          lastDocumentUploadedAt: lastUpload?.toISOString() ?? null,
          decidedAt: application.decidedAt?.toISOString() ?? null,
          parameterMinimumRounds: minimumRounds,
        },
        summaryAr: `طُلبت ${rounds} جولات استيفاء على هذا الطلب، ثم صدرت الموافقة دون رفع أي مستند جديد بعد آخر جولة.`,
        summaryEn: `${rounds} rounds of completions were requested on this application, and it was then approved with no document uploaded after the last round.`,
      })
    }

    return found
  },
}

/** Signal 16 — completions with no basis in the documented requirements. */
const unfoundedCompletions: Detector = {
  key: 'UNFOUNDED_COMPLETIONS',
  looksFor:
    'A round of completions where most items cite no checklist requirement at all.',
  async run(context) {
    if (!isEnabled(context, this.key)) return []
    const proportion = numberParam(context, this.key, 'uncitedProportion', 0.5)
    const minimumItems = numberParam(context, this.key, 'minimumItems', 2)

    const grouped = await db.completion.groupBy({
      by: ['applicationId', 'round'],
      _count: { _all: true },
      having: { round: { _count: { gte: minimumItems } } },
    })

    const found: SignalCandidate[] = []

    for (const group of grouped) {
      const uncited = await db.completion.count({
        where: {
          applicationId: group.applicationId,
          round: group.round,
          checklistItemKey: null,
        },
      })

      const share = uncited / group._count._all
      if (share < proportion) continue

      found.push({
        signalType: this.key,
        family: 'PROCESS_INTEGRITY',
        severity: severityOf(context, this.key),
        applicationId: group.applicationId,
        subjectType: 'CompletionRound',
        subjectId: `${group.applicationId}:${group.round}`,
        evidence: {
          round: group.round,
          itemCount: group._count._all,
          uncitedCount: uncited,
          uncitedShare: Number(share.toFixed(2)),
          parameterProportion: proportion,
        },
        summaryAr: `في الجولة ${group.round}، ${uncited} من ${group._count._all} بنود الاستيفاء لا تشير إلى بند في قائمة المستندات المقررة. قد يكون ذلك مشروعاً، وقد يستحق النظر.`,
        summaryEn: `In round ${group.round}, ${uncited} of ${group._count._all} completion items cite no entry in the documented requirements list. That may be legitimate, and it may be worth a look.`,
      })
    }

    return found
  },
}

/** Signal 17 — a decision taken outside working hours. */
const outOfHoursDecision: Detector = {
  key: 'OUT_OF_HOURS_DECISION',
  looksFor: 'An approval or refusal recorded outside the Authority’s working hours.',
  async run(context) {
    if (!isEnabled(context, this.key)) return []

    const parameters = context.parameters.get(this.key) ?? {}
    const start = numberParam(context, this.key, 'workingHourStart', 8)
    const end = numberParam(context, this.key, 'workingHourEnd', 16)
    const timeZone = typeof parameters.timeZone === 'string' ? parameters.timeZone : 'Africa/Cairo'
    const weekend = Array.isArray(parameters.weekendDays) ? (parameters.weekendDays as number[]) : [5, 6]

    const decisions = await db.applicationEvent.findMany({
      where: { action: { in: ['approve', 'reject'] } },
      select: { applicationId: true, occurredAt: true, actorUserId: true },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    })

    const found: SignalCandidate[] = []

    for (const decision of decisions) {
      // Read in the Authority's own time zone, not the server's. A decision at
      // 09:00 in Cairo is 07:00 UTC, and a detector reading UTC hours would
      // flag an entire ordinary morning as out of hours.
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        weekday: 'short',
        hour12: false,
      }).formatToParts(decision.occurredAt)

      const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
      const weekdayName = parts.find((p) => p.type === 'weekday')?.value ?? ''
      const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName)

      const outsideHours = hour < start || hour >= end
      const onWeekend = weekend.includes(weekdayIndex)
      if (!outsideHours && !onWeekend) continue

      found.push({
        signalType: this.key,
        family: 'PROCESS_INTEGRITY',
        severity: severityOf(context, this.key),
        applicationId: decision.applicationId,
        evidence: {
          localHour: hour,
          localWeekday: weekdayName,
          timeZone,
          workingHours: `${start}:00–${end}:00`,
          actorUserId: decision.actorUserId,
          occurredAt: decision.occurredAt.toISOString(),
        },
        summaryAr: `سُجِّل القرار الساعة ${hour}:00 بتوقيت القاهرة يوم ${weekdayName}، خارج ساعات العمل المقررة (${start}:00–${end}:00). العمل خارج الدوام وارد ومشروع؛ الإشارة للعلم فقط.`,
        summaryEn: `The decision was recorded at ${hour}:00 Cairo time on ${weekdayName}, outside the recorded working hours of ${start}:00–${end}:00. Working outside hours is legitimate and common; this signal is for information.`,
      })
    }

    return found
  },
}

/** Signal 18 — a file held at one stage far longer than usual. */
const abnormalDwellTime: Detector = {
  key: 'ABNORMAL_DWELL_TIME',
  looksFor: 'An open application that has not moved for more than the configured number of days.',
  async run(context) {
    if (!isEnabled(context, this.key)) return []
    const dwellDays = numberParam(context, this.key, 'dwellDays', 30)
    const cutoff = new Date(context.now.getTime() - dwellDays * 86_400_000)

    const stalled = await db.application.findMany({
      where: {
        status: { in: ['SUBMITTED', 'UNDER_INTAKE', 'UNDER_EXAMINATION', 'UNDER_REVIEW', 'AWAITING_PAYMENT'] },
        updatedAt: { lt: cutoff },
        archivedAt: null,
      },
      select: { id: true, status: true, updatedAt: true, temporaryNumber: true },
      orderBy: { updatedAt: 'asc' },
      take: 300,
    })

    return stalled.map((application) => {
      const days = Math.floor((context.now.getTime() - application.updatedAt.getTime()) / 86_400_000)
      return {
        signalType: this.key,
        family: 'PROCESS_INTEGRITY' as const,
        severity: severityOf(context, this.key),
        applicationId: application.id,
        evidence: {
          status: application.status,
          days,
          parameterDwellDays: dwellDays,
          lastMovedAt: application.updatedAt.toISOString(),
        },
        summaryAr: `لم يتحرك هذا الطلب منذ ${days} يوماً وهو في حالة «${application.status}». الحد التشغيلي ${dwellDays} يوماً.`,
        summaryEn: `This application has not moved for ${days} days while at "${application.status}". The operational threshold is ${dwellDays} days.`,
      }
    })
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// Against the supervised population — 00-VISION §5 signals 1–10
// ═══════════════════════════════════════════════════════════════════════════

/** Signal 5 — a registration that has never carried a contract. */
const dormantRegistration: Detector = {
  key: 'DORMANT_REGISTRATION',
  looksFor: 'A registration older than the configured age with no brokerage contract against it.',
  async run(context) {
    if (!isEnabled(context, this.key)) return []
    const dormantAfterDays = numberParam(context, this.key, 'dormantAfterDays', 365)
    const cutoff = new Date(context.now.getTime() - dormantAfterDays * 86_400_000)

    const registrations = await db.registration.findMany({
      where: {
        status: { in: ['ACTIVE', 'RENEWAL_DUE'] },
        validFrom: { lt: cutoff },
        archivedAt: null,
        contracts: { none: {} },
      },
      select: { id: true, registrationNumber: true, validFrom: true, brokerEntityId: true },
      take: 300,
    })

    return registrations.map((registration) => {
      const days = Math.floor(
        (context.now.getTime() - registration.validFrom.getTime()) / 86_400_000,
      )
      return {
        signalType: this.key,
        family: 'SUPERVISED_POPULATION' as const,
        severity: severityOf(context, this.key),
        subjectType: 'Registration',
        subjectId: registration.id,
        evidence: {
          registrationNumber: registration.registrationNumber,
          brokerEntityId: registration.brokerEntityId,
          daysSinceRegistration: days,
          contractCount: 0,
          parameterDormantAfterDays: dormantAfterDays,
        },
        summaryAr: `قيد ساري منذ ${days} يوماً دون أي عقد وساطة مسجَّل. قد يكون النشاط متوقفاً، وقد يكون العقد لم يُقيَّد كما يوجب REQ-REG-063.`,
        summaryEn: `A registration active for ${days} days with no brokerage contract registered against it. Activity may simply have stopped, or contracts may not have been registered as REQ-REG-063 requires.`,
      }
    })
  },
}

/** Signal 6 — one national ID across an improbable number of firms. */
const identityReuseAcrossEntities: Detector = {
  key: 'IDENTITY_REUSE_ACROSS_ENTITIES',
  looksFor:
    'One national-ID fingerprint appearing as the applicant on applications from N or more distinct firms.',
  async run(context) {
    if (!isEnabled(context, this.key)) return []
    const threshold = numberParam(context, this.key, 'entityCountThreshold', 4)

    /*
     * Matched on the keyed fingerprint, never on a decrypted identifier.
     *
     * REQ-DPA-002 has national IDs encrypted at rest, and `piiFingerprint` is
     * exactly the mechanism that lets the register ask "is this the same
     * person?" without ever holding the answer in the clear. Decrypting a
     * column to run a supervisory query would undo the control the column
     * exists for.
     */
    const rows = await db.$queryRaw<Array<{ hash: string; firms: bigint }>>`
      SELECT p."nationalIdHash" AS hash,
             COUNT(DISTINCT a."brokerEntityId") AS firms
      FROM "party" p
      JOIN "application" a ON a."applicantPartyId" = p.id
      WHERE p."nationalIdHash" IS NOT NULL
        AND a."archivedAt" IS NULL
      GROUP BY p."nationalIdHash"
      HAVING COUNT(DISTINCT a."brokerEntityId") >= ${threshold}
      LIMIT 200
    `

    return rows.map((row) => ({
      signalType: this.key,
      family: 'SUPERVISED_POPULATION' as const,
      severity: severityOf(context, this.key),
      subjectType: 'PartyIdentity',
      // The fingerprint, not the identifier. This id ends up in a URL and on a
      // screen; the national ID must not.
      subjectId: row.hash,
      evidence: {
        distinctFirms: Number(row.firms),
        parameterThreshold: threshold,
        matchedOn: 'keyed national-ID fingerprint (the identifier itself is never read)',
      },
      summaryAr: `الشخص نفسه مقدِّم للطلب في ${Number(row.firms)} منشآت مختلفة. تعدد المنشآت مشروع، والعدد هنا يتجاوز الحد التشغيلي المقرر للفحص.`,
      summaryEn: `The same person is the applicant on applications from ${Number(row.firms)} distinct firms. Holding interests in several firms is lawful; this count is above the operational threshold set for review.`,
    }))
  },
}

/** Signal 7 — one power of attorney across unrelated applications. */
const powerOfAttorneyReuse: Detector = {
  key: 'POWER_OF_ATTORNEY_REUSE',
  looksFor:
    'One power of attorney (number + year + notarisation office) used on applications from several firms.',
  async run(context) {
    if (!isEnabled(context, this.key)) return []
    const threshold = numberParam(context, this.key, 'distinctFirmsThreshold', 2)

    const rows = await db.$queryRaw<
      Array<{ poaid: string; number: string; year: number; office: string; firms: bigint }>
    >`
      SELECT poa.id AS poaid,
             poa."number" AS number,
             poa."year" AS year,
             poa."notarisationOffice" AS office,
             COUNT(DISTINCT a."brokerEntityId") AS firms
      FROM "power_of_attorney" poa
      JOIN "application" a ON a."powerOfAttorneyId" = poa.id
      WHERE a."archivedAt" IS NULL
      GROUP BY poa.id, poa."number", poa."year", poa."notarisationOffice"
      HAVING COUNT(DISTINCT a."brokerEntityId") >= ${threshold}
      LIMIT 200
    `

    return rows.map((row) => ({
      signalType: this.key,
      family: 'SUPERVISED_POPULATION' as const,
      severity: severityOf(context, this.key),
      subjectType: 'PowerOfAttorney',
      subjectId: row.poaid,
      evidence: {
        number: row.number,
        year: row.year,
        notarisationOffice: row.office,
        distinctFirms: Number(row.firms),
        parameterThreshold: threshold,
      },
      summaryAr: `استُخدم التوكيل رقم ${row.number} لسنة ${row.year} في طلبات ${Number(row.firms)} منشآت مختلفة.`,
      summaryEn: `Power of attorney ${row.number}/${row.year} was used on applications from ${Number(row.firms)} distinct firms.`,
    }))
  },
}

export const DETECTORS: Detector[] = [
  // Process integrity first: 00-VISION §5 says these matter most, and the
  // order they run in is the order a reader of this file meets them.
  approvedWithDocumentsMissing,
  implausibleDecisionSpeed,
  repeatedExaminerPairing,
  segregationOfDutiesAttempt,
  completionsThenSuddenApproval,
  unfoundedCompletions,
  outOfHoursDecision,
  abnormalDwellTime,
  // The supervised population.
  dormantRegistration,
  identityReuseAcrossEntities,
  powerOfAttorneyReuse,
]

export type { DetectorContext }
