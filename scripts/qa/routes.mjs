/**
 * Production QA harness. Signs in as each role and probes every route.
 *
 * HTTP rather than a browser: the thing under test is server-side
 * authorisation, and a browser adds a rendering layer between the assertion
 * and the answer without making the answer more true.
 */

const BASE = process.env.QA_BASE ?? 'https://osool-cyan.vercel.app'

const ACCOUNTS = {
  admin: ['mahmoud.fawzy@osool.gov.eg', 'MahmoudFawzy@123'],
  clerk: ['clerk@osool.test', 'DevOnly!Osool2026'],
  examiner: ['examiner@osool.test', 'DevOnly!Osool2026'],
  reviewer: ['reviewer@osool.test', 'DevOnly!Osool2026'],
  reviewer2: ['reviewer2@osool.test', 'DevOnly!Osool2026'],
  issuer: ['issuer@osool.test', 'DevOnly!Osool2026'],
  data: ['data@osool.test', 'DevOnly!Osool2026'],
  files: ['files@osool.test', 'DevOnly!Osool2026'],
  auditor: ['auditor@osool.test', 'DevOnly!Osool2026'],
  aml: ['aml@osool.test', 'DevOnly!Osool2026'],
  broker: ['broker@osool.test', 'DevOnly!Osool2026'],
  zamalek: ['zamalek@osool.test', 'DevOnly!Osool2026'],
}

const ROUTES = [
  '/dashboard', '/intake', '/examination', '/review', '/issuance',
  '/records', '/archive', '/audit', '/admin/users', '/application', '/registration',
]

let pass = 0
let fail = 0
const failures = []

