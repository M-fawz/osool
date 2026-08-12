/**
 * The whole business workflow, driven against the deployed production system.
 *
 *   node scripts/qa/workflow.mjs [--base https://osool-cyan.vercel.app]
 *
 * Broker → clerk → examiner → completion → broker → a *different* reviewer →
 * approval → fees → card → delivery, with the production database inspected
 * after every transition.
 *
 * ── Why this drives HTTP rather than a browser ─────────────────────────────
 *
 * A browser is the right instrument for "does the applicant understand this
 * screen", and it was used for that. It is the wrong instrument for a
 * fifteen-transition workflow across six sign-ins: the run takes long enough
 * that a flaky screenshot or a lost tab invalidates an hour of work, and a
 * failure tells you a click missed rather than what the server did.
 *
 * This is not a mock. Every request below goes to the real deployment, over
 * the real network, through the real middleware, session, authorisation, Zod
 * validation, rules engine, transition table and audit chain. Server Actions
 * are invoked exactly as the browser invokes them: POST to the page's own URL
 * with a `Next-Action` header carrying the action id, which is read out of the
 * page React just rendered. If an authorisation check or a segregation-of-
 * duties constraint would refuse the browser, it refuses this too — and §5
 * below deliberately proves that by trying.
 *
 * Nothing here writes anything a demonstration would not write. It uses the
 * seeded demonstration accounts and creates one application.
 */
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE =
  process.argv[process.argv.indexOf('--base') + 1]?.startsWith('http')
    ? process.argv[process.argv.indexOf('--base') + 1]
    : 'https://osool-cyan.vercel.app'

const PASSWORD = 'DevOnly!Osool2026'
const DEMO_DIR = join(process.cwd(), 'docs', 'demo-documents')

let pass = 0
let fail = 0
const failures = []

