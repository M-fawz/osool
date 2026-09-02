import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import {
  bookAppointment,
  cancelAppointment,
  liveAppointment,
  openSlots,
  recordAttendance,
  rescheduleAppointment,
  slotsFor,
} from '@/lib/appointments'
import { actor, makeApplication, makeBroker, makeUser } from '../support/fixtures'

/**
 * Phase 6 — the counter, and the one rule that makes it real.
 *
 * "A broker should NOT be able to reserve a slot already taken by another
 * broker. This must be enforced server-side." A test that books twice in
 * sequence proves nothing about that: the interesting case is two brokers
 * clicking at the same instant, which is the case a naive
 * read-count-then-write implementation gets wrong every time and passes every
 * sequential test.
 *
 * So these tests fire genuinely parallel bookings at one place and count the
 * winners.
 */

function period(offsetDays: number, hour: number) {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() + offsetDays)
  start.setUTCHours(hour, 0, 0, 0)
  return { startsAt: start, endsAt: new Date(start.getTime() + 30 * 60 * 1000) }
}

async function counterWithOnePlace(offsetDays = 7) {
  const clerk = await makeUser({ role: 'REGISTRY_CLERK' })
  const at = period(offsetDays, 9 + Math.floor(Math.random() * 6))
  await openSlots(actor(clerk), {
    purpose: 'DOCUMENT_HANDOVER',
    locationAr: `شباك اختبار ${Math.random().toString(36).slice(2, 8)}`,
    locationEn: 'Test counter',
    capacity: 1,
    periods: [at],
  })
  const slot = await db.appointmentSlot.findFirstOrThrow({
    where: { startsAt: at.startsAt, purpose: 'DOCUMENT_HANDOVER' },
    orderBy: { createdAt: 'desc' },
  })
  return { slot, clerk }
}

async function applicantReadyToHandOver() {
  const { user, entity } = await makeBroker()
  const application = await makeApplication({ brokerEntityId: entity.id, status: 'SUBMITTED' })
  return { user, entity, application }
}

describe('two brokers competing for one place', () => {
  it('gives it to exactly one of them, and tells the other why', async () => {
    const { slot } = await counterWithOnePlace()
    const a = await applicantReadyToHandOver()
    const b = await applicantReadyToHandOver()

    const [first, second] = await Promise.all([
      bookAppointment(actor(a.user), {
        slotId: slot.id,
        applicationId: a.application.id,
        purpose: 'DOCUMENT_HANDOVER',
        attendeeName: 'المتقدم الأول',
        attendeePhone: null,
      }),
      bookAppointment(actor(b.user), {
        slotId: slot.id,
        applicationId: b.application.id,
        purpose: 'DOCUMENT_HANDOVER',
        attendeeName: 'المتقدم الثاني',
        attendeePhone: null,
      }),
    ])

    const winners = [first, second].filter((r) => r.ok)
    const losers = [first, second].filter((r) => !r.ok)

    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)

    const refusal = losers[0]!
    expect(refusal.ok).toBe(false)
    if (!refusal.ok) {
      expect(refusal.violation.code).toBe('SLOT_NO_LONGER_AVAILABLE')
      // Four-part refusal, both languages. 03-DESIGN-DIRECTION §6.
      expect(refusal.violation.ar.blocked).toBeTruthy()
      expect(refusal.violation.ar.why).toBeTruthy()
      expect(refusal.violation.ar.nextStep).toBeTruthy()
      expect(refusal.violation.en.whoToAsk).toBeTruthy()
    }

    const after = await db.appointmentSlot.findUniqueOrThrow({ where: { id: slot.id } })
    expect(after.bookedCount).toBe(1)
    expect(after.bookedCount).toBeLessThanOrEqual(after.capacity)

    expect(await db.appointment.count({ where: { slotId: slot.id, status: 'BOOKED' } })).toBe(1)
  })

  it('holds under ten simultaneous attempts on a slot with three places', async () => {
    const clerk = await makeUser({ role: 'REGISTRY_CLERK' })
    const at = period(9, 11)
    await openSlots(actor(clerk), {
      purpose: 'DOCUMENT_HANDOVER',
      locationAr: `شباك اختبار ${Math.random().toString(36).slice(2, 8)}`,
      locationEn: 'Test counter',
      capacity: 3,
      periods: [at],
    })
    const slot = await db.appointmentSlot.findFirstOrThrow({
      where: { startsAt: at.startsAt },
      orderBy: { createdAt: 'desc' },
    })

    const applicants = await Promise.all(
      Array.from({ length: 10 }, () => applicantReadyToHandOver()),
    )

    const results = await Promise.all(
      applicants.map((applicant) =>
        bookAppointment(actor(applicant.user), {
          slotId: slot.id,
          applicationId: applicant.application.id,
          purpose: 'DOCUMENT_HANDOVER',
          attendeeName: 'متقدم',
          attendeePhone: null,
        }),
      ),
    )

    expect(results.filter((r) => r.ok)).toHaveLength(3)

    const after = await db.appointmentSlot.findUniqueOrThrow({ where: { id: slot.id } })
    expect(after.bookedCount).toBe(3)
    expect(await db.appointment.count({ where: { slotId: slot.id, status: 'BOOKED' } })).toBe(3)
  })
})

