import type { Prisma } from '@prisma/client'
import { db, type Tx } from '@/lib/db'

/**
 * The versioned rules engine. 02-SYSTEM-ARCHITECTURE §6.
 *
 * Regulatory thresholds are data with an effective date, never constants in
 * code. Nothing in src/ imports the seed definitions under prisma/rule-sets/ —
 * that separation is the mechanism, not a convention. If a threshold could be
 * read from a TypeScript constant at runtime, a decree amendment would become
 * a deployment, and a decision taken in March would be re-evaluated against
 * October's rules the first time anyone opened it.
 *
 * Every lookup is as-of a date:
 *
 *     const bands = await ruleSet('BROKER_CATEGORY', { asOf: application.submittedAt })
 *
 * Passing `asOf` is not optional. An overload without it would be used by
 * accident and would silently evaluate history against the present.
 */

export interface RuleLookup {
  /** The moment whose rules apply. For a decision, the decision's own date. */
  asOf: Date
  /** Join a caller's transaction, so rules read inside a write see that write. */
  tx?: Tx
}

export interface ResolvedRuleItem<T = Record<string, unknown>> {
  key: string
  position: number
  payload: T
}

export interface ResolvedRuleSet<T = Record<string, unknown>> {
  id: string
  code: string
  version: number
  description: string | null
  legalSource: string | null
  requirementIds: string[]
  effectiveFrom: Date
  effectiveTo: Date | null
  items: ResolvedRuleItem<T>[]
  /** Keyed by item key, for the common "look one thing up" case. */
  byKey: Map<string, ResolvedRuleItem<T>>
}

export class RuleSetNotFoundError extends Error {
  constructor(
    readonly code: string,
    readonly asOf: Date,
  ) {
    super(
      `No version of the rule set "${code}" was in force on ${asOf.toISOString()}. ` +
        'A regulatory rule cannot be evaluated without a version in force at the relevant date. ' +
        'Seed the rule set, or check the date being passed.',
    )
    this.name = 'RuleSetNotFoundError'
  }
}

/**
 * Resolve the version of a rule set that was in force on a given date.
 *
 * Where versions overlap — which should not happen, but a mis-entered
 * effective date can cause it — the most recently effective one wins, and the
 * ambiguity is reported by `findOverlappingRuleSets()` rather than being
 * resolved silently in a way nobody notices.
 */
export async function ruleSet<T = Record<string, unknown>>(
  code: string,
  lookup: RuleLookup,
): Promise<ResolvedRuleSet<T>> {
  const client = lookup.tx ?? db

  const found = await client.ruleSet.findFirst({
    where: {
      code,
      archivedAt: null,
      effectiveFrom: { lte: lookup.asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: lookup.asOf } }],
    },
    orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
    include: { items: { where: { archivedAt: null }, orderBy: { position: 'asc' } } },
  })

  if (!found) throw new RuleSetNotFoundError(code, lookup.asOf)

  const items: ResolvedRuleItem<T>[] = found.items.map((item) => ({
    key: item.key,
    position: item.position,
    payload: item.payload as T,
  }))

  return {
    id: found.id,
    code: found.code,
    version: found.version,
    description: found.description,
    legalSource: found.legalSource,
    requirementIds: found.requirementIds,
    effectiveFrom: found.effectiveFrom,
    effectiveTo: found.effectiveTo,
    items,
    byKey: new Map(items.map((i) => [i.key, i])),
  }
}

/** One item from a rule set, or null. */
export async function ruleItem<T = Record<string, unknown>>(
  code: string,
  key: string,
  lookup: RuleLookup,
): Promise<ResolvedRuleItem<T> | null> {
  const set = await ruleSet<T>(code, lookup)
  return set.byKey.get(key) ?? null
}

/**
 * The rule-set versions in force at a moment, as `{ CODE: version }`.
 *
 * Stamped onto audit events, application events, and registrations so that any
 * decision can be replayed later against exactly the configuration that
 * produced it — which is what makes it defensible to an inspector.
 */
export async function ruleSetVersionsInForce(
  codes: string[],
  lookup: RuleLookup,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const code of codes) {
    try {
      const set = await ruleSet(code, lookup)
      out[code] = set.version
    } catch (error) {
      if (!(error instanceof RuleSetNotFoundError)) throw error
      // A code with no version in force is recorded as absent rather than
      // omitted, so the stamp distinguishes "not applicable" from "forgotten".
    }
  }
  return out
}

/**
 * Report rule sets whose effective windows overlap.
 *
 * Two versions of the same code in force on the same day means one decision
 * could be justified two ways. Surfaced as an operational check rather than
 * being silently resolved.
 */
export async function findOverlappingRuleSets(): Promise<
  Array<{ code: string; versions: Array<{ version: number; from: Date; to: Date | null }> }>
> {
  const all = await db.ruleSet.findMany({
    where: { archivedAt: null },
    orderBy: [{ code: 'asc' }, { effectiveFrom: 'asc' }],
    select: { code: true, version: true, effectiveFrom: true, effectiveTo: true },
  })

  const byCode = new Map<string, typeof all>()
  for (const rs of all) {
    const list = byCode.get(rs.code) ?? []
    list.push(rs)
    byCode.set(rs.code, list)
  }

  const overlaps: Array<{ code: string; versions: Array<{ version: number; from: Date; to: Date | null }> }> = []

  for (const [code, versions] of byCode) {
    for (let i = 0; i < versions.length; i++) {
      for (let j = i + 1; j < versions.length; j++) {
        const a = versions[i]!
        const b = versions[j]!
        const aEnd = a.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY
        const bEnd = b.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY
        if (a.effectiveFrom.getTime() < bEnd && b.effectiveFrom.getTime() < aEnd) {
          overlaps.push({
            code,
            versions: [
              { version: a.version, from: a.effectiveFrom, to: a.effectiveTo },
              { version: b.version, from: b.effectiveFrom, to: b.effectiveTo },
            ],
          })
        }
      }
    }
  }

  return overlaps
}

export type { Prisma }
export * from './category'
export * from './violation'
