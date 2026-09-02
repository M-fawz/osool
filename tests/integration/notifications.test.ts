import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { capturedEmails, clearCapturedEmails } from '@/lib/email'
import { submitApplication } from '@/lib/applications/draft'
import {
  performAssignExaminer,
  performDecision,
  performIntake,
  performRecommend,
  performRecordFees,
  performRequestCompletions,
  saveExaminationRecord,
} from '@/lib/applications/workflow'
import { notify } from '@/lib/notifications'
import { ALL_EVENT_KEYS, CATALOGUE } from '@/lib/notifications/catalogue'
import { applicationSubject } from '@/lib/notifications/subjects'
import {
  actor,
  makeBroker,
  makeSubmittableApplication,
  makeUser,
} from '../support/fixtures'

/**
 * The notification system, proved against a file walked end to end.
 *
 * The point of this suite is not that a mail function returns without throwing.
 * It is that the right *person* is told the right thing at the right moment,
 * and — just as important — that the wrong person is not. Two of the register's
 * hardest rules live in the recipient list rather than in any screen:
 *
 *   · §4 — a SYSTEM_ADMIN is never sent case data, because administration is
 *     not access;
 *   · REQ-REG-052 — a reviewer is never told about a file they examined.
 *
 * Both are asserted here, because both are the kind of rule that is easy to
 * write down and easy to leak through a mailbox.
 */

function subjectsSent(): string[] {
  return capturedEmails().map((m) => m.subject)
}

function sentTo(email: string): string[] {
  return capturedEmails().filter((m) => m.to === email).map((m) => m.subject)
}

/**
 * The role-addressed events go to *every* officer holding the role, which on a
 * seeded database is more than the one this test created. That is the correct
 * behaviour — a file waiting at intake belongs to whoever is on the counter —
 * so the assertion is that the fixture officer is among them, not that they are
 * alone.
 */
function wasTold(email: string, fragment: string): boolean {
  return sentTo(email).some((subject) => subject.includes(fragment))
}

beforeEach(() => {
  clearCapturedEmails()
})

describe('the catalogue', () => {
  it('is complete: every event names a trigger, an audience, and a dedupe key', () => {
    expect(ALL_EVENT_KEYS.length).toBeGreaterThan(0)
    for (const key of ALL_EVENT_KEYS) {
      const definition = CATALOGUE[key]
      expect(definition.trigger, `${key} has no trigger`).toBeTruthy()
      expect(definition.audience.length, `${key} has no audience`).toBeGreaterThan(0)
      expect(typeof definition.dedupe, `${key} has no dedupe`).toBe('function')
    }
  })

  it('renders every message in both languages with no empty subject', () => {
    for (const key of ALL_EVENT_KEYS) {
      const built = CATALOGUE[key].build(
        {
          application: {
            id: 'app-1',
            temporaryNumber: 'T-2026/0001',
            brokerEntityId: 'be-1',
            examinerId: 'ex-1',
            tradeNameAr: 'منشأة الاختبار',
            tradeNameEn: 'Test Firm',
          },
          registration: {
            id: 'reg-1',
            registrationNumber: '2026/0001',
            brokerEntityId: 'be-1',
            validFrom: new Date('2026-01-01'),
            validTo: new Date('2031-01-01'),
          },
          appointment: {
            id: 'ap-1',
            applicationId: 'app-1',
            brokerEntityId: 'be-1',
            purpose: 'CARD_COLLECTION',
            startsAt: new Date('2026-09-01T07:00:00Z'),
            endsAt: new Date('2026-09-01T07:30:00Z'),
            locationAr: 'شباك ٣',
            locationEn: 'Counter 3',
            attendeeName: 'محمد أحمد',
          },
          signal: {
            id: 'sig-1',
            signalType: 'CATEGORY_CEILING_EXCEEDED',
            severity: 'HIGH',
            family: 'SUPERVISED_POPULATION',
            titleAr: 'تجاوز سقف الفئة',
            titleEn: 'Category ceiling exceeded',
            summaryAr: 'قيمة عقد تتجاوز سقف الفئة الممنوحة.',
            summaryEn: 'A contract value exceeds the ceiling for the category granted.',
          },
          accountChange: { userId: 'user-1', reason: 'Test' },
          extra: { itemCount: 3, reason: 'Test reason', round: 1 },
        },
        { userId: 'u1', email: 'x@osool.test', name: 'X', nameAr: null, role: 'BROKER_OWNER' },
      )

      expect(built.subjectAr, `${key} has no Arabic subject`).toBeTruthy()
      expect(built.subjectEn, `${key} has no English subject`).toBeTruthy()
      expect(built.parts.arBody.length, `${key} has no Arabic body`).toBeGreaterThan(0)
      expect(built.parts.enBody.length, `${key} has no English body`).toBeGreaterThan(0)
    }
  })
})