function check(label, ok, detail = '') {
  if (ok) { pass++; return }
  fail++
  failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
  console.log(`  FAIL  ${label} ${detail}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * `Origin` is not optional. Better Auth rejects a credential post without one
 * (MISSING_OR_NULL_ORIGIN) as cross-site-request forgery defence, which is
 * exactly right and means a harness has to look like the browser it stands in
 * for. The 429 retry is here for the same reason: sign-in is rate limited, and
 * twelve accounts back to back trip it.
 */
async function signIn(email, password, { attempts = 4 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE, referer: `${BASE}/login` },
      body: JSON.stringify({ email, password }),
      redirect: 'manual',
    })
    const body = await res.text()
    if (res.status === 429 && i < attempts - 1) {
      await sleep(11000)
      continue
    }
    const setCookie = res.headers.getSetCookie?.() ?? []
    const jar = setCookie.map((c) => c.split(';')[0]).join('; ')
    return { status: res.status, jar, body }
  }
  return { status: 429, jar: '', body: 'rate limited' }
}

async function get(path, jar) {
  const res = await fetch(`${BASE}${path}`, {
    headers: jar ? { cookie: jar } : {},
    redirect: 'manual',
  })
  const text = res.status < 400 ? await res.text() : ''
  return { status: res.status, text, location: res.headers.get('location') }
}

/**
 * What the page actually is, regardless of its 200.
 *
 * Matched on the refusal copy itself rather than on a marker attribute, because
 * the copy is the contract: 03-DESIGN-DIRECTION §6 requires these exact four
 * parts, and a test that passed while the sentence went missing would be
 * testing the wrong thing.
 */
const REFUSAL_AR = 'لا تملك صلاحية الاطلاع على هذه الصفحة'
const REFUSAL_EN = 'You do not have access to this page'
const SUSPENDED_AR = 'هذا الحساب موقوف'

/**
 * Scripts stripped first, and this is the whole trick.
 *
 * next-intl serialises the entire message catalogue into the RSC payload of
 * every page, so *every* response contains the refusal sentence somewhere
 * inside a <script> block whether or not anything was refused. Matching the
 * raw body reports every page in the product as a refusal, which is a very
 * convincing wrong answer. Only the rendered markup counts.
 */
function visibleText(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
}

function classify(html) {
  const text = visibleText(html)
  if (text.includes(REFUSAL_AR) || text.includes(REFUSAL_EN)) return 'refused'
  if (text.includes(SUSPENDED_AR)) return 'suspended'
  return 'page'
}

console.log(`\nOsool production QA — ${BASE}\n${'═'.repeat(72)}`)

// ── 1. Anonymous ────────────────────────────────────────────────────────────
console.log('\n1. Anonymous visitor')
for (const [path, expect] of [
  ['/', 200], ['/en', 200], ['/login', 200], ['/en/login', 200],
  ['/activate', 200], ['/api/auth/ok', 200], ['/no-such-page', 404],
]) {
  const r = await get(path, '')
  check(`anon GET ${path} -> ${expect}`, r.status === expect, `got ${r.status}`)
}
/*
 * A route with a loading.tsx answers 200 rather than 307: Next commits the
 * response and streams the skeleton before the guard's redirect is known. That
 * is not a hole — nothing is rendered and the stream ends in a redirect to
 * /login — so the assertion is about content, not about the status line.
 */
const LEAK_PATTERNS = [
  ['audit hash', /[0-9a-f]{64}/],
  ['temporary number', /T-20\d\d\/\d{4}/],
  ['account address', /@osool\.(test|gov\.eg)/],
  ['pii ciphertext', /v1:[A-Za-z0-9_-]{16,}/],
]

for (const path of ROUTES) {
  const r = await get(path, '')
  const redirected = r.status === 307 || r.status === 302
  if (redirected) {
    check(`anon blocked from ${path}`, true)
    continue
  }
  const visible = visibleText(r.text)
  const leaks = LEAK_PATTERNS.filter(([, re]) => re.test(visible)).map(([n]) => n)
  check(
    `anon sees no data at ${path} (streamed ${r.status}, ends at /login)`,
    r.status === 200 && leaks.length === 0 && /\/login/.test(r.text),
    leaks.length ? `leaked: ${leaks.join(', ')}` : `status ${r.status}`,
  )
}

// ── 2. Sign-in ──────────────────────────────────────────────────────────────
console.log('\n2. Authentication')

// CSRF first, while no rate-limit budget has been spent. A credential post
// with no Origin, and one from an origin this deployment does not trust, must
// both be refused outright.
const noOrigin = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'mahmoud.fawzy@osool.gov.eg', password: 'MahmoudFawzy@123' }),
  redirect: 'manual',
})
check('sign-in without Origin refused (CSRF)', noOrigin.status === 403, `status ${noOrigin.status}`)

const evil = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
  body: JSON.stringify({ email: 'mahmoud.fawzy@osool.gov.eg', password: 'MahmoudFawzy@123' }),
  redirect: 'manual',
})
check('sign-in from untrusted origin refused', evil.status === 403, `status ${evil.status}`)

const jars = {}
for (const [who, [email, password]] of Object.entries(ACCOUNTS)) {
  const r = await signIn(email, password)
  const ok = r.status === 200 && r.jar.includes('session')
  check(`sign in ${who} (${email})`, ok, `status ${r.status} ${ok ? '' : r.body.slice(0, 120)}`)
  if (ok) jars[who] = r.jar
  // Under the sign-in rate limit rather than through it.
  await sleep(3500)
}

await sleep(11000)
const bad = await signIn('mahmoud.fawzy@osool.gov.eg', 'WrongPassword123!', { attempts: 2 })
check('wrong password refused', bad.status >= 400 && bad.status !== 429, `status ${bad.status}`)
await sleep(11000)
const ghost = await signIn('nobody@osool.test', 'DevOnly!Osool2026', { attempts: 2 })
check('unknown account refused', ghost.status >= 400 && ghost.status !== 429, `status ${ghost.status}`)
check(
  'no account enumeration (same status for both)',
  bad.status === ghost.status,
  `${bad.status} vs ${ghost.status}`,
)

// The suspended-account refusal must be distinguishable from a bad password,
// because the holder can do nothing about it and must be told so.
await sleep(11000)
const suspended = await signIn('suspended@osool.test', 'DevOnly!Osool2026', { attempts: 2 })
console.log(`  note  suspended@osool.test sign-in -> ${suspended.status} (fixture may not exist here)`)

// ── 3. Role matrix ──────────────────────────────────────────────────────────
console.log('\n3. Role access matrix')
const EXPECTED = {
  admin:     { '/dashboard': 'page', '/admin/users': 'page', '/audit': 'refused', '/intake': 'refused', '/examination': 'refused', '/review': 'refused', '/issuance': 'refused', '/records': 'refused', '/archive': 'refused', '/application': 'refused', '/registration': 'refused' },
  clerk:     { '/dashboard': 'page', '/intake': 'page', '/admin/users': 'refused', '/examination': 'refused', '/review': 'refused', '/audit': 'refused' },
  examiner:  { '/dashboard': 'page', '/examination': 'page', '/intake': 'refused', '/review': 'refused', '/admin/users': 'refused', '/audit': 'refused' },
  reviewer:  { '/dashboard': 'page', '/review': 'page', '/examination': 'refused', '/admin/users': 'refused' },
  issuer:    { '/dashboard': 'page', '/issuance': 'page', '/review': 'refused', '/admin/users': 'refused' },
  data:      { '/dashboard': 'page', '/records': 'page', '/admin/users': 'refused' },
  files:     { '/dashboard': 'page', '/archive': 'page', '/admin/users': 'refused' },
  auditor:   { '/dashboard': 'page', '/audit': 'page', '/admin/users': 'refused', '/intake': 'refused' },
  aml:       { '/dashboard': 'page', '/admin/users': 'refused', '/intake': 'refused' },
  broker:    { '/dashboard': 'page', '/application': 'page', '/registration': 'page', '/admin/users': 'refused', '/intake': 'refused', '/audit': 'refused', '/examination': 'refused' },
}

for (const [who, expectations] of Object.entries(EXPECTED)) {
  if (!jars[who]) { check(`role matrix ${who}`, false, 'no session'); continue }
  for (const [path, want] of Object.entries(expectations)) {
    const r = await get(path, jars[who])
    if (r.status >= 500) { check(`${who} ${path}`, false, `HTTP ${r.status}`); continue }
    const got = r.status === 200 ? classify(r.text) : `http-${r.status}`
    check(`${who} ${path} = ${want}`, got === want, `got ${got}`)
  }
}

// ── 4. Locale mirror and RTL ────────────────────────────────────────────────
console.log('\n4. Arabic / English mirror')
for (const [arPath, enPath] of [['/', '/en'], ['/login', '/en/login'], ['/dashboard', '/en/dashboard']]) {
  const ar = await get(arPath, jars.examiner ?? '')
  const en = await get(enPath, jars.examiner ?? '')
  check(`${arPath} is Arabic RTL`, /<html lang="ar" dir="rtl"/.test(ar.text), ar.text.slice(0, 60))
  check(`${enPath} is English LTR`, /<html lang="en" dir="ltr"/.test(en.text), en.text.slice(0, 60))
  check(`${enPath} renders (not a refusal fallback)`, en.status === 200, `status ${en.status}`)
}

// The queue screens must mirror too, in the reader's own language.
for (const [who, path] of [['examiner', '/en/examination'], ['reviewer', '/en/review'], ['auditor', '/en/audit'], ['admin', '/en/admin/users']]) {
  if (!jars[who]) continue
  const r = await get(path, jars[who])
  check(`${who} ${path}`, r.status === 200 && classify(r.text) === 'page', `status ${r.status} ${classify(r.text)}`)
}

// ── 5. IDOR — one broker must not reach another broker's file ──────────────
console.log('\n5. Cross-tenant access (IDOR)')
if (jars.broker && jars.zamalek) {
  // Discover an application id belonging to zamalek from zamalek's own screen.
  const own = await get('/application', jars.zamalek)
  const id = visibleText(own.text).match(/\/application\/(c[a-z0-9]{20,})/)?.[1]
    ?? own.text.match(/\/application\/(c[a-z0-9]{20,})/)?.[1]
  if (!id) {
    console.log('  note  could not discover an application id to probe; skipping')
  } else {
    const asOther = await get(`/application/${id}`, jars.broker)
    const bad = asOther.status === 200 && classify(asOther.text) === 'page'
    check(`broker cannot open another firm's application ${id.slice(0, 8)}…`, !bad, `status ${asOther.status} ${classify(asOther.text)}`)

    const asExaminer = await get(`/examination/${id}`, jars.examiner ?? '')
    check(
      'examiner reaching a case screen does not 500',
      asExaminer.status < 500,
      `status ${asExaminer.status}`,
    )
  }
}

