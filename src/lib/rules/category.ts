import type { BrokerCategory } from '@prisma/client'
import { ruleSet, type RuleLookup } from './index'
import {
  applyCounselGate,
  evaluationFrom,
  formatEgp,
  type RuleEvaluation,
  type RuleViolation,
} from './violation'

/**
 * Category and capital evaluation — REQ-REG-020, REQ-REG-021, REQ-REG-022.
 * Decree 578/2025, Article 2.
 *
 * Every number used here is read from the BROKER_CATEGORY rule set as of the
 * relevant date. There is no threshold in this file, and there must never be
 * one: the refusal text below interpolates the figures it was given rather
 * than restating them, so a decree amendment changes the message as well as
 * the outcome without anyone editing this code.
 */

interface CategoryPayload {
  labelAr: string
  labelEn: string
  currency: string
  minimumPaidUpCapital: number
  contractValueAbove: number
  contractValueCeiling: number | null
  ceilingDerived: boolean
  sourceText: string
}

/**
 * REQ-REG-021 — an application for a category whose capital floor is not met
 * must be refused.
 *
 * `asOf` is the submission date, so an application submitted before a decree
 * amendment is judged by the bands that were in force when it was submitted.
 */
export async function evaluateCategoryAgainstCapital(
  input: { category: BrokerCategory; paidUpCapital: number },
  lookup: RuleLookup,
): Promise<RuleEvaluation> {
  const set = await ruleSet<CategoryPayload>('BROKER_CATEGORY', lookup)
  const versions = { BROKER_CATEGORY: set.version }

  const band = set.byKey.get(input.category)
  if (!band) {
    // The requested category has no definition in the version in force. This is
    // a configuration fault, not a user error, and it must not be reported as
    // though the applicant did something wrong.
    const violation: RuleViolation = {
      code: 'CATEGORY_NOT_DEFINED',
      severity: 'BLOCKING',
      requirementIds: ['REQ-REG-020'],
      legalSource: set.legalSource ?? 'Ministerial Decree 578 of 2025, Article 2',
      ruleSetCode: set.code,
      ruleSetVersion: set.version,
      field: 'requestedCategory',
      needsCounsel: false,
      evidence: { requestedCategory: input.category, ruleSetVersion: set.version },
      ar: {
        blocked: 'لا يمكن متابعة هذا الطلب.',
        why: `الفئة المطلوبة (${input.category}) غير معرَّفة في نسخة القواعد السارية في هذا التاريخ.`,
        nextStep: 'اختر فئة من الفئات المعروضة في النموذج.',
        whoToAsk: 'إذا استمرت المشكلة، تواصل مع الإدارة المركزية للسجلات التجارية بالهيئة.',
      },
      en: {
        blocked: 'This application cannot proceed.',
        why: `The requested category (${input.category}) is not defined in the rule version in force on this date.`,
        nextStep: 'Choose one of the categories offered in the form.',
        whoToAsk:
          'If this persists, contact the Central Administration for Commercial Registrations at the Authority.',
      },
    }
    return evaluationFrom([violation], versions)
  }

  const floor = band.payload.minimumPaidUpCapital

  if (input.paidUpCapital >= floor) {
    return evaluationFrom([], versions)
  }

  // Name the categories the applicant *could* apply under, so the refusal ends
  // with something they can actually do rather than only what they cannot.
  const affordable = set.items
    .filter((i) => input.paidUpCapital >= i.payload.minimumPaidUpCapital)
    .sort((a, b) => b.payload.minimumPaidUpCapital - a.payload.minimumPaidUpCapital)

  const alternative = affordable[0]

  const nextStepAr = alternative
    ? `إمّا زيادة رأس المال المدفوع إلى ${formatEgp(floor, 'ar')} على الأقل، أو التقدم تحت ${alternative.payload.labelAr}، التي تسمح بعقود ${
        alternative.payload.contractValueCeiling === null
          ? 'دون حد أقصى'
          : `حتى ${formatEgp(alternative.payload.contractValueCeiling, 'ar')}`
      }.`
    : `زيادة رأس المال المدفوع إلى ${formatEgp(floor, 'ar')} على الأقل، أو مراجعة الحد الأدنى لرأس المال لكل فئة قبل إعادة التقديم.`

  const nextStepEn = alternative
    ? `Either raise the paid-up capital to at least ${formatEgp(floor, 'en')}, or apply under ${alternative.payload.labelEn}, which permits contracts ${
        alternative.payload.contractValueCeiling === null
          ? 'with no upper limit'
          : `up to ${formatEgp(alternative.payload.contractValueCeiling, 'en')}`
      }.`
    : `Raise the paid-up capital to at least ${formatEgp(floor, 'en')}, or review the minimum capital for each category before reapplying.`

  const violation: RuleViolation = {
    code: 'CATEGORY_CAPITAL_BELOW_FLOOR',
    severity: 'BLOCKING',
    requirementIds: ['REQ-REG-020', 'REQ-REG-021'],
    legalSource: set.legalSource ?? 'Ministerial Decree 578 of 2025, Article 2',
    ruleSetCode: set.code,
    ruleSetVersion: set.version,
    field: 'paidUpCapital',
    needsCounsel: false,
    evidence: {
      requestedCategory: input.category,
      paidUpCapital: input.paidUpCapital,
      minimumPaidUpCapital: floor,
      shortfall: floor - input.paidUpCapital,
      alternativeCategory: alternative?.key ?? null,
      asOf: lookup.asOf.toISOString(),
      ruleSetVersion: set.version,
    },
    ar: {
      blocked: 'لا يمكن تقديم هذا الطلب.',
      why: `رأس المال المدفوع ${formatEgp(input.paidUpCapital, 'ar')} لا يبلغ الحد الأدنى المقرر لـ${band.payload.labelAr} وهو ${formatEgp(floor, 'ar')} — قرار وزاري ٥٧٨ لسنة ٢٠٢٥، المادة ٢.`,
      nextStep: nextStepAr,
      whoToAsk:
        'للاستفسار، تواصل مع الإدارة المركزية للسجلات التجارية بالهيئة العامة للرقابة على الصادرات والواردات.',
    },
    en: {
      blocked: 'This application cannot be submitted.',
      why: `Paid-up capital of ${formatEgp(input.paidUpCapital, 'en')} does not meet the minimum for ${band.payload.labelEn} (${formatEgp(floor, 'en')}) — Ministerial Decree 578 of 2025, Article 2.`,
      nextStep: nextStepEn,
      whoToAsk:
        'For guidance, contact the Central Administration for Commercial Registrations at GOEIC.',
    },
  }

  return evaluationFrom([applyCounselGate(violation)], versions)
}