describe('the database refuses over-booking on its own', () => {
  it('rejects a hand-written update that would exceed capacity', async () => {
    const { slot } = await counterWithOnePlace(11)

    // The application code is not in this path at all. If the CHECK constraint
    // were missing, this would succeed and the counter would be overfilled by
    // anyone with a psql prompt.
    await expect(
      db.appointmentSlot.update({ where: { id: slot.id }, data: { bookedCount: 5 } }),
    ).rejects.toThrow()

    const after = await db.appointmentSlot.findUniqueOrThrow({ where: { id: slot.id } })
    expect(after.bookedCount).toBe(0)
  })
})

describe('one live booking per application per purpose', () => {
  it('refuses a second booking rather than holding two places', async () => {
    const first = await counterWithOnePlace(13)
    const second = await counterWithOnePlace(14)
    const applicant = await applicantReadyToHandOver()

    const one = await bookAppointment(actor(applicant.user), {
      slotId: first.slot.id,
      applicationId: applicant.application.id,
      purpose: 'DOCUMENT_HANDOVER',
      attendeeName: 'متقدم',
      attendeePhone: null,
    })
    expect(one.ok).toBe(true)

    const two = await bookAppointment(actor(applicant.user), {
      slotId: second.slot.id,
      applicationId: applicant.application.id,
      purpose: 'DOCUMENT_HANDOVER',
      attendeeName: 'متقدم',
      attendeePhone: null,
    })

    expect(two.ok).toBe(false)
    if (!two.ok) expect(two.violation.code).toBe('APPOINTMENT_ALREADY_HELD')
  })
})

