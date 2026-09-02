import type { RuleSetDefinition } from './types'

/**
 * INTEGRITY_SIGNALS — the parameters the signals engine computes against.
 *
 * ── Read this before changing a number here ──────────────────────────────
 *
 * **Nothing in this file is a legal threshold, and nothing in it may be
 * presented to a user as one.** 01-LEGAL-REFERENCE.md sets no figure for how
 * fast a decision is implausibly fast, or how many firms one national ID may
 * appear across before it is worth a second look. Those numbers do not exist in
 * Decree 578, in Law 80, or in the AML Controls, and inventing them and
 * dressing them as law would be exactly the fabrication CLAUDE.md rule 3 and
 * the "never fabricate a legal citation" instruction exist to prevent.
 *
 * What they are instead: **operational triage parameters set by the Authority**,
 * versioned like everything else so that changing one is a configuration change
 * with an effective date and an audit event, not a deployment. Each item carries
 * `basis: 'OPERATIONAL'` so that no screen, message, or refusal can accidentally
 * cite it as a requirement — and the signal copy says, in both languages, that a
 * signal is triage and not a finding.
 *
 * The one exception is `CATEGORY_CEILING_EXCEEDED`, which has no threshold of
 * its own: it reads the bands from BROKER_CATEGORY, which *is* Decree 578
 * Article 2. Its severity is set here; its rule is set there.
 *
 * ── Why these particular signals ─────────────────────────────────────────
 *
 * 00-VISION §5 lists eighteen. These are the ones computable from data this
 * register actually holds today. The rest need sources it does not have — the
 * Commercial Register for "trading without an entry", ownership graphs for
 * foreign control — and a detector that silently never fires is worse than an
 * absent one, because it reads on a dashboard as "nothing found".
 *
 * Signals 11–18 in that list are the process-integrity family, and 00-VISION is
 * explicit that they "matter more than 1–10 politically, because they are the
 * ones a paper system structurally cannot produce".
 */

