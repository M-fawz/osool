/**
 * A read-only probe of a deployed Osool.
 *
 *   QA_LIVE=http://76.13.57.79:3000 node scripts/qa/live-probe.mjs
 *
 * ── Why this is separate from `browser.mjs` ──────────────────────────────
 *
 * The main harness proves the product by using it: it submits applications,
 * books appointments, cancels them and signs in as eleven roles. Every one of
 * those is a write, and under CLAUDE.md rule 2 nothing this product writes can
 * later be removed. Pointing it at somebody else's deployment would leave
 * permanent fixture data in a register that is not ours to seed.
 *
 * So this probe does what can be learned from the outside and stops there:
 * public pages only, no form is submitted, no session is created. What it
 * cannot answer, it says it cannot answer rather than guessing.
 *
 * The question it exists to settle is which code a deployment is running,
 * which is not something a version endpoint would answer honestly — a stale
 * build reports the version it was built from. Instead it looks for the
 * *fingerprints* of specific commits in the markup the server actually sends.
 */

import { chromium } from 'playwright'

const BASE = (process.env.QA_LIVE ?? 'http://76.13.57.79:3000').replace(/\/+$/, '')

let passed = 0
let failed = 0
const notes = []

function check(label, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok    ${label}`) }
  else { failed += 1; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }
  return ok
}
function note(label, detail) {
  notes.push(`${label}: ${detail}`)
  console.log(`  note  ${label} — ${detail}`)
}
function heading(t) { console.log(`\n${t}\n${'─'.repeat(72)}`) }

async function main() {
  console.log(`\nOsool live probe (read-only) — ${BASE}\n`)

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const consoleErrors = []
  const failedRequests = []

  context.on('weberror', (e) => consoleErrors.push(String(e.error()).slice(0, 200)))

  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
  page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`))
  page.on('response', (r) => { if (r.status() >= 500) failedRequests.push(`${r.status()} ${r.url()}`) })

  // ── 1. Reachable, and rendering rather than merely answering ────────────
  heading('1. Reachable and rendering')

  const health = await page.request.get(`${BASE}/api/health`).then((r) => r.json()).catch(() => null)
  check('the health endpoint answers', Boolean(health), 'no response')
  if (health) {
    check('the deployment reports its database as reachable',
      health.checks?.some((c) => c.name === 'database' && c.ok))
    note('deployment environment reported', String(health.deployment))
    note('drivers', `email=${health.drivers?.email} storage=${health.drivers?.storage}`)
  }

  for (const path of ['/en/login', '/', '/en/verify', '/en/signup']) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => null)
    const text = await page.locator('body').innerText().catch(() => '')
    // A blank page is the failure this whole harness family exists for: the
    // server answers 200 with correct HTML and the browser renders nothing.
    check(`${path} renders text rather than a blank page`,
      text.trim().length > 40, `status ${res?.status()} / ${text.trim().length} chars`)
  }

  // ── 2. Which code is running ────────────────────────────────────────────
  heading('2. Which code is deployed')

  await page.goto(`${BASE}/en/login`, { waitUntil: 'networkidle' })

  // Fingerprint A — commit 9923e16. A credential form must carry an explicit
  // method, or before React hydrates it is a plain HTML form and submitting it
  // performs a GET with the password as a query parameter.
  const formMethod = await page.locator('form').first().getAttribute('method')
  check('the sign-in form declares method="post" (commit 9923e16 present)',
    (formMethod ?? '').toLowerCase() === 'post', `method=${formMethod ?? 'absent'}`)

  // Fingerprint B — the password reveal. Present only on code newer than the
  // deployment this was written against.
  const revealCount = await page.locator('button[aria-pressed]').count()
  check('the password field offers a reveal control',
    revealCount > 0, `${revealCount} toggles found`)

  // Fingerprint C — the CSP fix, which is older than both. Its absence would
  // mean the deployment predates the blank-page repair entirely.
  const csp = (await page.request.get(`${BASE}/en/login`)).headers()['content-security-policy'] ?? ''
  check('the policy mints a per-request nonce (commit f3daea8 present)', csp.includes('nonce-'))
  if (csp.includes("'unsafe-eval'")) {
    note("script-src carries 'unsafe-eval'", 'the host is running NODE_ENV=development, not a production build')
  }

  // ── 3. The public surface, in both languages ────────────────────────────
  heading('3. The public surface')

  /*
   * Writing direction, checked on the home page rather than on `/verify`.
   *
   * The first version of this probe asked for `/<locale>/verify` and reported
   * that it rendered. It does not: with no number to check, `verify/page.tsx`
   * redirects to the locale home, so the assertion was passing on a page it had
   * not named — a green check for something it never tested, which is worse
   * than a red one. Verifying a real number needs a registration number from
   * that deployment's own register, and its register is behind a session, so
   * that is out of reach of a probe that refuses to sign in.
   */
  for (const [locale, expected] of [['en', 'ltr'], ['ar', 'rtl']]) {
    const landed = await page.goto(`${BASE}/${locale}/verify`, { waitUntil: 'networkidle' })
    const text = await page.locator('body').innerText().catch(() => '')
    check(`/${locale}/verify renders (as the ${locale} home, where it redirects)`,
      text.trim().length > 40, `${text.trim().length} chars, status ${landed?.status()}`)
    const dir = await page.locator('html').getAttribute('dir')
    check(`the ${locale} screen is ${expected}`, dir === expected, `dir=${dir}`)
  }
  note('/en/verify with no number', `redirects to ${page.url()} — by design, not a fault`)

  // The register list is behind a session on this deployment — it redirected
  // to /en/login when probed over HTTP. Recorded, not asserted: whether that
  // is correct policy is a question about this build, not about reachability.
  const reg = await page.goto(`${BASE}/en/register`, { waitUntil: 'networkidle' }).catch(() => null)
  note('/en/register', `ends at ${page.url()} (status ${reg?.status()})`)

  // ── 4. What the browser complained about ────────────────────────────────
  heading('4. Console and network')
  check('no console errors on the public pages', consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | '))
  check('no failed or 5xx requests', failedRequests.length === 0,
    failedRequests.slice(0, 3).join(' | '))

  await browser.close()

  console.log(`\n${'─'.repeat(72)}`)
  console.log(`${passed} passed, ${failed} failed`)
  if (notes.length) {
    console.log('\nRecorded, not asserted:')
    for (const n of notes) console.log(`  · ${n}`)
  }
  console.log('\nNot probed, deliberately: sign-in, registration, application submission,')
  console.log('document upload and appointment booking. Every one of them writes, and')
  console.log('nothing this product writes can be removed afterwards.\n')
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
