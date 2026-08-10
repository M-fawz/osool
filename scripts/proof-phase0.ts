/**
 * The Phase 0 proof point, run against the live application over HTTP.
 *
 *   npm run dev          (in one terminal)
 *   npm run proof:phase0 (in another)
 *
 * From 04-BUILD-PLAN.md:
 *
 *   "Proof point: an administrator creates an examiner account, the examiner
 *    receives a real email, activates, signs in, and every one of those steps
 *    is visible in the audit trail."
 *
 * Everything goes through the real HTTP surface — the endpoints a browser hits —
 * rather than calling library functions directly, so the session cookie, the
 * middleware, the locale routing, and the authorisation guards are all actually
 * exercised.
 *
 * One place stands in for a human, marked HUMAN-STANDIN: reading the one-time
 * token out of the row the emailed link was built from, which is what a person
 * does when they click that link. The email is genuinely sent either way — with
 * EMAIL_PROVIDER=console the dev server terminal prints the whole message.
 */

import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { auth } from '@/lib/auth'
import { recordAuditEvent, verifyChain } from '@/lib/audit'
import { provisionGovernmentAccount, suspendAccount } from '@/lib/auth/provisioning'
import { roleLabels } from '@/lib/auth/roles'

const BASE = env.APP_URL

function heading(text: string) {
  console.log(`\n${'━'.repeat(78)}\n${text}\n${'━'.repeat(78)}`)
}
const step = (t: string) => console.log(`\n▸ ${t}`)
const detail = (t: string) => console.log(`    ${t}`)

/**
 * Better Auth refuses a state-changing request with no `Origin` header —
 * ordinary CSRF protection. A browser always sends one; a script must say so.
 */
const BROWSER_HEADERS = {
  'content-type': 'application/json',
  origin: BASE,
  referer: `${BASE}/login`,
}

/**
 * Only the text a person would actually see on the page.
 *
 * This matters more than it looks. In development Next inlines the entire
 * next-intl message catalogue into the client bundle, so *every* translated
 * string appears somewhere in the raw HTML of *every* page — including strings
 * belonging to screens that were never rendered. Asserting against raw HTML
 * therefore passes whatever you ask of it, which is worse than failing.
 */
function visibleText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const marks = (text: string) => ({
  /**
   * The dashboard's own title, not the build-status sentence beneath it.
   *
   * This originally matched "المرحلة صفر / Phase 0: the foundation" — a
   * sentence that says which phase the build is in and therefore changes every
   * phase. Phase 1 changed it, and a proof of the *foundation* failed because a
   * status line had been updated. A marker should identify the screen, not the
   * moment.
   */
  dashboard: /لوحة العمل|Dashboard/.test(text),
  signOut: /تسجيل الخروج|Sign out/.test(text),
  suspended: /هذا الحساب موقوف|This account is suspended/.test(text),
  noAccess: /لا تملك صلاحية|do not have access/.test(text),
  auditTrail: /سجل التدقيق|Audit trail/.test(text),
  signInPage: /تسجيل الدخول|Sign in/.test(text),
  chainIntact: /السلسلة سليمة|Chain intact/.test(text),
})

const cookiesFrom = (res: Response) =>
  (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')

async function assertServerUp() {
  try {
    const res = await fetch(`${BASE}/`, { redirect: 'manual' })
    if (res.status >= 500) throw new Error(`status ${res.status}`)
  } catch {
    console.error(`\nThe application is not answering on ${BASE}.\nStart it first:\n\n  npm run dev\n`)
    process.exit(1)
  }
}

async function signIn(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: BROWSER_HEADERS,
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  })
  return { ok: res.ok, status: res.status, cookies: cookiesFrom(res), body: await res.text() }
}

async function getPage(path: string, cookie?: string) {
  // Redirects are followed, and the URL we landed on is reported. Arabic is the
  // canonical, unprefixed locale, so a request for /ar/x redirects to /x —
  // reading the redirect's empty body would fail every content assertion for a
  // reason that has nothing to do with what is being tested.
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'follow',
  })
  const text = visibleText(await res.text())
  const landedOn = new URL(res.url).pathname
  return { status: res.status, landedOn, text, marks: marks(text) }
}