describe('cancelling and rescheduling', () => {
  it('gives the place back and keeps the cancelled booking in the history', async () => {
    const { slot } = await counterWithOnePlace(17)
    const applicant = await applicantReadyToHandOver()

    const booked = await bookAppointment(actor(applicant.user), {
      slotId: slot.id,
      applicationId: applicant.application.id,
      purpose: 'DOCUMENT_HANDOVER',
      attendeeName: 'متقدم',
      attendeePhone: null,
    })
    expect(booked.ok).toBe(true)
    if (!booked.ok) return

    expect(
      await cancelAppointment(actor(applicant.user), {
        appointmentId: booked.appointmentId,
        reason: 'Cannot attend.',
      }),
    ).toMatchObject({ ok: true })

    const slotAfter = await db.appointmentSlot.findUniqueOrThrow({ where: { id: slot.id } })
    expect(slotAfter.bookedCount).toBe(0)

    // Nothing was deleted. CLAUDE.md rule 2.
    const row = await db.appointment.findUniqueOrThrow({ where: { id: booked.appointmentId } })
    expect(row.status).toBe('CANCELLED')
    expect(row.cancelledReason).toBe('Cannot attend.')

    // …and the freed place is genuinely usable by somebody else.
    const other = await applicantReadyToHandOver()
    const rebooked = await bookAppointment(actor(other.user), {
      slotId: slot.id,
      applicationId: other.application.id,
      purpose: 'DOCUMENT_HANDOVER',
      attendeeName: 'متقدم آخر',
      attendeePhone: null,
    })
    expect(rebooked.ok).toBe(true)
  })

  it('chains a reschedule so the move reads as one applicant, not two', async () => {
    const from = await counterWithOnePlace(19)
    const to = await counterWithOnePlace(20)
    const applicant = await applicantReadyToHandOver()

    const booked = await bookAppointment(actor(applicant.user), {
      slotId: from.slot.id,
      applicationId: applicant.application.id,
      purpose: 'DOCUMENT_HANDOVER',
      attendeeName: 'متقدم',
      attendeePhone: null,
    })
    expect(booked.ok).toBe(true)
    if (!booked.ok) return

    const moved = await rescheduleAppointment(actor(applicant.user), {
      appointmentId: booked.appointmentId,
      toSlotId: to.slot.id,
    })
    expect(moved.ok).toBe(true)
    if (!moved.ok) return

    const original = await db.appointment.findUniqueOrThrow({ where: { id: booked.appointmentId } })
    expect(original.status).toBe('RESCHEDULED')
    expect(original.rescheduledToId).toBe(moved.appointmentId)

    expect(
      (await db.appointmentSlot.findUniqueOrThrow({ where: { id: from.slot.id } })).bookedCount,
    ).toBe(0)
    expect(
      (await db.appointmentSlot.findUniqueOrThrow({ where: { id: to.slot.id } })).bookedCount,
    ).toBe(1)

    const live = await liveAppointment(applicant.application.id, 'DOCUMENT_HANDOVER')
    expect(live?.id).toBe(moved.appointmentId)
  })
})

