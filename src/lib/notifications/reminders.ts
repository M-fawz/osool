import { db } from '@/lib/db'
import { notify } from '@/lib/notifications'
import { appointmentSubject } from '@/lib/notifications/subjects'

/**
 * Tomorrow's bookings, reminded once.
 *
 * This lived inline in `scripts/sweep.ts` and had exactly one caller, which was
 * fine while a command line was the only way to run it. It is a library
 * function now because there are two callers: the command any scheduler can run
 * (`npm run sweep`), and the thin HTTP route a hosted platform's cron can reach
 * (`/api/cron/sweep`). 02-SYSTEM-ARCHITECTURE §10 decision 1 is what forces
 * that shape — the logic must not live inside a platform primitive, so it lives
 * here and both entry points call it.
 *
 * `reminderSentAt` is the guard rather than the dedupe key alone: the
 * notification table would refuse a second send anyway, but writing the
 * timestamp means the next sweep does not even look at the row. On a register
 * with a busy counter that is the difference between a query over tomorrow and
 * a query over every appointment ever booked.
 */

/** The window: far enough ahead to be useful, near enough to be tomorrow. */
const FROM_HOURS = 12
const TO_HOURS = 36

export interface ReminderResult {
  /** How many bookings were in the window. */
  due: number
  /** How many were actually reminded. Equal to `due` unless a subject was gone. */
  reminded: number
}

export async function sweepAppointmentReminders(
  options: { dry?: boolean; now?: Date } = {},
): Promise<ReminderResult> {
  const now = options.now ?? new Date()
  const from = new Date(now.getTime() + FROM_HOURS * 60 * 60 * 1000)
  const to = new Date(now.getTime() + TO_HOURS * 60 * 60 * 1000)

  const due = await db.appointment.findMany({
    where: {
      status: 'BOOKED',
      reminderSentAt: null,
      slot: { startsAt: { gte: from, lte: to }, closedAt: null },
    },
    select: { id: true },
  })

  if (options.dry) return { due: due.length, reminded: 0 }

  let reminded = 0
  for (const appointment of due) {
    const subject = await appointmentSubject(appointment.id)
    if (!subject) continue
    await notify({ event: 'APPOINTMENT_REMINDER', subject: { appointment: subject } })
    await db.appointment.update({
      where: { id: appointment.id },
      data: { reminderSentAt: new Date() },
    })
    reminded += 1
  }

  return { due: due.length, reminded }
}