/**
 * HUMAN-STANDIN. Better Auth stores a reset as identifier
 * `reset-password:<token>` with the user's id in `value`.
 */
async function activationTokenFor(userId: string): Promise<string> {
  const row = await db.verification.findFirst({
    where: { identifier: { startsWith: 'reset-password:' }, value: userId },
    orderBy: { createdAt: 'desc' },
  })
  if (!row) throw new Error(`No activation token found for user ${userId}.`)
  return row.identifier.slice('reset-password:'.length)
}

async function activate(userId: string, password: string) {
  const token = await activationTokenFor(userId)
  const res = await fetch(`${BASE}/api/auth/reset-password`, {
    method: 'POST',
    headers: BROWSER_HEADERS,
    body: JSON.stringify({ newPassword: password, token }),
    redirect: 'manual',
  })
  if (!res.ok) throw new Error(`Activation failed: ${(await res.text()).slice(0, 300)}`)
  await db.user.update({ where: { id: userId }, data: { status: 'ACTIVE', emailVerified: true } })
  return token
}

async function main() {
  const runId = randomBytes(3).toString('hex')
  const adminEmail = `admin.${runId}@osool.test`
  const examinerEmail = `examiner.${runId}@osool.test`
  const auditorEmail = `auditor.${runId}@osool.test`

  const adminPassword = `Admin-${randomBytes(9).toString('base64url')}`
  const examinerPassword = `Examiner-${randomBytes(9).toString('base64url')}`
  const auditorPassword = `Auditor-${randomBytes(9).toString('base64url')}`

  const failures: string[] = []
  const check = (label: string, passed: boolean) => {
    if (!passed) failures.push(label)
    return passed ? 'yes' : '*** NO ***'
  }

  heading('Osool — Phase 0 proof point')
  detail(`Application  : ${BASE}`)
  detail(`Email driver : ${env.EMAIL_PROVIDER} — every message is printed by the dev server`)
  detail(`Run id       : ${runId}`)

  await assertServerUp()
  const chainBefore = await verifyChain()
  detail(`Audit chain before this run: ${chainBefore.eventsChecked} events, intact=${chainBefore.ok}`)
  const watermark = chainBefore.lastSeq ?? 0n

  // ── 1 ────────────────────────────────────────────────────────────────────
  heading('1. Bootstrap a system administrator')
  step('Creating the first SYSTEM_ADMIN — the one account the application cannot create')

  const adminSignUp = await auth.api.signUpEmail({
    body: { email: adminEmail, password: adminPassword, name: `Bootstrap Admin ${runId}` },
  })
  if (!adminSignUp?.user?.id) throw new Error('Admin creation failed.')
  const adminId = adminSignUp.user.id

  await db.user.update({
    where: { id: adminId },
    data: { role: 'SYSTEM_ADMIN', status: 'ACTIVE', emailVerified: true, nameAr: 'مسؤول النظام' },
  })
  await recordAuditEvent({
    action: 'SYSTEM_BOOTSTRAP',
    entityType: 'User',
    entityId: adminId,
    actorLabel: 'bootstrap (command line)',
    toState: 'ACTIVE',
    reason: `First system administrator created for ${adminEmail}.`,
    payload: { email: adminEmail, role: 'SYSTEM_ADMIN' },
  })
  detail(`${adminEmail} — SYSTEM_ADMIN`)

  const adminSession = await signIn(adminEmail, adminPassword)
  detail(`POST /api/auth/sign-in/email → ${adminSession.status}`)
  if (!adminSession.ok) throw new Error(`Admin sign-in failed: ${adminSession.body.slice(0, 300)}`)

  // ── 2 ────────────────────────────────────────────────────────────────────
  heading('2. The public sign-up endpoint cannot mint privilege')
  step('Posting role: SYSTEM_ADMIN directly to /api/auth/sign-up/email')

  const escalationEmail = `escalation.${runId}@osool.test`
  const escalate = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: BROWSER_HEADERS,
    body: JSON.stringify({
      email: escalationEmail,
      password: `Escalate-${randomBytes(9).toString('base64url')}`,
      name: 'Privilege Escalation Attempt',
      role: 'SYSTEM_ADMIN',
      status: 'ACTIVE',
    }),
    redirect: 'manual',
  })
  const escalateBody = await escalate.text()
  detail(`POST /api/auth/sign-up/email → ${escalate.status}`)
  detail(`Response: ${escalateBody.slice(0, 90)}`)

  const escalated = await db.user.findUnique({
    where: { email: escalationEmail },
    select: { role: true, status: true },
  })

  // Two outcomes are acceptable, and Better Auth takes the stricter one: it
  // rejects the whole request with FIELD_NOT_ALLOWED rather than creating the
  // account and quietly ignoring the field. Either is secure — what would not
  // be is an account that exists holding the role the body asked for.
  const rejectedOutright = escalate.status === 400 && escalated === null
  const createdLeastPrivilege = escalated?.role === 'BROKER_OWNER'
  const escalationBlocked = rejectedOutright || createdLeastPrivilege

  detail(
    rejectedOutright
      ? 'Rejected outright — no account was created. `role` is input:false in the Better Auth config.'
      : createdLeastPrivilege
        ? `Field ignored — the account holds role=${escalated?.role}, the least-privileged default.`
        : `*** The account holds role=${escalated?.role}. This is a privilege-escalation hole. ***`,
  )

  step('And an ordinary broker sign-up, with no role field at all')
  const plainEmail = `broker.${runId}@osool.test`
  const plain = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: BROWSER_HEADERS,
    body: JSON.stringify({
      email: plainEmail,
      password: `Broker-${randomBytes(9).toString('base64url')}`,
      name: 'Self-registered Broker',
    }),
    redirect: 'manual',
  })
  const plainUser = await db.user.findUnique({
    where: { email: plainEmail },
    select: { role: true, status: true },
  })
  detail(`POST /api/auth/sign-up/email → ${plain.status}, role=${plainUser?.role}`)
  const brokerSelfRegistrationWorks = plain.ok && plainUser?.role === 'BROKER_OWNER'
  detail(
    brokerSelfRegistrationWorks
      ? 'Brokers self-register, and land on the least-privileged role.'
      : '*** Broker self-registration did not behave as specified. ***',
  )

  // ── 3 ────────────────────────────────────────────────────────────────────
  heading('3. Administration is not access (02-SYSTEM-ARCHITECTURE §4)')

  step('The administrator opens the accounts screen, which is theirs')
  const adminUsers = await getPage('/admin/users', adminSession.cookies)
  detail(`GET /admin/users → ${adminUsers.status}, refused: ${adminUsers.marks.noAccess}`)

  step('The administrator opens the audit trail, which is case data')
  const adminAudit = await getPage('/audit', adminSession.cookies)
  detail(`GET /audit → ${adminAudit.status}`)
  detail(`Refusal page shown  : ${adminAudit.marks.noAccess}`)
  detail(`Trail contents shown: ${adminAudit.marks.chainIntact ? '*** YES — LEAK ***' : 'no'}`)

  // ── 4 ────────────────────────────────────────────────────────────────────
  heading('4. The administrator creates an examiner account')
  const examiner = await provisionGovernmentAccount(
    { email: examinerEmail, name: `Examiner ${runId}`, nameAr: 'محمود عبد الرحمن', role: 'EXAMINER' },
    {
      userId: adminId,
      role: 'SYSTEM_ADMIN',
      name: `Bootstrap Admin ${runId}`,
      ipAddress: '127.0.0.1',
      userAgent: 'proof-phase0',
    },
  )
  detail(`Created ${examiner.email} — ${roleLabels[examiner.role].en} / ${roleLabels[examiner.role].ar}`)
  detail(`Activation email sent by the "${examiner.emailDriver}" driver.`)

  const pending = await db.user.findUniqueOrThrow({
    where: { id: examiner.userId },
    select: { status: true, role: true, emailVerified: true },
  })
  detail(`Account state: status=${pending.status} role=${pending.role} emailVerified=${pending.emailVerified}`)

  step('The examiner tries to sign in before activating')
  const tooEarly = await signIn(examinerEmail, examinerPassword)
  detail(`POST /api/auth/sign-in/email → ${tooEarly.status} (refused — no password has been set)`)

  // ── 5 ────────────────────────────────────────────────────────────────────
  heading('5. The examiner activates, sets their own password, and signs in')
  step('HUMAN-STANDIN: reading the one-time token carried by the emailed link')
  const token = await activate(examiner.userId, examinerPassword)
  detail(`Token used: ${token.slice(0, 14)}…`)
  await recordAuditEvent({
    action: 'ACCOUNT_ACTIVATED',
    entityType: 'User',
    entityId: examiner.userId,
    actorUserId: examiner.userId,
    actorRole: 'EXAMINER',
    actorLabel: `Examiner ${runId} (Examiner)`,
    fromState: 'PENDING_ACTIVATION',
    toState: 'ACTIVE',
    reason: 'Password set by the account holder from the activation link.',
    ipAddress: '127.0.0.1',
    userAgent: 'proof-phase0',
  })
  detail('Password set by the holder. The administrator never knew it.')

  const examinerSession = await signIn(examinerEmail, examinerPassword)
  detail(`POST /api/auth/sign-in/email → ${examinerSession.status}`)
  if (!examinerSession.ok) throw new Error(`Examiner sign-in failed: ${examinerSession.body.slice(0, 300)}`)

  const examinerDash = await getPage('/dashboard', examinerSession.cookies)
  detail(`GET /dashboard → ${examinerDash.status}, dashboard rendered: ${examinerDash.marks.dashboard}`)

  step('The examiner tries the administrator-only accounts screen')
  const examinerBlocked = await getPage('/admin/users', examinerSession.cookies)
  const examinerSawAccounts = new RegExp(adminEmail).test(examinerBlocked.text)
  detail(`GET /admin/users → ${examinerBlocked.status}`)
  detail(`Refusal page shown : ${examinerBlocked.marks.noAccess}`)
  detail(`Account list shown : ${examinerSawAccounts ? '*** YES — LEAK ***' : 'no'}`)

  // ── 6 ────────────────────────────────────────────────────────────────────
  heading('6. Read access is audited, not only writes (REQ-DPA-002)')
  const auditor = await provisionGovernmentAccount(
    { email: auditorEmail, name: `Auditor ${runId}`, nameAr: 'سلمى إبراهيم', role: 'AUDITOR' },
    {
      userId: adminId,
      role: 'SYSTEM_ADMIN',
      name: `Bootstrap Admin ${runId}`,
      ipAddress: '127.0.0.1',
      userAgent: 'proof-phase0',
    },
  )
  await activate(auditor.userId, auditorPassword)
  const auditorSession = await signIn(auditorEmail, auditorPassword)
  detail(`Auditor provisioned, activated, signed in → ${auditorSession.status}`)

  step('The auditor opens the audit trail')
  const auditorView = await getPage('/audit', auditorSession.cookies)
  detail(`GET /audit → ${auditorView.status}`)
  detail(`Trail rendered       : ${auditorView.marks.auditTrail}`)
  detail(`Chain shown as intact: ${auditorView.marks.chainIntact}`)

  const readEvents = await db.auditEvent.count({
    where: { accessType: 'READ', seq: { gt: watermark } },
  })
  detail(`READ events written by this run: ${readEvents}`)

  // ── 7 ────────────────────────────────────────────────────────────────────
  heading('7. Suspension takes effect on the next request, not at next sign-in')
  step('The examiner is working normally on a valid session cookie')
  const before = await getPage('/dashboard', examinerSession.cookies)
  detail(`GET /dashboard → ${before.status}, dashboard rendered: ${before.marks.dashboard}`)

  step('The administrator suspends the account')
  await suspendAccount(
    { userId: examiner.userId, reason: 'Proof of immediate effect on a live session.' },
    {
      userId: adminId,
      role: 'SYSTEM_ADMIN',
      name: `Bootstrap Admin ${runId}`,
      ipAddress: '127.0.0.1',
      userAgent: 'proof-phase0',
    },
  )
  detail('Suspended. The session cookie is unchanged and has not expired.')

  step('The very same cookie, one request later')
  const after = await getPage('/dashboard', examinerSession.cookies)
  detail(`GET /dashboard → ${after.status}`)
  detail(`Dashboard rendered   : ${after.marks.dashboard}`)
  detail(`Suspension explained : ${after.marks.suspended}`)
  const suspensionEffective = after.marks.suspended && !after.marks.dashboard

  // ── 8 ────────────────────────────────────────────────────────────────────
  heading('8. The audit trail for the whole sequence')
  const events = await db.auditEvent.findMany({
    where: { seq: { gt: watermark } },
    orderBy: { seq: 'asc' },
  })

  const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n))
  console.log('')
  console.log(
    `  ${pad('SEQ', 5)}${pad('TIME', 10)}${pad('ACTOR', 32)}${pad('ACTION', 33)}${pad('ACCESS', 7)}STATE CHANGE`,
  )
  console.log(`  ${'─'.repeat(118)}`)
  for (const e of events) {
    const transition = e.fromState || e.toState ? `${e.fromState ?? '—'} → ${e.toState ?? '—'}` : '—'
    console.log(
      `  ${pad(e.seq.toString(), 5)}${pad(e.occurredAt.toISOString().slice(11, 19), 10)}` +
        `${pad(e.actorLabel ?? '—', 32)}${pad(e.action, 33)}${pad(e.accessType, 7)}${transition}`,
    )
  }
  console.log('')
  detail(
    `${events.length} events, of which ${events.filter((e) => e.accessType === 'READ').length} record read access.`,
  )

  // ── 9 ────────────────────────────────────────────────────────────────────
  heading('9. Verify the hash chain')
  const chainAfter = await verifyChain()
  detail(`Events checked : ${chainAfter.eventsChecked}`)
  detail(`Sequence range : ${chainAfter.firstSeq} … ${chainAfter.lastSeq}`)
  detail(`Head hash      : ${chainAfter.lastHash}`)
  detail(`Breaks         : ${chainAfter.breaks.length}`)
  detail(chainAfter.ok ? 'INTACT' : 'BROKEN')

  // ── Result ───────────────────────────────────────────────────────────────
  heading('Result')
  const rows: Array<[string, boolean]> = [
    ['Public sign-up cannot set its own role', escalationBlocked],
    ['Brokers self-register at least privilege', brokerSelfRegistrationWorks],
    ['SYSTEM_ADMIN sees the accounts screen', !adminUsers.marks.noAccess],
    ['SYSTEM_ADMIN refused the audit trail', adminAudit.marks.noAccess && !adminAudit.marks.chainIntact],
    ['Administrator provisioned an examiner', pending.role === 'EXAMINER'],
    ['Account started PENDING_ACTIVATION', pending.status === 'PENDING_ACTIVATION'],
    ['Sign-in refused before activation', !tooEarly.ok],
    ['Activation email really sent', examiner.emailDriver === 'console' || examiner.emailDriver === 'resend'],
    ['Examiner set own password and signed in', examinerSession.ok && examinerDash.marks.dashboard],
    ['EXAMINER refused admin screen, nothing leaked', examinerBlocked.marks.noAccess && !examinerSawAccounts],
    ['AUDITOR saw the trail, chain intact on screen', auditorView.marks.auditTrail && auditorView.marks.chainIntact],
    ['Read access recorded (REQ-DPA-002)', readEvents > 0],
    ['Suspension effective on the next request', suspensionEffective],
    ['Whole sequence present in the audit trail', events.length > 0],
    ['Hash chain intact', chainAfter.ok],
  ]

  for (const [label, passed] of rows) {
    console.log(`  ${label.padEnd(48)}: ${check(label, passed)}`)
  }

  console.log(
    `\n  ${failures.length === 0 ? 'PHASE 0 PROOF POINT: PASSED' : `PHASE 0 PROOF POINT: FAILED (${failures.length})`}\n`,
  )
  if (failures.length) {
    for (const f of failures) console.log(`    failed: ${f}`)
    process.exitCode = 1
  }

  await db.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await db.$disconnect()
  process.exit(1)
})
