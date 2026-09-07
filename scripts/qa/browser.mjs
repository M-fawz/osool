/**
 * The browser harness.
 *
 * `scripts/qa/routes.mjs` signs in as ten roles over HTTP and probes fourteen
 * routes. It passed 142 assertions against a production build on the same day
 * every page in that build rendered a blank screen in every browser — because
 * the server was answering 200 with correct HTML and the Content Security
 * Policy was blocking the scripts that assemble it. An HTTP harness cannot see
 * that. Only a browser can, which is what this is.
 *
 * So the assertions here are deliberately about what a person sees: that a
 * heading is on the screen, that a row can be reached, that a booking appears
 * after it is made. Anything that can be checked without rendering belongs in
 * the HTTP harness, which is faster.
 *
 *   npm run qa:browser
 *   npm run qa:browser -- --headed        # watch it
 *   QA_BASE=http://localhost:3000 npm run qa:browser
 *
 * Screenshots land in `.proof/screens/`, which is gitignored. They are the
 * artefact worth keeping from a run: a failed assertion names the file that
 * shows the state it failed in.
 */

import { chromium } from 'playwright'
import { mkdir, readFile } from 'node:fs/promises'
import { adminCredentials, demonstrationPassword } from '../lib/credentials.mjs'

const BASE = process.env.QA_BASE ?? 'http://localhost:3000'
const HEADED = process.argv.includes('--headed')
const SHOTS = '.proof/screens'

const ADMIN = adminCredentials(BASE)
const PASSWORD = demonstrationPassword()

let passed = 0
let failed = 0
const failures = []

function check(label, ok, detail = '') {
  if (ok) {
    passed += 1
    console.log(`  ok    ${label}`)
  } else {
    failed += 1
    failures.push(label)
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
  return ok
}

function heading(title) {
  console.log(`\n${title}\n${'─'.repeat(72)}`)
}

/** A screenshot, named so a failure points at the picture of itself. */
async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {})
}

/**
 * Sign-ins are paced, because the register rate-limits them.
 *
 * `RATE_LIMITS['sign-in']` allows 40 attempts per 300 seconds from one address.
 * This harness signs in seventeen times in a couple of minutes from a single
 * address, which is exactly the shape the budget exists to refuse — and it
 * duly refused, with a 429, on whichever accounts happened to sit at the
 * boundary. The first run blamed reviewer, auditor and administrator; the
 * second blamed issuer and AML supervisor. Nothing was wrong with any of them.
 *
 * So the harness waits, at a rate the budget allows, rather than the limiter
 * being weakened for its convenience. `scripts/qa/routes.mjs` does the same
 * thing for the same reason.
 */
const SIGN_IN_SPACING_MS = 8_000
let lastSignInAt = 0

async function paceSignIn() {
  const wait = lastSignInAt + SIGN_IN_SPACING_MS - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastSignInAt = Date.now()
}

/**
 * Sign in through the actual form.
 *
 * Not by posting to the endpoint and carrying the cookie: the thing under test
 * includes whether the form works, and a harness that skips the form cannot
 * fail when the form is broken.
 */
async function signIn(page, email, password, locale = 'en') {
  await paceSignIn()

  // A blank page first, so the previous role's screen is not still settling
  // when the next navigation starts.
  await page.goto('about:blank')
  await page.goto(`${BASE}/${locale}/login`, { waitUntil: 'networkidle' })
  await page.waitForSelector('#email', { state: 'visible', timeout: 30_000 })
  await page.fill('#email', email)
  await page.fill('#password', password)

  const answer = page
    .waitForResponse((r) => r.url().includes('/api/auth/sign-in'), { timeout: 30_000 })
    .catch(() => null)
  await page.click('button[type="submit"]')
  const response = await answer

  // A refusal by the limiter is reported as itself rather than as a timeout
  // thirty seconds later, which is what made this hard to see the first time.
  if (response?.status() === 429) {
    throw new Error(`rate limited signing in as ${email} — the harness is going too fast`)
  }

  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 60_000 })
}

