import type { EmailMessage } from './index'

/**
 * The layout every workflow notification uses.
 *
 * `templates.ts` holds the three account emails — activation, verification,
 * password reset. Those exist to carry one one-time link and nothing else, and
 * their layout is built around that link. A workflow notification is a
 * different kind of message: it reports that something happened to a named file
 * and usually lists facts about it, and it may or may not have anywhere for the
 * reader to go.
 *
 * Rather than bend the link layout into a shape it was not designed for, this
 * is a second layout with the same visual language — navy ink, brass rule,
 * sharp corners — so the two look like they came from the same register while
 * saying quite different things. The account templates are untouched.
 *
 * Three rules the layout enforces so that no individual message has to
 * remember them:
 *
 *   · Arabic leads, English follows, in one message. A government mailbox may
 *     render either, and the recipient must not need a language switch.
 *   · Reference numbers, dates, and any Latin string sit in `dir="ltr"` spans
 *     inside the Arabic block. A registration number that renders backwards is
 *     a registration number nobody can read out over a telephone.
 *   · There is no tracking pixel, no remote image, and no external stylesheet.
 *     A government notification should not phone anybody when it is opened.
 */

const NAVY = '#0F2D53'
const BRASS = '#A7844E'
const INK = '#16181D'
const MUTED = '#5A6270'
const RULE = '#DDE1E8'

/** A row in the facts table — "Reference · 2026/0184". */
export interface NoticeFact {
  labelAr: string
  labelEn: string
  /** Rendered LTR-isolated: numbers, dates, references. */
  value: string
  /** Set for values that are Arabic prose rather than a reference. */
  rtl?: boolean
}

export interface NoticeParts {
  previewText: string
  arTitle: string
  arBody: string[]
  enTitle: string
  enBody: string[]
  facts?: NoticeFact[]
  action?: { url: string; labelAr: string; labelEn: string }
  /** A closing line in a lighter tone — what happens next, or a caution. */
  arFooterNote?: string
  enFooterNote?: string
}

/**
 * HTML-escape.
 *
 * Every value this module interpolates goes through it. The one deliberate
 * exception is the body paragraphs: `arBody` and `enBody` are authored in the
 * catalogue and carry their own markup (`<strong>`), so they are emitted as
 * written. That makes them a trusted-markup channel, and the rule that follows
 * is the catalogue's to keep — **anything the catalogue splices into a body
 * string must be escaped by the catalogue first**, which is why this is
 * exported. A refusal reason typed by an officer or a cancellation reason typed
 * by a broker is not trusted markup; unescaped, it would let one user put an
 * arbitrary link inside a message the recipient reads as coming from the
 * Authority.
 */
