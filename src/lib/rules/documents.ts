import type { ApplicantCapacity, PartyType } from '@prisma/client'
import { ruleSet, type RuleLookup } from './index'

/**
 * The document checklist, resolved for one applicant — REQ-REG-030 and Part C.
 *
 * The same resolution drives three surfaces that must never drift apart:
 * what the broker portal asks for, what the examiner sees as outstanding, and
 * what a requested completion (استيفاء) may legitimately cite. They agree
 * because they all call this, and none of them holds a list of its own.
 *
 * Applicability is computed, not stored. A sole trader who later re-declares as
 * a company gets the company's checklist immediately, without anyone having to
 * remember to re-derive it.
 */

export interface DocChecklistPayload {
  labelAr: string
  labelEn: string
  descriptionEn?: string
  appliesTo: PartyType[]
  mandatory: boolean
  conditionNote?: string
  acceptedMimeTypes: string[]
  maxSizeMb: number
  legalSource?: string
  relatedRequirements?: string[]
  relatedDeclarations?: string[]
}

export interface ChecklistItem {
  key: string
  position: number
  payload: DocChecklistPayload
  /** True when this applicant must supply it, after conditions are applied. */
  required: boolean
  /** Why it became required, where that is not obvious from the item itself. */
  requiredBecause: 'ALWAYS' | 'ACTING_UNDER_POA' | null
}

export interface ResolvedChecklist {
  ruleSetId: string
  ruleSetVersion: number
  items: ChecklistItem[]
  /** Only the ones this applicant must supply. */
  required: ChecklistItem[]
}

/**
 * Conditional items, and the condition each one turns on.
 *
 * DOC_CHECKLIST marks these `mandatory: false` with a `conditionNote` in prose,
 * because prose is what a lawyer reviews. Turning that prose into a decision
 * needs a machine-readable rule, and it lives here rather than in the seed so
 * that a rule-set version bump cannot silently change *which condition* an item
 * hangs on — only its wording, its limits, and whether it exists at all.
 */
const CONDITIONAL: Record<string, (input: { capacity: ApplicantCapacity | null }) => boolean> = {
  // REQ-REG-041 — required when the application is submitted by an agent.
  POWER_OF_ATTORNEY: ({ capacity }) => capacity === 'AGENT_UNDER_POA',
}

export async function resolveDocumentChecklist(
  applicant: { establishmentType: PartyType; capacity: ApplicantCapacity | null },
  lookup: RuleLookup,
): Promise<ResolvedChecklist> {
  const set = await ruleSet<DocChecklistPayload>('DOC_CHECKLIST', lookup)

  const items: ChecklistItem[] = set.items
    .filter((item) => item.payload.appliesTo.includes(applicant.establishmentType))
    .map((item) => {
      if (item.payload.mandatory) {
        return { key: item.key, position: item.position, payload: item.payload, required: true, requiredBecause: 'ALWAYS' as const }
      }

      const condition = CONDITIONAL[item.key]
      const required = condition ? condition({ capacity: applicant.capacity }) : false

      return {
        key: item.key,
        position: item.position,
        payload: item.payload,
        required,
        requiredBecause: required ? ('ACTING_UNDER_POA' as const) : null,
      }
    })

  return {
    ruleSetId: set.id,
    ruleSetVersion: set.version,
    items,
    required: items.filter((i) => i.required),
  }
}

/**
 * The checklist with each item's current upload attached.
 *
 * Superseded documents are excluded: a replaced identity card is still in the
 * archive, and still provable, but it is not what the examiner is looking at.
 */
export interface ChecklistStatusItem extends ChecklistItem {
  document: {
    id: string
    sha256: string
    mimeType: string
    sizeBytes: number
    originalFilename: string | null
    uploadedAt: Date
    version: number
  } | null
}

export function attachDocuments(
  checklist: ResolvedChecklist,
  documents: Array<{
    id: string
    checklistItemKey: string | null
    sha256: string
    mimeType: string
    sizeBytes: number
    originalFilename: string | null
    uploadedAt: Date
    version: number
    supersededBy: { id: string } | null
  }>,
): ChecklistStatusItem[] {
  const current = new Map<string, (typeof documents)[number]>()
  for (const doc of documents) {
    if (!doc.checklistItemKey || doc.supersededBy) continue
    const existing = current.get(doc.checklistItemKey)
    if (!existing || doc.version > existing.version) current.set(doc.checklistItemKey, doc)
  }

  return checklist.items.map((item) => {
    const doc = current.get(item.key)
    return {
      ...item,
      document: doc
        ? {
            id: doc.id,
            sha256: doc.sha256,
            mimeType: doc.mimeType,
            sizeBytes: doc.sizeBytes,
            originalFilename: doc.originalFilename,
            uploadedAt: doc.uploadedAt,
            version: doc.version,
          }
        : null,
    }
  })
}