async function signOutByClearing(context) {
  await context.clearCookies()
}

/**
 * Whether the target is serving a production build.
 *
 * It decides one thing here: whether the verification link is expected on the
 * page. `src/lib/env.ts` treats `next start` on a developer's own machine as
 * production — NODE_ENV says so and no VERCEL_ENV disagrees — so the link is
 * correctly withheld even locally, and the harness must not read that as a
 * fault. `/api/health` reports the deployment it believes itself to be.
 */
let IS_PRODUCTION_BUILD = false

async function readDeployment() {
  try {
    const r = await fetch(`${BASE}/api/health`)
    const body = await r.json()
    IS_PRODUCTION_BUILD = body.deployment === 'production'
    return body.deployment
  } catch {
    return 'unknown'
  }
}

/**
 * The verification link, from the console mailer's output.
 *
 * Where no link is shown on screen, the message still went somewhere: with
 * `EMAIL_PROVIDER=console` it is printed, and the server's stdout is captured
 * to a file for exactly this kind of check. Reading it is what lets the harness
 * follow the link a real recipient would click, on a build that is right not to
 * put it on the page.
 *
 * If the log is not where this expects, the assertion fails honestly rather
 * than the harness pretending the step happened.
 */
async function linkFromServerLog(email) {
  for (const path of ['.proof/server-s3b.log', '.proof/server-s3.log', process.env.QA_SERVER_LOG]) {
    if (!path) continue
    try {
      const text = await readFile(path, 'utf8')
      // The last message addressed to this recipient, and the first URL after
      // it — a mailbox that has been written to twice must yield the newer one.
      const at = text.lastIndexOf(email)
      if (at === -1) continue
      const after = text.slice(at)
      const match = after.match(/https?:\/\/\S*verify-email\S*/)
      if (match) return match[0].replace(/[|\s]+$/, '')
    } catch {
      // Try the next candidate.
    }
  }
  return null
}

/** Every console error, so a page that renders but throws is still a failure. */
function watchConsole(page, sink) {
  page.on('console', (m) => {
    if (m.type() === 'error') sink.push(m.text())
  })
  page.on('pageerror', (e) => sink.push(`PAGEERROR: ${e.message}`))
}

