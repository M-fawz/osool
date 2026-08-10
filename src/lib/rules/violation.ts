/**
 * The shape of a refusal.
 *
 * 03-DESIGN-DIRECTION §6 fixes the four parts of every blocked action, always
 * in this order:
 *
 *   1. what is blocked, plainly;
 *   2. why, in one sentence a non-lawyer understands, with the rule named;
 *   3. what to do next, specifically and actionably;
 *   4. who to ask, if the user cannot resolve it themselves.
 *
 * Making those four required fields on a type is the cheapest way to guarantee
 * it. A developer who wants to return "invalid input" from a rule evaluation
 * cannot: the type will not let them. The alternative — a convention plus code
 * review — is how every system ends up with a bare error somewhere in it.
 *
 * Both languages are carried on the violation itself rather than resolved
 * through message keys, because the *rule text* is versioned data and the
 * numbers inside these sentences come from the rule set that produced the
 * violation. A translation file would drift from the rule version.
 */

export type ViolationSeverity =
  /** Refuses the action. */
  | 'BLOCKING'
  /** Allows the action and flags it for supervision — REQ-REG-022's default. */
  | 'FLAG'
  /** Informational: shown, not enforced. `[NEEDS COUNSEL]` rules live here. */
  | 'ADVISORY'

export interface ViolationCopy {
  /** 1 — "This application cannot be submitted." */
  blocked: string
  /** 2 — one sentence, rule named in plain language. */
  why: string
  /** 3 — the exact next step. */
  nextStep: string
  /** 4 — who to ask. */
  whoToAsk: string
}

export interface RuleViolation {
  /** Stable machine code, e.g. CATEGORY_CAPITAL_BELOW_FLOOR. */
  code: string
  severity: ViolationSeverity
  /** The REQ-* IDs from docs/01-LEGAL-REFERENCE.md this refusal rests on. */
  requirementIds: string[]
  /** The instrument, as a lawyer would cite it. Shown to the user. */
  legalSource: string
  /**
   * The rule set and version that produced this, so the refusal is replayable.
   *
   * Absent for the refusals that are structural rather than configured — the
   * state machine's allowed transitions, segregation of duties, and ownership
   * of an application. Those do not have a version because they do not have a
   * threshold: they are not the sort of thing a decree amends, and pretending
   * otherwise by pointing them at a rule set would make the audit trail claim
   * a provenance that does not exist.
   */
  ruleSetCode?: string
  ruleSetVersion?: number
  /** Which field the user should be sent to, where there is one. */
  field?: string
  /**
   * True where the underlying requirement is marked [NEEDS COUNSEL].
   * CLAUDE.md rule 10: these never gate a user action. The evaluator downgrades
   * such a violation to ADVISORY rather than trusting callers to remember.
   */
  needsCounsel: boolean
  /** The facts behind the refusal, for the audit event and the signals engine. */
  evidence: Record<string, unknown>
  ar: ViolationCopy
  en: ViolationCopy
}

export interface RuleEvaluation {
  /** True when nothing BLOCKING was found. FLAG and ADVISORY do not stop an action. */
  ok: boolean
  violations: RuleViolation[]
  /** `{ CODE: version }` for every rule set consulted — stamp this on the audit event. */
  ruleSetVersions: Record<string, number>
}

export function blocking(violations: RuleViolation[]): RuleViolation[] {
  return violations.filter((v) => v.severity === 'BLOCKING')
}

export function evaluationFrom(
  violations: RuleViolation[],
  ruleSetVersions: Record<string, number>,
): RuleEvaluation {
  return {
    ok: blocking(violations).length === 0,
    violations,
    ruleSetVersions,
  }
}

/**
 * Enforce CLAUDE.md rule 10 in one place.
 *
 * A requirement marked `[NEEDS COUNSEL]` may warn and flag for human review;
 * it may not block until a lawyer has cleared it. Downgrading here rather than
 * at each call site means a new evaluator cannot forget.
 */
export function applyCounselGate(violation: RuleViolation): RuleViolation {
  if (!violation.needsCounsel || violation.severity !== 'BLOCKING') return violation
  return { ...violation, severity: 'ADVISORY' }
}

/** Format money the way the register writes it: Latin numerals, grouped, EGP named. */
export function formatEgp(amount: number, locale: 'ar' | 'en'): string {
  const grouped = new Intl.NumberFormat('en-US').format(amount)
  return locale === 'ar' ? `${grouped} جنيه مصري` : `EGP ${grouped}`
}
