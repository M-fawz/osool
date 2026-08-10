/**
 * Shape of a seeded rule set.
 *
 * These definitions are the published content of a regulatory configuration
 * version. They are read once, at seed time, and written into rule_set /
 * rule_item. The application never imports them — see the note at the top of
 * broker-category.ts for why that separation is deliberate.
 */

export interface RuleItemDefinition {
  /** Stable identifier within the rule set: 'A', 'DECL-01', 'CDD_IDENTITY_DOC'. */
  key: string
  /** Display order, where sequence carries meaning (checklists, declarations). */
  position: number
  /** The rule's content. Every threshold, period, band, and wording lives here. */
  payload: Record<string, unknown>
}

export interface RuleSetDefinition {
  code: string
  version: number
  description: string
  /** The instrument this encodes, in the form a lawyer would cite it. */
  legalSource: string
  /** REQ-* IDs from docs/01-LEGAL-REFERENCE.md that this rule set implements. */
  requirementIds: string[]
  effectiveFrom: Date
  effectiveTo: Date | null
  items: RuleItemDefinition[]
}
