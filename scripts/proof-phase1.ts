/**
 * The Phase 1 proof.
 *
 *   npm run proof:phase1            (proofs 1–5)
 *   npm run proof:phase1 -- --routes  (adds proof 6; needs `npm run dev`)
 *
 * 04-BUILD-PLAN.md states the Phase 1 proof point:
 *
 *   "A complete application travels from a broker's phone to an issued
 *    registration card, with every hand it passed through named and
 *    timestamped — and an attempt to register under Category C with EGP 30,000
 *    capital is refused with an explanation citing Decree 578/2025."
 *
 * Nothing here asserts against a fixture. Every proof drives the same functions
 * the Server Actions drive, against the real database, and prints what it
 * found — including the Arabic the user actually reads, because a refusal
 * nobody can read is not a refusal.
 */

import { parseArgs } from 'node:util'
import { db } from '@/lib/db'
import { verifyChain } from '@/lib/audit'
import { roleLabel } from '@/lib/auth/roles'
import { statusLabels } from '@/lib/applications/refusals'
import { evaluateCompleteness, loadApplicationDetail } from '@/lib/applications/completeness'
import { submitApplication } from '@/lib/applications/draft'
import {
  performArchive,
  performAssignExaminer,
  performDataExtraction,
  performDecision,
  performIntake,
  performIssueCard,
  performRecommend,
  performRecordDelivery,
  performRecordFees,
  saveExaminationRecord,
} from '@/lib/applications/workflow'
import type { ActorContext } from '@/lib/applications/transition'
import { evaluateCategoryAgainstCapital } from '@/lib/rules/category'
import { ruleSet } from '@/lib/rules'
import { closePdfBrowser } from '@/lib/pdf/render'
import type { RuleViolation } from '@/lib/rules/violation'
import type { Role, User } from '@prisma/client'

let failures = 0

function heading(text: string) {
  console.log(`\n${'═'.repeat(74)}\n${text}\n${'═'.repeat(74)}`)
}

function pass(text: string) {
  console.log(`  PASS  ${text}`)
}

function fail(text: string) {
  failures += 1
  console.log(`  FAIL  ${text}`)
}

function showViolation(violation: RuleViolation) {
  console.log(`\n    code        ${violation.code}`)
  console.log(`    severity    ${violation.severity}`)
  console.log(`    requires    ${violation.requirementIds.join(', ')}`)
  console.log(`    instrument  ${violation.legalSource}`)
  console.log('\n    As the applicant reads it, in Arabic:')
  console.log(`      ما الذي تعذّر : ${violation.ar.blocked}`)
  console.log(`      السبب        : ${violation.ar.why}`)
  console.log(`      الخطوة التالية: ${violation.ar.nextStep}`)
  console.log(`      لمن تتوجه     : ${violation.ar.whoToAsk}`)
  console.log('\n    The English mirror:')
  console.log(`      Blocked : ${violation.en.blocked}`)
  console.log(`      Why     : ${violation.en.why}`)
  console.log(`      Next    : ${violation.en.nextStep}`)
  console.log(`      Who     : ${violation.en.whoToAsk}`)
}

function actorFor(user: User): ActorContext {
  return {
    userId: user.id,
    role: user.role,
    name: user.name,
    brokerEntityId: user.brokerEntityId,
    ipAddress: '127.0.0.1',
    userAgent: 'osool-proof/phase-1',
  }
}

async function requireUser(email: string): Promise<User> {
  const user = await db.user.findUnique({ where: { email } })
  if (!user) {
    throw new Error(
      `The account ${email} does not exist. Run \`npm run seed:phase1\` before the proof.`,
    )
  }
  return user
}

// ═══════════════════════════════════════════════════════════════════════════
// 1 — A complete application, broker submission to issued card
// ═══════════════════════════════════════════════════════════════════════════

