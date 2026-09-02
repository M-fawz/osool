import type { RuleSetDefinition } from './types'
import { brokerCategory } from './broker-category'
import { brokerType } from './broker-type'
import { declarations } from './declarations'
import { docChecklist } from './doc-checklist'
import { examinationForm } from './examination-form'
import { feeSchedule } from './fee-schedule'
import { integritySignals } from './integrity-signals'
import { obligationPeriods } from './obligation-periods'
import { retention } from './retention'

export type { RuleSetDefinition, RuleItemDefinition } from './types'

/**
 * Every rule set this system seeds.
 *
 * 02-SYSTEM-ARCHITECTURE §6 also lists RED_FLAGS and FOREIGN_OWNERSHIP. Those
 * are deliberately not seeded: an empty rule set is honest, whereas a
 * half-populated one would be read as complete by whoever builds against it
 * next. RED_FLAGS in particular is reference material for inspection, and
 * REQ-AML-060 is clear that the indicators are indicative — seeding them as
 * though they were computable tests would misrepresent what they are.
 *
 * INTEGRITY_SIGNALS *is* seeded, and its own file opens with the reason it must
 * never be read as legal thresholds: those numbers are operational parameters
 * the Authority sets, not requirements drawn from any instrument.
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
  integritySignals,
]

export {
  brokerCategory,
  brokerType,
  declarations,
  docChecklist,
  examinationForm,
  feeSchedule,
  integritySignals,
  obligationPeriods,
  retention,
}
