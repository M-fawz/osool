/**
 * Seed the database.
 *
 *   npm run db:seed
 *
 * Two things are seeded, and nothing else:
 *
 *   1. The allowed application transitions (02-SYSTEM-ARCHITECTURE §5). A
 *      status is never assignable directly, so this table is what makes the
 *      state machine real rather than documentary.
 *   2. The versioned rule sets (§6), from prisma/rule-sets/.
 *
 * The seed is idempotent and additive: it upserts, and it never deletes — the
 * database would refuse a delete anyway. Re-running it after editing a rule set
 * definition updates that version in place, which is correct during
 * development. In production a rule change is a *new version* with a new
 * effective date, never an edit to the version that past decisions were made
 * under.
 *
 * Every rule set published writes an audit event, so the trail answers "who
 * put this threshold in force, and when" from the first day.
 */

import { db } from '../src/lib/db'
import { recordAuditEvent } from '../src/lib/audit'
import { ruleSetDefinitions } from './rule-sets'
import type { ApplicationStatus, Prisma, Role } from '@prisma/client'

// ── The state machine, 02-SYSTEM-ARCHITECTURE §5 ────────────────────────────

interface TransitionSeed {
  from: ApplicationStatus
  to: ApplicationStatus
  action: string
  roles: Role[]
  description: string
}

const transitions: TransitionSeed[] = [
  {
    from: 'DRAFT',
    to: 'SUBMITTED',
    action: 'submit',
    roles: ['BROKER_OWNER', 'BROKER_AGENT'],
    description:
      'The applicant submits. Validated server-side against the rule sets in force at this moment.',
  },
  {
    from: 'SUBMITTED',
    to: 'UNDER_INTAKE',
    action: 'intake',
    roles: ['REGISTRY_CLERK'],
    description: 'REQ-REG-050 step 1 — entered in the incoming register under a temporary number.',
  },
  {
    from: 'UNDER_INTAKE',
    to: 'UNDER_EXAMINATION',
    action: 'assign',
    roles: ['REGISTRY_CLERK'],
    description: 'Assigned to an examiner. Assignment is recorded, never self-service.',
  },
  {
    from: 'UNDER_EXAMINATION',
    to: 'AWAITING_COMPLETION',
    action: 'request_completions',
    roles: ['EXAMINER'],
    description:
      'REQ-REG-050 step 2 — requires at least one structured completion item. Free text alone is not accepted.',
  },
  {
    from: 'AWAITING_COMPLETION',
    to: 'UNDER_EXAMINATION',
    action: 'resubmit',
    roles: ['BROKER_OWNER', 'BROKER_AGENT', 'BROKER_STAFF'],
    description: 'The applicant answers the requested completions.',
  },
  {
    from: 'UNDER_EXAMINATION',
    to: 'UNDER_REVIEW',
    action: 'recommend',
    roles: ['EXAMINER'],
    description: 'The examiner completes the internal review form and recommends.',
  },
  {
    from: 'UNDER_REVIEW',
    to: 'APPROVED',
    action: 'approve',
    roles: ['REVIEWER'],
    description:
      'REQ-REG-050 step 3, and REQ-REG-052 — the reviewer must not be the examiner of this application.',
  },
  {
    from: 'UNDER_REVIEW',
    to: 'REJECTED',
    action: 'reject',
    roles: ['REVIEWER'],
    description: 'Rejection requires a written reason.',
  },
  {
    from: 'APPROVED',
    to: 'AWAITING_PAYMENT',
    action: 'record_fees',
    roles: ['CARD_ISSUER', 'DATA_MANAGER'],
    description: 'REQ-REG-050 step 4 — fees recorded. Money is not moved by this platform.',
  },
  {
    from: 'AWAITING_PAYMENT',
    to: 'CARD_ISSUED',
    action: 'issue_card',
    roles: ['CARD_ISSUER'],
    description: 'REQ-REG-050 step 5 — registration card issued under a permanent number.',
  },
  {
    from: 'CARD_ISSUED',
    to: 'ACTIVE',
    action: 'deliver',
    roles: ['CARD_ISSUER'],
    description: 'REQ-REG-050 step 6 — delivery recorded in the delivery ledger.',
  },
  {
    from: 'DRAFT',
    to: 'WITHDRAWN',
    action: 'withdraw',
    roles: ['BROKER_OWNER', 'BROKER_AGENT'],
    description: 'Withdrawal before submission.',
  },
  {
    from: 'SUBMITTED',
    to: 'WITHDRAWN',
    action: 'withdraw',
    roles: ['BROKER_OWNER', 'BROKER_AGENT'],
    description: 'Withdrawal after submission and before intake.',
  },
  {
    from: 'UNDER_INTAKE',
    to: 'WITHDRAWN',
    action: 'withdraw',
    roles: ['BROKER_OWNER', 'BROKER_AGENT'],
    description: 'Withdrawal during intake.',
  },
  {
    from: 'UNDER_EXAMINATION',
    to: 'WITHDRAWN',
    action: 'withdraw',
    roles: ['BROKER_OWNER', 'BROKER_AGENT'],
    description: 'Withdrawal during examination.',
  },
  {
    from: 'AWAITING_COMPLETION',
    to: 'WITHDRAWN',
    action: 'withdraw',
    roles: ['BROKER_OWNER', 'BROKER_AGENT'],
    description: 'Withdrawal while completions are outstanding.',
  },
]

