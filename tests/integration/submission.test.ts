import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { evaluateCompleteness, loadApplicationDetail } from '@/lib/applications/completeness'
import { submitApplication } from '@/lib/applications/draft'
import { resolveDeclarations } from '@/lib/rules/declarations'
import { resolveDocumentChecklist } from '@/lib/rules/documents'
import { putDocument, sha256, storageKeyFor } from '@/lib/storage'
import { actor, makeApplication, makeBroker } from '../support/fixtures'

/**
 * Phase 15 — the rule versions a submission was judged under.
 *
 * `Application.submittedUnderRuleSetIds` exists so that a decision taken in
 * March stays re-explainable after October amends the decree. It was written by
 * walking the *violations* an evaluation produced — which are empty exactly when
 * the submission succeeds. So every application that made it into the register
 * recorded that it had been judged under no rules at all.
 *
 * This suite submits a complete application end to end and reads the column
 * back. It is the only way to catch this class of bug: the code that was wrong
 * type-checked, linted, and looked right.
 */

const PLACEHOLDER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** A draft carried all the way to submittable: entity, contract, docs, all 15. */
async function completeDraft() {
  const { user, entity } = await makeBroker()
  const application = await makeApplication({ brokerEntityId: entity.id, status: 'DRAFT' })
  const asOf = new Date()

  await db.applicationEntityData.create({
    data: {
      applicationId: application.id,
      tradeNameAr: 'منشأة اختبار الاستيفاء',
      tradeNameEn: 'Completeness Test Firm',
      establishmentType: 'NATURAL_PERSON',
      headOfficeAddress: '١ شارع الاختبار، القاهرة',
      governorate: 'CAIRO',
      commercialRegisterNo: `CR-${Date.now()}`,
      commercialRegisterOffice: 'القاهرة',
      commercialRegisterDate: new Date('2024-01-01'),
      taxRegistrationNo: `TX-${Date.now()}`,
      taxOffice: 'وسط القاهرة',
      telephone: '0223456789',
      email: 'firm@osool.test',
    },
  })

  await db.applicationContractData.create({
    data: {
      applicationId: application.id,
      position: 1,
      clientNameAr: 'عميل الاختبار',
      clientNameEn: 'Test Client',
      clientNationality: 'مصري',
      authenticationNumber: '12345',
      authenticationBody: 'REAL_ESTATE_PUBLICITY',
      validFrom: new Date('2026-01-01'),
      validTo: new Date('2027-01-01'),
      capacityActedIn: 'SELL',
      contractValue: 500_000,
      subjectDescription: 'شقة سكنية',
      subjectAddress: '٢ شارع الاختبار',
      governorate: 'CAIRO',
    },
  })

  const checklist = await resolveDocumentChecklist(
    { establishmentType: 'NATURAL_PERSON', capacity: 'SOLE_TRADER' },
    { asOf },
  )
  const hash = sha256(PLACEHOLDER)
  await putDocument({ bytes: PLACEHOLDER, mimeType: 'image/png', originalFilename: 'scan.png' })

  for (const item of checklist.items.filter((i) => i.required)) {
    await db.document.create({
      data: {
        kind: 'APPLICANT_UPLOAD',
        checklistItemKey: item.key,
        applicationId: application.id,
        sha256: hash,
        storageKey: storageKeyFor(hash),
        sizeBytes: PLACEHOLDER.byteLength,
        mimeType: 'image/png',
        originalFilename: `${item.key}.png`,
        uploadedByUserId: user.id,
      },
    })
  }

  const declarations = await resolveDeclarations({ asOf })
  for (const item of declarations.items) {
    await db.declaration.create({
      data: {
        applicationId: application.id,
        declarationKey: item.key,
        textAr: item.payload.textAr,
        textEn: item.payload.textEn ?? null,
        affirmed: true,
      },
    })
  }

  return { user, entity, application }
}

describe('a complete submission', () => {
  it('records the rule-set versions it was actually judged under', async () => {
    const { user, application } = await completeDraft()

    const detail = await loadApplicationDetail(application.id)
    const completeness = await evaluateCompleteness(detail!, { asOf: new Date() })
    expect(completeness.gaps).toEqual([])
    expect(completeness.ok).toBe(true)

    const result = await submitApplication(actor(user), application.id)
    expect(result).toEqual({ ok: true })

    const after = await db.application.findUniqueOrThrow({ where: { id: application.id } })
    expect(after.status).toBe('SUBMITTED')

    const stamped = after.submittedUnderRuleSetIds as Record<string, number> | null
    expect(stamped).not.toBeNull()

    // The three rule sets the evaluator genuinely consults on a natural-person
    // sole-trader application. An empty object here is the bug this test exists
    // for, and it is what every row in the register carried before.
    expect(Object.keys(stamped!).sort()).toEqual([
      'BROKER_CATEGORY',
      'DECLARATIONS',
      'DOC_CHECKLIST',
    ])
    for (const version of Object.values(stamped!)) {
      expect(version).toBeGreaterThanOrEqual(1)
    }
  })

  it('reports the same versions from the evaluator whether or not it refuses', async () => {
    const { entity } = await makeBroker()
    const empty = await makeApplication({ brokerEntityId: entity.id, status: 'DRAFT' })

    const detail = await loadApplicationDetail(empty.id)
    const completeness = await evaluateCompleteness(detail!, { asOf: new Date() })

    expect(completeness.ok).toBe(false)
    expect(completeness.gaps.length).toBeGreaterThan(0)
    // Consulted-and-satisfied is still consulted: an incomplete application is
    // judged against the same checklist and declarations as a complete one.
    expect(Object.keys(completeness.ruleSetVersions).sort()).toEqual([
      'BROKER_CATEGORY',
      'DECLARATIONS',
      'DOC_CHECKLIST',
    ])
  })
})