function check(label, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  ok    ${label}`)
    return true
  }
  fail++
  failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  return false
}

function step(title) {
  console.log(`\n${title}\n${'─'.repeat(Math.max(title.length, 40))}`)
}

// ── A signed-in browser, near enough ────────────────────────────────────────

/**
 * One cookie jar per person, because the whole point of several of the checks
 * below is that two officials are two different sessions.
 */
class Client {
  constructor(label) {
    this.label = label
    this.cookies = new Map()
  }

  #store(response) {
    // Node exposes every Set-Cookie separately through getSetCookie().
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';')
      const index = pair.indexOf('=')
      if (index < 0) continue
      this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
    }
  }

  get cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  async fetch(path, init = {}) {
    const response = await fetch(new URL(path, BASE), {
      ...init,
      redirect: 'manual',
      headers: {
        cookie: this.cookieHeader,
        // Better Auth refuses a request with no Origin outright — an ordinary
        // CSRF defence, and one this harness must satisfy honestly rather than
        // route around: it sends the deployment's own origin, which is exactly
        // what a browser on that page would send, and which `trustedOrigins`
        // then checks. A harness that could bypass this would not be testing
        // the same system.
        origin: BASE,
        referer: new URL(path, BASE).toString(),
        ...(init.headers ?? {}),
      },
    })
    this.#store(response)
    return response
  }

  async signIn(email) {
    const response = await this.fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    })
    const ok = response.status === 200 && this.cookies.size > 0
    if (!ok) throw new Error(`${this.label}: sign-in failed for ${email} (${response.status})`)
    this.email = email
    return this
  }

  /**
   * Read a page and pull out the Server Action ids React embedded in it.
   *
   * Every `<form action={serverAction}>` React renders carries a hidden
   * `$ACTION_1:0` input whose value is `{"id":"<40 hex>","bound":"$@1"}`. That
   * id is what the `Next-Action` header has to carry. Reading it back out of
   * the page — rather than hard-coding it — means this harness follows a
   * rebuild automatically, and means a page that stopped rendering the form at
   * all fails loudly here instead of silently doing nothing.
   */
  async actionsOn(path) {
    const response = await this.fetch(path)
    const html = await response.text()
    const ids = [...html.matchAll(/\{&quot;id&quot;:&quot;([0-9a-f]{40})&quot;/g)].map((m) => m[1])
    const plain = [...html.matchAll(/\{"id":"([0-9a-f]{40})"/g)].map((m) => m[1])
    return { status: response.status, html, ids: [...new Set([...ids, ...plain])] }
  }

  /** Invoke a Server Action the way the browser does. */
  async act(path, actionId, fields) {
    const body = new FormData()
    for (const [name, value] of Object.entries(fields)) {
      if (Array.isArray(value)) for (const v of value) body.append(name, String(v))
      else if (value !== undefined && value !== null) body.append(name, String(value))
    }

    const response = await this.fetch(path, {
      method: 'POST',
      headers: { 'next-action': actionId },
      body,
    })
    const text = await response.text()
    return { status: response.status, text }
  }
}

/** The flight payload is not JSON, so read the outcome by shape. */
const succeeded = (result) =>
  result.status === 200 && /"ok"\s*:\s*true/.test(result.text)
const refusedWith = (result, code) => new RegExp(`"code"\\s*:\\s*"${code}"`).test(result.text)

// ── The database, read directly ─────────────────────────────────────────────

const ENV_FILE = '.env.prod.pulled'
let db = null

async function openDb() {
  if (!existsSync(ENV_FILE)) {
    console.log(`\n  ${ENV_FILE} missing — database assertions will be skipped.`)
    console.log(`  npx vercel env pull ${ENV_FILE} --environment=production --yes\n`)
    return null
  }
  process.loadEnvFile(ENV_FILE)
  const usable = (v) => Boolean(v) && v !== '[SENSITIVE]' && v.startsWith('post')
  const url = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.POSTGRES_PRISMA_URL,
  ].find(usable)
  if (!url) return null
  process.env.DATABASE_URL = url
  const { PrismaClient } = await import('@prisma/client')
  return new PrismaClient({ datasourceUrl: url })
}

const q = async (sql, ...params) => (db ? db.$queryRawUnsafe(sql, ...params) : [])

async function statusOf(id) {
  const rows = await q(`select status, "temporaryNumber", "examinerId", "reviewerId" from application where id = $1`, id)
  return rows[0] ?? null
}

// ── The run ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nOsool — end-to-end business workflow against ${BASE}\n${'='.repeat(72)}`)
  db = await openDb()

  // ── 1. The broker starts and fills an application ────────────────────────
  step('1. Broker — start an application')

  const broker = await new Client('broker').signIn('nile@osool.test')
  check('broker signed in', Boolean(broker.email))

  const listing = await broker.actionsOn('/en/application')
  check('the applications page renders', listing.status === 200)
  check('it carries a Server Action id', listing.ids.length > 0, `found ${listing.ids.length}`)

  // `startApplicationAction` takes no form data and is invoked from a click,
  // so it arrives as a JSON array body rather than as FormData.
  const startId = listing.ids[0]
  const started = await broker.fetch('/en/application', {
    method: 'POST',
    headers: { 'next-action': startId, 'content-type': 'text/plain;charset=UTF-8' },
    body: '[]',
  })
  const startedText = await started.text()
  check('start-application answered', started.status === 200)

  const applicationId =
    startedText.match(/"applicationId"\s*:\s*"([a-z0-9]+)"/)?.[1] ??
    (await q(
      `select a.id from application a join "user" u on u."brokerEntityId" = a."brokerEntityId"
       where u.email = 'nile@osool.test' and a.status = 'DRAFT' and a."archivedAt" is null
       order by a."updatedAt" desc limit 1`,
    ))[0]?.id

  if (!applicationId) {
    console.log('\n  Could not obtain a draft application id. Stopping.')
    return
  }
  console.log(`        application ${applicationId}`)

  // Pressing "start" twice used to create a second firm and strand the file.
  const again = await broker.fetch('/en/application', {
    method: 'POST',
    headers: { 'next-action': startId, 'content-type': 'text/plain;charset=UTF-8' },
    body: '[]',
  })
  const againId = (await again.text()).match(/"applicationId"\s*:\s*"([a-z0-9]+)"/)?.[1]
  check(
    'pressing start twice returns the same draft, not a second one',
    !againId || againId === applicationId,
    `second press gave ${againId}`,
  )

  const firms = await q(
    `select count(*)::int n from broker_entity e
     where not exists (select 1 from "user" u where u."brokerEntityId" = e.id)`,
  )
  check('no firm was left without an account', (firms[0]?.n ?? 0) === 0, `${firms[0]?.n} orphaned`)

  // ── 2. The seven steps ───────────────────────────────────────────────────
  step('2. Broker — the wizard, step by step')

  const stepUrl = (s) => `/en/application/${applicationId}/${s}`

  /** Run the first action on a step page with the given fields. */
  async function saveStep(name, fields, { expectOk = true } = {}) {
    const page = await broker.actionsOn(stepUrl(name))
    if (page.ids.length === 0) {
      check(`${name}: the step renders a form`, false, `status ${page.status}`)
      return null
    }
    const result = await broker.act(stepUrl(name), page.ids[0], {
      applicationId,
      ...fields,
    })
    if (expectOk) check(`${name} saved`, succeeded(result), `HTTP ${result.status}`)
    return result
  }

  await saveStep('capacity', {
    applicantCapacity: 'SOLE_TRADER',
    applicantNameAr: 'محمود عبد الرحمن حسن',
    applicantNameEn: 'Mahmoud Abdelrahman Hassan',
    applicantNationalId: '28001011201234',
    applicantNationality: 'مصري',
  })

  await saveStep('entity', {
    establishmentType: 'NATURAL_PERSON',
    legalForm: 'منشأة فردية',
    tradeNameAr: 'مؤسسة أصول التجريبية للوساطة العقارية',
    tradeNameEn: 'Osool Demonstration Real Estate Brokerage',
    tradeStyleAr: 'أصول',
    tradeStyleEn: 'Osool',
    headOfficeAddress: '١٢ شارع التجربة، المعادي، القاهرة',
    governorate: 'CAIRO',
    poBox: '11728',
    telephone: '0227351234',
    email: 'demo@osool.test',
    commercialRegisterNo: '123456',
    commercialRegisterOffice: 'القاهرة',
    commercialRegisterDate: '2022-03-15',
    commercialRegisterRenewalDate: '2027-03-15',
    taxRegistrationNo: '555-123-456',
    taxOffice: 'مأمورية ضرائب المعادي',
  })

  await saveStep('category', {
    requestedTypes: ['SELL', 'RENTAL'],
    requestedCategory: 'C',
    paidUpCapital: '250000',
  })

  // The refusal that proves the rules engine is doing work: category A needs
  // more paid-up capital than this file has.
  const overreach = await saveStep(
    'category',
    { requestedTypes: ['SELL'], requestedCategory: 'A', paidUpCapital: '250000' },
    { expectOk: false },
  )
  console.log(
    `        category A on 250,000 EGP: ${
      overreach && succeeded(overreach) ? 'accepted at this step (refused at submission)' : 'refused here'
    }`,
  )
  // Put the honest answer back.
  await saveStep('category', {
    requestedTypes: ['SELL', 'RENTAL'],
    requestedCategory: 'C',
    paidUpCapital: '250000',
  })

  await saveStep('contracts', {
    clientNameAr: 'شركة النور للاستثمار العقاري — بيانات تجريبية',
    clientNameEn: 'Al-Nour Real Estate Investment (DEMO)',
    clientNationality: 'مصري',
    authenticationBody: 'REAL_ESTATE_PUBLICITY',
    authenticationNumber: '2026/1234',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    capacityActedIn: 'SELL',
    contractValue: '1500000',
    subjectDescription: 'بيانات تجريبية — وساطة في بيع وحدة سكنية بمساحة ١٢٠ م٢',
    subjectAddress: '١٢ شارع التجربة، المعادي، القاهرة',
    governorate: 'CAIRO',
  })

  const contracts = await q(
    `select count(*)::int n from application_contract_data where "applicationId" = $1 and "archivedAt" is null`,
    applicationId,
  )
  check('the contract reached the database', (contracts[0]?.n ?? 0) >= 1, `${contracts[0]?.n} rows`)

  // A refused save must say so. This is the defect the whole exercise started
  // from: letters in a reference field, refused server-side, reported nowhere.
  const refusedContract = await saveStep(
    'contracts',
    {
      clientNameAr: 'Latin only, which this field refuses',
      clientNameEn: 'Al-Nour Real Estate Investment (DEMO)',
      clientNationality: 'مصري',
      authenticationBody: 'REAL_ESTATE_PUBLICITY',
      authenticationNumber: 'DEMO-RP-2026-0001',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      capacityActedIn: 'SELL',
      subjectDescription: 'x',
      subjectAddress: 'y',
    },
    { expectOk: false },
  )
  check(
    'a bad contract is refused, naming both faulty fields',
    /needsArabic/.test(refusedContract?.text ?? '') &&
      /referenceFormat/.test(refusedContract?.text ?? ''),
    'the field-error keys were not returned',
  )

  // ── 3. Documents ─────────────────────────────────────────────────────────
  step('3. Broker — upload the demonstration documents')

  const files = existsSync(DEMO_DIR) ? await readdir(DEMO_DIR) : []
  check('demonstration documents exist on disk', files.length > 0, 'run scripts/demo-documents.ts')

  const checklist = await q(
    `select ri.key from rule_item ri join rule_set rs on rs.id = ri."ruleSetId"
     where rs.code = 'DOC_CHECKLIST' and rs."archivedAt" is null
       and (ri.payload->'appliesTo') ? 'NATURAL_PERSON'
       and (ri.payload->>'mandatory')::boolean = true
     order by ri.position`,
  )

  let uploaded = 0
  for (const { key } of checklist) {
    const file = join(DEMO_DIR, `DEMO-${key}.pdf`)
    if (!existsSync(file)) continue

    const body = new FormData()
    body.append('file', new Blob([await readFile(file)], { type: 'application/pdf' }), `DEMO-${key}.pdf`)
    body.append('checklistItemKey', key)

    const response = await broker.fetch(`/api/applications/${applicationId}/documents`, {
      method: 'POST',
      body,
    })
    if (response.ok) uploaded++
    else console.log(`        ${key}: HTTP ${response.status}`)
  }
  check(
    `every required document uploaded (${uploaded}/${checklist.length})`,
    uploaded === checklist.length,
  )

  const stored = await q(
    `select count(*)::int n, count(distinct sha256)::int distinct_hashes
     from document where "applicationId" = $1`,
    applicationId,
  )
  check('documents are recorded against the application', (stored[0]?.n ?? 0) >= uploaded)

  // ── 4. Declarations and submission ───────────────────────────────────────
  step('4. Broker — declarations and submission')

  const declarations = await q(
    `select ri.key from rule_item ri join rule_set rs on rs.id = ri."ruleSetId"
     where rs.code = 'DECLARATIONS' and rs."archivedAt" is null order by ri.position`,
  )

  const declPage = await broker.actionsOn(stepUrl('declarations'))
  const declAction = declPage.ids[0]
  let affirmed = 0
  for (const { key } of declarations) {
    const response = await broker.fetch(stepUrl('declarations'), {
      method: 'POST',
      headers: { 'next-action': declAction, 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify([{ applicationId, declarationKey: key, affirmed: true }]),
    })
    if (/"ok"\s*:\s*true/.test(await response.text())) affirmed++
  }
  check(`all declarations affirmed (${affirmed}/${declarations.length})`, affirmed === declarations.length)

  const review = await broker.actionsOn(stepUrl('review'))
  check('the review step renders', review.status === 200)

  let submitted = null
  for (const id of review.ids) {
    const result = await broker.act(stepUrl('review'), id, { applicationId })
    if (succeeded(result)) {
      submitted = result
      break
    }
  }
  check('the application was submitted', Boolean(submitted))

  let state = await statusOf(applicationId)
  check('status is SUBMITTED', state?.status === 'SUBMITTED', `status is ${state?.status}`)

  // ── 5. Segregation of duties, before anyone touches the file ─────────────
  step('5. Authorisation — who may not do what')

  const examiner = await new Client('examiner').signIn('examiner@osool.test')
  const reviewer = await new Client('reviewer').signIn('reviewer2@osool.test')
  const clerk = await new Client('clerk').signIn('clerk@osool.test')
  const issuer = await new Client('issuer').signIn('issuer@osool.test')
  const admin = await new Client('admin').signIn('mahmoud.fawzy@osool.gov.eg')

  const refusals = [
    ['a broker cannot open the intake queue', broker, '/en/intake'],
    ['a broker cannot open the examination queue', broker, '/en/examination'],
    ['an examiner cannot open the review queue', examiner, '/en/review'],
    ['a reviewer cannot open the intake queue', reviewer, '/en/intake'],
    ['a clerk cannot open the issuance queue', clerk, '/en/issuance'],
    ['the system administrator cannot open a case file', admin, `/en/applications/${applicationId}`],
    ['the system administrator cannot open the audit trail', admin, '/en/audit'],
  ]

  for (const [label, client, path] of refusals) {
    const response = await client.fetch(path)
    const body = await response.text()
    // A refusal is a rendered four-part notice, not a stack trace: the page
    // returns 200 and says no. What must never appear is the queue itself.
    const refused = /Access refused|الوصول مرفوض|not permitted|غير مصرح|Page not found|لم يُعثر/i.test(body)
    check(label, refused || response.status === 404 || response.status >= 400, `HTTP ${response.status}`)
  }

  // IDOR: another firm's file, by id.
  const otherApp = (
    await q(
      `select a.id from application a
       join "user" u on u."brokerEntityId" = a."brokerEntityId"
       where u.email = 'broker@osool.test' limit 1`,
    )
  )[0]?.id
  if (otherApp) {
    const response = await broker.fetch(`/en/application/${otherApp}/capacity`)
    const body = await response.text()
    check(
      "another firm's application is not reachable by changing the id",
      /Page not found|لم يُعثر/i.test(body) || response.status === 404,
      `HTTP ${response.status}`,
    )
  }

  const anonymous = await fetch(new URL(`/en/application/${applicationId}/capacity`, BASE), {
    redirect: 'manual',
  })
  check(
    'a signed-out visitor cannot open an application',
    anonymous.status >= 300 || /Sign in|تسجيل الدخول/i.test(await anonymous.text()),
    `HTTP ${anonymous.status}`,
  )

  // ── 6. Intake ────────────────────────────────────────────────────────────
  step('6. Registry clerk — book the file in and assign it')

  const intake = await clerk.actionsOn('/en/intake')
  check('the intake queue renders for the clerk', intake.status === 200 && intake.ids.length > 0)

  const casePath = `/en/applications/${applicationId}`
  const caseForClerk = await clerk.actionsOn(casePath)
  let booked = false
  for (const id of caseForClerk.ids) {
    const result = await clerk.act(casePath, id, { applicationId, pageCount: '24' })
    if (succeeded(result)) {
      booked = true
      break
    }
  }
  check('the clerk booked the file in', booked)

  state = await statusOf(applicationId)
  check('status is UNDER_INTAKE', state?.status === 'UNDER_INTAKE', `status is ${state?.status}`)
  check(
    'a temporary application number was allocated',
    Boolean(state?.temporaryNumber),
    'no number',
  )
  console.log(`        reference ${state?.temporaryNumber}`)

  const examinerRow = (
    await q(`select id from "user" where email = 'examiner@osool.test' limit 1`)
  )[0]
  const caseAgain = await clerk.actionsOn(casePath)
  let assigned = false
  for (const id of caseAgain.ids) {
    const result = await clerk.act(casePath, id, { applicationId, examinerId: examinerRow?.id })
    if (succeeded(result)) {
      assigned = true
      break
    }
  }
  check('the clerk assigned an examiner', assigned)

  state = await statusOf(applicationId)
  check('status is UNDER_EXAMINATION', state?.status === 'UNDER_EXAMINATION', `status is ${state?.status}`)

  // ── 7. Examination and a completion request ──────────────────────────────
  step('7. Examiner — request a completion')

  const caseForExaminer = await examiner.actionsOn(casePath)
  check('the examiner can open the case file', caseForExaminer.status === 200)

  let requested = false
  for (const id of caseForExaminer.ids) {
    const result = await examiner.act(casePath, id, {
      applicationId,
      items: JSON.stringify([
        {
          checklistItemKey: 'PREMISES_PROOF',
          descriptionAr: 'صورة عقد الإيجار غير واضحة — يرجى إعادة رفعها بجودة أعلى.',
          descriptionEn: 'The lease copy is not legible. Please upload it again more clearly.',
        },
      ]),
    })
    if (succeeded(result)) {
      requested = true
      break
    }
  }
  check('the examiner raised a completion request', requested)

  state = await statusOf(applicationId)
  check('status is AWAITING_COMPLETION', state?.status === 'AWAITING_COMPLETION', `status is ${state?.status}`)

  const completions = await q(
    `select id, status, "descriptionAr", "checklistItemKey" from completion where "applicationId" = $1`,
    applicationId,
  )
  check('the completion is itemised in the database', completions.length >= 1)

  // ── 8. The broker answers ────────────────────────────────────────────────
  step('8. Broker — answer the completion and resubmit')

  const brokerSeesIt = await broker.fetch(stepUrl('review'))
  const brokerBody = await brokerSeesIt.text()
  check(
    'the broker is shown the completion request',
    /غير واضحة|not legible|Completion|استيفاء/i.test(brokerBody),
    'the request is not on the broker screen',
  )

  const premises = join(DEMO_DIR, 'DEMO-PREMISES_PROOF.pdf')
  if (existsSync(premises)) {
    const body = new FormData()
    body.append(
      'file',
      new Blob([await readFile(premises)], { type: 'application/pdf' }),
      'DEMO-PREMISES_PROOF-v2.pdf',
    )
    body.append('checklistItemKey', 'PREMISES_PROOF')
    const response = await broker.fetch(`/api/applications/${applicationId}/documents`, {
      method: 'POST',
      body,
    })
    check('the broker replaced the document', response.ok, `HTTP ${response.status}`)

    const versions = await q(
      `select count(*)::int n from document where "applicationId" = $1 and "checklistItemKey" = 'PREMISES_PROOF'`,
      applicationId,
    )
    check(
      'the replaced document was superseded, not overwritten',
      (versions[0]?.n ?? 0) >= 2,
      `${versions[0]?.n} versions`,
    )
  }

  const reviewAgain = await broker.actionsOn(stepUrl('review'))
  let resubmitted = false
  for (const id of reviewAgain.ids) {
    const result = await broker.act(stepUrl('review'), id, { applicationId })
    if (succeeded(result)) {
      resubmitted = true
      break
    }
  }
  check('the broker resubmitted', resubmitted)

  state = await statusOf(applicationId)
  check(
    'the file went back to examination',
    state?.status === 'UNDER_EXAMINATION',
    `status is ${state?.status}`,
  )

  // ── 9. The examiner recommends ───────────────────────────────────────────
  step('9. Examiner — verify the lines and recommend')

  const formLines = await q(
    `select ri.key from rule_item ri join rule_set rs on rs.id = ri."ruleSetId"
     where rs.code = 'EXAMINATION_FORM' and rs."archivedAt" is null order by ri.position`,
  )

  const caseToSign = await examiner.actionsOn(casePath)
  let recommended = false
  for (const id of caseToSign.ids) {
    const result = await examiner.act(casePath, id, {
      applicationId,
      originalCount: '1',
      copyCount: '2',
      brokerageNature: ['SELL', 'RENTAL'],
      proposedValidFrom: '2026-09-01',
      proposedValidTo: '2029-08-31',
      recommendation: 'RECOMMEND_APPROVAL',
      examinerNote: 'بيانات تجريبية — استُوفيت جميع البنود.',
      verifiedFieldKeys: formLines.map((l) => l.key),
    })
    if (succeeded(result)) {
      recommended = true
      break
    }
  }
  check('the examiner signed and referred the file', recommended)

  state = await statusOf(applicationId)
  check('status is UNDER_REVIEW', state?.status === 'UNDER_REVIEW', `status is ${state?.status}`)

  // The control that matters: the same person must not decide it.
  const selfReview = await examiner.actionsOn(casePath)
  let examinerCouldDecide = false
  for (const id of selfReview.ids) {
    const result = await examiner.act(casePath, id, {
      applicationId,
      decision: 'APPROVE',
      note: 'attempting to approve my own examination',
    })
    if (succeeded(result)) examinerCouldDecide = true
  }
  check(
    'the examiner cannot decide the file they examined',
    !examinerCouldDecide,
    'SEGREGATION OF DUTIES BREACHED',
  )

  state = await statusOf(applicationId)
  check('the file is still awaiting review', state?.status === 'UNDER_REVIEW', `status is ${state?.status}`)

  // ── 10. A different reviewer decides ─────────────────────────────────────
  step('10. Reviewer — approve')

  const caseForReviewer = await reviewer.actionsOn(casePath)
  check('a different reviewer can open the case', caseForReviewer.status === 200)

  let approved = false
  for (const id of caseForReviewer.ids) {
    const result = await reviewer.act(casePath, id, {
      applicationId,
      decision: 'APPROVE',
      note: 'بيانات تجريبية — الطلب مستوفٍ للشروط.',
    })
    if (succeeded(result)) {
      approved = true
      break
    }
  }
  check('the reviewer approved', approved)

  state = await statusOf(applicationId)
  check('status is APPROVED', state?.status === 'APPROVED', `status is ${state?.status}`)
  check(
    'the examiner and the reviewer are different people',
    state?.examinerId && state?.reviewerId && state.examinerId !== state.reviewerId,
    `${state?.examinerId} vs ${state?.reviewerId}`,
  )

  // ── 11. Fees, card, delivery ─────────────────────────────────────────────
  step('11. Card issuer — fees, card, delivery')

  const feeHeads = await q(
    `select ri.key from rule_item ri join rule_set rs on rs.id = ri."ruleSetId"
     where rs.code = 'FEE_HEADINGS' and rs."archivedAt" is null order by ri.position limit 3`,
  )

  const caseForIssuer = await issuer.actionsOn(casePath)
  check('the issuance screen renders for the card issuer', caseForIssuer.status === 200)

  let feesRecorded = false
  for (const id of caseForIssuer.ids) {
    const result = await issuer.act(casePath, id, {
      applicationId,
      paymentMethod: 'CASH',
      receiptNumber: '2026/00042',
      lines: JSON.stringify(feeHeads.map((h, i) => ({ feeKey: h.key, amount: String(100 * (i + 1)) }))),
    })
    if (succeeded(result)) {
      feesRecorded = true
      break
    }
  }
  check('fees were recorded', feesRecorded)

  state = await statusOf(applicationId)
  check('status is AWAITING_PAYMENT', state?.status === 'AWAITING_PAYMENT', `status is ${state?.status}`)

  const caseForCard = await issuer.actionsOn(casePath)
  let cardIssued = false
  for (const id of caseForCard.ids) {
    const result = await issuer.act(casePath, id, { applicationId })
    if (succeeded(result)) {
      cardIssued = true
      break
    }
  }
  check('the card was issued', cardIssued)

  state = await statusOf(applicationId)
  check('status is CARD_ISSUED', state?.status === 'CARD_ISSUED', `status is ${state?.status}`)

  const registration = await q(
    `select r."registrationNumber", ci."documentId"
     from registration r left join card_issuance ci on ci."registrationId" = r.id
     where r."brokerEntityId" = (select "brokerEntityId" from application where id = $1)
     order by r."createdAt" desc limit 1`,
    applicationId,
  )
  check('a permanent registration number was issued', Boolean(registration[0]?.registrationNumber))
  check('the card PDF was stored', Boolean(registration[0]?.documentId))
  console.log(`        registration ${registration[0]?.registrationNumber}`)

  const caseForDelivery = await issuer.actionsOn(casePath)
  let delivered = false
  for (const id of caseForDelivery.ids) {
    const result = await issuer.act(casePath, id, {
      applicationId,
      deliveredToName: 'محمود عبد الرحمن حسن',
      renewalDateAcknowledged: 'on',
      registrationNumberObligationAcknowledged: 'on',
    })
    if (succeeded(result)) {
      delivered = true
      break
    }
  }
  check('delivery was recorded', delivered)

  state = await statusOf(applicationId)
  check('status is ACTIVE', state?.status === 'ACTIVE', `status is ${state?.status}`)

  // ── 12. What the broker sees at the end ──────────────────────────────────
  step('12. Broker — the result')

  const registrationPage = await broker.fetch('/en/registration')
  const registrationBody = await registrationPage.text()
  check(
    'the broker can see their issued registration',
    registrationPage.status === 200 &&
      Boolean(registration[0]?.registrationNumber) &&
      registrationBody.includes(registration[0].registrationNumber),
    'the number is not on the page',
  )

  if (registration[0]?.registrationNumber) {
    const publicLookup = await fetch(
      new URL(`/en/verify/${encodeURIComponent(registration[0].registrationNumber)}`, BASE),
    )
    check('the public register shows it', publicLookup.status === 200, `HTTP ${publicLookup.status}`)
  }

  // ── 13. The trail ────────────────────────────────────────────────────────
  step('13. Audit trail')

  const events = await q(
    `select action, "actorRole", "fromState", "toState" from audit_event
     where "entityId" = $1 order by seq`,
    applicationId,
  )
  console.log(`        ${events.length} events recorded for this application`)

  const expected = [
    'APPLICATION_STARTED',
    'APPLICATION_DRAFT_UPDATED',
    'DOCUMENT_UPLOADED',
    'DECLARATION_AFFIRMED',
  ]
  for (const action of expected) {
    check(`the trail records ${action}`, events.some((e) => e.action === action))
  }
  check(
    'the trail records a read, not only writes',
    (await q(`select count(*)::int n from audit_event where "entityId" = $1 and "accessType" = 'READ'`, applicationId))[0]
      ?.n > 0,
  )

  const transitions = events.filter((e) => e.toState).map((e) => e.toState)
  console.log(`        state path: ${['DRAFT', ...transitions].join(' → ')}`)

  const chain = await q(
    `select count(*)::int total,
            count(*) filter (where "previousHash" is null)::int roots
     from audit_event`,
  )
  check('the audit chain has exactly one root', (chain[0]?.roots ?? 0) === 1, `${chain[0]?.roots} roots`)

  // ── Result ───────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(72)}`)
  console.log(`  ${pass} passed, ${fail} failed`)
  if (failures.length > 0) {
    console.log('\n  Failures:')
    for (const f of failures) console.log(`    · ${f}`)
  }
  console.log(`\n  Application: ${applicationId}`)
  console.log(`  Reference:   ${state?.temporaryNumber ?? '—'}`)
  console.log(`  Registration:${registration[0]?.registrationNumber ?? ' —'}\n`)
}

main()
  .catch((error) => {
    console.error(`\n  The run stopped: ${error.message}\n`)
    process.exitCode = 1
  })
  .finally(async () => {
    if (db) await db.$disconnect()
    if (fail > 0) process.exitCode = 1
  })
