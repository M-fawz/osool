import type { EmailMessage } from './index'

/**
 * Email templates.
 *
 * Arabic leads and English follows in the same message, because a government
 * employee's mail client may render either and the message must be usable
 * without a language switch. The Arabic block is marked `dir="rtl"`; the
 * activation URL, being a Latin string, is wrapped so it cannot be reordered
 * by bidirectional layout — a URL that renders backwards is a URL nobody can
 * use.
 *
 * The visual language follows the logo: navy ink, brass rule, sharp corners,
 * no decoration. An email from a register should look like it came from one.
 */

const NAVY = '#0F2D53'
const BRASS = '#A7844E'
const INK = '#16181D'
const MUTED = '#5A6270'

function layout(parts: {
  previewText: string
  arTitle: string
  arBody: string[]
  arCta: string
  enTitle: string
  enBody: string[]
  enCta: string
  url: string
  expiryNoteAr: string
  expiryNoteEn: string
}): string {
  const arParagraphs = parts.arBody
    .map((p) => `<p style="margin:0 0 12px;line-height:1.75;color:${INK};font-size:15px;">${p}</p>`)
    .join('')
  const enParagraphs = parts.enBody
    .map((p) => `<p style="margin:0 0 12px;line-height:1.65;color:${INK};font-size:15px;">${p}</p>`)
    .join('')

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F5F7;">
<span style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${parts.previewText}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #DDE1E8;">

      <tr><td style="background:${NAVY};padding:20px 28px;">
        <div style="color:#FFFFFF;font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:18px;font-weight:600;letter-spacing:.02em;">
          أصول &nbsp;·&nbsp; <span style="font-size:15px;font-weight:500;">Osool</span>
        </div>
        <div style="color:#C6CEDC;font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:11px;margin-top:5px;">
          سجل الوسطاء العقاريين — Real Estate Brokers Register
        </div>
      </td></tr>
      <tr><td style="height:3px;background:${BRASS};font-size:0;line-height:0;">&nbsp;</td></tr>

      <tr><td dir="rtl" lang="ar" style="padding:26px 28px 6px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;text-align:right;">
        <h1 style="margin:0 0 14px;font-size:18px;font-weight:600;color:${NAVY};">${parts.arTitle}</h1>
        ${arParagraphs}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 10px;">
          <tr><td style="background:${NAVY};">
            <a href="${parts.url}" style="display:inline-block;padding:13px 26px;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;">${parts.arCta}</a>
          </td></tr>
        </table>
        <p style="margin:0;font-size:13px;color:${MUTED};">${parts.expiryNoteAr}</p>
      </td></tr>

      <tr><td style="padding:0 28px;"><div style="height:1px;background:#DDE1E8;margin:22px 0;"></div></td></tr>

      <tr><td dir="ltr" lang="en" style="padding:0 28px 6px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;text-align:left;">
        <h2 style="margin:0 0 14px;font-size:18px;font-weight:600;color:${NAVY};">${parts.enTitle}</h2>
        ${enParagraphs}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 10px;">
          <tr><td style="background:${NAVY};">
            <a href="${parts.url}" style="display:inline-block;padding:13px 26px;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;">${parts.enCta}</a>
          </td></tr>
        </table>
        <p style="margin:0;font-size:13px;color:${MUTED};">${parts.expiryNoteEn}</p>
      </td></tr>

      <tr><td style="padding:20px 28px 26px;">
        <p style="margin:0 0 6px;font-size:11px;color:${MUTED};font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
          If the button does not work, copy this address into your browser:
        </p>
        <p dir="ltr" style="margin:0;font-size:11px;color:${NAVY};word-break:break-all;font-family:'IBM Plex Mono',Consolas,Menlo,monospace;">${parts.url}</p>
      </td></tr>

      <tr><td style="background:#F7F8FA;border-top:1px solid #DDE1E8;padding:16px 28px;">
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

/**
 * Activation of a government account created by an administrator.
 *
 * The employee sets their own password. The administrator never knows it — and
 * that is the point: provisioning an account and being able to sign in as its
 * holder are different powers, and this system does not let one imply the
 * other.
 */
export function governmentActivationEmail(input: {
  to: string
  name: string
  roleLabelAr: string
  roleLabelEn: string
  url: string
  expiresInHours: number
}): EmailMessage {
  const text = [
    'تفعيل حساب أصول',
    '',
    `${input.name} — تم إنشاء حساب لك على منصة أصول بصلاحية: ${input.roleLabelAr}.`,
    'لتفعيل الحساب، عليك تعيين كلمة مرور خاصة بك من الرابط التالي:',
    '',
    input.url,
    '',
    `الرابط صالح لمدة ${input.expiresInHours} ساعة.`,
    'لم يطّلع أحد على كلمة المرور التي ستختارها، ولا يمكن لمن أنشأ الحساب معرفتها.',
    '',
    '────────────────────────────────────────',
    '',
    'Activate your Osool account',
    '',
    `${input.name} — an account has been created for you on Osool with the role: ${input.roleLabelEn}.`,
    'To activate it, set your own password using the link below:',
    '',
    input.url,
    '',
    `This link is valid for ${input.expiresInHours} hours.`,
    'Nobody else knows the password you choose, including the administrator who created the account.',
    '',
    'GOEIC — Ministry of Investment and Foreign Trade',
  ].join('\n')

  return {
    to: input.to,
    subject: `تفعيل حساب أصول · Activate your Osool account`,
    text,
    html: layout({
      previewText: 'Set your password to activate your Osool account.',
      arTitle: 'تفعيل حسابك على منصة أصول',
      arBody: [
        `${input.name}، تم إنشاء حساب لك بصلاحية <strong style="color:${NAVY};">${input.roleLabelAr}</strong>.`,
        'لتفعيل الحساب عليك تعيين كلمة مرور خاصة بك. لن يطّلع عليها أحد، بما في ذلك من أنشأ الحساب.',
      ],
      arCta: 'تعيين كلمة المرور',
      enTitle: 'Activate your Osool account',
      enBody: [
        `${input.name}, an account has been created for you with the role <strong style="color:${NAVY};">${input.roleLabelEn}</strong>.`,
        'To activate it, set your own password. Nobody else will know it, including the administrator who created the account.',
      ],
      enCta: 'Set your password',
      url: input.url,
      expiryNoteAr: `الرابط صالح لمدة ${input.expiresInHours} ساعة.`,
      expiryNoteEn: `This link is valid for ${input.expiresInHours} hours.`,
    }),
  }
}

/** Email verification for a self-registering broker. */
export function brokerVerificationEmail(input: {
  to: string
  name: string
  url: string
  expiresInHours: number
}): EmailMessage {
  const text = [
    'تأكيد بريدك الإلكتروني — منصة أصول',
    '',
    `${input.name}، لتأكيد بريدك الإلكتروني وإتمام إنشاء الحساب، افتح الرابط التالي:`,
    '',
    input.url,
    '',
    `الرابط صالح لمدة ${input.expiresInHours} ساعة.`,
    'إذا لم تكن أنت من أنشأ هذا الحساب، تجاهل هذه الرسالة.',
    '',
    '────────────────────────────────────────',
    '',
    'Confirm your email address — Osool',
    '',
    `${input.name}, to confirm your email address and finish creating your account, open the link below:`,
    '',
    input.url,
    '',
    `This link is valid for ${input.expiresInHours} hours.`,
    'If you did not create this account, you can ignore this message.',
  ].join('\n')

  return {
    to: input.to,
    subject: 'تأكيد بريدك الإلكتروني · Confirm your email — Osool',
    text,
    html: layout({
      previewText: 'Confirm your email address to finish creating your Osool account.',
      arTitle: 'تأكيد بريدك الإلكتروني',
      arBody: [
        `${input.name}، لتأكيد بريدك الإلكتروني وإتمام إنشاء حسابك على منصة أصول، اضغط الزر أدناه.`,
        'إذا لم تكن أنت من أنشأ هذا الحساب، تجاهل هذه الرسالة ولن يحدث أي إجراء.',
      ],
      arCta: 'تأكيد البريد الإلكتروني',
      enTitle: 'Confirm your email address',
      enBody: [
        `${input.name}, to confirm your email address and finish creating your Osool account, use the button below.`,
        'If you did not create this account, ignore this message and nothing will happen.',
      ],
      enCta: 'Confirm email address',
      url: input.url,
      expiryNoteAr: `الرابط صالح لمدة ${input.expiresInHours} ساعة.`,
      expiryNoteEn: `This link is valid for ${input.expiresInHours} hours.`,
    }),
  }
}

/** Password reset, for an account that already exists and is active. */
export function passwordResetEmail(input: {
  to: string
  name: string
  url: string
  expiresInHours: number
}): EmailMessage {
  const text = [
    'إعادة تعيين كلمة المرور — منصة أصول',
    '',
    `${input.name}، لإعادة تعيين كلمة المرور افتح الرابط التالي:`,
    '',
    input.url,
    '',
    `الرابط صالح لمدة ${input.expiresInHours} ساعة.`,
    'إذا لم تطلب ذلك، تجاهل الرسالة — كلمة مرورك الحالية لم تتغير.',
    '',
    '────────────────────────────────────────',
    '',
    'Reset your password — Osool',
    '',
    `${input.name}, to reset your password, open the link below:`,
    '',
    input.url,
    '',
    `This link is valid for ${input.expiresInHours} hours.`,
    'If you did not request this, ignore this message — your current password has not changed.',
  ].join('\n')

  return {
    to: input.to,
    subject: 'إعادة تعيين كلمة المرور · Reset your Osool password',
    text,
    html: layout({
      previewText: 'Reset your Osool password.',
      arTitle: 'إعادة تعيين كلمة المرور',
      arBody: [
        `${input.name}، وصلنا طلب لإعادة تعيين كلمة المرور الخاصة بحسابك.`,
        'إذا لم تطلب ذلك، تجاهل هذه الرسالة — كلمة مرورك الحالية لم تتغير.',
      ],
      arCta: 'إعادة تعيين كلمة المرور',
      enTitle: 'Reset your password',
      enBody: [
        `${input.name}, we received a request to reset the password for your account.`,
        'If you did not request this, ignore this message — your current password has not changed.',
      ],
      enCta: 'Reset password',
      url: input.url,
      expiryNoteAr: `الرابط صالح لمدة ${input.expiresInHours} ساعة.`,
      expiryNoteEn: `This link is valid for ${input.expiresInHours} hours.`,
    }),
  }
}
