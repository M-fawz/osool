'use server'

import type { AppointmentPurpose } from '@prisma/client'
import { z } from 'zod'
import { BROKER_ROLES } from '@/lib/auth/roles'
import { requireRole, type Session } from '@/lib/auth/session'
import type { ActorContext } from '@/lib/applications/transition'
import {
  bookAppointment,
  cancelAppointment,
  openSlots,
  recordAttendance,
  rescheduleAppointment,
} from '@/lib/appointments'
import { consume } from '@/lib/security/rate-limit'
import type { RuleViolation } from '@/lib/rules/violation'
import { precondition } from '@/lib/applications/refusals'
import { fieldErrors } from '@/lib/validation/application'

/**
 * The counter, as Server Actions.
 *
 * Same three steps as every other action in this product — authorise, parse,
 * delegate — and the work lives in `src/lib/appointments`, which is what lets
 * the concurrency tests contend on real bookings without a browser anywhere in
 * the picture.
 *
 * One thing worth noting about who may do what. Booking, cancelling, and
 * rescheduling belong to the *applicant*: an officer booking on somebody's
 * behalf is a different operation with a different accountability, and it is
 * not this one. Recording attendance belongs to the officer at the counter,
 * because they are the only person who can see whether anyone turned up.
 */

export type AppointmentResult =
  | { ok: true; next?: string }
  | { ok: false; kind: 'validation'; errors: Record<string, string> }
  | { ok: false; kind: 'refused'; violation: RuleViolation }

function refused(violation: RuleViolation): AppointmentResult {
  return { ok: false, kind: 'refused', violation }
}

function actorFrom(session: Session): ActorContext {
  return {
    userId: session.userId,
    role: session.role,
    name: session.name,
    brokerEntityId: session.brokerEntityId,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
  }
}

const PURPOSES = ['DOCUMENT_HANDOVER', 'CARD_COLLECTION'] as const

const BookSchema = z.object({
  slotId: z.string().min(1, { message: 'required' }),
  applicationId: z.string().min(1, { message: 'required' }),
  purpose: z.enum(PURPOSES, { message: 'required' }),
  attendeeName: z
    .string()
    .trim()
    .min(3, { message: 'attendeeNameRequired' })
    .max(200, { message: 'tooLong' }),
  attendeePhone: z
    .string()
    .trim()
    .max(40, { message: 'tooLong' })
    .optional()
    .transform((v) => (v ? v : null)),
})

const CancelSchema = z.object({
  appointmentId: z.string().min(1, { message: 'required' }),
  reason: z
    .string()
    .trim()
    .min(3, { message: 'reasonRequired' })
    .max(500, { message: 'tooLong' }),
})

const RescheduleSchema = z.object({
  appointmentId: z.string().min(1, { message: 'required' }),
  toSlotId: z.string().min(1, { message: 'required' }),
})

const AttendanceSchema = z.object({
  appointmentId: z.string().min(1, { message: 'required' }),
  attended: z.enum(['yes', 'no'], { message: 'required' }),
  note: z.string().trim().max(500).optional().transform((v) => (v ? v : null)),
})

export async function bookAppointmentAction(
  _previous: AppointmentResult | null,
  formData: FormData,
): Promise<AppointmentResult> {
  const session = await requireRole(BROKER_ROLES)

  const parsed = BookSchema.safeParse({
    slotId: formData.get('slotId'),
    applicationId: formData.get('applicationId'),
    purpose: formData.get('purpose'),
    attendeeName: formData.get('attendeeName'),
    attendeePhone: formData.get('attendeePhone') ?? undefined,
  })

  if (!parsed.success) return { ok: false, kind: 'validation', errors: fieldErrors(parsed.error) }

  /*
   * Limited per account, not per address.
   *
   * A slot released by a cancellation is a scarce thing at a government
   * counter, and a script that books and cancels in a loop can hold a whole
   * morning hostage. The budget is generous enough that no honest applicant
   * meets it — twenty bookings an hour is not a person arranging a visit.
   */
  const limit = await consume('appointment-booking', session.userId)
  if (!limit.allowed) {
    return refused(
      precondition({
        code: 'TOO_MANY_BOOKING_ATTEMPTS',
        requirementIds: ['REQ-REG-050'],
        legalSource: 'Platform limit, not a regulatory one',
        ar: {
          blocked: 'تعذّر حجز الموعد الآن.',
          why: 'جرى عدد كبير من محاولات الحجز من حسابك خلال وقت قصير. هذا الحد يحمي المواعيد المتاحة من الحجز الآلي.',
          nextStep: 'انتظر قليلاً ثم أعد المحاولة. لم يُحجز لك موعد ولم يُلغَ أي حجز قائم.',
        },
        en: {
          blocked: 'This appointment could not be booked right now.',
          why: 'There have been a large number of booking attempts from your account in a short time. The limit protects available appointments from automated booking.',
          nextStep: 'Wait a short while and try again. Nothing has been booked and no existing booking has been cancelled.',
        },
      }),
    )
  }

  const result = await bookAppointment(actorFrom(session), {
    slotId: parsed.data.slotId,
    applicationId: parsed.data.applicationId,
    purpose: parsed.data.purpose as AppointmentPurpose,
    attendeeName: parsed.data.attendeeName,
    attendeePhone: parsed.data.attendeePhone,
  })

  return result.ok
    ? { ok: true, next: `/application/${parsed.data.applicationId}/appointment` }
    : refused(result.violation)
}