async function proofFullJourney(): Promise<string | null> {
  heading('1 — A complete application travels from submission to an issued card')

  const owner = await requireUser('proof-broker@osool.test')
  const clerk = await requireUser('clerk@osool.test')
  const examiner = await requireUser('examiner@osool.test')
  const reviewer = await requireUser('reviewer@osool.test')
  const issuer = await requireUser('issuer@osool.test')
  const dataManager = await requireUser('data@osool.test')
  const filesHead = await requireUser('files@osool.test')

  const application = await db.application.findFirst({
    where: { brokerEntityId: owner.brokerEntityId!, status: 'DRAFT', archivedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  if (!application) {
    fail('No draft application was prepared for the proof. Run `npm run seed:phase1` first.')
    return null
  }

  const steps: Array<[string, () => Promise<{ ok: boolean; violation?: RuleViolation }>]> = [
    ['the applicant submits', () => submitApplication(actorFor(owner), application.id)],
    ['the registry clerk records intake', () => performIntake(actorFor(clerk), { applicationId: application.id, pageCount: 16 })],
    [
      'the clerk assigns an examiner',
      () => performAssignExaminer(actorFor(clerk), { applicationId: application.id, examinerId: examiner.id }),
    ],
    [
      'the examiner completes the internal review form',
      async () => {
        const form = await ruleSet('EXAMINATION_FORM', { asOf: new Date() })
        const from = new Date()
        const to = new Date(Date.UTC(from.getUTCFullYear() + 5, from.getUTCMonth(), from.getUTCDate()))
        return saveExaminationRecord(actorFor(examiner), {
          applicationId: application.id,
          originalCount: 1,
          copyCount: 2,
          brokerageNature: ['SELL'],
          proposedValidFrom: from,
          proposedValidTo: to,
          recommendation: 'RECOMMEND_APPROVAL',
          examinerNote: 'روجعت المستندات أمام البيانات ولم يظهر ما يخالفها.',
          verifiedFieldKeys: form.items.map((item) => item.key),
        })
      },
    ],
    ['the examiner signs and passes for review', () => performRecommend(actorFor(examiner), { applicationId: application.id })],
    [
      'the reviewer approves',
      () =>
        performDecision(actorFor(reviewer), {
          applicationId: application.id,
          decision: 'APPROVE',
          note: 'روجع الطلب ووُجد مستوفياً لشروط القيد.',
        }),
    ],
    [
      'the treasurer records the fees',
      async () => {
        const fees = await ruleSet<{ mandatory: boolean }>('FEE_SCHEDULE', { asOf: new Date() })
        return performRecordFees(actorFor(issuer), {
          applicationId: application.id,
          paymentMethod: 'CERTIFIED_CHEQUE',
          receiptNumber: 'R-PROOF/0001',
          bankName: 'البنك الأهلي المصري',
          bankBranch: 'فرع التجمع الخامس',
          chequeNumber: '00471255',
          lines: fees.items
            .filter((item) => item.payload.mandatory)
            .map((item, index) => ({ feeKey: item.key, amount: [500, 1500, 300, 200, 100][index] ?? 100 })),
        })
      },
    ],
    ['the card is issued', () => performIssueCard(actorFor(issuer), { applicationId: application.id })],
    [
      'the card is delivered',
      () =>
        performRecordDelivery(actorFor(issuer), {
          applicationId: application.id,
          deliveredToName: 'المتقدّم بنفسه',
          renewalDateAcknowledged: true,
          numberObligationAcknowledged: true,
        }),
    ],
    [
      'the data manager extracts the file data',
      () =>
        performDataExtraction(actorFor(dataManager), {
          applicationId: application.id,
          dataNote: 'استُخرجت بيانات الملف وقُيدت بقاعدة البيانات.',
        }),
    ],
    [
      'the head of files archives it',
      () =>
        performArchive(actorFor(filesHead), {
          applicationId: application.id,
          pageCount: 16,
          serialRegisterNo: 'S-PROOF-001',
          alphabeticalIndex: 'ب — البستان',
          fileReference: 'F/PROOF/001',
        }),
    ],
  ]

  for (const [label, run] of steps) {
    const result = await run()
    if (result.ok) {
      pass(label)
    } else {
      fail(`${label} — ${result.violation?.code ?? 'unknown'}`)
      if (result.violation) showViolation(result.violation)
      return application.id
    }
  }

  const final = await db.application.findUnique({
    where: { id: application.id },
    include: {
      registration: true,
      cardIssuance: { include: { document: { select: { sha256: true, sizeBytes: true } } } },
      fileHandling: true,
    },
  })

  if (final?.status !== 'ACTIVE') {
    fail(`Expected the file to end at ACTIVE; it is at ${final?.status}.`)
  } else {
    pass(`the registration is ACTIVE under number ${final.registration?.registrationNumber}`)
  }

  if (!final?.cardIssuance?.document) {
    fail('No registration card document was stored.')
  } else {
    pass(
      `the card is stored, hashed ${final.cardIssuance.document.sha256.slice(0, 16)}… ` +
        `(${final.cardIssuance.document.sizeBytes} bytes)`,
    )
  }

  // ── The trail, printed in full ──────────────────────────────────────────
  const events = await db.applicationEvent.findMany({
    where: { applicationId: application.id },
    orderBy: { occurredAt: 'asc' },
    include: { actor: { select: { name: true, nameAr: true } } },
  })

  console.log('\n  Every hand the file passed through:\n')
  console.log(
    `    ${'#'.padEnd(3)} ${'WHEN'.padEnd(20)} ${'WHO'.padEnd(30)} ${'ROLE'.padEnd(16)} ${'FROM → TO'}`,
  )
  console.log(`    ${'─'.repeat(112)}`)

  for (const [index, event] of events.entries()) {
    const when = event.occurredAt.toISOString().replace('T', ' ').slice(0, 19)
    const who = `${event.actor.nameAr ?? event.actor.name}`
    const move = `${event.fromState ? statusLabels[event.fromState].en : '—'} → ${statusLabels[event.toState].en}`
    console.log(
      `    ${String(index + 1).padEnd(3)} ${when.padEnd(20)} ${who.padEnd(30)} ${roleLabel(event.actorRole).en.padEnd(16)} ${move}`,
    )
  }

  const distinctActors = new Set(events.map((e) => e.actorUserId)).size
  console.log(`\n    ${events.length} transitions, ${distinctActors} distinct people.`)

  // Eight transitions, not ten: REQ-REG-050 has eight steps, and its last two —
  // data extraction and archiving — record work on a file whose status does not
  // change. They are proved separately, below, because a system that digitised
  // six of eight steps could not answer "where is the file?".
  if (events.length !== 8) {
    fail(`Expected 8 transitions on a complete journey; found ${events.length}.`)
  } else {
    pass('8 transitions recorded, every one with an actor and a timestamp')
  }

  if (distinctActors < 5) {
    fail(`Only ${distinctActors} people touched the file. The workflow separates more than that.`)
  } else {
    pass(`${distinctActors} distinct people handled it — no one person carried it through`)
  }

  if (!final?.fileHandling?.dataExtractedAt || !final.fileHandling.filedAt) {
    fail('Steps 7 and 8 were not recorded, so the register cannot say where the file is.')
  } else {
    pass(
      `steps 7 and 8 recorded: data extracted, filed under ${final.fileHandling.serialRegisterNo}`,
    )
  }

  return application.id
}

// ═══════════════════════════════════════════════════════════════════════════
// 2 — Category C below the capital floor is refused
// ═══════════════════════════════════════════════════════════════════════════

async function proofCapitalRefusal() {
  heading('2 — Category C with capital below the floor is refused')

  const shortfall = await db.application.findFirst({
    where: {
      requestedCategory: 'C',
      paidUpCapital: { lt: 50_000 },
      status: 'DRAFT',
      archivedAt: null,
    },
    include: { entityData: { select: { tradeNameAr: true } }, brokerEntity: true },
  })

  if (!shortfall) {
    fail('No demonstration application requests Category C below the floor. Re-run the seed.')
    return
  }

  console.log(
    `\n  ${shortfall.entityData?.tradeNameAr ?? '—'} — requesting Category C ` +
      `on EGP ${Number(shortfall.paidUpCapital).toLocaleString('en-US')} paid-up capital.\n`,
  )

  // The rule, evaluated as of today, read from the versioned rule set.
  const evaluation = await evaluateCategoryAgainstCapital(
    { category: 'C', paidUpCapital: Number(shortfall.paidUpCapital) },
    { asOf: new Date() },
  )

  if (evaluation.ok) {
    fail('The rules engine allowed a category whose capital floor is not met.')
  } else {
    pass('the rules engine refuses it (REQ-REG-021)')
  }

  const violation = evaluation.violations[0]
  if (violation) showViolation(violation)

  // And the same refusal through the submission path a broker actually uses.
  const owner = await db.user.findFirst({
    where: { brokerEntityId: shortfall.brokerEntityId, role: 'BROKER_OWNER' },
  })

  if (!owner) {
    fail('The application has no broker owner; cannot test the submission path.')
    return
  }

  const submitted = await submitApplication(actorFor(owner), shortfall.id)

  if (submitted.ok) {
    fail('The submission was accepted. REQ-REG-021 is not enforced at submission.')
  } else if (submitted.violation.code !== 'CATEGORY_CAPITAL_BELOW_FLOOR') {
    fail(`Submission was refused for the wrong reason: ${submitted.violation.code}`)
  } else {
    pass('the submission itself is refused, with the same four-part explanation')
  }

  const after = await db.application.findUnique({
    where: { id: shortfall.id },
    select: { status: true },
  })
  if (after?.status !== 'DRAFT') {
    fail(`The refused application changed state to ${after?.status}. It must stay a draft.`)
  } else {
    pass('the application is still a draft — the refusal changed nothing')
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 — Segregation of duties. REQ-REG-052
// ═══════════════════════════════════════════════════════════════════════════

async function proofSegregationOfDuties() {
  heading('3 — The same official cannot examine and then approve the same application')

  const dual = await requireUser('proof-dual@osool.test')
  const clerk = await requireUser('clerk@osool.test')
  const owner = await requireUser('proof-sod@osool.test')

  const application = await db.application.findFirst({
    where: { brokerEntityId: owner.brokerEntityId!, status: 'DRAFT', archivedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  if (!application) {
    fail('No draft application was prepared for the segregation-of-duties proof.')
    return
  }

  // Walk it to UNDER_REVIEW with `dual` as the examiner.
  const submitted = await submitApplication(actorFor(owner), application.id)
  if (!submitted.ok) {
    fail(`Could not submit the test application: ${submitted.violation.code}`)
    return
  }

  await performIntake(actorFor(clerk), { applicationId: application.id, pageCount: 12 })
  await performAssignExaminer(actorFor(clerk), {
    applicationId: application.id,
    examinerId: dual.id,
  })

  const form = await ruleSet('EXAMINATION_FORM', { asOf: new Date() })
  const from = new Date()
  const to = new Date(Date.UTC(from.getUTCFullYear() + 5, from.getUTCMonth(), from.getUTCDate()))

  await saveExaminationRecord(actorFor(dual), {
    applicationId: application.id,
    originalCount: 1,
    copyCount: 1,
    brokerageNature: ['SELL'],
    proposedValidFrom: from,
    proposedValidTo: to,
    recommendation: 'RECOMMEND_APPROVAL',
    examinerNote: null,
    verifiedFieldKeys: form.items.map((item) => item.key),
  })

  await performRecommend(actorFor(dual), { applicationId: application.id })
  pass(`${dual.nameAr ?? dual.name} examined the file and passed it for review`)

  // Now the attack: the same person is given the reviewer role and tries to
  // approve the file they examined. This is the realistic failure — not two
  // job titles, but one person holding both at different moments.
  const promoted = await db.user.update({
    where: { id: dual.id },
    data: { role: 'REVIEWER' as Role },
  })
  console.log(`\n  ${promoted.nameAr ?? promoted.name} is now a REVIEWER, and tries to approve it.\n`)

  const attempt = await performDecision(actorFor(promoted), {
    applicationId: application.id,
    decision: 'APPROVE',
    note: 'محاولة اعتماد من نفس الفاحص.',
  })

  if (attempt.ok) {
    fail('The approval was accepted. REQ-REG-052 is not enforced.')
  } else if (attempt.violation.code !== 'SEGREGATION_OF_DUTIES') {
    fail(`Refused for the wrong reason: ${attempt.violation.code}`)
  } else {
    pass('the approval is refused under REQ-REG-052')
    showViolation(attempt.violation)
  }

  const after = await db.application.findUnique({
    where: { id: application.id },
    select: { status: true, reviewerId: true },
  })

  if (after?.status !== 'UNDER_REVIEW' || after.reviewerId !== null) {
    fail(`The file moved despite the refusal: status ${after?.status}, reviewer ${after?.reviewerId}.`)
  } else {
    pass('the file did not move, and no reviewer was recorded')
  }

  // A different reviewer can decide it, which is the point of the control:
  // it separates people, it does not stop the work.
  const other = await requireUser('reviewer2@osool.test')
  const allowed = await performDecision(actorFor(other), {
    applicationId: application.id,
    decision: 'APPROVE',
    note: 'روجع الطلب بمعرفة مراجع آخر ووُجد مستوفياً.',
  })

  if (!allowed.ok) {
    fail(`A different reviewer was also refused: ${allowed.violation.code}`)
  } else {
    pass(`${other.nameAr ?? other.name}, who did not examine it, approves it without difficulty`)
  }

  // Restore the role, so the register is left as it was found.
  await db.user.update({ where: { id: dual.id }, data: { role: 'EXAMINER' as Role } })
}

// ═══════════════════════════════════════════════════════════════════════════
// 4 — An incomplete application cannot be submitted
// ═══════════════════════════════════════════════════════════════════════════

async function proofIncompleteRefusal() {
  heading('4 — An incomplete application cannot be submitted, and says what is missing')

  const owner = await requireUser('broker@osool.test')
  const application = await db.application.findFirst({
    where: { brokerEntityId: owner.brokerEntityId!, status: 'DRAFT', archivedAt: null },
    orderBy: { createdAt: 'asc' },
  })

  if (!application) {
    fail('No incomplete draft exists. Re-run the seed.')
    return
  }

  const detail = await loadApplicationDetail(application.id)
  if (!detail) {
    fail('Could not load the draft.')
    return
  }

  const completeness = await evaluateCompleteness(detail)

  console.log(
    `\n  ${completeness.gaps.length} items outstanding, ` +
      `${completeness.completedSteps}/${completeness.totalSteps} steps complete, ` +
      `${completeness.documentsSupplied}/${completeness.documentsRequired} documents, ` +
      `${completeness.declarationsAffirmed}/${completeness.declarationsTotal} declarations.\n`,
  )

  for (const gap of completeness.gaps.slice(0, 8)) {
    console.log(`    · ${gap.ar}`)
    console.log(`      ${gap.en}   [step: ${gap.step}]`)
  }
  if (completeness.gaps.length > 8) {
    console.log(`    … and ${completeness.gaps.length - 8} more`)
  }

  const submitted = await submitApplication(actorFor(owner), application.id)

  if (submitted.ok) {
    fail('An incomplete application was accepted.')
  } else if (submitted.violation.code !== 'APPLICATION_INCOMPLETE') {
    fail(`Refused for the wrong reason: ${submitted.violation.code}`)
  } else {
    pass('the submission is refused, naming the missing items')
    showViolation(submitted.violation)
  }

  const after = await db.application.findUnique({
    where: { id: application.id },
    select: { status: true },
  })
  if (after?.status !== 'DRAFT') {
    fail(`The application changed state to ${after?.status}.`)
  } else {
    pass('it is still a draft, and nothing was lost')
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5 — The audit chain, and the absence of any destructive delete
// ═══════════════════════════════════════════════════════════════════════════

async function proofAuditIntegrity() {
  heading('5 — The audit chain is intact and nothing can be destroyed')

  const verification = await verifyChain()

  if (!verification.ok) {
    fail(`The chain is broken: ${verification.breaks.length} break(s).`)
    for (const each of verification.breaks.slice(0, 5)) console.log(`    ${JSON.stringify(each)}`)
  } else {
    pass(
      `${verification.eventsChecked} events verified, seq ${verification.firstSeq}–${verification.lastSeq}, ` +
        `head ${verification.lastHash?.slice(0, 16)}…`,
    )
  }

  // Read access is audited too — REQ-DPA-002.
  const reads = await db.auditEvent.count({ where: { accessType: 'READ' } })
  const writes = await db.auditEvent.count({ where: { accessType: 'WRITE' } })
  console.log(`\n    ${writes} write events, ${reads} read events recorded.`)
  if (reads === 0) {
    console.log('    (No reads yet — they are written when a screen opens a file.)')
  }

  // The database refuses a delete regardless of what the application does.
  const guardedTables = [
    'application',
    'application_event',
    'document',
    'declaration',
    'examination_record',
    'fee_record',
    'card_issuance',
    'file_handling_record',
  ]

  for (const table of guardedTables) {
    try {
      await db.$transaction(async (tx) => {
        // This statement exists to *prove* the guarantee rather than to breach
        // it: it matches no rows, it runs inside a transaction that is always
        // rolled back, and the proof FAILS if the database lets it through.
        // no-delete-allowed: the assertion is not the violation it asserts against.
        await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE 1 = 0`)
        throw new Error('__rollback__')
      })
      fail(`DELETE was permitted on "${table}".`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('__rollback__')) {
        fail(`DELETE was permitted on "${table}" (the statement succeeded).`)
      } else if (/not permitted|restrict_violation/i.test(message)) {
        pass(`DELETE refused by the database on "${table}"`)
      } else {
        fail(`Unexpected error probing "${table}": ${message.slice(0, 120)}`)
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6 — Every route renders, in Arabic RTL and English LTR
// ═══════════════════════════════════════════════════════════════════════════

interface RouteCheck {
  path: string
  account: string
  label: string
}

async function proofRoutes() {
  heading('6 — Every route renders in Arabic RTL and in English LTR')

  const { chromium } = await import('playwright')
  const base = 'http://localhost:3000'

  const reachable = await fetch(base, { method: 'GET' })
    .then((r) => r.ok || r.status < 500)
    .catch(() => false)

  if (!reachable) {
    fail(`${base} is not answering. Start the application with \`npm run dev\` and re-run.`)
    return
  }

  const activeApplication = await db.application.findFirst({
    where: { status: 'ACTIVE' },
    select: { id: true },
  })
  const examining = await db.application.findFirst({
    where: { status: 'UNDER_EXAMINATION' },
    select: { id: true },
  })
  const reviewing = await db.application.findFirst({
    where: { status: 'UNDER_REVIEW' },
    select: { id: true },
  })
  const approved = await db.application.findFirst({
    where: { status: { in: ['APPROVED', 'AWAITING_PAYMENT', 'CARD_ISSUED'] } },
    select: { id: true },
  })
  const brokerDraft = await db.application.findFirst({
    where: { status: 'DRAFT' },
    select: { id: true },
  })

  const routes: RouteCheck[] = [
    { path: '/', account: '', label: 'public landing' },
    { path: '/login', account: '', label: 'sign in' },
    { path: '/dashboard', account: 'auditor@osool.test', label: 'dashboard' },
    { path: '/audit', account: 'auditor@osool.test', label: 'audit trail' },
    { path: '/admin/users', account: 'mahmoud.fawzy@osool.gov.eg', label: 'accounts' },
    { path: '/application', account: 'broker@osool.test', label: 'broker applications' },
    { path: '/registration', account: 'shorouk@osool.test', label: 'broker registration' },
    { path: '/intake', account: 'clerk@osool.test', label: 'intake queue' },
    { path: '/examination', account: 'examiner@osool.test', label: 'examination queue' },
    { path: '/review', account: 'reviewer@osool.test', label: 'review queue' },
    { path: '/issuance', account: 'issuer@osool.test', label: 'issuance queue' },
    { path: '/records', account: 'data@osool.test', label: 'data queue' },
    { path: '/archive', account: 'files@osool.test', label: 'archive queue' },
  ]

  for (const step of ['capacity', 'entity', 'category', 'contracts', 'documents', 'declarations', 'review']) {
    if (brokerDraft) {
      routes.push({
        path: `/application/${brokerDraft.id}/${step}`,
        account: 'broker@osool.test',
        label: `application step: ${step}`,
      })
    }
  }

  if (examining) {
    routes.push({
      path: `/examination/${examining.id}`,
      account: 'examiner@osool.test',
      label: 'examiner case screen',
    })
  }
  if (reviewing) {
    routes.push({ path: `/review/${reviewing.id}`, account: 'reviewer@osool.test', label: 'reviewer case screen' })
  }
  if (approved) {
    routes.push({ path: `/issuance/${approved.id}`, account: 'issuer@osool.test', label: 'issuance case screen' })
  }
  if (activeApplication) {
    routes.push({ path: `/applications/${activeApplication.id}`, account: 'files@osool.test', label: 'case file' })
  }

  const browser = await chromium.launch()

  try {
    const sessions = new Map<string, import('playwright').BrowserContext>()

    const contextFor = async (account: string) => {
      if (sessions.has(account)) return sessions.get(account)!
      const context = await browser.newContext()

      if (account) {
        const password =
          account === 'mahmoud.fawzy@osool.gov.eg' ? 'MahmoudFawzy@123' : 'DevOnly!Osool2026'
        const page = await context.newPage()
        await page.goto(`${base}/login`, { waitUntil: 'load' })
        // The sign-in form is a client component and its submit handler only
        // exists once React has hydrated. Filling and clicking before that
        // submits a form with no action, the page does not move, and the whole
        // run silently proceeds signed out.
        await page.waitForFunction(() => document.readyState === 'complete')
        await page.waitForTimeout(600)
        await page.fill('input[name="email"]', account)
        await page.fill('input[name="password"]', password)
        await Promise.all([
          page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 20_000 }),
          page.click('button[type="submit"]'),
        ]).catch(() => undefined)
        await page.close()
      }

      sessions.set(account, context)
      return context
    }

    console.log(`\n    ${'ROUTE'.padEnd(46)} ${'AR'.padEnd(14)} ${'EN'.padEnd(14)} RESULT`)
    console.log(`    ${'─'.repeat(94)}`)

    for (const route of routes) {
      const context = await contextFor(route.account)
      const results: Record<string, string> = {}
      let ok = true

      for (const [locale, prefix] of [
        ['ar', ''],
        ['en', '/en'],
      ] as const) {
        // Arabic is the unprefixed canonical locale, so an unprefixed request
        // is resolved from the NEXT_LOCALE cookie and then from Accept-Language
        // — and a headless Chromium asks for en-US. Left alone, this measures
        // the browser's language preference rather than the route. Stating the
        // cookie makes each check deterministic and matches what a user who has
        // chosen a language actually sends.
        await context.addCookies([
          { name: 'NEXT_LOCALE', value: locale, url: base },
        ])

        const page = await context.newPage()
        const consoleErrors: string[] = []
        page.on('pageerror', (error) => consoleErrors.push(error.message))

        try {
          const response = await page.goto(`${base}${prefix}${route.path}`, {
            // 'load', not 'domcontentloaded': in development every route is
            // compiled on first request, and a check that starts querying the
            // DOM while the route is still being built reports a missing
            // heading on a page that renders it perfectly.
            waitUntil: 'load',
            timeout: 90_000,
          })

          const status = response?.status() ?? 0
          const dir = await page.getAttribute('html', 'dir')
          const lang = await page.getAttribute('html', 'lang')
          const expectedDir = locale === 'ar' ? 'rtl' : 'ltr'

          // Assert against the *rendered* document, never the raw HTML: Next
          // inlines the whole message catalogue into the development bundle, so
          // a substring search of the response body finds any string you ask
          // for whether or not it was rendered.
          const heading = await page
            .locator('h1')
            .first()
            .textContent({ timeout: 20_000 })
            .catch(() => null)

          const problems: string[] = []
          if (status >= 500) problems.push(`HTTP ${status}`)
          if (dir !== expectedDir) problems.push(`dir=${dir}`)
          if (lang !== locale) problems.push(`lang=${lang}`)
          if (!heading?.trim()) problems.push('no heading')
          if (consoleErrors.length) problems.push(`js: ${consoleErrors[0]?.slice(0, 40)}`)

          results[locale] = problems.length === 0 ? `${status} ${dir}` : problems.join(', ')
          if (problems.length) ok = false
        } catch (error) {
          results[locale] = (error instanceof Error ? error.message : String(error)).slice(0, 40)
          ok = false
        } finally {
          await page.close()
        }
      }

      const line = `    ${route.path.slice(0, 44).padEnd(46)} ${(results.ar ?? '').padEnd(14)} ${(results.en ?? '').padEnd(14)} ${ok ? 'PASS' : 'FAIL'}`
      console.log(line)
      if (!ok) failures += 1
    }

    for (const context of sessions.values()) await context.close()
  } finally {
    await browser.close()
  }
}

// ═══════════════════════════════════════════════════════════════════════════

async function prepareProofFixtures() {
  // Two dedicated brokers and one official, created here rather than in the
  // seed because they exist only for the proof. Created through the same
  // account path as everything else.
  const { default: prepare } = await import('./lib/proof-fixtures')
  await prepare()
}

async function main() {
  const { values } = parseArgs({
    options: { routes: { type: 'boolean', default: false } },
    allowPositionals: true,
  })

  console.log('\nOsool — Phase 1 proof')
  console.log('04-BUILD-PLAN.md: registration, end to end.\n')

  await prepareProofFixtures()

  await proofFullJourney()
  await proofCapitalRefusal()
  await proofSegregationOfDuties()
  await proofIncompleteRefusal()
  await proofAuditIntegrity()

  if (values.routes) {
    await proofRoutes()
  } else {
    heading('6 — Every route renders in Arabic RTL and in English LTR')
    console.log('  SKIPPED  Pass --routes with `npm run dev` running to check the screens.')
  }

  heading(failures === 0 ? 'All Phase 1 proofs passed.' : `${failures} proof(s) FAILED.`)

  await closePdfBrowser()
  await db.$disconnect()
  process.exitCode = failures === 0 ? 0 : 1
}

main().catch(async (error) => {
  console.error(`\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
  await closePdfBrowser().catch(() => {})
  await db.$disconnect()
  process.exit(1)
})
