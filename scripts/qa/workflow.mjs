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
/** The administrator was provisioned separately and has its own password. */
const PASSWORDS = { 'mahmoud.fawzy@osool.gov.eg': 'MahmoudFawzy@123' }
const passwordFor = (email) => PASSWORDS[email] ?? PASSWORD
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
    /*
     * Better Auth rate-limits sign-in, and six officials signing in inside one
     * run trips it. Backing off rather than raising the limit is the right way
     * round: the limit is a control, and a harness that needed it relaxed would
     * be testing a system nobody deploys.
     */
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await this.fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: passwordFor(email) }),
      })

      if (response.status === 200 && this.cookies.size > 0) {
        this.email = email
        return this
      }

      if (response.status !== 429) {
        throw new Error(`${this.label}: sign-in failed for ${email} (${response.status})`)
      }
      await new Promise((resolve) => setTimeout(resolve, 12_000 * (attempt + 1)))
    }
    throw new Error(`${this.label}: still rate-limited signing in ${email}`)
  }

  /**
   * Read a page and pull out its forms, hidden action fields and all.
   *
   * React renders a set of `$ACTION_*` hidden inputs into every
   * `<form action={serverAction}>` — the reference, the action id, and the
   * bound arguments. Those inputs *are* the no-JavaScript submission path: a
   * browser with scripting disabled posts them back and Next resolves the
   * action from them.
   *
   * So this harness posts them back too, verbatim, rather than reconstructing
   * a `Next-Action` header. It is the more faithful of the two — it is the
   * path the progressive-enhancement guarantee in ActionForm's own
   * documentation promises — and it fails loudly if that path ever disappears
   * again, which it once did.
   */
  async actionsOn(path) {
    const response = await this.fetch(path)
    const html = await response.text()
    return { status: response.status, html, forms: parseForms(html) }
  }

  /**
   * Submit to an action id directly, synthesising the fields React would have
   * rendered had the form been on the page.
   *
   * Three of this product's forms are revealed by client state — the contracts
   * editor, the examiner's completions composer, the fee lines — so the server
   * never renders them and there is nothing to post back. Their actions still
   * exist, and they are still `useActionState` actions, which means they take
   * `(previousState, formData)`: posting the FormData under a bare
   * `Next-Action` header hands them the form as the *first* argument and they
   * refuse it. The `$ACTION_*` triple below is exactly what React writes into a
   * rendered form to carry that bound first argument, and reproducing it is
   * what makes these three reachable.
   */
  async actById(path, actionId, fields) {
    return this.act(
      path,
      {
        hidden: {
          $ACTION_REF_1: '',
          '$ACTION_1:0': JSON.stringify({ id: actionId, bound: '$@1' }),
          '$ACTION_1:1': '[null]',
        },
      },
      fields,
    )
  }

  /** Submit one of those forms, the way a browser with no JavaScript would. */
  async act(path, form, fields) {
    const body = new FormData()

    // A field given here *replaces* the hidden one the page rendered rather
    // than being appended beside it. `formData.get()` returns the first of two
    // entries with the same name, so appending both would silently post the
    // page's empty value and ignore ours — which is how a fee submission came
    // back "at least one fee line" while carrying five.
    const overridden = new Set(Object.keys(fields))
    for (const [name, value] of Object.entries(form.hidden)) {
      if (!overridden.has(name)) body.append(name, value)
    }
    for (const [name, value] of Object.entries(fields)) {
      if (Array.isArray(value)) for (const v of value) body.append(name, String(v))
      else if (value !== undefined && value !== null) body.append(name, String(value))
    }

    const response = await this.fetch(path, { method: 'POST', body })
    const text = await response.text()
    return { status: response.status, text }
  }
}

const decode = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/** Every `<form>` on the page, with its hidden inputs and its visible names. */
function parseForms(html) {
  const forms = []
  for (const match of html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)) {
    const inner = match[1]
    const hidden = {}
    const names = new Set()

    for (const input of inner.matchAll(/<input\b[^>]*>/g)) {
      const tag = input[0]
      const name = decode(tag.match(/\bname="([^"]*)"/)?.[1] ?? '')
      if (!name) continue
      names.add(name)
      if (/\btype="hidden"/.test(tag)) {
        hidden[name] = decode(tag.match(/\bvalue="([^"]*)"/)?.[1] ?? '')
      }
    }
    for (const el of inner.matchAll(/<(?:select|textarea)\b[^>]*\bname="([^"]*)"/g)) {
      names.add(decode(el[1]))
    }

    // A form with no action plumbing is not a Server Action form.
    if (!Object.keys(hidden).some((n) => n.startsWith('$ACTION'))) continue
    forms.push({ hidden, names: [...names] })
  }
  return forms
}

