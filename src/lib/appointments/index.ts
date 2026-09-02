import type { AppointmentPurpose, ApplicationStatus, Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { recordAuditEvent } from '@/lib/audit'
import { roleLabel } from '@/lib/auth/roles'
import { notify } from '@/lib/notifications'
import { appointmentSubject } from '@/lib/notifications/subjects'
import type { ActorContext } from '@/lib/applications/transition'
import { notYourApplication, precondition } from '@/lib/applications/refusals'
import type { RuleViolation } from '@/lib/rules/violation'

/**
 * Booking a place at the counter.
 *
 * REQ-REG-050 has the applicant attending in person twice: once to hand over
 * the original papers, and once to collect the card. On paper those attendances
 * are unmanaged — people arrive and queue. This makes them bookable, which is
 * the whole of what the platform adds: it does not change what happens at the
 * counter, only who is expected there and when.
 *
 * ── What makes double-booking impossible ─────────────────────────────────
 *
 * Three independent things, deliberately, because this is the one operation in
 * the product where two users race for the same resource by design:
 *
 *   1. The booking transaction takes `SELECT … FOR UPDATE` on the slot row
 *      before it reads the count. Two brokers clicking at the same instant
 *      serialise there; the second one reads the count the first one wrote.
 *   2. A CHECK constraint refuses `bookedCount > capacity` at the database. If
 *      the booking code is ever wrong — or someone edits the table by hand —
 *      the write fails rather than quietly overfilling a counter.
 *   3. A partial unique index refuses a second live booking for the same
 *      application and purpose, so a broker cannot hold two places at once by
 *      opening the page twice.
 *
 * Cancelling does not delete anything. The row stays, its status changes, and
 * the slot's count comes back down — which is what lets "who was booked when,
 * and who did not come" survive as a question anyone can answer later.
 *
 * ── What this deliberately does not do ───────────────────────────────────
 *
 * It records attendance and non-attendance. It attaches no consequence to
 * either. Nothing in Decree 578 or the AML Controls sets a penalty for missing
 * an appointment, and CLAUDE.md rule 3 is explicit that a rule with no
 * requirement ID does not go into the code. A no-show is a fact in the file.
 */

export type BookingOutcome =
  | { ok: true; appointmentId: string }
  | { ok: false; violation: RuleViolation }

/**
 * The application states at which each attendance is due.
 *
 * Handing papers over belongs to the early file — it is what intake is waiting
 * on. Collecting the card belongs to the end of it, once there is a card to
 * collect. Booking outside those windows is refused, because an appointment for
 * a step the file has not reached wastes a counter place that somebody else
 * needed.
 */
const PURPOSE_WINDOWS: Record<AppointmentPurpose, ApplicationStatus[]> = {
  DOCUMENT_HANDOVER: ['SUBMITTED', 'UNDER_INTAKE', 'AWAITING_COMPLETION', 'UNDER_EXAMINATION'],
  CARD_COLLECTION: ['APPROVED', 'AWAITING_PAYMENT', 'CARD_ISSUED'],
}

const purposeLabels: Record<AppointmentPurpose, { ar: string; en: string }> = {
  DOCUMENT_HANDOVER: { ar: 'تسليم المستندات الأصلية', en: 'Handing over the original documents' },
  CARD_COLLECTION: { ar: 'استلام بطاقة القيد', en: 'Collecting the registration card' },
}

export { purposeLabels }

// ── Reading the diary ──────────────────────────────────────────────────────

export interface SlotView {
  id: string
  purpose: AppointmentPurpose
  startsAt: Date
  endsAt: Date
  locationAr: string
  locationEn: string | null
  capacity: number
  bookedCount: number
  remaining: number
  /** BOOKED here means *this* application holds a place in this slot. */
  state: 'AVAILABLE' | 'FULL' | 'UNAVAILABLE' | 'BOOKED_BY_YOU'
}

/**
 * The slots an applicant may choose from, and why each one is or is not open.
 *
 * Returns closed and full slots as well as open ones, marked. A calendar that
 * silently omits what is unavailable makes an applicant wonder whether they are
 * looking at everything; one that shows a full Tuesday tells them to try
 * Wednesday.
 */
export async function slotsFor(input: {
  purpose: AppointmentPurpose
  applicationId: string
  from?: Date
  to?: Date
}): Promise<SlotView[]> {
  const from = input.from ?? new Date()
  const to = input.to ?? new Date(from.getTime() + 42 * 24 * 60 * 60 * 1000)

  const [slots, mine] = await Promise.all([
    db.appointmentSlot.findMany({
      where: {
        purpose: input.purpose,
        archivedAt: null,
        startsAt: { gte: from, lte: to },
      },
      orderBy: { startsAt: 'asc' },
    }),
    db.appointment.findMany({
      where: { applicationId: input.applicationId, status: 'BOOKED' },
      select: { slotId: true },
    }),
  ])

  const mineSlotIds = new Set(mine.map((a) => a.slotId))

  return slots.map((slot) => {
    const remaining = Math.max(0, slot.capacity - slot.bookedCount)
    const state: SlotView['state'] = mineSlotIds.has(slot.id)
      ? 'BOOKED_BY_YOU'
      : slot.closedAt
        ? 'UNAVAILABLE'
        : remaining === 0
          ? 'FULL'
          : 'AVAILABLE'

    return {
      id: slot.id,
      purpose: slot.purpose,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      locationAr: slot.locationAr,
      locationEn: slot.locationEn,
      capacity: slot.capacity,
      bookedCount: slot.bookedCount,
      remaining,
      state,
    }
  })
}

/** The live booking an application holds for a purpose, if any. */
export async function liveAppointment(applicationId: string, purpose: AppointmentPurpose) {
  return db.appointment.findFirst({
    where: { applicationId, purpose, status: 'BOOKED' },
    include: { slot: true },
  })
}

/** Every appointment an application has ever had, newest first. */
export async function appointmentHistory(applicationId: string) {
  return db.appointment.findMany({
    where: { applicationId },
    include: { slot: true, bookedBy: { select: { name: true, nameAr: true } } },
    orderBy: { bookedAt: 'desc' },
  })
}

// ── Booking ────────────────────────────────────────────────────────────────

function slotTaken(): RuleViolation {
  return precondition({
    code: 'SLOT_NO_LONGER_AVAILABLE',
    requirementIds: ['REQ-REG-050'],
    legalSource: 'GOEIC workflow, REQ-REG-050 — attendance at the counter',
    ar: {
      blocked: 'تعذّر حجز هذا الموعد.',
      why: 'اكتمل عدد المقاعد في هذه الفترة قبل تأكيد حجزك بلحظات. لم يُحجز لك موعد ولم يُخصم منك شيء.',
      nextStep: 'أعد تحميل الصفحة واختر فترة أخرى؛ الفترات المتاحة محدّثة لحظياً.',
    },
    en: {
      blocked: 'This appointment could not be booked.',
      why: 'The period filled up moments before your booking was confirmed. Nothing was booked for you.',
      nextStep: 'Reload the page and choose another period; availability is shown live.',
    },
  })
}

function slotClosed(): RuleViolation {
  return precondition({
    code: 'SLOT_CLOSED',
    requirementIds: ['REQ-REG-050'],
    legalSource: 'GOEIC workflow, REQ-REG-050 — attendance at the counter',
    ar: {
      blocked: 'تعذّر حجز هذا الموعد.',
      why: 'أُغلقت هذه الفترة من جانب الهيئة — عطلة رسمية أو إغلاق شباك.',
      nextStep: 'اختر فترة أخرى من المواعيد المتاحة.',
    },
    en: {
      blocked: 'This appointment could not be booked.',
      why: 'The Authority has closed this period — a public holiday, or a counter that is not open.',
      nextStep: 'Choose another period from those shown as available.',
    },
  })
}

function alreadyBooked(purpose: AppointmentPurpose): RuleViolation {
  return precondition({
    code: 'APPOINTMENT_ALREADY_HELD',
    requirementIds: ['REQ-REG-050'],
    legalSource: 'GOEIC workflow, REQ-REG-050 — attendance at the counter',
    ar: {
      blocked: 'لديك موعد قائم بالفعل.',
      why: `يوجد موعد محجوز لهذا الطلب لغرض «${purposeLabels[purpose].ar}». لا يُحجز أكثر من موعد واحد لكل غرض حتى لا تُحجز مقاعد لا يحضرها أحد.`,
      nextStep: 'ألغِ الموعد القائم أو غيّره إلى فترة أخرى بدلاً من حجز موعد ثانٍ.',
    },
    en: {
      blocked: 'You already hold an appointment.',
      why: `This application already has a booking for "${purposeLabels[purpose].en}". Only one booking per purpose is held at a time, so that places are not reserved and left empty.`,
      nextStep: 'Cancel the existing appointment, or move it to another period, rather than booking a second.',
    },
  })
}

function notDueYet(purpose: AppointmentPurpose, status: ApplicationStatus): RuleViolation {
  const isCollection = purpose === 'CARD_COLLECTION'
  return precondition({
    code: 'APPOINTMENT_NOT_DUE',
    requirementIds: ['REQ-REG-050'],
    legalSource: `GOEIC workflow, REQ-REG-050 step ${isCollection ? '6' : '1'}`,
    evidence: { purpose, status },
    ar: {
      blocked: 'لا يمكن حجز هذا الموعد الآن.',
      why: isCollection
        ? 'لم تصدر بطاقة القيد بعد، ولا يُحجز موعد الاستلام قبل الموافقة على الطلب وسداد الرسوم.'
        : 'هذا الطلب تجاوز مرحلة تسليم المستندات الأصلية، أو لم يُقدَّم بعد.',
      nextStep: isCollection
        ? 'انتظر رسالة الموافقة على الطلب؛ ستتضمن رابط حجز موعد الاستلام.'
        : 'قدّم الطلب أولاً، ثم احجز موعداً لتسليم الأصول.',
    },
    en: {
      blocked: 'This appointment cannot be booked yet.',
      why: isCollection
        ? 'The registration card has not been issued. A collection appointment is not booked before the application is approved and the fees are recorded.'
        : 'This application is past the point of handing over the original documents, or has not been submitted yet.',
      nextStep: isCollection
        ? 'Wait for the approval message; it carries the link to book a collection appointment.'
        : 'Submit the application first, then book a time to hand the originals over.',
    },
  })
}

/**
 * Take a place in a slot.
 *
 * The whole of the contention lives in one transaction: lock the slot, read it,
 * refuse if it is closed or full, write the appointment, raise the count. The
 * CHECK constraint is behind that as a second opinion — if this function is
 * ever wrong, the database refuses rather than overfilling the counter.
 */
export async function bookAppointment(
  actor: ActorContext,
  input: {
    slotId: string
    applicationId: string
    purpose: AppointmentPurpose
    attendeeName: string
    attendeePhone: string | null
  },
): Promise<BookingOutcome> {
  const application = await db.application.findUnique({
    where: { id: input.applicationId },
    select: { id: true, brokerEntityId: true, status: true },
  })

  if (!application) return { ok: false, violation: notYourApplication() }

  // A broker books their own firm's appointments and nobody else's. An officer
  // booking on an applicant's behalf at the counter is a different operation
  // and is not this one.
  if (!actor.brokerEntityId || actor.brokerEntityId !== application.brokerEntityId) {
    return { ok: false, violation: notYourApplication() }
  }

  if (!PURPOSE_WINDOWS[input.purpose].includes(application.status)) {
    return { ok: false, violation: notDueYet(input.purpose, application.status) }
  }

  const existing = await liveAppointment(input.applicationId, input.purpose)
  if (existing) return { ok: false, violation: alreadyBooked(input.purpose) }

  try {
    const appointmentId = await db.$transaction(async (tx) => {
      // The lock. Everything after this reads a slot nobody else can change.
      await tx.$executeRaw`SELECT id FROM "appointment_slot" WHERE id = ${input.slotId} FOR UPDATE`

      const slot = await tx.appointmentSlot.findUnique({ where: { id: input.slotId } })
      if (!slot || slot.archivedAt) throw new BookingRefused(slotTaken())
      if (slot.closedAt) throw new BookingRefused(slotClosed())
      if (slot.purpose !== input.purpose) throw new BookingRefused(notDueYet(input.purpose, application.status))
      if (slot.bookedCount >= slot.capacity) throw new BookingRefused(slotTaken())

      const appointment = await tx.appointment.create({
        data: {
          slotId: slot.id,
          applicationId: input.applicationId,
          brokerEntityId: application.brokerEntityId,
          purpose: input.purpose,
          status: 'BOOKED',
          attendeeName: input.attendeeName,
          attendeePhone: input.attendeePhone,
          bookedByUserId: actor.userId,
        },
      })

      await tx.appointmentSlot.update({
        where: { id: slot.id },
        data: { bookedCount: { increment: 1 } },
      })

      await recordAuditEvent(
        {
          action: 'APPOINTMENT_BOOKED',
          entityType: 'Appointment',
          entityId: appointment.id,
          actorUserId: actor.userId,
          actorRole: actor.role,
          actorLabel: `${actor.name} (${roleLabel(actor.role).en})`,
          toState: 'BOOKED',
          reason: `Booked for ${purposeLabels[input.purpose].en.toLowerCase()}.`,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          payload: {
            applicationId: input.applicationId,
            slotId: slot.id,
            startsAt: slot.startsAt.toISOString(),
            purpose: input.purpose,
          },
        },
        tx,
      )

      return appointment.id
    })

    await announceAppointment('APPOINTMENT_BOOKED', appointmentId)
    return { ok: true, appointmentId }
  } catch (error) {
    if (error instanceof BookingRefused) return { ok: false, violation: error.violation }

    // The unique index or the CHECK refused it. Both mean the same thing to the
    // applicant — somebody else got there first — and neither is a fault worth
    // showing them a stack trace over.
    if (isConstraintViolation(error)) return { ok: false, violation: slotTaken() }
    throw error
  }
}

class BookingRefused extends Error {
  constructor(readonly violation: RuleViolation) {
    super(violation.en.blocked)
    this.name = 'BookingRefused'
  }
}

function isConstraintViolation(error: unknown): boolean {
  const code = (error as { code?: string }).code
  // P2002 unique, P2010 raw query failure carrying a CHECK violation.
  return code === 'P2002' || code === 'P2010' || /violates check constraint/i.test(String(error))
}

/**
 * Give a place back.
 *
 * The appointment row stays exactly where it is; only its status changes and
 * the slot's count comes down. That is what makes "this applicant booked three
 * times and came to none of them" a question the register can answer — and
 * CLAUDE.md rule 2 would refuse the alternative in any case.
 */
export async function cancelAppointment(
  actor: ActorContext,
  input: { appointmentId: string; reason: string },
): Promise<BookingOutcome> {
  const appointment = await db.appointment.findUnique({
    where: { id: input.appointmentId },
    select: { id: true, slotId: true, status: true, brokerEntityId: true, applicationId: true },
  })

  if (!appointment) return { ok: false, violation: notYourApplication() }

  const isBrokerSide = Boolean(actor.brokerEntityId)
  if (isBrokerSide && actor.brokerEntityId !== appointment.brokerEntityId) {
    return { ok: false, violation: notYourApplication() }
  }

  if (appointment.status !== 'BOOKED') {
    return {
      ok: false,
      violation: precondition({
        code: 'APPOINTMENT_NOT_LIVE',
        requirementIds: ['REQ-REG-050'],
        legalSource: 'GOEIC workflow, REQ-REG-050 — attendance at the counter',
        ar: {
          blocked: 'تعذّر إلغاء هذا الموعد.',
          why: 'هذا الموعد لم يعد قائماً — أُلغي أو انقضى أو سُجّل الحضور فيه بالفعل.',
          nextStep: 'أعد تحميل الصفحة لعرض حالة المواعيد الحالية.',
        },
        en: {
          blocked: 'This appointment could not be cancelled.',
          why: 'It is no longer live — it has already been cancelled, moved, or attended.',
          nextStep: 'Reload the page to see the current state of your appointments.',
        },
      }),
    }
  }

  // Notify before the row changes, so the message describes the appointment the
  // applicant actually had rather than a cancelled shell.
  const subject = await appointmentSubject(appointment.id)

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "appointment_slot" WHERE id = ${appointment.slotId} FOR UPDATE`

    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledReason: input.reason,
        cancelledByUserId: actor.userId,
      },
    })

    await tx.appointmentSlot.update({
      where: { id: appointment.slotId },
      data: { bookedCount: { decrement: 1 } },
    })

    await recordAuditEvent(
      {
        action: 'APPOINTMENT_CANCELLED',
        entityType: 'Appointment',
        entityId: appointment.id,
        actorUserId: actor.userId,
        actorRole: actor.role,
        actorLabel: `${actor.name} (${roleLabel(actor.role).en})`,
        fromState: 'BOOKED',
        toState: 'CANCELLED',
        reason: input.reason,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        payload: { applicationId: appointment.applicationId },
      },
      tx,
    )
  })

  if (subject) {
    await notify({
      event: 'APPOINTMENT_CANCELLED',
      subject: { appointment: subject, extra: { reason: input.reason } },
    })
  }

  return { ok: true, appointmentId: appointment.id }
}

/**
 * Move a booking to another slot.
 *
 * Cancel-then-book, chained: the old row records that it was rescheduled and
 * points at its replacement, so the history reads as one applicant moving once
 * rather than as an applicant who cancelled and a stranger who booked.
 */
export async function rescheduleAppointment(
  actor: ActorContext,
  input: { appointmentId: string; toSlotId: string },
): Promise<BookingOutcome> {
  const existing = await db.appointment.findUnique({
    where: { id: input.appointmentId },
    select: {
      id: true,
      status: true,
      purpose: true,
      applicationId: true,
      brokerEntityId: true,
      attendeeName: true,
      attendeePhone: true,
      slotId: true,
    },
  })

  if (!existing) return { ok: false, violation: notYourApplication() }
  if (!actor.brokerEntityId || actor.brokerEntityId !== existing.brokerEntityId) {
    return { ok: false, violation: notYourApplication() }
  }
  if (existing.status !== 'BOOKED') {
    return { ok: false, violation: slotTaken() }
  }

  // Free the old place first, so the partial unique index does not see two live
  // bookings for one application. If the new booking then fails, the applicant
  // is told and can pick again — which is better than holding a place they have
  // already decided not to use.
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "appointment_slot" WHERE id = ${existing.slotId} FOR UPDATE`
    await tx.appointment.update({
      where: { id: existing.id },
      data: {
        status: 'RESCHEDULED',
        cancelledAt: new Date(),
        cancelledReason: 'Moved to another period by the applicant.',
        cancelledByUserId: actor.userId,
      },
    })
    await tx.appointmentSlot.update({
      where: { id: existing.slotId },
      data: { bookedCount: { decrement: 1 } },
    })
  })

  const booked = await bookAppointment(actor, {
    slotId: input.toSlotId,
    applicationId: existing.applicationId,
    purpose: existing.purpose,
    attendeeName: existing.attendeeName,
    attendeePhone: existing.attendeePhone,
  })

  if (!booked.ok) return booked

  await db.appointment.update({
    where: { id: existing.id },
    data: { rescheduledToId: booked.appointmentId },
  })

  const subject = await appointmentSubject(booked.appointmentId)
  if (subject) await notify({ event: 'APPOINTMENT_RESCHEDULED', subject: { appointment: subject } })

  return booked
}

