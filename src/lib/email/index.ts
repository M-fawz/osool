import { env } from '@/lib/env'

/**
 * Transactional email.
 *
 * 02-SYSTEM-ARCHITECTURE §4: "The activation link must be delivered by real
 * email — the predecessor system wrote emails to a database table and required
 * an administrator to copy links by hand. That is not acceptable here."
 *
 * So there is no outbox table in this module, and there will not be one. Two
 * drivers exist:
 *
 *   · `resend`  — a real transactional provider. Required in production;
 *                 src/lib/env.ts refuses to start a production process
 *                 configured any other way.
 *   · `console` — development only. Writes the whole message, including the
 *                 activation URL, to the server console where the developer is
 *                 already looking. It is a *delivery* mechanism for one
 *                 developer on one machine, not a queue someone administers.
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
  driver: 'console' | 'resend'
  id: string | null
  to: string
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

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (env.EMAIL_PROVIDER === 'resend') return sendViaResend(message)
  return sendViaConsole(message)
}
