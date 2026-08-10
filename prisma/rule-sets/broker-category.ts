import type { RuleSetDefinition } from './types'

/**
 * BROKER_CATEGORY — Decree 578/2025, Article 2. REQ-REG-020, REQ-REG-021,
 * REQ-REG-022.
 *
 * This file is *seed input*. It lives under prisma/ and not under src/ on
 * purpose: nothing in the running application may import it. The application
 * reads these numbers from the rule_set / rule_item tables, as of a date, so
 * that a decree amending the thresholds is a configuration change and a
 * decision taken in March stays re-explainable against the March rules.
 *
 * ── A note on the ceilings ─────────────────────────────────────────────────
 * 01-LEGAL-REFERENCE.md states each category's contract value as a lower bound
 * only ("Exceeding EGP 100,000,000" for A, and so on). REQ-REG-022 needs an
 * upper bound to enforce against — "a contract whose value exceeds the ceiling
 * of the broker's registered category". The ceilings below are therefore
 * derived by reading the four rows as a ladder, each category reaching up to
 * the floor of the one above it. Two independent statements in the project
 * documents confirm the bottom rung: 00-VISION §3 ("a category-D broker
 * (capital ≥ EGP 20,000, deals ≤ EGP 10M)") and 03-DESIGN-DIRECTION §6
 * ("Category D, which permits contracts up to EGP 10,000,000").
 *
 * The derivation is marked on every item as `ceilingDerived`, so that a lawyer
 * reviewing this can see exactly which numbers came from the decree text and
 * which were inferred. Confirm against the gazette before this gates anything
 * in production.
 */

export const brokerCategory: RuleSetDefinition = {
  code: 'BROKER_CATEGORY',
  version: 1,
  description:
    'Broker categories A–D: permitted contract value bands and minimum paid-up capital.',
  legalSource: 'Ministerial Decree 578 of 2025, Article 2',
  requirementIds: ['REQ-REG-020', 'REQ-REG-021', 'REQ-REG-022'],

  // Issued 16/12/2025; published in الوقائع المصرية issue 13 on 17 January
  // 2026; in force from the day following publication.
  effectiveFrom: new Date('2026-01-18T00:00:00.000Z'),
  effectiveTo: null,

  items: [
    {
      key: 'A',
      position: 1,
      payload: {
        labelAr: 'فئة أ',
        labelEn: 'Category A',
        currency: 'EGP',
        minimumPaidUpCapital: 1_000_000,
        contractValueAbove: 100_000_000,
        contractValueCeiling: null, // no upper limit
        ceilingDerived: false, // the top rung genuinely has no ceiling
        sourceText: 'Contract value exceeding EGP 100,000,000; capital ≥ EGP 1,000,000.',
      },
    },
    {
      key: 'B',
      position: 2,
      payload: {
        labelAr: 'فئة ب',
        labelEn: 'Category B',
        currency: 'EGP',
        minimumPaidUpCapital: 500_000,
        contractValueAbove: 50_000_000,
        contractValueCeiling: 100_000_000,
        ceilingDerived: true,
        sourceText: 'Contract value exceeding EGP 50,000,000; capital ≥ EGP 500,000.',
      },
    },
    {
      key: 'C',
      position: 3,
      payload: {
        labelAr: 'فئة ج',
        labelEn: 'Category C',
        currency: 'EGP',
        minimumPaidUpCapital: 50_000,
        contractValueAbove: 10_000_000,
        contractValueCeiling: 50_000_000,
        ceilingDerived: true,
        sourceText: 'Contract value exceeding EGP 10,000,000; capital ≥ EGP 50,000.',
      },
    },
    {
      key: 'D',
      position: 4,
      payload: {
        labelAr: 'فئة د',
        labelEn: 'Category D',
        currency: 'EGP',
        minimumPaidUpCapital: 20_000,
        contractValueAbove: 0,
        contractValueCeiling: 10_000_000,
        ceilingDerived: false, // stated directly as "not exceeding EGP 10,000,000"
        sourceText: 'Contract value not exceeding EGP 10,000,000; capital ≥ EGP 20,000.',
      },
    },
  ],
}