/**
 * Record what happened at the counter.
 *
 * A fact, not a penalty. See the note at the top of this file: nothing in the
 * decree or the Controls attaches a consequence to missing an appointment, so
 * this platform attaches none either. It writes down who came.
 */
export async function recordAttendance(
  actor: ActorContext,
  input: { appointmentId: string; attended: boolean; note?: string | null },
): Promise<BookingOutcome> {
  const appointment = await db.appointment.findUnique({
    where: { id: input.appointmentId },
    select: { id: true, status: true, applicationId: true },
  })

  if (!appointment) return { ok: false, violation: notYourApplication() }

  if (appointment.status !== 'BOOKED') {
    return { ok: false, violation: slotTaken() }
  }

  const toState = input.attended ? 'ATTENDED' : 'NO_SHOW'

  await db.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        status: toState,
        attendanceRecordedAt: new Date(),
        attendanceRecordedByUserId: actor.userId,
      },
    })

    await recordAuditEvent(
      {
        action: input.attended ? 'APPOINTMENT_ATTENDED' : 'APPOINTMENT_MISSED',
        entityType: 'Appointment',
        entityId: appointment.id,
        actorUserId: actor.userId,
        actorRole: actor.role,
        actorLabel: `${actor.name} (${roleLabel(actor.role).en})`,
        fromState: 'BOOKED',
        toState,
        reason: input.note ?? (input.attended ? 'Attended.' : 'Did not attend.'),
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        payload: { applicationId: appointment.applicationId },
      },
      tx,
    )
  })

  /*
   * Only the non-attendance is announced. Somebody who turned up and was served
   * does not need an email telling them so; somebody recorded absent does, both
   * because they may not know and because the message is the only place that
   * says no consequence follows from it.
   *
   * After the transaction, never inside it — see the note in src/lib/notifications.
   */
  if (!input.attended) {
    await announceAppointment('APPOINTMENT_MISSED', appointment.id)
  }

  return { ok: true, appointmentId: appointment.id }
}