export function escapeHtml(value: string): string {
  return esc(value)
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function factsTable(input: NoticeFact[], locale: 'ar' | 'en'): string {
  /*
   * A fact with nothing in it is dropped rather than rendered as a blank row —
   * and, more to the point, rather than reaching `esc` as `undefined` and
   * throwing. `notify()` swallows what this module throws, so the failure mode
   * of that crash is not an error anybody sees: it is a message recorded FAILED
   * and a broker who is never told their appointment is confirmed.
   */
  const facts = input.filter((fact) => fact.value !== null && fact.value !== undefined && fact.value !== '')
  if (facts.length === 0) return ''
  const align = locale === 'ar' ? 'right' : 'left'

  const rows = facts
    .map((fact) => {
      const label = locale === 'ar' ? fact.labelAr : fact.labelEn
      const value = fact.rtl
        ? `<span dir="rtl">${esc(fact.value)}</span>`
        : `<span dir="ltr" style="unicode-bidi:isolate;font-family:'IBM Plex Mono',Consolas,Menlo,monospace;">${esc(fact.value)}</span>`

      return `<tr>
        <td style="padding:7px 0;border-bottom:1px solid ${RULE};color:${MUTED};font-size:13px;white-space:nowrap;" align="${align}">${esc(label)}</td>
        <td style="padding:7px 0 7px 14px;border-bottom:1px solid ${RULE};color:${INK};font-size:13px;font-weight:600;" align="${align}">${value}</td>
      </tr>`
    })
    .join('')

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 4px;">${rows}</table>`
}

function actionButton(
  action: NoticeParts['action'],
  locale: 'ar' | 'en',
): string {
  if (!action) return ''
  const label = locale === 'ar' ? action.labelAr : action.labelEn
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 6px;">
    <tr><td style="background:${NAVY};">
      <a href="${esc(action.url)}" style="display:inline-block;padding:12px 24px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;">${esc(label)}</a>
    </td></tr>
  </table>`
}

function block(parts: NoticeParts, locale: 'ar' | 'en'): string {
  const dir = locale === 'ar' ? 'rtl' : 'ltr'
  const align = locale === 'ar' ? 'right' : 'left'
  const title = locale === 'ar' ? parts.arTitle : parts.enTitle
  const body = locale === 'ar' ? parts.arBody : parts.enBody
  const note = locale === 'ar' ? parts.arFooterNote : parts.enFooterNote

  const paragraphs = body
    .map(
      (p) =>
        `<p style="margin:0 0 12px;line-height:${locale === 'ar' ? '1.85' : '1.65'};color:${INK};font-size:15px;">${p}</p>`,
    )
    .join('')

  return `<tr><td dir="${dir}" lang="${locale}" style="padding:26px 28px 8px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;text-align:${align};">
    <h1 style="margin:0 0 14px;font-size:18px;font-weight:600;color:${NAVY};">${esc(title)}</h1>
    ${paragraphs}
    ${factsTable(parts.facts ?? [], locale)}
    ${actionButton(parts.action, locale)}
    ${note ? `<p style="margin:12px 0 0;font-size:13px;line-height:1.7;color:${MUTED};">${note}</p>` : ''}
  </td></tr>`
}

export function noticeHtml(parts: NoticeParts): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F5F7;">
<span style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${esc(parts.previewText)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#FFFFFF;border:1px solid ${RULE};">

      <tr><td style="background:${NAVY};padding:20px 28px;">
        <div style="color:#FFFFFF;font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:18px;font-weight:600;letter-spacing:.02em;">
          أصول &nbsp;·&nbsp; <span style="font-size:15px;font-weight:500;">Osool</span>
        </div>
        <div style="color:#C6CEDC;font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:11px;margin-top:5px;">
          سجل الوسطاء العقاريين — Real Estate Brokers Register
        </div>
      </td></tr>
      <tr><td style="height:3px;background:${BRASS};font-size:0;line-height:0;">&nbsp;</td></tr>

      ${block(parts, 'ar')}

      <tr><td style="padding:0 28px;"><div style="height:1px;background:${RULE};margin:20px 0;"></div></td></tr>

      ${block(parts, 'en')}

      ${
        parts.action
          ? `<tr><td style="padding:14px 28px 22px;">
        <p style="margin:0 0 6px;font-size:11px;color:${MUTED};font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
          If the button does not work, copy this address into your browser:
        </p>
        <p dir="ltr" style="margin:0;font-size:11px;color:${NAVY};word-break:break-all;font-family:'IBM Plex Mono',Consolas,Menlo,monospace;">${esc(parts.action.url)}</p>
      </td></tr>`
          : '<tr><td style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>'
      }

      <tr><td style="background:#F7F8FA;border-top:1px solid ${RULE};padding:16px 28px;">
        <p style="margin:0;font-size:11px;line-height:1.6;color:${MUTED};font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
          الهيئة العامة للرقابة على الصادرات والواردات — وزارة الاستثمار والتجارة الخارجية<br>
          <span dir="ltr">GOEIC — Ministry of Investment and Foreign Trade. This is an automated message; please do not reply.</span>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

/** The same message as plain text, for a client that will not render HTML. */
export function noticeText(parts: NoticeParts): string {
  const lines: string[] = [parts.arTitle, '']
  lines.push(...parts.arBody.map(stripTags))
  if (parts.facts?.length) {
    lines.push('')
    for (const fact of parts.facts) lines.push(`${fact.labelAr}: ${fact.value}`)
  }
  if (parts.action) lines.push('', parts.action.labelAr + ':', parts.action.url)
  if (parts.arFooterNote) lines.push('', stripTags(parts.arFooterNote))

  lines.push('', '────────────────────────────────────────', '')
  lines.push(parts.enTitle, '')
  lines.push(...parts.enBody.map(stripTags))
  if (parts.facts?.length) {
    lines.push('')
    for (const fact of parts.facts) lines.push(`${fact.labelEn}: ${fact.value}`)
  }
  if (parts.action) lines.push('', parts.action.labelEn + ':', parts.action.url)
  if (parts.enFooterNote) lines.push('', stripTags(parts.enFooterNote))

  lines.push('', 'GOEIC — Ministry of Investment and Foreign Trade')
  return lines.join('\n')
}

/** Bodies carry light inline markup for emphasis; the text part cannot. */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
}

export function noticeEmail(input: {
  to: string
  subjectAr: string
  subjectEn: string
  parts: NoticeParts
}): EmailMessage {
  return {
    to: input.to,
    // Both languages in the subject line, Arabic first, separated by a middle
    // dot. An inbox shows one line and the reader may read either.
    subject: `${input.subjectAr} · ${input.subjectEn}`,
    html: noticeHtml(input.parts),
    text: noticeText(input.parts),
  }
}