export const integritySignals: RuleSetDefinition = {
  code: 'INTEGRITY_SIGNALS',
  version: 1,
  description:
    'Operational triage parameters for the integrity signals engine. Not legal thresholds — see the note in the source.',
  legalSource:
    'None. These are operational parameters set by the Authority, not requirements drawn from any instrument.',
  requirementIds: ['REQ-AML-060'],
  effectiveFrom: new Date('2020-06-01T00:00:00.000Z'),
  effectiveTo: null,

  items: [
    // ── Against the supervised population ─────────────────────────────────
    {
      key: 'CATEGORY_CEILING_EXCEEDED',
      position: 1,
      payload: {
        labelAr: 'قيمة عقد تتجاوز سقف الفئة',
        labelEn: 'Contract value above the category ceiling',
        family: 'SUPERVISED_POPULATION',
        severity: 'HIGH',
        basis: 'LEGAL',
        // The only item here whose rule is a decree. The bands live in
        // BROKER_CATEGORY; this entry only says how loudly to report a breach.
        legalSource: 'Decree 578 of 2025, Article 2 — via the BROKER_CATEGORY rule set',
        visionSignal: 1,
        enabled: true,
      },
    },
    {
      key: 'THRESHOLD_CLUSTERING',
      position: 2,
      payload: {
        labelAr: 'تركّز قيم العقود أسفل حد الفئة مباشرةً',
        labelEn: 'Contract values clustering just below a category threshold',
        family: 'SUPERVISED_POPULATION',
        severity: 'MEDIUM',
        basis: 'OPERATIONAL',
        // "Just below" has to be given a width, and no instrument gives one.
        withinPercentOfCeiling: 5,
        minimumContracts: 3,
        visionSignal: 2,
        enabled: true,
      },
    },
    {
      key: 'DORMANT_REGISTRATION',
      position: 3,
      payload: {
        labelAr: 'قيد ساري دون أي عقد مسجَّل',
        labelEn: 'An active registration with no registered contract',
        family: 'SUPERVISED_POPULATION',
        severity: 'LOW',
        basis: 'OPERATIONAL',
        // How long a registration may hold no contract before it is worth a
        // look. A brand-new registration legitimately has none.
        dormantAfterDays: 365,
        visionSignal: 5,
        enabled: true,
      },
    },
    {
      key: 'IDENTITY_REUSE_ACROSS_ENTITIES',
      position: 4,
      payload: {
        labelAr: 'تكرار الرقم القومي نفسه عبر عدة منشآت',
        labelEn: 'The same national ID appearing across several firms',
        family: 'SUPERVISED_POPULATION',
        severity: 'MEDIUM',
        basis: 'OPERATIONAL',
        // Holding an interest in more than one firm is entirely lawful. The
        // number is where "several" stops being unremarkable, and it is a
        // supervisory judgement, not a rule.
        entityCountThreshold: 4,
        visionSignal: 6,
        enabled: true,
      },
    },
    {
      key: 'POWER_OF_ATTORNEY_REUSE',
      position: 5,
      payload: {
        labelAr: 'تكرار التوكيل نفسه عبر طلبات غير مترابطة',
        labelEn: 'The same power of attorney used across unrelated applications',
        family: 'SUPERVISED_POPULATION',
        severity: 'MEDIUM',
        basis: 'OPERATIONAL',
        // REQ-REG-041 makes number+year+office a composite key precisely so
        // this is detectable. It sets no limit on legitimate reuse.
        distinctFirmsThreshold: 2,
        visionSignal: 7,
        enabled: true,
      },
    },

    // ── Against the process itself ────────────────────────────────────────
    {
      key: 'APPROVED_WITH_DOCUMENTS_MISSING',
      position: 10,
      payload: {
        labelAr: 'موافقة مع نقص في المستندات الإلزامية',
        labelEn: 'Approved while mandatory documents were absent',
        family: 'PROCESS_INTEGRITY',
        severity: 'HIGH',
        basis: 'OPERATIONAL',
        // No parameter: any missing mandatory document at the moment of
        // approval raises it. The checklist itself is the rule, and it is
        // versioned in DOC_CHECKLIST.
        visionSignal: 11,
        enabled: true,
      },
    },
    {
      key: 'IMPLAUSIBLE_DECISION_SPEED',
      position: 11,
      payload: {
        labelAr: 'سرعة قرار تتجاوز ما يمكن لقارئ بشري إنجازه',
        labelEn: 'A decision taken faster than the file could have been read',
        family: 'PROCESS_INTEGRITY',
        severity: 'HIGH',
        basis: 'OPERATIONAL',
        // How long the file was on the reviewer's desk before the decision.
        // Chosen as a floor no honest reading of a registration file could be
        // under, not as a target.
        minimumReviewMinutes: 3,
        visionSignal: 12,
        enabled: true,
      },
    },
    {
      key: 'REPEATED_EXAMINER_PAIRING',
      position: 12,
      payload: {
        labelAr: 'تكرار إحالة طلبات المنشأة نفسها إلى الفاحص نفسه',
        labelEn: 'The same examiner repeatedly assigned to the same applicant',
        family: 'PROCESS_INTEGRITY',
        severity: 'MEDIUM',
        basis: 'OPERATIONAL',
        // §4: "Assignment is not self-service … repeated pairings between an
        // official and an applicant become a signal." How many is a signal is
        // not stated anywhere, so it is a parameter.
        pairingThreshold: 3,
        visionSignal: 13,
        enabled: true,
      },
    },
    {
      key: 'SEGREGATION_OF_DUTIES_ATTEMPT',
      position: 13,
      payload: {
        labelAr: 'محاولة اتخاذ قرار في طلب فحصه المستخدم نفسه',
        labelEn: 'An attempt to decide a file the same officer examined',
        family: 'PROCESS_INTEGRITY',
        severity: 'HIGH',
        basis: 'OPERATIONAL',
        // The system refuses the act outright — three times over. This records
        // that it was attempted, which the refusal alone does not surface to
        // anybody.
        visionSignal: 14,
        enabled: true,
      },
    },
    {
      key: 'COMPLETIONS_THEN_SUDDEN_APPROVAL',
      position: 14,
      payload: {
        labelAr: 'استيفاءات متكررة ثم موافقة دون رفع أي مستند جديد',
        labelEn: 'Rounds of completions, then approval with no new document uploaded',
        family: 'PROCESS_INTEGRITY',
        severity: 'HIGH',
        basis: 'OPERATIONAL',
        minimumRounds: 2,
        visionSignal: 15,
        enabled: true,
      },
    },
    {
      key: 'UNFOUNDED_COMPLETIONS',
      position: 15,
      payload: {
        labelAr: 'استيفاءات لا تستند إلى قائمة المستندات المقررة',
        labelEn: 'Completions requested with no basis in the documented requirements',
        family: 'PROCESS_INTEGRITY',
        severity: 'MEDIUM',
        basis: 'OPERATIONAL',
        // An examiner may legitimately ask for something the checklist does not
        // list. A file where most of a round is uncited is a different shape.
        uncitedProportion: 0.5,
        minimumItems: 2,
        visionSignal: 16,
        enabled: true,
      },
    },
    {
      key: 'OUT_OF_HOURS_DECISION',
      position: 16,
      payload: {
        labelAr: 'قرار متخذ خارج ساعات العمل',
        labelEn: 'A decision taken outside working hours',
        family: 'PROCESS_INTEGRITY',
        severity: 'LOW',
        basis: 'OPERATIONAL',
        // Cairo local time. Government hours are a fact about the Authority,
        // not a rule about brokers, and they are the sort of thing that changes
        // by circular — which is why they are configuration.
        timeZone: 'Africa/Cairo',
        workingHourStart: 8,
        workingHourEnd: 16,
        // 5 = Friday, 6 = Saturday, matching JavaScript's getUTCDay().
        weekendDays: [5, 6],
        visionSignal: 17,
        enabled: true,
      },
    },
    {
      key: 'ABNORMAL_DWELL_TIME',
      position: 17,
      payload: {
        labelAr: 'بقاء الملف لدى موظف واحد مدة تتجاوز المعتاد',
        labelEn: 'A file held at one stage far longer than the median',
        family: 'PROCESS_INTEGRITY',
        severity: 'MEDIUM',
        basis: 'OPERATIONAL',
        // Absolute, not relative to a computed median: a median over a register
        // with few files is noise, and a signal that fires differently every
        // week is one nobody trusts. Revisit once there is a year of data.
        dwellDays: 30,
        visionSignal: 18,
        enabled: true,
      },
    },
  ],
}
