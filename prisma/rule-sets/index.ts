import type { RuleSetDefinition } from './types'
import { brokerCategory } from './broker-category'
import { brokerType } from './broker-type'
import { declarations } from './declarations'
import { docChecklist } from './doc-checklist'
import { examinationForm } from './examination-form'
import { feeSchedule } from './fee-schedule'
import { obligationPeriods } from './obligation-periods'
import { retention } from './retention'

export type { RuleSetDefinition, RuleItemDefinition } from './types'

/**
 * Every rule set this system seeds.
 *
 * 02-SYSTEM-ARCHITECTURE §6 also lists RED_FLAGS, SIGNALS, and
 * FOREIGN_OWNERSHIP. Those belong to Phases 3–5 and are deliberately not
 * seeded yet: an empty rule set is honest, whereas a half-populated one would
 * be read as complete by whoever builds against it next.
 */
export const ruleSetDefinitions: RuleSetDefinition[] = [
  brokerCategory,
  brokerType,
  docChecklist,
  declarations,
  retention,
  obligationPeriods,
  feeSchedule,
  examinationForm,
]

export {
  brokerCategory,
  brokerType,
  declarations,
  docChecklist,
  examinationForm,
  feeSchedule,
  obligationPeriods,
  retention,
}