async function announceAppointment(
  event: 'APPOINTMENT_BOOKED' | 'APPOINTMENT_RESCHEDULED' | 'APPOINTMENT_REMINDER' | 'APPOINTMENT_MISSED',
  appointmentId: string,
): Promise<void> {
  const subject = await appointmentSubject(appointmentId)
  if (subject) await notify({ event, subject: { appointment: subject } })
}

// ── The Authority's side: opening the diary ────────────────────────────────

/**
 * Publish bookable periods.
 *
 * Idempotent on `(purpose, startsAt, locationAr)` so that running the opener
 * twice for the same week does not double the counter's capacity — a mistake
 * that would be invisible until twice as many people turned up as there were
 * chairs.
 */
export async function openSlots(
  actor: ActorContext,
  input: {
    purpose: AppointmentPurpose
    locationAr: string
    locationEn: string | null
    capacity: number
    periods: Array<{ startsAt: Date; endsAt: Date }>
  },
): Promise<{ created: number; alreadyOpen: number }> {
  let created = 0
  let alreadyOpen = 0

  for (const period of input.periods) {
    const existing = await db.appointmentSlot.findFirst({
      where: {
        purpose: input.purpose,
        startsAt: period.startsAt,
        locationAr: input.locationAr,
        archivedAt: null,
      },
      select: { id: true },
    })

    if (existing) {
      alreadyOpen += 1
      continue
    }

    await db.appointmentSlot.create({
      data: {
        purpose: input.purpose,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        locationAr: input.locationAr,
        locationEn: input.locationEn,
        capacity: input.capacity,
        createdByUserId: actor.userId,
      },
    })
    created += 1
  }

  if (created > 0) {
    await recordAuditEvent({
      action: 'APPOINTMENT_SLOTS_OPENED',
      entityType: 'AppointmentSlot',
      entityId: `${input.purpose}:${input.locationAr}`,
      actorUserId: actor.userId,
      actorRole: actor.role,
      actorLabel: `${actor.name} (${roleLabel(actor.role).en})`,
      reason: `${created} period(s) opened for ${purposeLabels[input.purpose].en.toLowerCase()}.`,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      payload: { created, alreadyOpen, capacity: input.capacity },
    })
  }

  return { created, alreadyOpen }
}

