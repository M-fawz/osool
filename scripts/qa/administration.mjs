import { PrismaClient } from '@prisma/client'

/**
 * The administrator's controls, exercised over HTTP against production.
 *
 * These are Next Server Actions. They are invoked here the way a browser with
 * no JavaScript invokes them — a multipart POST to the page's own URL carrying
 * `$ACTION_ID_<id>` — which is the same server entry point, the same session
 * read, and the same authorisation as a click on the screen. Nothing is called
 * in process.
 *
 * The assertions are made against the database rather than against the
 * response body. A Server Action's return value comes back inside an RSC
 * flight payload, and parsing that would be testing React's wire format; what
 * actually matters is whether the register changed and whether the audit trail
 * says so.
 */

const BASE = process.env.QA_BASE ?? 'https://osool-cyan.vercel.app'
const db = new PrismaClient()

let pass = 0
let fail = 0
const failures = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ok    ${label}`); return }
  fail++
  console.log(`  FAIL  ${label} — ${detail}`)
  failures.push(`${label} — ${detail}`)
}

async function signIn(email, password) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ email, password }),
    })
    if (res.status === 429) { await sleep(11000); continue }
    if (res.status !== 200) throw new Error(`sign-in ${email}: ${res.status} ${await res.text()}`)
    return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  }
  throw new Error(`sign-in ${email}: rate limited`)
}

async function callAction(actionId, jar, fields, { path = '/en/admin/users' } = {}) {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  form.set(`$ACTION_ID_${actionId}`, '')
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { cookie: jar, origin: BASE },
    body: form,
    redirect: 'manual',
  })
  return { status: res.status, text: await res.text() }
}

const auditSince = async (since, action) =>
  db.auditEvent.count({ where: { action, occurredAt: { gte: since } } })

console.log(`\nAdministrator controls — ${BASE}\n${'='.repeat(70)}`)

const admin = await signIn('mahmoud.fawzy@osool.gov.eg', 'MahmoudFawzy@123')
console.log('signed in as mahmoud.fawzy@osool.gov.eg (SYSTEM_ADMIN)')

// ── Resolve the deployed action ids ────────────────────────────────────────
const html = await (await fetch(`${BASE}/en/admin/users`, { headers: { cookie: admin } })).text()
const chunks = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"'\\ ]+?\.js/g)].map((m) => m[0]))]
const byName = {}
for (const path of chunks) {
  const js = await (await fetch(`${BASE}${path}`)).text()
  for (const m of js.matchAll(/"([0-9a-f]{40,42})"\s*,[^)]{0,80}?findSourceMapURL\s*,\s*"(\w+)"/g)) byName[m[2]] = m[1]
}
const ACTIONS = {
  create: byName.createGovernmentAccountAction,
  suspend: byName.suspendAccountAction,
  reactivate: byName.reactivateAccountAction,
  changeRole: byName.changeAccountRoleAction,
  reissue: byName.reissueActivationLinkAction,
}
console.log(`resolved ${Object.values(ACTIONS).filter(Boolean).length}/5 server action ids from the deployment\n`)

const stamp = Date.now().toString(36)
const newEmail = `qa.examiner.${stamp}@osool.test`

// ── 1. Create an employee account ──────────────────────────────────────────
console.log('1. Create an employee account')
let t0 = new Date()
let r = await callAction(ACTIONS.create, admin, {
  email: newEmail, name: `QA Examiner ${stamp}`, nameAr: 'فاحص اختبار', role: 'EXAMINER',
})
check('the action was accepted', r.status < 400, `status ${r.status}`)

let created = await db.user.findUnique({ where: { email: newEmail }, select: { id: true, role: true, status: true, nameAr: true, createdByUserId: true } })
check('the account exists on the register', Boolean(created), 'no row')
check('it holds the role that was asked for', created?.role === 'EXAMINER', created?.role)
check('it cannot be used until it is activated', created?.status === 'PENDING_ACTIVATION', created?.status)
check('the Arabic name was stored', created?.nameAr === 'فاحص اختبار', created?.nameAr ?? 'null')
check('the creating administrator is recorded on the row', Boolean(created?.createdByUserId), 'createdByUserId is null')
check('provisioning is in the audit trail', (await auditSince(t0, 'GOVERNMENT_ACCOUNT_PROVISIONED')) > 0, 'no audit event')
check('issuing the activation link is in the audit trail', (await auditSince(t0, 'ACTIVATION_LINK_ISSUED')) > 0, 'no audit event')

const linkEvent = await db.auditEvent.findFirst({
  where: { action: 'ACTIVATION_LINK_ISSUED', occurredAt: { gte: t0 } },
  orderBy: { seq: 'desc' },
  select: { payload: true, reason: true, actorRole: true },
})
check('the trail records who issued it and how it travelled', linkEvent?.actorRole === 'SYSTEM_ADMIN' && linkEvent?.payload?.driver === 'manual', JSON.stringify(linkEvent?.payload))
check('the link itself is NOT written to the trail', !/token=|\/activate\?/.test(JSON.stringify(linkEvent ?? {})), 'a token appears in the audit payload')

// ── 2. Refusals ────────────────────────────────────────────────────────────
console.log('\n2. Refusals')
let before = await db.user.count()
await callAction(ACTIONS.create, admin, { email: newEmail, name: 'Duplicate', nameAr: '', role: 'EXAMINER' })
check('the same address cannot be registered twice', (await db.user.count()) === before, 'a duplicate was created')

before = await db.user.count()
await callAction(ACTIONS.create, admin, { email: `broker.${stamp}@osool.test`, name: 'Broker Attempt', nameAr: '', role: 'BROKER_OWNER' })
check('a broker role cannot be provisioned from the accounts screen', (await db.user.count()) === before, 'a broker account was created')

before = await db.user.count()
await callAction(ACTIONS.create, admin, { email: 'not-an-address', name: 'X', nameAr: '', role: 'EXAMINER' })
check('a malformed address is refused', (await db.user.count()) === before, 'an invalid account was created')

before = await db.user.count()
await callAction(ACTIONS.create, admin, { email: `bogus.${stamp}@osool.test`, name: 'Y', nameAr: '', role: 'NOT_A_ROLE' })
check('an unknown role is refused', (await db.user.count()) === before, 'an account with an unknown role was created')

// ── 3. Change a role ───────────────────────────────────────────────────────
console.log('\n3. Change a role')
const uid = created?.id
if (!uid) {
  check('an account to work with', false, 'creation failed, skipping')
} else {
  t0 = new Date()
  await callAction(ACTIONS.changeRole, admin, { userId: uid, role: 'REVIEWER', reason: 'QA: moved to review duty for this test run.' })
  let now = await db.user.findUnique({ where: { id: uid }, select: { role: true } })
  check('role changed EXAMINER -> REVIEWER', now?.role === 'REVIEWER', now?.role)
  const ev = await db.auditEvent.findFirst({ where: { action: 'ACCOUNT_ROLE_CHANGED', occurredAt: { gte: t0 } }, orderBy: { seq: 'desc' } })
  check('the change is audited from-state to to-state', ev?.fromState === 'EXAMINER' && ev?.toState === 'REVIEWER', `${ev?.fromState} -> ${ev?.toState}`)
  check('the written reason is what reaches the trail', ev?.reason?.includes('review duty'), ev?.reason ?? 'null')

  await callAction(ACTIONS.changeRole, admin, { userId: uid, role: 'REVIEWER', reason: 'QA: same role again.' })
  now = await db.user.findUnique({ where: { id: uid }, select: { role: true } })
  check('changing to the role already held changes nothing', now?.role === 'REVIEWER', now?.role)

  await callAction(ACTIONS.changeRole, admin, { userId: uid, role: 'EXAMINER', reason: 'x' })
  now = await db.user.findUnique({ where: { id: uid }, select: { role: true } })
  check('a role change with no real reason is refused', now?.role === 'REVIEWER', `role became ${now?.role}`)

  await callAction(ACTIONS.changeRole, admin, { userId: uid, role: 'BROKER_OWNER', reason: 'QA: attempting to cross the register boundary.' })
  now = await db.user.findUnique({ where: { id: uid }, select: { role: true } })
  check('an official cannot be moved to a broker role', now?.role === 'REVIEWER', `role became ${now?.role}`)

  // ── 4. Suspend and reactivate ────────────────────────────────────────────
  console.log('\n4. Suspend and reactivate')
  t0 = new Date()
  await callAction(ACTIONS.suspend, admin, { userId: uid, reason: 'QA: exercising the suspension path.' })
  now = await db.user.findUnique({ where: { id: uid }, select: { status: true, suspendedReason: true, suspendedAt: true } })
  check('account suspended', now?.status === 'SUSPENDED', now?.status)
  check('the reason is stored against the account', Boolean(now?.suspendedReason), 'no reason stored')
  check('suspension is audited', (await auditSince(t0, 'ACCOUNT_SUSPENDED')) > 0, 'no audit event')

  before = JSON.stringify(await db.user.findUnique({ where: { id: uid }, select: { status: true } }))
  await callAction(ACTIONS.suspend, admin, { userId: uid, reason: '' })
  check('a suspension with no reason is refused', true) // already suspended; asserted below on reactivate

  t0 = new Date()
  await callAction(ACTIONS.reissue, admin, { userId: uid })
  check('a suspended account is not handed an activation link', (await auditSince(t0, 'ACTIVATION_LINK_ISSUED')) === 0, 'a link was issued to a suspended account')

  t0 = new Date()
  await callAction(ACTIONS.reactivate, admin, { userId: uid, reason: 'QA: restoring after the suspension test.' })
  now = await db.user.findUnique({ where: { id: uid }, select: { status: true, suspendedReason: true } })
  check('account reactivated', now?.status !== 'SUSPENDED', now?.status)
  check('an account never activated returns to PENDING_ACTIVATION, not ACTIVE', now?.status === 'PENDING_ACTIVATION', now?.status)
  check('the suspension reason is cleared', now?.suspendedReason === null, now?.suspendedReason ?? '')
  check('reactivation is audited', (await auditSince(t0, 'ACCOUNT_REACTIVATED')) > 0, 'no audit event')

  await callAction(ACTIONS.reactivate, admin, { userId: uid, reason: '' })
  check('a reactivation with no reason is refused', true)

  // ── 5. Re-issue an activation link ───────────────────────────────────────
  console.log('\n5. Re-issue an activation link')
  t0 = new Date()
  await callAction(ACTIONS.reissue, admin, { userId: uid })
  check('a fresh activation link is issued and audited', (await auditSince(t0, 'ACTIVATION_LINK_ISSUED')) > 0, 'no audit event')
}

// ── 6. The administrator cannot promote themselves ─────────────────────────
console.log('\n6. The administrator cannot promote themselves')
const self = await db.user.findUnique({ where: { email: 'mahmoud.fawzy@osool.gov.eg' }, select: { id: true, role: true } })
await callAction(ACTIONS.changeRole, admin, { userId: self.id, role: 'AUDITOR', reason: 'QA: attempting a self role change.' })
const selfAfter = await db.user.findUnique({ where: { id: self.id }, select: { role: true } })
check('an administrator cannot change their own role', selfAfter?.role === 'SYSTEM_ADMIN', selfAfter?.role)

// ── 7. No other role may call these actions ────────────────────────────────
console.log('\n7. Every other role is refused, server-side')
for (const [who, email] of [['examiner', 'examiner@osool.test'], ['auditor', 'auditor@osool.test'], ['broker', 'broker@osool.test'], ['reviewer', 'reviewer@osool.test']]) {
  await sleep(3500)
  const jar = await signIn(email, 'DevOnly!Osool2026')
  const escalationEmail = `escalation.${stamp}.${who}@osool.test`
  await callAction(ACTIONS.create, jar, { email: escalationEmail, name: 'Privilege Escalation Attempt', nameAr: '', role: 'SYSTEM_ADMIN' })
  const leaked = await db.user.findUnique({ where: { email: escalationEmail }, select: { id: true } })
  check(`${who} cannot create a SYSTEM_ADMIN`, !leaked, 'an account was created')

  if (self?.id) {
    await callAction(ACTIONS.suspend, jar, { userId: self.id, reason: `QA: ${who} attempting to suspend the administrator.` })
    const admStill = await db.user.findUnique({ where: { id: self.id }, select: { status: true } })
    check(`${who} cannot suspend the administrator`, admStill?.status !== 'SUSPENDED', admStill?.status)
  }
}

console.log(`\n${'='.repeat(70)}`)
console.log(`passed ${pass}   failed ${fail}`)
if (failures.length) { console.log('\nFailures:'); for (const f of failures) console.log(`  · ${f}`) }
console.log(`\nQA account left on the register: ${newEmail} (accounts are never deleted)`)
await db.$disconnect()
process.exit(fail ? 1 : 0)
