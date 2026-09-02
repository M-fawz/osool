import type { NotificationStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { noticeEmail } from '@/lib/email/notice'
import { CATALOGUE, type NotificationEventKey, type NotifySubject } from './catalogue'
import { unique, type Recipient } from './recipients'

export type { NotificationEventKey, NotifySubject } from './catalogue'
export { CATALOGUE, ALL_EVENT_KEYS } from './catalogue'

/**
 * Sending the register's notifications.
 *
 * Three properties, and each exists because of a specific way this goes wrong:
 *
 * **1. A notification never fails a workflow step.**
 * `notify()` does not throw. An approval that was refused because a mail server
 * was briefly unreachable would be the worst kind of bug in this product: the
 * decision is correct, the officer took it, the audit trail says it happened,
 * and the applicant's file did not move. So every failure is caught, recorded
 * as a `FAILED` notification with the provider's reason, and logged. The
 * workflow carries on. What was lost is a message; what was not lost is a
 * decision.
 *
 * For the same reason `notify()` is called *after* the transaction that made
 * the thing happen has committed, never inside it — sending mail while holding
 * a row lock would put a network round trip inside a database transaction.
 *
 * **2. One event notifies one person once.**
 * Every send carries a `dedupeKey` from the catalogue, and the column is
 * unique. A double-submitted form, a retried Server Action, or two code paths
 * that both reach the same event produce one message, because the second insert
 * loses to the index rather than to a check someone remembered to write.
 *
 * **3. No message is sent to somebody who may not see the thing.**
 * Recipients come from `recipients.ts`, which applies §4's access rules — a
 * SYSTEM_ADMIN is never sent case data, a reviewer is never sent a file they
 * examined, a suspended account is never mailed at all.
 */

export interface NotifyOutcome {
  event: NotificationEventKey
  recipientEmail: string
  status: NotificationStatus
  reason?: string
}

export interface NotifyInput {
  event: NotificationEventKey
  subject: NotifySubject
  /**
   * Send even where an identical `dedupeKey` already exists.
   *
   * There is deliberately no such flag. If a message legitimately repeats — a
   * second round of completions, a rebooked appointment — the catalogue entry's
   * `dedupe` puts the distinguishing fact in the key. That keeps "why did this
   * send twice?" answerable from one place instead of from every call site.
   */
}

/**
 * Send one event to everybody it concerns.
 *
 * Returns what happened, for the caller that wants to log or assert on it.
 * Callers in the workflow ignore the return value, which is the point.
 */
export async function notify(input: NotifyInput): Promise<NotifyOutcome[]> {
  const definition = CATALOGUE[input.event]

  let recipients: Recipient[]
  try {
    recipients = unique(await definition.resolve(input.subject))
  } catch (error) {
    console.error(
      `[osool] notification ${input.event}: could not resolve recipients`,
      (error as Error).message,
    )
    return []
  }

  if (recipients.length === 0) {
    // Not a failure. Plenty of events legitimately concern nobody right now —
    // a firm whose only owner account is suspended, a reviewer queue where the
    // one reviewer is the examiner of this very file. Recorded so that "nobody
    // was told" is visible rather than indistinguishable from "nothing ran".
    await recordSuppressed(input)
    return []
  }

  const outcomes: NotifyOutcome[] = []
  for (const recipient of recipients) {
    outcomes.push(await deliverOne(input, definition, recipient))
  }
  return outcomes
}

async function deliverOne(
  input: NotifyInput,
  definition: (typeof CATALOGUE)[NotificationEventKey],
  recipient: Recipient,
): Promise<NotifyOutcome> {
  const dedupeKey = definition.dedupe(input.subject, recipient)

  // Claim the key first. Winning the insert is what gives this process the
  // right to send; losing it means somebody else already did, and the message
  // must not go out a second time. Doing it the other way round — send, then
  // record — sends twice under a retry and records once.
  const claim = await claimDedupeKey(input, recipient, dedupeKey)
  if (!claim.claimed) {
    return { event: input.event, recipientEmail: recipient.email, status: 'SUPPRESSED', reason: 'already sent' }
  }

  const built = definition.build(input.subject, recipient)

  try {
    const result = await sendEmail(
      noticeEmail({
        to: recipient.email,
        subjectAr: built.subjectAr,
        subjectEn: built.subjectEn,
        parts: built.parts,
      }),
    )

    await db.notification.update({
      where: { id: claim.id },
      data: { status: 'SENT', providerMessageId: result.id, sentAt: new Date() },
    })

    return { event: input.event, recipientEmail: recipient.email, status: 'SENT' }
  } catch (error) {
    const reason = (error as Error).message.slice(0, 500)

    // The row is already there; it becomes the record of a failure rather than
    // of a send. An operator looking for "who did not get told" queries one
    // column, and the workflow above this never learns anything went wrong.
    await db.notification.update({
      where: { id: claim.id },
      data: { status: 'FAILED', failureReason: reason },
    })

    console.error(`[osool] notification ${input.event} to ${recipient.email} failed: ${reason}`)
    return { event: input.event, recipientEmail: recipient.email, status: 'FAILED', reason }
  }
}

async function claimDedupeKey(
  input: NotifyInput,
  recipient: Recipient,
  dedupeKey: string,
): Promise<{ claimed: true; id: string } | { claimed: false }> {
  const built = CATALOGUE[input.event].build(input.subject, recipient)

  try {
    const row = await db.notification.create({
      data: {
        eventKey: input.event,
        channel: 'EMAIL',
        // Written as FAILED and moved to SENT once the provider has taken it.
        // A row that never gets updated — because the process died mid-send —
        // then reads as a failure, which is the truthful reading.
        status: 'FAILED',
        failureReason: 'send not completed',
        recipientUserId: recipient.userId,
        recipientEmail: recipient.email,
        subjectAr: built.subjectAr,
        subjectEn: built.subjectEn,
        applicationId: input.subject.application?.id ?? null,
        appointmentId: input.subject.appointment?.id ?? null,
        registrationId: input.subject.registration?.id ?? null,
        signalId: input.subject.signal?.id ?? null,
        dedupeKey,
      },
      select: { id: true },
    })
    return { claimed: true, id: row.id }
  } catch {
    // The unique index on dedupeKey refused it: this event has already been
    // sent to this person. Any other write failure lands here too and is
    // treated the same way, which errs towards not sending twice.
    return { claimed: false }
  }
}

async function recordSuppressed(input: NotifyInput): Promise<void> {
  const key = [
    'SUPPRESSED',
    input.event,
    input.subject.application?.id ?? input.subject.appointment?.id ?? input.subject.registration?.id ?? input.subject.signal?.id ?? input.subject.accountChange?.userId ?? 'none',
  ].join(':')

  try {
    await db.notification.create({
      data: {
        eventKey: input.event,
        status: 'SUPPRESSED',
        recipientEmail: '—',
        subjectAr: '—',
        subjectEn: '—',
        failureReason: 'No recipient was eligible for this event.',
        applicationId: input.subject.application?.id ?? null,
        appointmentId: input.subject.appointment?.id ?? null,
        registrationId: input.subject.registration?.id ?? null,
        signalId: input.subject.signal?.id ?? null,
        dedupeKey: key,
      },
    })
  } catch {
    // Already recorded. Nothing to do.
  }
}

/**
 * Fire and forget, for a workflow step that must not wait on a mail server.
 *
 * Server Actions in this product return a result the browser is already
 * waiting on. Blocking that response while Resend answers adds the provider's
 * latency to every approval an officer takes. This hands the work off and
 * returns immediately; `notify()` already swallows its own failures, so there
 * is no unhandled rejection to leak.
 *
 * Used where the message is genuinely secondary to the action. Where a test
 * needs to assert on the message, it awaits `notify()` directly.
 */
export function notifyInBackground(input: NotifyInput): void {
  void notify(input).catch((error) => {
    console.error(`[osool] notification ${input.event} threw unexpectedly`, error)
  })
}
