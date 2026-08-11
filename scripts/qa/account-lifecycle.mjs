import { PrismaClient } from '@prisma/client'
import { createRequire } from 'node:module'

/**
 * The whole account lifecycle, from the administrator's click to the new
 * employee's first signed-in page.
 *
 * This is the claim that matters most about the `manual` mail driver: that an
 * activation link handed over by hand is a *real* activation link, and that
 * the employee who receives it ends up with an account they chose the password
 * for — not one the administrator knows the password to.
 */

const BASE = process.env.QA_BASE ?? 'https://osool-cyan.vercel.app'
const db = new PrismaClient()
const require = createRequire(import.meta.url)
const { encodeReply } = require('next/dist/compiled/react-server-dom-webpack/client.edge')

let pass = 0, fail = 0
const failures = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ok    ${label}`); return }
  fail++; console.log(`  FAIL  ${label} — ${detail}`); failures.push(label)
}

async function signIn(email, password) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ email, password }),
    })
    if (res.status === 429) { await sleep(11000); continue }
    const jar = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
    return { status: res.status, jar, body: await res.text() }
  }
  return { status: 429, jar: '', body: 'rate limited' }
}

console.log(`\nAccount lifecycle — ${BASE}\n${'='.repeat(70)}`)

const { jar: admin } = await signIn('mahmoud.fawzy@osool.gov.eg', 'MahmoudFawzy@123')

// Resolve the deployed action id.
const html = await (await fetch(`${BASE}/en/admin/users`, { headers: { cookie: admin } })).text()
const chunks = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"'\\ ]+?\.js/g)].map((m) => m[0]))]
let createId
for (const p of chunks) {
  const js = await (await fetch(`${BASE}${p}`)).text()
  const m = js.match(/"([0-9a-f]{40,42})"\s*,[^)]{0,80}?findSourceMapURL\s*,\s*"createGovernmentAccountAction"/)
  if (m) { createId = m[1]; break }
}

const stamp = Date.now().toString(36)
const email = `qa.lifecycle.${stamp}@osool.test`
const chosenPassword = `Chosen!Password${stamp}`

// ── 1. The administrator provisions the account ────────────────────────────
console.log('\n1. The administrator provisions an account')
const args = new FormData()
args.set('email', email)
args.set('name', `QA Lifecycle ${stamp}`)
args.set('nameAr', 'دورة حياة الحساب')
args.set('role', 'REGISTRY_CLERK')

const res = await fetch(`${BASE}/en/admin/users`, {
  method: 'POST',
  headers: { cookie: admin, origin: BASE, 'Next-Action': createId },
  body: await encodeReply([args]),
})
const reply = await res.text()
const result = JSON.parse(reply.match(/^1:(\{"ok".*)$/m)?.[1] ?? '{}')
check('the account was created', result.ok === true, JSON.stringify(result).slice(0, 160))
check('an activation link came back to the administrator', Boolean(result.activationUrl), 'none')

const row = await db.user.findUnique({ where: { email }, select: { id: true, status: true, role: true } })
check('it starts as PENDING_ACTIVATION', row?.status === 'PENDING_ACTIVATION', row?.status)

// ── 2. A pending account cannot be used ────────────────────────────────────
console.log('\n2. Before activation')
const early = await signIn(email, chosenPassword)
check('the account cannot sign in before a password is set', early.status !== 200, `status ${early.status}`)

// ── 3. The employee follows the link ───────────────────────────────────────
console.log('\n3. The employee follows the link')
const follow = await fetch(result.activationUrl, { redirect: 'manual' })
const dest = follow.headers.get('location')
check('the link redirects to the activation screen', Boolean(dest), `status ${follow.status}`)
const token = dest ? new URL(dest, BASE).searchParams.get('token') : null
check('a one-time token arrives on the activation screen', Boolean(token), dest ?? 'no location')
console.log(`        ${dest?.replace(/token=[^&]+/, 'token=…')}`)

const activatePage = await fetch(`${BASE}/en/activate?token=${token}`)
check('the activation screen renders', activatePage.status === 200, `status ${activatePage.status}`)

// ── 4. The employee sets their own password ────────────────────────────────
console.log('\n4. The employee sets their own password')
const reset = await fetch(`${BASE}/api/auth/reset-password`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: BASE },
  body: JSON.stringify({ newPassword: chosenPassword, token }),
})
check('the password is accepted', reset.status === 200, `status ${reset.status} ${(await reset.text()).slice(0, 120)}`)

// ── 5. The account now works ───────────────────────────────────────────────
console.log('\n5. The account now works')
await sleep(3500)
const now = await signIn(email, chosenPassword)
check('the employee can sign in with the password they chose', now.status === 200, `status ${now.status} ${now.body.slice(0, 120)}`)

const after = await db.user.findUnique({ where: { email }, select: { status: true, role: true } })
check('the account is ACTIVE', after?.status === 'ACTIVE', after?.status)
check('it still holds the role the administrator assigned', after?.role === 'REGISTRY_CLERK', after?.role)

if (now.jar) {
  const dash = await fetch(`${BASE}/en/dashboard`, { headers: { cookie: now.jar } })
  const body = (await dash.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  check('the clerk lands on a working dashboard', dash.status === 200 && !body.includes('You do not have access'), `status ${dash.status}`)
  const intake = await fetch(`${BASE}/en/intake`, { headers: { cookie: now.jar } })
  const intakeBody = (await intake.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  check('and reaches the intake queue their role owns', !intakeBody.includes('You do not have access'), 'refused')
}

// ── 6. The link is one-time ────────────────────────────────────────────────
console.log('\n6. The link is one-time')
const replay = await fetch(`${BASE}/api/auth/reset-password`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: BASE },
  body: JSON.stringify({ newPassword: 'Replayed!Password123', token }),
})
check('the same token cannot be replayed', replay.status !== 200, `status ${replay.status}`)

const stillMine = await signIn(email, chosenPassword)
check('the password the employee chose still stands', stillMine.status === 200, `status ${stillMine.status}`)

console.log(`\n${'='.repeat(70)}`)
console.log(`passed ${pass}   failed ${fail}`)
if (failures.length) { console.log('\nFailures:'); for (const f of failures) console.log(`  · ${f}`) }
await db.$disconnect()
process.exit(fail ? 1 : 0)