describe('booking outside the window', () => {
  it('refuses a card-collection appointment before there is a card', async () => {
    const clerk = await makeUser({ role: 'REGISTRY_CLERK' })
    const at = period(23, 10)
    await openSlots(actor(clerk), {
      purpose: 'CARD_COLLECTION',
      locationAr: `شباك اختبار ${Math.random().toString(36).slice(2, 8)}`,
      locationEn: 'Test counter',
      capacity: 2,
      periods: [at],
    })
    const slot = await db.appointmentSlot.findFirstOrThrow({
      where: { startsAt: at.startsAt, purpose: 'CARD_COLLECTION' },
      orderBy: { createdAt: 'desc' },
    })

    const applicant = await applicantReadyToHandOver() // still SUBMITTED

    const result = await bookAppointment(actor(applicant.user), {
      slotId: slot.id,
      applicationId: applicant.application.id,
      purpose: 'CARD_COLLECTION',
      attendeeName: 'متقدم',
      attendeePhone: null,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.violation.code).toBe('APPOINTMENT_NOT_DUE')
  })

  it('refuses a booking on another firm’s application', async () => {
    const { slot } = await counterWithOnePlace(25)
    const applicant = await applicantReadyToHandOver()
    const stranger = await makeBroker()

    const result = await bookAppointment(actor(stranger.user), {
      slotId: slot.id,
      applicationId: applicant.application.id,
      purpose: 'DOCUMENT_HANDOVER',
      attendeeName: 'دخيل',
      attendeePhone: null,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.violation.code).toBe('APPLICATION_NOT_YOURS')
  })
})

describe('the diary as the applicant sees it', () => {
  it('shows full and closed periods rather than hiding them', async () => {
    const { slot, clerk } = await counterWithOnePlace(29)
    const applicant = await applicantReadyToHandOver()

    const before = await slotsFor({
      purpose: 'DOCUMENT_HANDOVER',
      applicationId: applicant.application.id,
    })
    expect(before.find((s) => s.id === slot.id)?.state).toBe('AVAILABLE')

    const other = await applicantReadyToHandOver()
    await bookAppointment(actor(other.user), {
      slotId: slot.id,
      applicationId: other.application.id,
      purpose: 'DOCUMENT_HANDOVER',
      attendeeName: 'متقدم',
      attendeePhone: null,
    })

    const afterBooking = await slotsFor({
      purpose: 'DOCUMENT_HANDOVER',
      applicationId: applicant.application.id,
    })
    expect(afterBooking.find((s) => s.id === slot.id)?.state).toBe('FULL')

    // …and the applicant who holds it sees that they hold it.
    const asHolder = await slotsFor({
      purpose: 'DOCUMENT_HANDOVER',
      applicationId: other.application.id,
    })
    expect(asHolder.find((s) => s.id === slot.id)?.state).toBe('BOOKED_BY_YOU')

    await db.appointmentSlot.update({
      where: { id: slot.id },
      data: { closedAt: new Date(), closedReason: 'Public holiday.' },
    })
    void clerk

    const afterClosing = await slotsFor({
      purpose: 'DOCUMENT_HANDOVER',
      applicationId: applicant.application.id,
    })
    expect(afterClosing.find((s) => s.id === slot.id)?.state).toBe('UNAVAILABLE')
  })
})

describe('attendance', () => {
  it('records that somebody came, and that somebody did not', async () => {
    const attended = await counterWithOnePlace(31)
    const missed = await counterWithOnePlace(33)
    const officer = await makeUser({ role: 'REGISTRY_CLERK' })

    const a = await applicantReadyToHandOver()
    const b = await applicantReadyToHandOver()

    const one = await bookAppointment(actor(a.user), {
      slotId: attended.slot.id,
      applicationId: a.application.id,
      purpose: 'DOCUMENT_HANDOVER',
      attendeeName: 'حضر',
      attendeePhone: null,
    })
    const two = await bookAppointment(actor(b.user), {
      slotId: missed.slot.id,
      applicationId: b.application.id,
      purpose: 'DOCUMENT_HANDOVER',
      attendeeName: 'لم يحضر',
      attendeePhone: null,
    })
    if (!one.ok || !two.ok) throw new Error('fixture bookings failed')

    await recordAttendance(actor(officer), { appointmentId: one.appointmentId, attended: true })
    await recordAttendance(actor(officer), { appointmentId: two.appointmentId, attended: false })

    expect((await db.appointment.findUniqueOrThrow({ where: { id: one.appointmentId } })).status).toBe('ATTENDED')
    expect((await db.appointment.findUniqueOrThrow({ where: { id: two.appointmentId } })).status).toBe('NO_SHOW')

    // Both are in the audit trail, attributed to the officer who recorded them.
    const events = await db.auditEvent.findMany({
      where: { entityType: 'Appointment', entityId: { in: [one.appointmentId, two.appointmentId] } },
      select: { action: true },
    })
    const actions = events.map((e) => e.action)
    expect(actions).toContain('APPOINTMENT_ATTENDED')
    expect(actions).toContain('APPOINTMENT_MISSED')

    /*
     * And the person who was marked absent is told.
     *
     * Only that one: somebody who attended was standing at the counter and does
     * not need an email about it. The message matters because a missed step in a
     * government process reads as a penalty unless something says otherwise, and
     * nothing in Decree 578 or the AML Controls attaches a consequence to it.
     */
    const missedNotice = await db.notification.findFirst({
      where: { eventKey: 'APPOINTMENT_MISSED', appointmentId: two.appointmentId },
    })
    expect(missedNotice, 'a no-show is announced to the applicant').not.toBeNull()

    const attendedNotice = await db.notification.findFirst({
      where: { eventKey: 'APPOINTMENT_MISSED', appointmentId: one.appointmentId },
    })
    expect(attendedNotice, 'somebody who attended is not told they did not').toBeNull()
  })
})