export async function cancelAppointmentAction(
  _previous: AppointmentResult | null,
  formData: FormData,
): Promise<AppointmentResult> {
  const session = await requireRole([...BROKER_ROLES, 'REGISTRY_CLERK', 'CARD_ISSUER'])

  const parsed = CancelSchema.safeParse({
    appointmentId: formData.get('appointmentId'),
    reason: formData.get('reason'),
  })
  if (!parsed.success) return { ok: false, kind: 'validation', errors: fieldErrors(parsed.error) }

  const result = await cancelAppointment(actorFrom(session), parsed.data)
  return result.ok ? { ok: true } : refused(result.violation)
}

export async function rescheduleAppointmentAction(
  _previous: AppointmentResult | null,
  formData: FormData,
): Promise<AppointmentResult> {
  const session = await requireRole(BROKER_ROLES)

  const parsed = RescheduleSchema.safeParse({
    appointmentId: formData.get('appointmentId'),
    toSlotId: formData.get('toSlotId'),
  })
  if (!parsed.success) return { ok: false, kind: 'validation', errors: fieldErrors(parsed.error) }

  const result = await rescheduleAppointment(actorFrom(session), parsed.data)
  return result.ok ? { ok: true } : refused(result.violation)
}

/** Recorded at the counter, by the officer on it. */
export async function recordAttendanceAction(
  _previous: AppointmentResult | null,
  formData: FormData,
): Promise<AppointmentResult> {
  const session = await requireRole(['REGISTRY_CLERK', 'CARD_ISSUER'])

  const parsed = AttendanceSchema.safeParse({
    appointmentId: formData.get('appointmentId'),
    attended: formData.get('attended'),
    note: formData.get('note') ?? undefined,
  })
  if (!parsed.success) return { ok: false, kind: 'validation', errors: fieldErrors(parsed.error) }

  const result = await recordAttendance(actorFrom(session), {
    appointmentId: parsed.data.appointmentId,
    attended: parsed.data.attended === 'yes',
    note: parsed.data.note,
  })

  return result.ok ? { ok: true, next: '/appointments' } : refused(result.violation)
}

const OpenSlotsSchema = z.object({
  purpose: z.enum(PURPOSES, { message: 'required' }),
  locationAr: z.string().trim().min(2, { message: 'required' }).max(200),
  locationEn: z.string().trim().max(200).optional().transform((v) => (v ? v : null)),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'invalidDate' }),
  startHour: z.coerce.number().int().min(0).max(23),
  endHour: z.coerce.number().int().min(1).max(24),
  minutesPerSlot: z.coerce.number().int().min(10).max(240),
  capacity: z.coerce.number().int().min(1).max(50),
})

/**
 * Publish a day's worth of periods.
 *
 * The clerk gives a date, a window, a slot length, and a capacity; this expands
 * it. Expanding on the server rather than making them add twelve rows by hand
 * is the difference between a diary somebody keeps up to date and one that
 * quietly empties.
 */
export async function openSlotsAction(
  _previous: AppointmentResult | null,
  formData: FormData,
): Promise<AppointmentResult> {
  const session = await requireRole(['REGISTRY_CLERK', 'CARD_ISSUER', 'DATA_MANAGER'])

  const parsed = OpenSlotsSchema.safeParse({
    purpose: formData.get('purpose'),
    locationAr: formData.get('locationAr'),
    locationEn: formData.get('locationEn') ?? undefined,
    date: formData.get('date'),
    startHour: formData.get('startHour'),
    endHour: formData.get('endHour'),
    minutesPerSlot: formData.get('minutesPerSlot'),
    capacity: formData.get('capacity'),
  })

  if (!parsed.success) return { ok: false, kind: 'validation', errors: fieldErrors(parsed.error) }

  if (parsed.data.endHour <= parsed.data.startHour) {
    return { ok: false, kind: 'validation', errors: { endHour: 'endBeforeStart' } }
  }

  /*
   * The clerk types Cairo time; the database stores instants.
   *
   * Cairo is UTC+2 with no daylight saving since 2023, so the offset is a
   * constant — but writing it as one would be a bug the first time that
   * changes. `Intl` is asked what the offset actually is on the date in
   * question, so the arithmetic stays right through any future change.
   */
  const offsetMinutes = cairoOffsetMinutes(new Date(`${parsed.data.date}T12:00:00Z`))

  const periods: Array<{ startsAt: Date; endsAt: Date }> = []
  const totalMinutes = (parsed.data.endHour - parsed.data.startHour) * 60

  for (let offset = 0; offset + parsed.data.minutesPerSlot <= totalMinutes; offset += parsed.data.minutesPerSlot) {
    const localMinutes = parsed.data.startHour * 60 + offset
    const startsAt = new Date(
      new Date(`${parsed.data.date}T00:00:00Z`).getTime() + (localMinutes - offsetMinutes) * 60_000,
    )
    periods.push({
      startsAt,
      endsAt: new Date(startsAt.getTime() + parsed.data.minutesPerSlot * 60_000),
    })
  }

  if (periods.length === 0) {
    return { ok: false, kind: 'validation', errors: { minutesPerSlot: 'noPeriodsProduced' } }
  }

  await openSlots(actorFrom(session), {
    purpose: parsed.data.purpose as AppointmentPurpose,
    locationAr: parsed.data.locationAr,
    locationEn: parsed.data.locationEn,
    capacity: parsed.data.capacity,
    periods,
  })

  return { ok: true, next: '/appointments' }
}

/** Minutes Cairo is ahead of UTC on a given instant. */
function cairoOffsetMinutes(on: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(on)

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')

  return hour * 60 + minute - (on.getUTCHours() * 60 + on.getUTCMinutes())
}