/**
 * The ids of Server Actions a page calls from client code.
 *
 * A form gets progressive enhancement and its action id in the HTML. An action
 * invoked from an onClick — "start a new application", each declaration —
 * cannot: there is no form to post, and the id lives only in the JavaScript
 * chunk as `createServerReference("<id>", …)`. Reading it out of the chunk is
 * how this harness reaches those, and it is the same string the browser uses.
 */
async function clientActionIds(client, path) {
  const response = await client.fetch(path)
  const html = await response.text()

  const chunks = [
    ...new Set([...html.matchAll(/"(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1])),
  ]
  const ids = new Set()

  for (const chunk of chunks) {
    const source = await (await fetch(new URL(chunk, BASE))).text()
    for (const match of source.matchAll(/createServerReference\)?\(\s*"([0-9a-f]{40,42})"/g)) {
      ids.add(match[1])
    }
  }
  return [...ids]
}

/** The form on a page that carries a given field — how each step is found. */
const formWith = (forms, ...fieldNames) =>
  forms.find((f) => fieldNames.every((n) => f.names.includes(n)))

/**
 * Did the action succeed?
 *
 * The response is a React flight payload, not JSON, so this reads it by shape —
 * and reads it strictly. `"ok":true` alone is not enough: a page's own data can
 * contain that pair, and a first attempt at this reported an examination as
 * signed while the file had not moved. A refusal or a validation failure names
 * itself, so their absence is the other half of the test.
 *
 * Every transition is confirmed against the database as well. This decides
 * whether to *report* the request as accepted; the database decides what
 * actually happened.
 */
const succeeded = (result) =>
  result.status === 200 &&
  /"ok"\s*:\s*true/.test(result.text) &&
  !/"kind"\s*:\s*"(validation|refused)"/.test(result.text)

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
  if (!db) {
    console.log('  Without the database this run cannot verify anything. Stopping.')
    return
  }

  // ── 1. The broker's draft ────────────────────────────────────────────────
  step('1. Broker — a draft application')

  const broker = await new Client('broker').signIn('nile@osool.test')
  check('broker signed in', Boolean(broker.email))

  /*
   * "Start a new application" is a button, not a form — the action is called
   * from an onClick — so it is reached the way the browser reaches it, through
   * the server reference in the page's own client chunk.
   */
  const openDraft = async () =>
    (
      await q(
        `select a.id from application a
         join "user" u on u."brokerEntityId" = a."brokerEntityId"
         where u.email = 'nile@osool.test' and a.status = 'DRAFT' and a."archivedAt" is null
         order by a."updatedAt" desc limit 1`,
      )
    )[0]?.id ?? null

  let applicationId = await openDraft()

  if (!applicationId) {
    const candidates = await clientActionIds(broker, '/en/application')
    for (const id of candidates) {
      const response = await broker.fetch('/en/application', {
        method: 'POST',
        headers: { 'next-action': id, 'content-type': 'text/plain;charset=UTF-8' },
        body: '[]',
      })
      if (/"applicationId"/.test(await response.text())) break
    }
    applicationId = await openDraft()
  }

  check('a draft application exists to work from', Boolean(applicationId))
  if (!applicationId) return
  console.log(`        application ${applicationId}`)

  /*
   * Pressing "start" twice used to create a second firm, leave the account
   * pointing at it, and strand the file the browser had been sent into. Both
   * halves of that are asserted: one draft, and no firm without an account.
   */
  const startAgain = await clientActionIds(broker, '/en/application')
  for (const id of startAgain) {
    await broker.fetch('/en/application', {
      method: 'POST',
      headers: { 'next-action': id, 'content-type': 'text/plain;charset=UTF-8' },
      body: '[]',
    })
  }
  check(
    'pressing start again returns the same draft, not a second one',
    (await openDraft()) === applicationId,
    'a second draft appeared',
  )

  const orphans = await q(
    `select count(*)::int n from broker_entity e
     where not exists (select 1 from "user" u where u."brokerEntityId" = e.id)`,
  )
  check('no firm was left without an account', (orphans[0]?.n ?? 0) === 0, `${orphans[0]?.n} orphaned`)

  const drafts = await q(
    `select count(*)::int n from application a
     join "user" u on u."brokerEntityId" = a."brokerEntityId"
     where u.email = 'nile@osool.test' and a.status = 'DRAFT' and a."archivedAt" is null`,
  )
  check('the broker has exactly one open draft', (drafts[0]?.n ?? 0) === 1, `${drafts[0]?.n} drafts`)

  // ── 2. The seven steps ───────────────────────────────────────────────────
  step('2. Broker — the wizard, step by step')

  const stepUrl = (s) => `/en/application/${applicationId}/${s}`

  /** Fill in a step by finding the form that carries a given field. */
  async function saveStep(name, marker, fields, { expectOk = true } = {}) {
    const page = await broker.actionsOn(stepUrl(name))
    const form = formWith(page.forms, marker)
    if (!form) {
      check(`${name}: the step renders its form`, false, `status ${page.status}, ${page.forms.length} forms`)
      return null
    }
    const result = await broker.act(stepUrl(name), form, fields)
    if (expectOk) check(`${name} saved`, succeeded(result), `HTTP ${result.status}`)
    return result
  }

  await saveStep('capacity', 'applicantNameAr', {
    applicantCapacity: 'SOLE_TRADER',
    applicantNameAr: 'محمود عبد الرحمن حسن',
    applicantNameEn: 'Mahmoud Abdelrahman Hassan',
    applicantNationalId: '28001011201234',
    applicantNationality: 'مصري',
  })

  await saveStep('entity', 'tradeNameAr', {
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

  await saveStep('category', 'paidUpCapital', {
    requestedTypes: ['SELL', 'RENTAL'],
    requestedCategory: 'C',
    paidUpCapital: '250000',
  })

  await saveStep('contracts', 'clientNameAr', {
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
    `select count(*)::int n from application_contract_data
     where "applicationId" = $1 and "archivedAt" is null`,
    applicationId,
  )
  check('the contract reached the database', (contracts[0]?.n ?? 0) >= 1, `${contracts[0]?.n} rows`)

  /*
   * The defect this whole exercise began with: a reference field that accepts
   * digits and separators only, refused server-side, and reported to the
   * applicant nowhere at all. Both faults must come back named.
   *
   * Asked of the entity step rather than the contracts step, because the
   * contracts form is revealed by client state once a contract exists and so is
   * not on the page for a form post to find. That is a real gap in that one
   * step's progressive enhancement; it is reported as a finding rather than
   * worked around silently.
   */
  const refusedStep = await saveStep(
    'entity',
    'tradeNameAr',
    {
      establishmentType: 'NATURAL_PERSON',
      legalForm: 'منشأة فردية',
      tradeNameAr: 'Latin only, which this field refuses',
      tradeNameEn: 'Osool Demonstration Real Estate Brokerage',
      tradeStyleAr: 'أصول',
      tradeStyleEn: 'Osool',
      headOfficeAddress: '١٢ شارع التجربة، المعادي، القاهرة',
      governorate: 'CAIRO',
      poBox: '11728',
      telephone: '0227351234',
      email: 'demo@osool.test',
      commercialRegisterNo: 'CR-DEMO-123456',
      commercialRegisterOffice: 'القاهرة',
      commercialRegisterDate: '2022-03-15',
      commercialRegisterRenewalDate: '2027-03-15',
      taxRegistrationNo: '555-123-456',
      taxOffice: 'مأمورية ضرائب المعادي',
    },
    { expectOk: false },
  )
  check(
    'a faulty step is refused, and both faults are named',
    /needsArabic/.test(refusedStep?.text ?? '') && /referenceFormat/.test(refusedStep?.text ?? ''),
    'the field-error keys did not come back',
  )

  // Put the honest values back after the deliberate refusal.
  await saveStep('entity', 'tradeNameAr', {
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
  check(`every required document uploaded (${uploaded}/${checklist.length})`, uploaded === checklist.length)

  const stored = await q(
    `select count(*)::int n, count(distinct sha256)::int hashes
     from document where "applicationId" = $1`,
    applicationId,
  )
  check('documents are recorded against the application', (stored[0]?.n ?? 0) >= uploaded)
  // Storage is content-addressed, so identical bytes *should* resolve to the
  // same hash. What matters is that every row carries one.
  const unhashed = await q(
    `select count(*)::int n from document where "applicationId" = $1 and (sha256 is null or sha256 = '')`,
    applicationId,
  )
  check('every stored document carries a content hash', (unhashed[0]?.n ?? 0) === 0)
  console.log(`        ${stored[0]?.n} document rows, ${stored[0]?.hashes} distinct hashes`)

  // ── 4. Declarations and submission ───────────────────────────────────────
  step('4. Broker — declarations and submission')

  const declarations = await q(
    `select ri.key from rule_item ri join rule_set rs on rs.id = ri."ruleSetId"
     where rs.code = 'DECLARATIONS' and rs."archivedAt" is null order by ri.position`,
  )

  /*
   * The declarations step calls its action directly rather than through a
   * form, so it is posted the way the browser's own client call posts it: a
   * JSON argument array with the Next-Action id. The id is read off the page
   * for the same reason the form ids are.
   */
  const candidates = await clientActionIds(broker, stepUrl('declarations'))
  console.log(`        ${candidates.length} client action references on the declarations step`)

  /** Which of them is setDeclarationAction? Ask, rather than guess. */
  let declActionId = null
  for (const id of candidates) {
    const response = await broker.fetch(stepUrl('declarations'), {
      method: 'POST',
      headers: { 'next-action': id, 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify([{ applicationId, declarationKey: declarations[0].key, affirmed: true }]),
    })
    if (/"ok"\s*:\s*true/.test(await response.text())) {
      declActionId = id
      break
    }
  }
  check('the declarations action is reachable', Boolean(declActionId))

  if (declActionId) {
    for (const { key } of declarations) {
      await broker.fetch(stepUrl('declarations'), {
        method: 'POST',
        headers: { 'next-action': declActionId, 'content-type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify([{ applicationId, declarationKey: key, affirmed: true }]),
      })
    }
  }

  const affirmedRows = await q(
    `select count(*)::int n from declaration where "applicationId" = $1 and affirmed = true`,
    applicationId,
  )
  check(
    `all declarations affirmed (${affirmedRows[0]?.n}/${declarations.length})`,
    (affirmedRows[0]?.n ?? 0) === declarations.length,
  )

  const review = await broker.actionsOn(stepUrl('review'))
  check('the review step renders', review.status === 200)

  const submitForm = review.forms.at(-1)
  const submitted = submitForm ? await broker.act(stepUrl('review'), submitForm, { applicationId }) : null
  check('the application was submitted', Boolean(submitted && succeeded(submitted)))

  let state = await statusOf(applicationId)
  check('status is SUBMITTED', state?.status === 'SUBMITTED', `status is ${state?.status}`)

  // ── 5. Authorisation ─────────────────────────────────────────────────────
  step('5. Authorisation — who may not do what')

  const clerk = await new Client('clerk').signIn('clerk@osool.test')
  const examiner = await new Client('examiner').signIn('examiner@osool.test')
  const reviewer = await new Client('reviewer').signIn('reviewer2@osool.test')
  const issuer = await new Client('issuer').signIn('issuer@osool.test')
  const admin = await new Client('admin').signIn('mahmoud.fawzy@osool.gov.eg')

  /*
   * Whether a screen opened is asked positively — does the page carry the
   * control that screen exists to offer — rather than by pattern-matching a
   * refusal. A regex over the whole body was answering "refused" for pages that
   * merely contained one of its words somewhere, which is a test that fails
   * safe in the wrong direction: it would have reported a leak as a refusal.
   */
  const marker = {
    intake: 'name="pageCount"',
    examination: 'name="recommendation"',
    review: 'name="decision"',
    issuance: 'name="receiptNumber"',
    accounts: 'name="role"',
  }
  const showsAny = (html) => Object.values(marker).some((m) => html.includes(m))

  const barred = [
    ['a broker cannot open the intake queue', broker, '/en/intake'],
    ['a broker cannot open the examination queue', broker, '/en/examination'],
    ['a broker cannot open the audit trail', broker, '/en/audit'],
    ['an examiner cannot open the review queue', examiner, '/en/review'],
    ['an examiner cannot open another examiner’s decision screen', examiner, `/en/review/${applicationId}`],
    ['an examiner cannot open the issuance queue', examiner, '/en/issuance'],
    ['a reviewer cannot open the intake queue', reviewer, '/en/intake'],
    ['a clerk cannot open the issuance queue', clerk, '/en/issuance'],
    ['a clerk cannot administer accounts', clerk, '/en/admin/users'],
    ['the system administrator cannot open a case file', admin, `/en/applications/${applicationId}`],
    ['the system administrator cannot open the audit trail', admin, '/en/audit'],
    ['the system administrator cannot open the intake queue', admin, '/en/intake'],
  ]

  for (const [label, client, path] of barred) {
    const response = await client.fetch(path)
    const body = await response.text()
    // Refused means: the screen's own controls are not on the page, and no
    // case data came with it. A 200 that renders a four-part refusal is the
    // designed answer here, so the status alone proves nothing either way.
    // Refused means the screen's own controls are absent and no case data
    // came with it. The application *id* is not case data — a refusal page may
    // legitimately echo the address that was asked for — so the test is for
    // the applicant's details, which only a permitted reader may see.
    check(
      label,
      response.status >= 400 ||
        (!showsAny(body) && !body.includes('مؤسسة أصول التجريبية للوساطة العقارية')),
      `HTTP ${response.status}`,
    )
  }

  const otherApp = (
    await q(
      `select a.id from application a join "user" u on u."brokerEntityId" = a."brokerEntityId"
       where u.email = 'broker@osool.test' limit 1`,
    )
  )[0]?.id
  if (otherApp) {
    const response = await broker.fetch(`/en/application/${otherApp}/capacity`)
    const body = await response.text()
    check(
      "another firm's application is not reachable by changing the id",
      response.status === 404 || !body.includes('name="applicantNationalId"'),
      `HTTP ${response.status}`,
    )
  }

  const anonymous = await fetch(new URL(`/en/application/${applicationId}/capacity`, BASE), {
    redirect: 'manual',
  })
  const anonymousBody = await anonymous.text()
  check(
    'a signed-out visitor cannot open an application',
    anonymous.status >= 300 || !anonymousBody.includes('name="applicantNationalId"'),
    `HTTP ${anonymous.status}`,
  )

  const anonymousDoc = await fetch(
    new URL(`/api/documents/${(await q(`select id from document where "applicationId" = $1 limit 1`, applicationId))[0]?.id}`, BASE),
    { redirect: 'manual' },
  )
  check(
    'a signed-out visitor cannot fetch a stored document',
    anonymousDoc.status === 401 || anonymousDoc.status === 403 || anonymousDoc.status >= 300,
    `HTTP ${anonymousDoc.status}`,
  )

  // ── 6. Intake ────────────────────────────────────────────────────────────
  step('6. Registry clerk — book the file in and assign it')

  const queue = await clerk.fetch('/en/intake')
  const queueBody = await queue.text()
  check('the intake queue renders for the clerk', queue.status === 200)
  check('the submitted file is in the clerk’s queue', queueBody.includes(applicationId), 'not listed')

  /*
   * The file has four addresses, and that is by design rather than by accident:
   * `/applications/[id]` is the case summary and the clerk's two actions,
   * `/examination/[id]` is the examiner's form, `/review/[id]` is the
   * reviewer's decision, and `/issuance/[id]` is fees, card and delivery. Each
   * is guarded to exactly one role, so "can this person open the screen" and
   * "may this person take this step" are the same question.
   */
  const casePath = `/en/applications/${applicationId}`
  const examinationPath = `/en/examination/${applicationId}`
  const reviewPath = `/en/review/${applicationId}`
  const issuancePath = `/en/issuance/${applicationId}`

  const intakePage = await clerk.actionsOn(casePath)
  const intakeForm = formWith(intakePage.forms, 'pageCount')
  const booked = intakeForm
    ? await clerk.act(casePath, intakeForm, { applicationId, pageCount: '24' })
    : null
  check('the clerk booked the file in', Boolean(booked && succeeded(booked)))

  state = await statusOf(applicationId)
  check('status is UNDER_INTAKE', state?.status === 'UNDER_INTAKE', `status is ${state?.status}`)
  check('a temporary application number was allocated', Boolean(state?.temporaryNumber), 'none')
  console.log(`        reference ${state?.temporaryNumber}`)

  const examinerRow = (await q(`select id from "user" where email = 'examiner@osool.test' limit 1`))[0]
  const assignPage = await clerk.actionsOn(casePath)
  const assignForm = formWith(assignPage.forms, 'examinerId')
  const assigned = assignForm
    ? await clerk.act(casePath, assignForm, { applicationId, examinerId: examinerRow?.id })
    : null
  check('the clerk assigned an examiner', Boolean(assigned && succeeded(assigned)))

  state = await statusOf(applicationId)
  check('status is UNDER_EXAMINATION', state?.status === 'UNDER_EXAMINATION', `status is ${state?.status}`)

  // ── 7. Examination and a completion request ──────────────────────────────
  step('7. Examiner — request a completion')

  const examinerCase = await examiner.actionsOn(examinationPath)
  check(
    'the examiner can open their case screen',
    examinerCase.status === 200 && examinerCase.html.includes(marker.examination),
    `HTTP ${examinerCase.status}`,
  )

  /*
   * The completions form appears only once the examiner has added an item in
   * the browser, so it is not in the server-rendered HTML and there is nothing
   * to post. Reached through the page's own client action reference instead —
   * the same route the browser takes. Worth recording as a finding: this step
   * and the contracts step are the two with no no-JavaScript path.
   */
  const items = JSON.stringify([
    {
      checklistItemKey: 'PREMISES_PROOF',
      descriptionAr: 'صورة عقد الإيجار غير واضحة — يرجى إعادة رفعها بجودة أعلى.',
      descriptionEn: 'The lease copy is not legible. Please upload it again more clearly.',
    },
  ])

  let requested = false
  for (const id of await clientActionIds(examiner, examinationPath)) {
    const result = await examiner.actById(examinationPath, id, { applicationId, items })
    if (succeeded(result)) {
      requested = true
      break
    }
  }
  check(
    'the examiner raised a completion request',
    requested || (await statusOf(applicationId))?.status === 'AWAITING_COMPLETION',
  )

  state = await statusOf(applicationId)
  check('status is AWAITING_COMPLETION', state?.status === 'AWAITING_COMPLETION', `status is ${state?.status}`)

  const completions = await q(
    `select id, status, "checklistItemKey" from completion where "applicationId" = $1`,
    applicationId,
  )
  check('the completion is itemised in the database', completions.length >= 1)
  check(
    'the completion cites a real checklist item',
    completions.every((c) => !c.checklistItemKey || checklist.some((k) => k.key === c.checklistItemKey)),
  )

  // ── 8. The broker answers ────────────────────────────────────────────────
  step('8. Broker — answer the completion and resubmit')

  const brokerView = await broker.fetch(stepUrl('review'))
  const brokerBody = await brokerView.text()
  check(
    'the broker is shown the completion request',
    /غير واضحة|not legible/i.test(brokerBody),
    'the request is not on the broker’s screen',
  )

  const premises = join(DEMO_DIR, 'DEMO-PREMISES_PROOF.pdf')
  if (existsSync(premises)) {
    const body = new FormData()
    const bytes = await readFile(premises)
    // A different byte sequence, so the content hash differs and the register
    // is genuinely holding two versions rather than one file twice.
    body.append(
      'file',
      new Blob([bytes, Buffer.from('\n% replaced for the completion request\n')], {
        type: 'application/pdf',
      }),
      'DEMO-PREMISES_PROOF-v2.pdf',
    )
    body.append('checklistItemKey', 'PREMISES_PROOF')
    const response = await broker.fetch(`/api/applications/${applicationId}/documents`, {
      method: 'POST',
      body,
    })
    check('the broker replaced the document', response.ok, `HTTP ${response.status}`)

    const versions = await q(
      `select count(*)::int n, max(version)::int top from document
       where "applicationId" = $1 and "checklistItemKey" = 'PREMISES_PROOF'`,
      applicationId,
    )
    check(
      'the replaced document was superseded, not overwritten',
      (versions[0]?.n ?? 0) >= 2 && (versions[0]?.top ?? 0) >= 2,
      `${versions[0]?.n} rows, highest version ${versions[0]?.top}`,
    )
  }

  const reviewAgain = await broker.actionsOn(stepUrl('review'))
  const resubmitForm = reviewAgain.forms.at(-1)
  const resubmitted = resubmitForm
    ? await broker.act(stepUrl('review'), resubmitForm, { applicationId })
    : null
  check('the broker resubmitted', Boolean(resubmitted && succeeded(resubmitted)))

  state = await statusOf(applicationId)
  check('the file went back to examination', state?.status === 'UNDER_EXAMINATION', `status is ${state?.status}`)

  // ── 9. The examiner recommends ───────────────────────────────────────────
  step('9. Examiner — verify the lines and recommend')

  const formLines = await q(
    `select ri.key from rule_item ri join rule_set rs on rs.id = ri."ruleSetId"
     where rs.code = 'EXAMINATION_FORM' and rs."archivedAt" is null order by ri.position`,
  )

  const signPage = await examiner.actionsOn(examinationPath)
  const signForm = formWith(signPage.forms, 'recommendation')
  const recommended = signForm
    ? await examiner.act(examinationPath, signForm, {
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
    : null
  check('the examiner signed the internal review form', Boolean(recommended && succeeded(recommended)))

  /*
   * Signing the form and referring the file are two separate acts, and the
   * second only becomes available once the first is done — which is right: the
   * form is the work, and "send to review" is the assertion that the work is
   * finished. The referral form carries nothing but the application id.
   */
  const referPage = await examiner.actionsOn(examinationPath)
  const referForm = referPage.forms.find((f) =>
    f.names.every((n) => n.startsWith('$ACTION') || n === 'applicationId'),
  )
  const referred = referForm
    ? await examiner.act(examinationPath, referForm, { applicationId })
    : null
  check('the examiner referred the file for review', Boolean(referred && succeeded(referred)))

  state = await statusOf(applicationId)
  check('status is UNDER_REVIEW', state?.status === 'UNDER_REVIEW', `status is ${state?.status}`)

  /*
   * The control the whole workflow exists to enforce: the person who examined
   * a file must not be the person who decides it. Tried, not assumed.
   */
  const selfDecide = await examiner.actionsOn(reviewPath)
  const decisionFormForExaminer = formWith(selfDecide.forms, 'decision')
  const examinerCouldDecide = decisionFormForExaminer
    ? succeeded(
        await examiner.act(reviewPath, decisionFormForExaminer, {
          applicationId,
          decision: 'APPROVE',
          note: 'attempting to approve my own examination',
        }),
      )
    : false
  check(
    'the examiner cannot decide the file they examined',
    !examinerCouldDecide,
    'SEGREGATION OF DUTIES BREACHED',
  )
  check(
    'the examiner is not even shown the reviewer’s screen',
    !decisionFormForExaminer && !selfDecide.html.includes(marker.review),
    'the decision form is rendered to them',
  )

  state = await statusOf(applicationId)
  check('the file is still awaiting review', state?.status === 'UNDER_REVIEW', `status is ${state?.status}`)

  // ── 10. A different reviewer decides ─────────────────────────────────────
  step('10. Reviewer — approve')

  const reviewerCase = await reviewer.actionsOn(reviewPath)
  check(
    'a different reviewer can open the case',
    reviewerCase.status === 200 && reviewerCase.html.includes(marker.review),
    `HTTP ${reviewerCase.status}`,
  )

  const decisionForm = formWith(reviewerCase.forms, 'decision')
  const approved = decisionForm
    ? await reviewer.act(reviewPath, decisionForm, {
        applicationId,
        decision: 'APPROVE',
        note: 'بيانات تجريبية — الطلب مستوفٍ للشروط.',
      })
    : null
  check('the reviewer approved', Boolean(approved && succeeded(approved)))

  state = await statusOf(applicationId)
  check('status is APPROVED', state?.status === 'APPROVED', `status is ${state?.status}`)
  check(
    'the examiner and the reviewer are different people',
    Boolean(state?.examinerId && state?.reviewerId && state.examinerId !== state.reviewerId),
    `${state?.examinerId} vs ${state?.reviewerId}`,
  )

  // ── 11. Fees, card, delivery ─────────────────────────────────────────────
  step('11. Card issuer — fees, card, delivery')

  const feeHeads = await q(
    `select ri.key from rule_item ri join rule_set rs on rs.id = ri."ruleSetId"
     where rs.code = 'FEE_SCHEDULE' and rs."archivedAt" is null
       and (ri.payload->>'mandatory')::boolean = true
     order by ri.position`,
  )

  const issuerCase = await issuer.actionsOn(issuancePath)
  check(
    'the issuance screen renders for the card issuer',
    issuerCase.status === 200 && issuerCase.html.includes(marker.issuance),
    `HTTP ${issuerCase.status}`,
  )

  /*
   * The fee form *is* rendered, but its `lines` hidden input is built from the
   * amounts typed into the table, so a server-rendered copy carries an empty
   * list. The visible fields come from the rendered form; the lines are
   * supplied here, which is what the browser's own re-render would have done.
   */
  const lines = JSON.stringify(
    feeHeads.map((h, i) => ({ feeKey: h.key, amount: String(100 * (i + 1)) })),
  )
  const feesForm = formWith(issuerCase.forms, 'receiptNumber')
  const feesRecorded = feesForm
    ? await issuer.act(issuancePath, feesForm, {
        applicationId,
        paymentMethod: 'CASH',
        receiptNumber: '2026/00042',
        lines,
      })
    : null
  check('fees were recorded', Boolean(feesRecorded && succeeded(feesRecorded)), feesRecorded ? '' : 'no fee form')

  state = await statusOf(applicationId)
  check('status is AWAITING_PAYMENT', state?.status === 'AWAITING_PAYMENT', `status is ${state?.status}`)

  const cardPage = await issuer.actionsOn(issuancePath)
  // The issue-card form has no fields of its own; it is the only one on the
  // page at this stage that carries nothing but the application id.
  const cardForm = cardPage.forms.find((f) => f.names.every((n) => n.startsWith('$ACTION') || n === 'applicationId'))
  const cardIssued = cardForm ? await issuer.act(issuancePath, cardForm, { applicationId }) : null
  check('the card was issued', Boolean(cardIssued && succeeded(cardIssued)))

  state = await statusOf(applicationId)
  check('status is CARD_ISSUED', state?.status === 'CARD_ISSUED', `status is ${state?.status}`)

  const registration = (
    await q(
      `select r."registrationNumber", r."validFrom", r."validTo", ci."documentId"
       from registration r left join card_issuance ci on ci."registrationId" = r.id
       where r."brokerEntityId" = (select "brokerEntityId" from application where id = $1)
       order by r."createdAt" desc limit 1`,
      applicationId,
    )
  )[0]
  check('a permanent registration number was issued', Boolean(registration?.registrationNumber))
  check('the card PDF was stored', Boolean(registration?.documentId))
  console.log(`        registration ${registration?.registrationNumber}`)

  const deliveryPage = await issuer.actionsOn(issuancePath)
  const deliveryForm = formWith(deliveryPage.forms, 'deliveredToName')
  const delivered = deliveryForm
    ? await issuer.act(issuancePath, deliveryForm, {
        applicationId,
        deliveredToName: 'محمود عبد الرحمن حسن',
        renewalDateAcknowledged: 'on',
        numberObligationAcknowledged: 'on',
      })
    : null
  check('delivery was recorded', Boolean(delivered && succeeded(delivered)))

  state = await statusOf(applicationId)
  check('status is ACTIVE', state?.status === 'ACTIVE', `status is ${state?.status}`)

  // ── 12. What the broker sees at the end ──────────────────────────────────
  step('12. Broker — the result')

  const registrationPage = await broker.fetch('/en/registration')
  const registrationBody = await registrationPage.text()
  check(
    'the broker can see their issued registration',
    registrationPage.status === 200 &&
      Boolean(registration?.registrationNumber) &&
      registrationBody.includes(registration.registrationNumber),
    'the number is not on the page',
  )
  check(
    'the card is offered for download',
    registrationBody.includes(`/api/documents/${registration?.documentId}`),
    'no download link',
  )

  if (registration?.registrationNumber) {
    const lookup = await fetch(
      new URL(`/en/verify/${encodeURIComponent(registration.registrationNumber)}`, BASE),
    )
    const lookupBody = await lookup.text()
    check('the public register shows it', lookup.status === 200 && lookupBody.includes(registration.registrationNumber))
    check(
      'the public register does not leak the applicant’s national ID',
      !lookupBody.includes('28001011201234'),
      'the number is on a public page',
    )
  }

  // ── 13. The trail ────────────────────────────────────────────────────────
  step('13. Audit trail')

  const events = await q(
    `select action, "actorRole", "accessType", "fromState", "toState" from audit_event
     where "entityId" = $1 order by seq`,
    applicationId,
  )
  console.log(`        ${events.length} events recorded for this application`)

  for (const action of ['APPLICATION_DRAFT_UPDATED', 'DECLARATION_AFFIRMED']) {
    check(`the trail records ${action}`, events.some((e) => e.action === action))
  }
  // Written against the Document, not the Application — which is right: the
  // entity the event is about is the document.
  const documentEvents = await q(
    `select action from audit_event
     where "entityType" = 'Document'
       and "entityId" in (select id from document where "applicationId" = $1)`,
    applicationId,
  )
  check(
    'the trail records each document, as an upload or as a supersession',
    documentEvents.some((e) => e.action === 'DOCUMENT_UPLOADED' || e.action === 'DOCUMENT_SUPERSEDED'),
    `${documentEvents.length} document events`,
  )
  check(
    'the trail records reads, not only writes',
    events.some((e) => e.accessType === 'READ'),
  )

  const path = ['DRAFT', ...events.filter((e) => e.toState).map((e) => e.toState)]
  console.log(`        ${path.join(' → ')}`)
  check('the file reached ACTIVE through the transition table', path.at(-1) === 'ACTIVE', path.at(-1))

  const chain = await q(
    `select count(*)::int total,
            count(*) filter (where "prevHash" = repeat('0', 64))::int roots
     from audit_event`,
  )
  check('the audit chain has exactly one root', (chain[0]?.roots ?? 0) === 1, `${chain[0]?.roots} roots`)
  console.log(`        ${chain[0]?.total} events in the chain overall`)

  // ── Result ───────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(72)}`)
  console.log(`  ${pass} passed, ${fail} failed`)
  if (failures.length > 0) {
    console.log('\n  Failures:')
    for (const f of failures) console.log(`    · ${f}`)
  }
  console.log(`\n  Application:  ${applicationId}`)
  console.log(`  Reference:    ${state?.temporaryNumber ?? '—'}`)
  console.log(`  Registration: ${registration?.registrationNumber ?? '—'}\n`)
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