describe('a file walked from submission to approval', () => {
  it('notifies the right person at each step, and nobody else', async () => {
    const { user: broker, application } = await makeSubmittableApplication()
    const clerk = await makeUser({ role: 'REGISTRY_CLERK' })
    const examiner = await makeUser({ role: 'EXAMINER' })
    const reviewer = await makeUser({ role: 'REVIEWER' })
    const admin = await makeUser({ role: 'SYSTEM_ADMIN' })

    // ── Submission ─────────────────────────────────────────────────────────
    clearCapturedEmails()
    expect(await submitApplication(actor(broker), application.id)).toEqual({ ok: true })

    expect(wasTold(broker.email, 'received')).toBe(true)
    expect(wasTold(clerk.email, 'intake')).toBe(true)
    // §4: administration is not access. The administrator hears nothing.
    expect(sentTo(admin.email)).toEqual([])

    // ── Intake and assignment ──────────────────────────────────────────────
    clearCapturedEmails()
    expect(await performIntake(actor(clerk), { applicationId: application.id, pageCount: 12 })).toEqual({ ok: true })
    expect(
      await performAssignExaminer(actor(clerk), {
        applicationId: application.id,
        examinerId: examiner.id,
      }),
    ).toEqual({ ok: true })

    expect(wasTold(examiner.email, 'assigned to you')).toBe(true)
    expect(sentTo(admin.email)).toEqual([])

    // ── Returned for correction ────────────────────────────────────────────
    clearCapturedEmails()
    expect(
      await performRequestCompletions(actor(examiner), {
        applicationId: application.id,
        items: [
          {
            checklistItemKey: null,
            descriptionAr: 'صورة البطاقة غير واضحة.',
            descriptionEn: 'The ID scan is not legible.',
          },
        ],
      }),
    ).toEqual({ ok: true })

    expect(wasTold(broker.email, 'corrections')).toBe(true)
    // The count of items to fix is in the body, so the applicant knows the size
    // of the job before opening anything.
    const returnedBody = capturedEmails().find((m) => m.to === broker.email)!.text
    expect(returnedBody).toContain('1')

    // ── The applicant answers ──────────────────────────────────────────────
    clearCapturedEmails()
    expect(await submitApplication(actor(broker), application.id)).toEqual({ ok: true })
    expect(wasTold(examiner.email, 'Corrections have been submitted')).toBe(true)
    // The clerks are not told again: they dealt with this file at intake.
    expect(sentTo(clerk.email)).toEqual([])

    // ── Examination signed off ─────────────────────────────────────────────
    clearCapturedEmails()
    await saveExaminationRecord(actor(examiner), {
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
    expect(await performRecommend(actor(examiner), { applicationId: application.id })).toEqual({ ok: true })

    expect(wasTold(reviewer.email, 'ready for review')).toBe(true)

    // ── The decision ───────────────────────────────────────────────────────
    clearCapturedEmails()
    expect(
      await performDecision(actor(reviewer), {
        applicationId: application.id,
        decision: 'APPROVE',
        note: 'Documents in order.',
      }),
    ).toEqual({ ok: true })

    expect(wasTold(broker.email, 'approved')).toBe(true)
    expect(sentTo(admin.email)).toEqual([])

    // ── Fees ───────────────────────────────────────────────────────────────
    clearCapturedEmails()
    const issuer = await makeUser({ role: 'CARD_ISSUER' })
    expect(
      await performRecordFees(actor(issuer), {
        applicationId: application.id,
        paymentMethod: 'CASH',
        receiptNumber: 'R-9001',
        bankName: null,
        bankBranch: null,
        chequeNumber: null,
        lines: [{ feeKey: 'REGISTRATION_FEE', amount: 1000 }],
      }),
    ).toEqual({ ok: true })

    const feeMail = capturedEmails().find((m) => m.to === broker.email)
    expect(feeMail?.text).toContain('R-9001')
  })
})

describe('REQ-REG-052 in the mailbox', () => {
  it('does not tell a reviewer about a file they examined themselves', async () => {
    const { user: broker, application } = await makeSubmittableApplication()
    const clerk = await makeUser({ role: 'REGISTRY_CLERK' })

    // One person who examines and also holds the reviewer role. The register
    // has to cope with this: small offices do it, and it is exactly the case
    // segregation of duties exists for.
    const bothHats = await makeUser({ role: 'EXAMINER' })
    const otherReviewer = await makeUser({ role: 'REVIEWER' })

    await submitApplication(actor(broker), application.id)
    await performIntake(actor(clerk), { applicationId: application.id, pageCount: 4 })
    await performAssignExaminer(actor(clerk), {
      applicationId: application.id,
      examinerId: bothHats.id,
    })
    await saveExaminationRecord(actor(bothHats), {
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

    // Now they hold the reviewer role too.
    await db.user.update({ where: { id: bothHats.id }, data: { role: 'REVIEWER' } })

    clearCapturedEmails()
    await performRecommend(
      actor({ ...bothHats, role: 'EXAMINER' } as typeof bothHats),
      { applicationId: application.id },
    )

    expect(wasTold(otherReviewer.email, 'ready for review')).toBe(true)
    expect(sentTo(bothHats.email)).toEqual([])
  })
})

describe('duplicate suppression', () => {
  it('sends one message per person per event, however many times it is fired', async () => {
    const { entity } = await makeBroker()
    const { application } = await makeSubmittableApplication()
    void entity

    const subject = await applicationSubject(application.id)
    expect(subject).toBeDefined()

    clearCapturedEmails()
    const first = await notify({ event: 'APPLICATION_SUBMITTED', subject: { application: subject! } })
    const second = await notify({ event: 'APPLICATION_SUBMITTED', subject: { application: subject! } })

    expect(first.every((o) => o.status === 'SENT')).toBe(true)
    expect(second.every((o) => o.status === 'SUPPRESSED')).toBe(true)
    expect(subjectsSent().length).toBe(first.length)
    expect(first.length).toBeGreaterThan(0)

    const rows = await db.notification.findMany({
      where: { applicationId: application.id, eventKey: 'APPLICATION_SUBMITTED' },
    })
    expect(rows.length).toBe(first.length)
    expect(rows.every((r) => r.status === 'SENT')).toBe(true)
  })

  it('records the fact of a send without recording its body or any link', async () => {
    const { application } = await makeSubmittableApplication()
    const subject = await applicationSubject(application.id)

    await notify({ event: 'APPLICATION_APPROVED', subject: { application: subject! } })

    const row = await db.notification.findFirst({
      where: { applicationId: application.id, eventKey: 'APPLICATION_APPROVED' },
    })
    expect(row).not.toBeNull()
    expect(row!.subjectAr).toBeTruthy()
    expect(row!.subjectEn).toBeTruthy()
    // The table is a record that something was sent, not an outbox somebody
    // could read a link out of. There is no column for the body, and there
    // must not be one.
    expect(Object.keys(row!)).not.toContain('body')
    expect(Object.keys(row!)).not.toContain('html')
  })
})