/** The counter's day — what the officer on duty is expecting. */
export async function daySchedule(input: { on: Date; purpose?: AppointmentPurpose }) {
  const start = new Date(input.on)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  const where: Prisma.AppointmentWhereInput = {
    slot: { startsAt: { gte: start, lt: end }, ...(input.purpose ? { purpose: input.purpose } : {}) },
    status: { in: ['BOOKED', 'ATTENDED', 'NO_SHOW'] },
  }

  return db.appointment.findMany({
    where,
    include: {
      slot: true,
      application: {
        select: {
          id: true,
          temporaryNumber: true,
          entityData: { select: { tradeNameAr: true } },
          brokerEntity: { select: { tradeNameAr: true } },
        },
      },
    },
    orderBy: { slot: { startsAt: 'asc' } },
  })
}

/**
 * The periods that exist on a day, booked or not.
 *
 * `daySchedule` answers "who is coming", which is what the counter needs while
 * it is open. This answers "what did we put on offer", which is what the clerk
 * needs the moment after they open periods — without it, opening a day's
 * capacity produces no visible result at all until a broker happens to book
 * into it, and the only way to tell whether the action worked is to run it
 * again and see whether anything changes.
 *
 * Ordered as the day runs. `bookedCount` comes from the row rather than from
 * counting appointments, because that column is the one the booking path locks
 * and the CHECK constraint defends — reading anything else here would show a
 * number the database does not consider authoritative.
 */
export async function dayPeriods(input: { on: Date; purpose?: AppointmentPurpose }) {
  const start = new Date(input.on)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  return db.appointmentSlot.findMany({
    where: {
      startsAt: { gte: start, lt: end },
      ...(input.purpose ? { purpose: input.purpose } : {}),
    },
    orderBy: { startsAt: 'asc' },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      purpose: true,
      capacity: true,
      bookedCount: true,
      locationAr: true,
      locationEn: true,
      closedAt: true,
    },
  })
}