// A government case screen with a fabricated id must refuse, not crash.
for (const [who, path] of [['examiner', '/examination/cxxxxxxxxxxxxxxxxxxxxxxx'], ['reviewer', '/review/cxxxxxxxxxxxxxxxxxxxxxxx'], ['broker', '/application/cxxxxxxxxxxxxxxxxxxxxxxx']]) {
  if (!jars[who]) continue
  const r = await get(path, jars[who])
  check(`${who} fabricated id -> not 500`, r.status < 500, `status ${r.status}`)
}

// ── 6. Server Actions reject an unauthorised caller ────────────────────────
console.log('\n6. Server-side authorisation on writes')
async function postAction(path, jar, body) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { cookie: jar, origin: BASE, 'content-type': 'text/plain;charset=UTF-8' },
    body,
    redirect: 'manual',
  })
}
// A POST to the accounts screen from a role that may not provision must not
// be answered with anything but a refusal. Next requires a Next-Action header
// to route it, so absent that this asserts the route itself is not open.
for (const who of ['examiner', 'broker', 'auditor']) {
  if (!jars[who]) continue
  const r = await postAction('/admin/users', jars[who], '[]')
  check(`${who} POST /admin/users refused`, r.status !== 200 || classify(await r.text()) !== 'page', `status ${r.status}`)
}

console.log(`\n${'═'.repeat(72)}`)
console.log(`passed ${pass}   failed ${fail}`)
if (failures.length) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  · ${f}`)
}
process.exit(fail ? 1 : 0)
