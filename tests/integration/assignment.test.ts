import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import {
  performRecommend,
  performRequestCompletions,
  saveExaminationRecord,
} from '@/lib/applications/workflow'
import { actor, makeApplication, makeBroker, makeUser } from '../support/fixtures'

/**
 * F-03 and F-04 — the assigned examiner.
 *
 * Before this suite existed the only thing standing between an examiner and a
 * colleague's file was `canSign={application.examinerId === session.userId}`,
 * a prop on a React component. CLAUDE.md rule 1: "A rule that is not enforced
 * server-side does not exist." These tests call the domain layer directly, with
 * no browser and no component anywhere in the stack, which is the only way to
 * demonstrate that the control is real.
 */

async function underExamination() {
  const { entity } = await makeBroker()
  const assigned = await makeUser({ role: 'EXAMINER' })
  const application = await makeApplication({
    brokerEntityId: entity.id,
    status: 'UNDER_EXAMINATION',
    examinerId: assigned.id,
  })
  return { entity, assigned, application }
}

const completionItem = {
  checklistItemKey: null,
  descriptionAr: 'صورة بطاقة الرقم القومي غير واضحة.',
  descriptionEn: 'The national ID scan is not legible.',
}

describe('an examiner the file is not assigned to', () => {
  it('cannot request completions on it', async () => {
    const { application } = await underExamination()
    const stranger = await makeUser({ role: 'EXAMINER' })

    const result = await performRequestCompletions(actor(stranger), {
      applicationId: application.id,
      items: [completionItem],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.violation.code).toBe('NOT_THE_ASSIGNED_OFFICER')
    expect(result.violation.requirementIds).toContain('REQ-REG-052')

    const after = await db.application.findUniqueOrThrow({ where: { id: application.id } })
    expect(after.status).toBe('UNDER_EXAMINATION')
    expect(await db.completion.count({ where: { applicationId: application.id } })).toBe(0)
  })

  it('cannot sign the file off to review', async () => {
    const { application, assigned } = await underExamination()
    await saveExaminationRecord(actor(assigned), {
      applicationId: application.id,
      originalCount: 1,
      copyCount: 1,
      brokerageNature: ['SELL'],
      proposedValidFrom: new Date('2026-01-01'),
      proposedValidTo: new Date('2031-01-01'),
      recommendation: 'RECOMMEND_APPROVAL',
      examinerNote: null,
      verifiedFieldKeys: [],
    })

    const stranger = await makeUser({ role: 'EXAMINER' })
    const result = await performRecommend(actor(stranger), { applicationId: application.id })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.violation.code).toBe('NOT_THE_ASSIGNED_OFFICER')

    const after = await db.application.findUniqueOrThrow({ where: { id: application.id } })
    expect(after.status).toBe('UNDER_EXAMINATION')
  })

  it('cannot edit the internal review form', async () => {
    const { application } = await underExamination()
    const stranger = await makeUser({ role: 'EXAMINER' })

    const result = await saveExaminationRecord(actor(stranger), {
      applicationId: application.id,
      originalCount: 9,
      copyCount: 9,
      brokerageNature: ['RENTAL'],
      proposedValidFrom: new Date('2026-01-01'),
      proposedValidTo: new Date('2031-01-01'),
      recommendation: 'RECOMMEND_REFUSAL',
      examinerNote: 'written by somebody else',
      verifiedFieldKeys: [],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.violation.code).toBe('NOT_THE_ASSIGNED_OFFICER')
  })
})

describe('the assigned examiner', () => {
  it('can request completions, and the file moves', async () => {
    const { application, assigned } = await underExamination()

    const result = await performRequestCompletions(actor(assigned), {
      applicationId: application.id,
      items: [completionItem],
    })

    expect(result).toEqual({ ok: true })
    const after = await db.application.findUniqueOrThrow({ where: { id: application.id } })
    expect(after.status).toBe('AWAITING_COMPLETION')
    expect(await db.completion.count({ where: { applicationId: application.id } })).toBe(1)
  })

  it('can sign the file off to review', async () => {
    const { application, assigned } = await underExamination()
    await saveExaminationRecord(actor(assigned), {
      applicationId: application.id,
      originalCount: 1,
      copyCount: 1,
      brokerageNature: ['SELL'],
      proposedValidFrom: new Date('2026-01-01'),
      proposedValidTo: new Date('2031-01-01'),
      recommendation: 'RECOMMEND_APPROVAL',
      examinerNote: null,
      verifiedFieldKeys: [],
    })

    const result = await performRecommend(actor(assigned), { applicationId: application.id })

    expect(result).toEqual({ ok: true })
    const after = await db.application.findUniqueOrThrow({ where: { id: application.id } })
    expect(after.status).toBe('UNDER_REVIEW')
  })
})

describe('an unassigned file', () => {
  it('refuses examiner steps outright rather than assigning by side effect', async () => {
    const { entity } = await makeBroker()
    const application = await makeApplication({
      brokerEntityId: entity.id,
      status: 'UNDER_EXAMINATION',
      examinerId: null,
    })
    const examiner = await makeUser({ role: 'EXAMINER' })

    const result = await performRequestCompletions(actor(examiner), {
      applicationId: application.id,
      items: [completionItem],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.violation.code).toBe('NOT_THE_ASSIGNED_OFFICER')

    const after = await db.application.findUniqueOrThrow({ where: { id: application.id } })
    expect(after.examinerId).toBeNull()
  })
})
