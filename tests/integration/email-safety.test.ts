import { describe, expect, it } from 'vitest'
import { CATALOGUE } from '@/lib/notifications/catalogue'
import { noticeHtml } from '@/lib/email/notice'

/**
 * What a person types must not become markup in somebody else's inbox.
 *
 * The email layout emits `arBody`/`enBody` as written, because the catalogue
 * authors them and they carry their own `<strong>`. That is a trusted-markup
 * channel, and three events splice values into it that no one at the Authority
 * wrote: the reviewer's reason for refusing an application, the reason a
 * booking was cancelled, and the reason an account was suspended.
 *
 * Unescaped, the consequence is not a script — mail clients do not run those —
 * it is a link. One user could put an arbitrary anchor inside a message that
 * arrives with the Authority's letterhead, addressed to a broker who has every
 * reason to trust it. That is a phishing primitive handed to the supervised
 * population, and it is worth a test that fails loudly rather than a convention
 * the next person to add an event has to know about.
 */

const INJECTION = '<a href="https://evil.example/collect">اضغط هنا</a><script>alert(1)</script>'

function renderBoth(event: keyof typeof CATALOGUE, subject: Record<string, unknown>) {
  const built = CATALOGUE[event].build(
    subject as never,
    { email: 'broker@example.test', userId: 'U1' } as never,
  )
  return noticeHtml(built.parts)
}

describe('a reason somebody typed', () => {
  it('cannot inject markup through an appointment cancellation', () => {
    const html = renderBoth('APPOINTMENT_CANCELLED', {
      appointment: {
        id: 'A1',
        applicationId: 'APP1',
        brokerEntityId: 'B1',
        startsAt: new Date(),
        endsAt: new Date(),
        purpose: 'DOCUMENT_HANDOVER',
        locationAr: 'شباك',
        locationEn: 'Counter',
        attendeeName: 'كريم بدوي',
      },
      extra: { reason: INJECTION },
    })

    expect(html).not.toContain('<a href="https://evil.example/collect"')
    expect(html).not.toContain('<script>')
    // Escaped, not dropped: the officer reading it must still see what was typed.
    expect(html).toContain('&lt;a href=&quot;https://evil.example/collect&quot;&gt;')
  })

  it('cannot inject markup through an account suspension', () => {
    const html = renderBoth('ACCOUNT_SUSPENDED', {
      accountChange: { userId: 'U1', email: 'x@y.test', role: 'EXAMINER', reason: INJECTION },
      extra: { reason: INJECTION },
    })

    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<a href="https://evil.example/collect"')
  })

  it('cannot inject markup through a refusal decision', () => {
    const html = renderBoth('APPLICATION_REJECTED', {
      application: {
        id: 'APP1',
        brokerEntityId: 'B1',
        temporaryNumber: 'T-2026/0001',
        tradeNameAr: 'منشأة',
        status: 'REJECTED',
      },
      extra: { note: INJECTION },
    })

    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<a href="https://evil.example/collect"')
  })
})

describe('the notice layout', () => {
  it('escapes an action URL rather than trusting it', () => {
    const html = noticeHtml({
      previewText: 'x',
      arTitle: 'ع',
      arBody: ['ن'],
      enTitle: 'T',
      enBody: ['B'],
      action: { url: 'https://x.test/"><script>alert(1)</script>', labelAr: 'ا', labelEn: 'Go' },
    })

    expect(html).not.toContain('<script>alert(1)</script>')
  })
})
