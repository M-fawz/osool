/**
 * Proof that the rules engine enforces from versioned data, as of a date.
 *
 *   npm run proof:rules
 *
 * Three claims are tested:
 *   1. REQ-REG-021 refuses a category whose capital floor is not met, and the
 *      refusal carries the four-part copy from 03-DESIGN-DIRECTION §6.
 *   2. Evaluation is genuinely as-of a date — publishing a v2 with a later
 *      effective date changes today's answer and leaves yesterday's untouched.
 *   3. REQ-REG-022 flags rather than blocks, because it is [NEEDS COUNSEL].
 */

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  evaluateCategoryAgainstCapital,
  evaluateContractAgainstCategoryCeiling,
  ruleSet,
} from '@/lib/rules'

function heading(text: string) {
  console.log(`\n${text}\n${'─'.repeat(text.length)}`)
}

function showViolation(v: {
  code: string
  severity: string
  requirementIds: string[]
  // Optional since Phase 1: the workflow's own refusals — a step out of
  // order, a role that does not perform it, segregation of duties — are
  // structural rather than configured, and have no rule-set version to cite.
  ruleSetVersion?: number
  ar: { blocked: string; why: string; nextStep: string; whoToAsk: string }
  en: { blocked: string; why: string; nextStep: string; whoToAsk: string }
}) {
  console.log(`  code      ${v.code}`)
  console.log(`  severity  ${v.severity}`)
  const provenance = v.ruleSetVersion === undefined ? 'structural rule' : `rule set v${v.ruleSetVersion}`
  console.log(`  requires  ${v.requirementIds.join(', ')}  (${provenance})`)
  console.log('\n  English, as the user reads it:')
  console.log(`    1. ${v.en.blocked}`)
  console.log(`    2. ${v.en.why}`)
  console.log(`    3. ${v.en.nextStep}`)
  console.log(`    4. ${v.en.whoToAsk}`)
  console.log('\n  Arabic, as the user reads it:')
  console.log(`    ١. ${v.ar.blocked}`)
  console.log(`    ٢. ${v.ar.why}`)
  console.log(`    ٣. ${v.ar.nextStep}`)
  console.log(`    ٤. ${v.ar.whoToAsk}`)
}