/**
 * REQ-REG-022 — a brokerage contract whose value exceeds the ceiling of the
 * broker's registered category.
 *
 * 01-LEGAL-REFERENCE.md marks this `[NEEDS COUNSEL]`: it is not settled
 * whether the breach is a hard bar on recording the contract or a supervisory
 * flag, and it states the default explicitly — "record it, flag it, notify
 * supervision". So this returns FLAG, never BLOCKING. The contract is
 * recorded; the Authority is told.
 */
export async function evaluateContractAgainstCategoryCeiling(
  input: { category: BrokerCategory; contractValue: number },
  lookup: RuleLookup,
): Promise<RuleEvaluation> {
  const set = await ruleSet<CategoryPayload>('BROKER_CATEGORY', lookup)
  const versions = { BROKER_CATEGORY: set.version }

  const band = set.byKey.get(input.category)
  if (!band) return evaluationFrom([], versions)

  const ceiling = band.payload.contractValueCeiling
  if (ceiling === null || input.contractValue <= ceiling) {
    return evaluationFrom([], versions)
  }

  const permitted = set.items
    .filter((i) => i.payload.contractValueCeiling === null || i.payload.contractValueCeiling >= input.contractValue)
    .sort((a, b) => a.payload.minimumPaidUpCapital - b.payload.minimumPaidUpCapital)[0]

  const violation: RuleViolation = {
    code: 'CONTRACT_VALUE_ABOVE_CATEGORY_CEILING',
    // The default from 01-LEGAL-REFERENCE.md REQ-REG-022, not a hard bar.
    severity: 'FLAG',
    requirementIds: ['REQ-REG-022'],
    legalSource: set.legalSource ?? 'Ministerial Decree 578 of 2025, Article 2',
    ruleSetCode: set.code,
    ruleSetVersion: set.version,
    field: 'contractValue',
    needsCounsel: true,
    evidence: {
      category: input.category,
      contractValue: input.contractValue,
      categoryCeiling: ceiling,
      ceilingDerived: band.payload.ceilingDerived,
      excess: input.contractValue - ceiling,
      categoryPermittingThisValue: permitted?.key ?? null,
      asOf: lookup.asOf.toISOString(),
      ruleSetVersion: set.version,
    },
    ar: {
      blocked: 'تم قيد العقد، مع إحالته إلى الرقابة.',
      why: `قيمة العقد ${formatEgp(input.contractValue, 'ar')} تتجاوز الحد الأقصى المقرر لـ${band.payload.labelAr} وهو ${formatEgp(ceiling, 'ar')} — قرار وزاري ٥٧٨ لسنة ٢٠٢٥، المادة ٢.`,
      nextStep: permitted
        ? `للتعامل في عقود بهذه القيمة، يلزم القيد تحت ${permitted.payload.labelEn === undefined ? permitted.key : permitted.payload.labelAr}، وحدها الأدنى لرأس المال ${formatEgp(permitted.payload.minimumPaidUpCapital, 'ar')}.`
        : 'راجع فئة القيد الحالية قبل مباشرة أي عمل بمقتضى هذا العقد.',
      whoToAsk: 'ستتواصل معك إدارة الرقابة بالهيئة إذا لزم الأمر.',
    },
    en: {
      blocked: 'The contract was recorded, and referred to supervision.',
      why: `The contract value of ${formatEgp(input.contractValue, 'en')} exceeds the ceiling for ${band.payload.labelEn} (${formatEgp(ceiling, 'en')}) — Ministerial Decree 578 of 2025, Article 2.`,
      nextStep: permitted
        ? `To act on contracts of this value, registration under ${permitted.payload.labelEn} is required, whose minimum paid-up capital is ${formatEgp(permitted.payload.minimumPaidUpCapital, 'en')}.`
        : 'Review the current registration category before performing any work under this contract.',
      whoToAsk: 'The Authority’s supervision department will contact you if anything further is needed.',
    },
  }

  return evaluationFrom([violation], versions)
}
