import { ruleSet, type RuleLookup } from './index'

/**
 * The fifteen declarations, resolved — REQ-REG-040.
 *
 * "Each must be captured as a discrete, individually recorded assertion — not a
 *  single 'I agree' checkbox — because each is independently falsifiable and
 *  independently cross-checkable."
 *
 * Two consequences run through this module. The wording travels with the
 * answer, so the register can always show what the applicant actually asserted
 * rather than what the current rule-set version happens to say. And the
 * grouping below is presentational only: it exists so fifteen legal paragraphs
 * do not arrive as one wall of text, and it never merges two assertions into
 * one act.
 */

export interface DeclarationPayload {
  wordingStatus: string
  textAr: string
  textEn: string
  crossCheckable?: boolean
  notifyOnChange?: boolean
  obligationDays?: number
  exemptionNote?: string
  requiresQualificationWhenNegative?: boolean
  relatedRequirements?: string[]
}

/**
 * How the fifteen are grouped on screen.
 *
 * Not in the rule set, because it is a reading aid rather than a rule: a decree
 * amending declaration 7 must not have to restate how the portal lays out the
 * page. An item in no group falls into `OTHER`, so adding a sixteenth
 * declaration to the rule set cannot make it disappear from the interface.
 */
export type DeclarationGroup = 'ELIGIBILITY' | 'ONGOING_DUTIES' | 'ACCURACY' | 'OTHER'

const GROUPS: Record<DeclarationGroup, string[]> = {
  ELIGIBILITY: ['DECL-01', 'DECL-02', 'DECL-03', 'DECL-04', 'DECL-10'],
  ONGOING_DUTIES: ['DECL-05', 'DECL-06', 'DECL-07', 'DECL-08', 'DECL-09', 'DECL-11'],
  ACCURACY: ['DECL-12', 'DECL-13', 'DECL-14', 'DECL-15'],
  OTHER: [],
}

export function groupOf(key: string): DeclarationGroup {
  for (const [group, keys] of Object.entries(GROUPS)) {
    if (keys.includes(key)) return group as DeclarationGroup
  }
  return 'OTHER'
}

export interface DeclarationItem {
  key: string
  position: number
  group: DeclarationGroup
  payload: DeclarationPayload
}

export interface ResolvedDeclarations {
  ruleSetId: string
  ruleSetVersion: number
  items: DeclarationItem[]
}

export async function resolveDeclarations(lookup: RuleLookup): Promise<ResolvedDeclarations> {
  const set = await ruleSet<DeclarationPayload>('DECLARATIONS', lookup)

  return {
    ruleSetId: set.id,
    ruleSetVersion: set.version,
    items: set.items.map((item) => ({
      key: item.key,
      position: item.position,
      group: groupOf(item.key),
      payload: item.payload,
    })),
  }
}

/** The display order of the groups, and their headings. */
export const declarationGroupLabels: Record<DeclarationGroup, { ar: string; en: string; order: number }> = {
  ELIGIBILITY: { ar: 'شروط الأهلية', en: 'Eligibility conditions', order: 1 },
  ONGOING_DUTIES: { ar: 'التزامات مستمرة بعد القيد', en: 'Continuing obligations after registration', order: 2 },
  ACCURACY: { ar: 'إقرارات بصحة البيانات', en: 'Declarations of accuracy', order: 3 },
  OTHER: { ar: 'إقرارات أخرى', en: 'Other declarations', order: 4 },
}