async function main() {
  const today = new Date('2026-08-06T00:00:00.000Z')

  heading('1. Category C requested with EGP 30,000 paid-up capital')
  const refused = await evaluateCategoryAgainstCapital(
    { category: 'C', paidUpCapital: 30_000 },
    { asOf: today },
  )
  console.log(`  ok = ${refused.ok}  (false means the submission is refused)\n`)
  if (refused.violations[0]) showViolation(refused.violations[0])

  heading('2. The same applicant under Category D')
  const allowed = await evaluateCategoryAgainstCapital(
    { category: 'D', paidUpCapital: 30_000 },
    { asOf: today },
  )
  console.log(`  ok = ${allowed.ok}  violations = ${allowed.violations.length}`)
  console.log('  EGP 30,000 clears the Category D floor of EGP 20,000, so the application proceeds.')

  heading('3. Evaluation is as-of a date, not as-of now')

  const before = new Date('2026-01-17T00:00:00.000Z') // day before D578 took effect
  try {
    await ruleSet('BROKER_CATEGORY', { asOf: before })
    console.log('  Unexpected: a version was in force before the decree took effect.')
  } catch (error) {
    console.log(`  2026-01-17 (day before D578 in force): ${(error as Error).name}`)
    console.log('  A decision cannot be evaluated against rules that did not yet exist.')
  }

  const inForce = await ruleSet('BROKER_CATEGORY', { asOf: today })
  console.log(`  2026-08-06: BROKER_CATEGORY v${inForce.version} in force, ${inForce.items.length} categories.`)

  // Publish a hypothetical amendment raising the Category C floor, effective
  // later. Nothing in the code changes — only data.
  heading('4. A decree amendment is a configuration change, not a deployment')
  const amendmentDate = new Date('2026-09-01T00:00:00.000Z')

  const v1 = await db.ruleSet.findFirstOrThrow({
    where: { code: 'BROKER_CATEGORY', version: 1 },
    include: { items: true },
  })

  const v2 = await db.ruleSet.upsert({
    where: { code_version: { code: 'BROKER_CATEGORY', version: 2 } },
    create: {
      code: 'BROKER_CATEGORY',
      version: 2,
      description: 'Hypothetical amendment raising the Category C capital floor.',
      legalSource: 'Hypothetical amending decree — proof script only',
      requirementIds: ['REQ-REG-020', 'REQ-REG-021'],
      effectiveFrom: amendmentDate,
    },
    // Un-archived on re-entry. The proof archives this fixture on its way out,
    // so a second run would otherwise look for a version it had itself put
    // beyond the reach of `ruleSet()` — and fail with "no version in force",
    // which reads like a defect in the rules engine rather than in the proof.
    update: { effectiveFrom: amendmentDate, archivedAt: null, effectiveTo: null },
  })

  // Same for its items: `ruleSet()` excludes archived ones, so a v2 whose rows
  // were archived would resolve to a rule set with no bands in it.
  await db.ruleItem.updateMany({ where: { ruleSetId: v2.id }, data: { archivedAt: null } })

  for (const item of v1.items) {
    const payload = item.payload as Record<string, unknown>
    await db.ruleItem.upsert({
      where: { ruleSetId_key: { ruleSetId: v2.id, key: item.key } },
      create: {
        ruleSetId: v2.id,
        key: item.key,
        position: item.position,
        payload: (item.key === 'C' ? { ...payload, minimumPaidUpCapital: 250_000 } : payload) as Prisma.InputJsonValue,
      },
      update: {
        payload: (item.key === 'C' ? { ...payload, minimumPaidUpCapital: 250_000 } : payload) as Prisma.InputJsonValue,
      },
    })
  }

  // Close v1 the day the amendment takes effect, so the windows do not overlap.
  await db.ruleSet.update({ where: { id: v1.id }, data: { effectiveTo: amendmentDate } })

  const applicant = { category: 'C' as const, paidUpCapital: 100_000 }

  const underV1 = await evaluateCategoryAgainstCapital(applicant, { asOf: today })
  const underV2 = await evaluateCategoryAgainstCapital(applicant, {
    asOf: new Date('2026-09-15T00:00:00.000Z'),
  })

  console.log(`  An applicant with EGP 100,000 requesting Category C:`)
  console.log(`    submitted 2026-08-06 (v1, floor EGP 50,000)  → ok = ${underV1.ok}`)
  console.log(`    submitted 2026-09-15 (v2, floor EGP 250,000) → ok = ${underV2.ok}`)
  console.log('\n  The August decision remains defensible against August rules after the amendment.')
  console.log('  No TypeScript changed to produce this. Only rule data.')

  // Restore, so the proof leaves the register as it found it.
  await db.ruleSet.update({ where: { id: v1.id }, data: { effectiveTo: null } })
  await db.ruleSet.update({
    where: { id: v2.id },
    data: { archivedAt: new Date(), effectiveTo: amendmentDate },
  })

  heading('5. REQ-REG-022 flags, and does not block — it is [NEEDS COUNSEL]')
  const overCeiling = await evaluateContractAgainstCategoryCeiling(
    { category: 'D', contractValue: 45_000_000 },
    { asOf: today },
  )
  const v = overCeiling.violations[0]
  console.log(`  ok = ${overCeiling.ok}  (true — the contract is recorded)`)
  console.log(`  severity = ${v?.severity}  needsCounsel = ${v?.needsCounsel}`)
  console.log(`  ${v?.en.blocked}`)
  console.log(`  ${v?.en.why}`)

  await db.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await db.$disconnect()
  process.exit(1)
})