async function seedTransitions() {
  for (const t of transitions) {
    await db.applicationTransition.upsert({
      where: { fromState_toState_action: { fromState: t.from, toState: t.to, action: t.action } },
      create: {
        fromState: t.from,
        toState: t.to,
        action: t.action,
        allowedRoles: t.roles,
        description: t.description,
      },
      update: { allowedRoles: t.roles, description: t.description },
    })
  }
  console.log(`  ${transitions.length} allowed transitions`)
}

async function seedRuleSets() {
  for (const definition of ruleSetDefinitions) {
    const existing = await db.ruleSet.findUnique({
      where: { code_version: { code: definition.code, version: definition.version } },
      select: { id: true },
    })

    const ruleSet = await db.ruleSet.upsert({
      where: { code_version: { code: definition.code, version: definition.version } },
      create: {
        code: definition.code,
        version: definition.version,
        description: definition.description,
        legalSource: definition.legalSource,
        requirementIds: definition.requirementIds,
        effectiveFrom: definition.effectiveFrom,
        effectiveTo: definition.effectiveTo,
      },
      update: {
        description: definition.description,
        legalSource: definition.legalSource,
        requirementIds: definition.requirementIds,
        effectiveFrom: definition.effectiveFrom,
        effectiveTo: definition.effectiveTo,
      },
    })

    for (const item of definition.items) {
      await db.ruleItem.upsert({
        where: { ruleSetId_key: { ruleSetId: ruleSet.id, key: item.key } },
        create: {
          ruleSetId: ruleSet.id,
          key: item.key,
          position: item.position,
          payload: item.payload as Prisma.InputJsonValue,
        },
        update: { position: item.position, payload: item.payload as Prisma.InputJsonValue },
      })
    }

    // Publishing a threshold is itself a regulated act: the trail has to be
    // able to answer who put this in force and when.
    await recordAuditEvent({
      action: existing ? 'RULE_SET_UPDATED' : 'RULE_SET_PUBLISHED',
      entityType: 'RuleSet',
      entityId: ruleSet.id,
      actorLabel: 'seed',
      reason: `Seeded ${definition.code} v${definition.version} from prisma/rule-sets/.`,
      ruleSetVersions: { [definition.code]: definition.version },
      payload: {
        legalSource: definition.legalSource,
        requirementIds: definition.requirementIds,
        effectiveFrom: definition.effectiveFrom.toISOString(),
        itemCount: definition.items.length,
      },
    })

    console.log(
      `  ${definition.code} v${definition.version} — ${definition.items.length} items, in force from ${definition.effectiveFrom.toISOString().slice(0, 10)}`,
    )
  }
}

async function main() {
  console.log('Seeding Osool.\n')

  console.log('Application state machine:')
  await seedTransitions()

  console.log('\nVersioned rule sets:')
  await seedRuleSets()

  const { findOverlappingRuleSets } = await import('../src/lib/rules')
  const overlaps = await findOverlappingRuleSets()
  if (overlaps.length) {
    console.log('\nWarning — overlapping effective windows:')
    for (const o of overlaps) {
      console.log(`  ${o.code}: v${o.versions[0]!.version} and v${o.versions[1]!.version} are both in force at some date.`)
    }
  }

  console.log('\nDone.')
  await db.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await db.$disconnect()
  process.exit(1)
})
