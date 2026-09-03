import { env } from '@/lib/env'

/**
 * Transactional email.
 *
 * 02-SYSTEM-ARCHITECTURE §4: "The activation link must be delivered by real
 * email — the predecessor system wrote emails to a database table and required
 * an administrator to copy links by hand. That is not acceptable here."
 *
 * So there is no outbox table in this module, and there will not be one. Three
 * drivers exist:
 *
 *   · `resend`  — a real transactional provider. What a live register should
 *                 run on.
 *   · `manual`  — the deployment has no outbound mail at all. The message is
 *                 not queued, not stored, and not retried; the one-time link
 *                 inside it is handed straight back to the administrator whose
 *                 action produced it, on screen, once. See
 *                 src/lib/auth/link-capture.ts. This is a *narrower* thing
 *                 than the predecessor's outbox, not a reinvention of it:
 *                 nothing is written down, and nobody but the acting
 *                 administrator ever sees it.
 *   · `console` — development only. Writes the whole message, including the
 *                 activation URL, to the server console where the developer is
 *                 already looking. It is a *delivery* mechanism for one
 *                 developer on one machine, not a queue someone administers.
 *   · `capture`  — the automated tests. Holds messages in memory so a test can
 *                 assert that the right person was told the right thing. Never
 *                 touches disk or database, and is refused in production.
 *
 * `manual` is refused in production too, and src/lib/env.ts explains why at
 * length: it cannot deliver to a self-registering broker, because there is no
 * administrator in that loop to hand the link to.
 *
 * A send that fails throws. A caller provisioning an account must not report
 * success when the employee will never receive the link.
 */

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
}

export interface EmailResult {
  driver: 'console' | 'resend' | 'manual' | 'capture'
  id: string | null
  to: string
}

/**
 * Messages the `capture` driver has taken, newest last.
 *
 * Module state, deliberately: a test asserts against the same process that sent
 * the message. It is bounded so a long run cannot grow it without limit, and
 * `capture` never runs anywhere but a test — env.ts refuses it in production.
 */
const captured: EmailMessage[] = []

/*
 * A ceiling that shouts, not a ring buffer that forgets.
 *
 * This used to keep the newest 500 and silently `shift()` the rest away. That
 * turns a capacity problem into a false assertion: a test asking "was the
 * broker told their file arrived?" got `false` — not because the notice was
 * never sent, but because 603 accumulated registry clerks had pushed it out of
 * the buffer, and the broker's notice is the one sent first. The test reported
 * a notification bug that did not exist, and the real cause was invisible from
 * anything it printed.
 *
 * A test double must never quietly discard the evidence a test is about to
 * assert on. So nothing is dropped; if the volume ever becomes genuinely
 * unreasonable the run fails loudly and names the reason, which is a far better
 * outcome than an assertion that is wrong for a reason nobody can see.
 */
const CAPTURE_CEILING = 50_000

export function capturedEmails(): readonly EmailMessage[] {
  return captured
}

export function clearCapturedEmails(): void {
  captured.length = 0
}

async function sendViaCapture(message: EmailMessage): Promise<EmailResult> {
  if (captured.length >= CAPTURE_CEILING) {
    throw new Error(
      `The capture driver is holding ${CAPTURE_CEILING} messages. Something is ` +
        'fanning out further than a test should — check for accumulated fixture ' +
        'users, since role-addressed notices go to every officer holding the role.',
    )
  }
  captured.push(message)
  return { driver: 'capture', id: `capture-${captured.length}`, to: message.to }
}

async function sendViaConsole(message: EmailMessage): Promise<EmailResult> {
  const rule = '─'.repeat(74)
  console.log(`\n┌${rule}┐`)
  console.log(`│ EMAIL — development driver. In production this is sent by Resend.`)
  console.log(`├${rule}┤`)
  console.log(`│ To      : ${message.to}`)
  console.log(`│ From    : ${env.EMAIL_FROM}`)
  console.log(`│ Subject : ${message.subject}`)
  console.log(`├${rule}┤`)
  for (const line of message.text.split('\n')) console.log(`│ ${line}`)
  console.log(`└${rule}┘\n`)
  return { driver: 'console', id: null, to: message.to }
}

async function sendViaResend(message: EmailMessage): Promise<EmailResult> {
  const { Resend } = await import('resend')
  const resend = new Resend(env.RESEND_API_KEY)

  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  })

  if (error) {
    throw new Error(`Resend refused the message to ${message.to}: ${error.message}`)
  }

  return { driver: 'resend', id: data?.id ?? null, to: message.to }
}

/**
 * No outbound mail on this deployment.
 *
 * Deliberately does nothing with the message body. The one-time link the
 * message would have carried has already been captured by
 * src/lib/auth/link-capture.ts and is returned to the acting administrator by
 * the provisioning call; writing the body anywhere else would be building the
 * outbox this module exists not to have.
 */
async function sendViaManual(message: EmailMessage): Promise<EmailResult> {
  return { driver: 'manual', id: null, to: message.to }
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (env.EMAIL_PROVIDER === 'resend') return sendViaResend(message)
  if (env.EMAIL_PROVIDER === 'manual') return sendViaManual(message)
  if (env.EMAIL_PROVIDER === 'capture') return sendViaCapture(message)
  return sendViaConsole(message)
}