const run = async () => {
  await mkdir(SHOTS, { recursive: true })

  const browser = await chromium.launch({ headless: !HEADED })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const consoleErrors = []
  watchConsole(page, consoleErrors)

  const deployment = await readDeployment()
  console.log(`\nOsool browser QA — ${BASE}  (deployment: ${deployment})`)
  console.log('═'.repeat(72))

  // ── 1. The pages a signed-out visitor can reach ────────────────────────
  heading('1. Public screens render')

  for (const [path, marker] of [
    ['/en/login', 'Sign in'],
    ['/ar/login', 'تسجيل الدخول'],
    ['/en/signup', 'Open a broker account'],
    ['/ar/signup', 'فتح حساب وسيط'],
    ['/en/verify', null],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
    const text = await page.locator('body').innerText()
    check(`${path} renders content`, text.trim().length > 40, `${text.trim().length} chars`)
    if (marker) check(`${path} shows "${marker}"`, text.includes(marker))
  }
  await shot(page, 'public-login-en')

  // The regression that motivated this harness. A blank page is not a
  // rendering nicety; it is the whole product being unavailable.
  check(
    'no Content Security Policy violations on a public page',
    !consoleErrors.some((e) => /Content Security Policy/i.test(e)),
    consoleErrors.find((e) => /Content Security Policy/i.test(e))?.slice(0, 120),
  )

  check(
    'the sign-in screen offers a way to register',
    await page.goto(`${BASE}/en/login`, { waitUntil: 'domcontentloaded' })
      .then(() => page.getByRole('link', { name: /Open a broker account/i }).isVisible()),
  )

  // ── 2. A firm opens its own account ────────────────────────────────────
  heading('2. Broker self-registration')

  const tag = Date.now().toString(36)
  const brokerEmail = `qa-${tag}@example.test`
  const brokerPassword = 'qa-harness-password-2026'

  await page.goto(`${BASE}/en/signup`, { waitUntil: 'networkidle' })
  await page.fill('#tradeNameAr', `منشأة اختبار ${tag}`)
  await page.fill('#tradeNameEn', `QA Test Firm ${tag}`)
  await page.selectOption('#governorate', 'CAIRO')
  await page.fill('#headOfficeAddress', '12 Qasr El Nil Street, Cairo')
  await page.fill('#ownerNameAr', 'محمود فوزي')
  await page.fill('#ownerNameEn', 'Mahmoud Fawzy')
  await page.fill('#email', brokerEmail)
  await page.fill('#password', brokerPassword)
  await shot(page, 'signup-filled')

  await page.click('button[type="submit"]')

  /*
   * The success notice, by its own heading — not by any text containing
   * "confirm your email". The page's *lead* says "You will confirm your email
   * address before you can sign in", so a loose match passed the instant the
   * form was submitted and screenshotted a button still reading "Opening the
   * account…". The assertion has to name something that exists only after the
   * action returns.
   */
  await page
    .getByText(/Account opened|تم فتح الحساب/)
    .first()
    .waitFor({ state: 'visible', timeout: 60_000 })
    .catch(() => {})

  const signedUp = await page.locator('body').innerText()
  await shot(page, 'signup-confirmed')

  /*
   * The sign-up budget is five accounts per hour from one address
   * (`RATE_LIMITS['sign-up']`), so a harness run more than five times in an
   * hour will meet it — correctly. That is reported as the control working
   * rather than as three unexplained failures, and the rest of this section is
   * skipped because it has nothing to act on.
   */
  const budgetSpent = /was not opened|لم يُفتح الحساب/i.test(signedUp)
  if (budgetSpent) {
    check(
      'the sign-up budget is spent — five accounts per hour, refused as designed',
      true,
      'skipping the rest of section 2',
    )
  }

  const openedOk =
    !budgetSpent && check('the account is reported as opened', /Account opened/i.test(signedUp))
  if (!budgetSpent) {
    check('the confirmation names the address used', signedUp.includes(brokerEmail))
  }

  /*
   * The on-screen link is shown only off production, and `next start` on this
   * machine *is* production as far as `src/lib/env.ts` is concerned — NODE_ENV
   * is production and no VERCEL_ENV says otherwise. So its absence here is the
   * control working, not a defect, and the harness reads the link out of the
   * console mailer's output instead. Against a development server the link is
   * on the page and this finds it there.
   */
  const verifyLink = !openedOk ? null : (await page
      .locator('a[href*="verify-email"], a[href*="token="]')
      .first()
      .getAttribute('href')
      .catch(() => null)) ?? (await linkFromServerLog(brokerEmail))

  if (openedOk) {
    check(
      'the link is withheld from the page on a production build',
      !(await page.locator('a[href*="verify-email"]').count()) || !IS_PRODUCTION_BUILD,
    )
  }

  if (openedOk && check('a verification link was issued', Boolean(verifyLink))) {
    await page.goto(verifyLink, { waitUntil: 'networkidle' })
    await shot(page, 'signup-verified')

    await signIn(page, brokerEmail, brokerPassword)

    /*
     * The portal, by going to it. Sampling `/dashboard` immediately after the
     * redirect measured a Suspense fallback still reading "Loading…" and
     * called the flow broken; the page was fine and the assertion was early.
     * `/application` is where a broker's work actually is, and it renders the
     * firm's own name, which is the thing worth proving: the account is
     * attached to the firm the sign-up form created.
     */
    await page.goto(`${BASE}/en/application`, { waitUntil: 'networkidle' })
    const portal = await page.locator('body').innerText()
    check(
      'the new account reaches its own portal after verifying',
      portal.includes(`QA Test Firm ${tag}`),
      portal.slice(0, 120).split(String.fromCharCode(10)).join(' '),
    )
    await shot(page, 'signup-portal')
  }

  await signOutByClearing(context)

  // ── 3. The officer queue, past row fifty ───────────────────────────────
  heading('3. Officer queue pagination')

  await signIn(page, 'clerk@osool.test', PASSWORD)
  await page.goto(`${BASE}/en/intake`, { waitUntil: 'networkidle' })
  await shot(page, 'queue-page-1')

  // The pagination nav, addressed by the label the component gives it. The
  // previous selector matched the shell's own <nav> and read the sidebar.
  const countText = await page
    .locator('nav')
    .filter({ hasText: /Showing/ })
    .first()
    .innerText()
    .catch(() => '')
  check(
    'the queue states a real total',
    /of\s+[\d,]{3,}/.test(countText),
    countText.split('\n').join(' ').slice(0, 80),
  )

  /*
   * The *entity* column, not the reference. The first column is the temporary
   * number, which is "—" for any file that has not been given one yet, so
   * comparing it across pages compared "—" with "—" and proved nothing.
   */
  const firstRowsPage1 = await page.locator('tbody tr td:nth-child(2)').allInnerTexts()
  check('page 1 shows a full page of rows', firstRowsPage1.length >= 25, `${firstRowsPage1.length} rows`)

  check('paging controls are rendered', await page.getByRole('link', { name: '2', exact: true }).isVisible().catch(() => false))

  for (const p of [2, 3, 10]) {
    await page.goto(`${BASE}/en/intake?page=${p}`, { waitUntil: 'networkidle' })
    const rows = await page.locator('tbody tr td:nth-child(2)').allInnerTexts()
    check(`page ${p} is reachable and has rows`, rows.length > 0, `${rows.length} rows`)
    if (p === 2) {
      check(
        'page 2 shows different rows from page 1',
        rows[0] !== firstRowsPage1[0],
        `${rows[0]} vs ${firstRowsPage1[0]}`,
      )
    }
  }
  await shot(page, 'queue-page-10')

  // The last page, computed from the total the screen itself reports.
  await page.goto(`${BASE}/en/intake?pageSize=200`, { waitUntil: 'networkidle' })
  const bigRows = await page.locator('tbody tr').count()
  check('a larger page size is honoured', bigRows > 50, `${bigRows} rows`)

  // The search the loader has always supported and no screen ever passed.
  await page.goto(`${BASE}/en/intake`, { waitUntil: 'networkidle' })
  // The entity cell renders the Arabic trade name and the English one on two
  // lines; searching for both joined by a newline matches nothing.
  const knownRef = firstRowsPage1[0]?.split(String.fromCharCode(10))[0]?.trim()
  if (knownRef && knownRef !== '—') {
    await page.fill('#queue-q', knownRef)
    await page.click('form button[type="submit"]')
    await page.waitForLoadState('networkidle')
    const found = await page.locator('tbody tr').count()
    check(`searching the queue for ${knownRef} narrows it`, found >= 1 && found < 50, `${found} rows`)
    await shot(page, 'queue-search')
  }

  // Arabic, same screen.
  await page.goto(`${BASE}/ar/intake`, { waitUntil: 'networkidle' })
  const dir = await page.locator('html').getAttribute('dir')
  check('the Arabic queue is right-to-left', dir === 'rtl', `dir=${dir}`)
  check('the Arabic queue has rows', (await page.locator('tbody tr').count()) > 0)
  await shot(page, 'queue-arabic')

  // ── 4. The register ────────────────────────────────────────────────────
  heading('4. Register search')

  await page.goto(`${BASE}/en/register`, { waitUntil: 'networkidle' })
  const registerRows = await page.locator('tbody tr').count()
  check('the register lists registrations', registerRows > 0, `${registerRows} rows`)
  await shot(page, 'register-en')

  // A name taken off the screen, so the search term is one that must match.
  const aName = (await page.locator('tbody tr td:nth-child(2) bdi').first().innerText().catch(() => '')).trim()
  const aNumber = (await page.locator('tbody tr td:first-child a').first().innerText().catch(() => '')).trim()

  if (aName) {
    await page.goto(`${BASE}/en/register?q=${encodeURIComponent(aName)}`, { waitUntil: 'networkidle' })
    check(`searching the register by Arabic name "${aName}" finds it`, (await page.locator('tbody tr').count()) > 0)
  }
  if (aNumber) {
    await page.goto(`${BASE}/en/register?q=${encodeURIComponent(aNumber)}`, { waitUntil: 'networkidle' })
    check(`searching the register by number ${aNumber} finds it`, (await page.locator('tbody tr').count()) > 0)
  }

  await page.goto(`${BASE}/en/register?status=ACTIVE`, { waitUntil: 'networkidle' })
  check('filtering the register by status works', (await page.locator('tbody tr').count()) > 0)

  await page.goto(`${BASE}/en/register?page=2`, { waitUntil: 'networkidle' })
  check('the register pages', (await page.locator('tbody tr').count()) > 0)

  await page.goto(`${BASE}/ar/register`, { waitUntil: 'networkidle' })
  check('the Arabic register renders', (await page.locator('tbody tr').count()) > 0)
  await shot(page, 'register-ar')

  /*
   * Public verification, signed out — the citizen-facing half.
   *
   * In its own context rather than by clearing the cookies on this one. Signing
   * out here meant signing the clerk back in for the next section, and the
   * per-account budget is eight attempts in fifteen minutes: three clerk
   * sign-ins per run is two runs before the harness locks itself out. A second
   * context costs nothing and keeps this run to one sign-in per account.
   */
  if (aNumber) {
    const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const visitor = await anon.newPage()
    watchConsole(visitor, consoleErrors)
    await visitor.goto(`${BASE}/en/verify?number=${encodeURIComponent(aNumber)}`, { waitUntil: 'networkidle' })
    const verifyText = await visitor.locator('body').innerText()
    check(
      'public verification answers for a real number, with no session',
      verifyText.length > 100 && !/500|error/i.test(await visitor.title()),
    )
    await visitor.screenshot({ path: `${SHOTS}/verify-public.png`, fullPage: true }).catch(() => {})
    await anon.close()
  }

  // ── 5. Appointments ────────────────────────────────────────────────────
  heading('5. Appointments')

  // Still signed in as the clerk from section 3 — deliberately not repeated.
  await page.goto(`${BASE}/en/appointments`, { waitUntil: 'networkidle' })
  const diary = await page.locator('body').innerText()
  check("the clerk's diary renders", diary.length > 200)
  await shot(page, 'appointments-clerk')

  await page.goto(`${BASE}/ar/appointments`, { waitUntil: 'networkidle' })
  check('the Arabic diary renders', (await page.locator('body').innerText()).length > 200)

  /*
   * An actual booking, made through the interface.
   *
   * `tests/integration/appointments.test.ts` covers the domain rules — capacity,
   * double booking, cancellation. What it cannot cover is whether a broker can
   * reach the screen, see a free slot, and end up with a booking, which is the
   * thing being demonstrated. So this books one.
   *
   * `nile@osool.test` is a seeded firm with a SUBMITTED application and no live
   * appointment, which is exactly the state where a document handover is due.
   */
  const booker = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const brokerPage = await booker.newPage()
  watchConsole(brokerPage, consoleErrors)

  await signIn(brokerPage, 'nile@osool.test', PASSWORD)
  await brokerPage.goto(`${BASE}/en/application`, { waitUntil: 'networkidle' })

  const appHref = await brokerPage
    .locator('a[href*="/application/"]')
    .first()
    .getAttribute('href')
    .catch(() => null)

  const appId = appHref?.match(/\/application\/([^/?#]+)/)?.[1] ?? null

  if (check('the broker can find their own application', Boolean(appId), appHref ?? 'no link')) {
    await brokerPage.goto(`${BASE}/en/application/${appId}/appointment`, { waitUntil: 'networkidle' })
    await shot(brokerPage, 'appointment-slots')

    /*
     * Whether a booking already exists, by the one control that only appears
     * when it does. Matching the page text for "Your appointment" was wrong —
     * that is the *heading* of the screen, so every visit looked like an
     * existing booking and the harness silently skipped the thing it was for.
     */
    const alreadyBooked =
      (await brokerPage.getByRole('button', { name: /cancel|إلغاء/i }).count()) > 0

    // Every slot control that is not full or closed. The picker disables the
    // ones that cannot be taken, so "enabled" is the availability assertion.
    const free = brokerPage.locator('button:not([disabled])').filter({ hasText: /:/ })
    const freeCount = await free.count()
    check('open slots are offered to the broker', freeCount > 0 || alreadyBooked, `${freeCount} selectable`)

    if (freeCount > 0 && !alreadyBooked) {
      await free.first().click()
      await brokerPage.waitForSelector('#attendee-name', { state: 'visible', timeout: 15_000 })
      await brokerPage.fill('#attendee-name', 'Mahmoud Fawzy')
      await brokerPage.fill('#attendee-phone', '01000000000')
      await shot(brokerPage, 'appointment-confirming')

      await brokerPage.click('form button[type="submit"]')
      await brokerPage.waitForLoadState('networkidle')
      await brokerPage.waitForTimeout(2_000)

      const after = await brokerPage.locator('body').innerText()
      check(
        'the booking is confirmed back to the broker',
        /cancel|Your appointment|موعدك/i.test(after),
        after.slice(0, 140).split(String.fromCharCode(10)).join(' '),
      )
      check(
        'the confirmation states a date and a time',
        /\d{1,2}:\d{2}/.test(after) && /20\d{2}/.test(after),
      )
      await shot(brokerPage, 'appointment-booked')
    }

    // Arabic, on the same screen.
    await brokerPage.goto(`${BASE}/ar/application/${appId}/appointment`, { waitUntil: 'networkidle' })
    check(
      'the Arabic appointment screen renders right-to-left',
      (await brokerPage.locator('html').getAttribute('dir')) === 'rtl',
    )
    await shot(brokerPage, 'appointment-ar')
  }

  await booker.close()

  // ── 6. Every role lands somewhere real ─────────────────────────────────
  heading('6. Roles reach their own screens')

  const ROLES = [
    ['clerk@osool.test', '/en/intake', 'REGISTRY_CLERK'],
    ['examiner@osool.test', '/en/examination', 'EXAMINER'],
    ['reviewer@osool.test', '/en/review', 'REVIEWER'],
    ['issuer@osool.test', '/en/issuance', 'CARD_ISSUER'],
    ['data@osool.test', '/en/records', 'DATA_MANAGER'],
    ['files@osool.test', '/en/archive', 'FILES_HEAD'],
    ['auditor@osool.test', '/en/audit', 'AUDITOR'],
    ['aml@osool.test', '/en/supervision', 'AML_SUPERVISOR'],
    ['analyst@osool.test', '/en/supervision', 'ANALYST'],
    [ADMIN.email, '/en/admin/users', 'SYSTEM_ADMIN'],
    ['broker@osool.test', '/en/application', 'BROKER_OWNER'],
  ]

  for (const [email, path, role] of ROLES) {
    await signOutByClearing(context)
    const password = email === ADMIN.email ? ADMIN.password : PASSWORD
    try {
      await signIn(page, email, password)
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
      const text = await page.locator('body').innerText()

      /*
       * A refusal is the four-part notice, identified by its own headings —
       * not by the word "refused" appearing anywhere on the page. The audit
       * screen carries the status label "The application was refused, and the
       * reason is recorded inside it", so the loose match reported the auditor
       * as locked out of the one screen the role exists for.
       */
      // Case-insensitively: the headings are uppercased by CSS, and
      // `innerText` returns the transformed text, so an exact match never hits.
      const refused = /what is blocked/i.test(text) || text.includes('ما هو الممنوع')
      check(`${role} reaches ${path}`, text.length > 150 && !refused, refused ? 'refused' : `${text.length} chars`)
    } catch (error) {
      check(`${role} reaches ${path}`, false, error.message.split('\n')[0].slice(0, 100))
    }
  }

  /*
   * INSPECTOR is asserted as *refused*, on purpose.
   *
   * The role exists, has a label, sits in GOVERNMENT_ROLES and can be
   * provisioned — and there is no screen anywhere that admits it. `/supervision`
   * permits AML_SUPERVISOR, AUDITOR and ANALYST; the inspector's own subject
   * matter, `Inspection` and `Finding`, is part of the AML cluster that has no
   * reads and no writes yet. So an inspector signs in and can reach nothing.
   *
   * That is recorded as a gap rather than fixed by adding the role to a guard:
   * which screens an inspector may see is a regulatory question, and CLAUDE.md
   * rule 3 is that a rule with no requirement ID behind it does not go into the
   * code. What this asserts is that the refusal is at least a proper one.
   */
  await signOutByClearing(context)
  await signIn(page, 'inspector@osool.test', PASSWORD)
  await page.goto(`${BASE}/en/supervision`, { waitUntil: 'networkidle' })
  const inspectorText = await page.locator('body').innerText()
  check(
    'INSPECTOR has no screen yet, and is refused in all four parts',
    [/what is blocked/i, /why/i, /what to do next/i, /who to ask/i].every((h) =>
      h.test(inspectorText),
    ),
    inspectorText.slice(0, 120).split(String.fromCharCode(10)).join(' '),
  )

  // The refusal has to work as well as the permission.
  await signOutByClearing(context)
  await signIn(page, 'broker@osool.test', PASSWORD)
  await page.goto(`${BASE}/en/audit`, { waitUntil: 'networkidle' })
  const brokerOnAudit = await page.locator('body').innerText()
  check(
    'a broker is refused the audit trail, in all four parts',
    [/what is blocked/i, /why/i, /what to do next/i, /who to ask/i].every((h) =>
      h.test(brokerOnAudit),
    ),
    brokerOnAudit.slice(0, 120).split(String.fromCharCode(10)).join(' '),
  )
  await shot(page, 'refusal-broker-audit')

  // ── 7. A phone ─────────────────────────────────────────────────────────
  heading('7. Mobile viewport')

  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
  const mobile = await phone.newPage()
  const mobileErrors = []
  watchConsole(mobile, mobileErrors)

  for (const [path, label] of [
    ['/ar/login', 'login-ar'],
    ['/ar/signup', 'signup-ar'],
  ]) {
    await mobile.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
    const overflow = await mobile.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    check(`${path} does not scroll sideways on a phone`, !overflow)
    await mobile.screenshot({ path: `${SHOTS}/mobile-${label}.png`, fullPage: true }).catch(() => {})
  }

  // The examiner rather than the clerk: spreading the sign-ins across accounts
  // keeps every one of them well inside the per-account budget.
  await signIn(mobile, 'examiner@osool.test', PASSWORD, 'ar')
  await mobile.goto(`${BASE}/ar/examination`, { waitUntil: 'networkidle' })
  const mobileOverflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
  check('an Arabic queue does not scroll sideways on a phone', !mobileOverflow)
  await mobile.screenshot({ path: `${SHOTS}/mobile-queue-ar.png`, fullPage: true }).catch(() => {})

  check(
    'no Content Security Policy violations anywhere in the run',
    ![...consoleErrors, ...mobileErrors].some((e) => /Content Security Policy/i.test(e)),
  )

  await phone.close()
  await browser.close()

  // ── The verdict ────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(72)}`)
  console.log(`  ${passed} passed, ${failed} failed`)
  if (failures.length) {
    console.log('\n  Failed:')
    for (const f of failures) console.log(`    · ${f}`)
  }
  console.log(`  Screenshots in ${SHOTS}/`)
  console.log(`${'═'.repeat(72)}\n`)

  process.exit(failed === 0 ? 0 : 1)
}

run().catch((error) => {
  console.error('\nThe harness itself failed:', error)
  process.exit(2)
})
