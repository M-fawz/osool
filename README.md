# Osool · أصول

The digital **Real Estate Brokers Register** (سجل الوسطاء العقاريين) for the Government of Egypt —
operated by **GOEIC** (الهيئة العامة للرقابة على الصادرات والواردات) under the **Ministry of
Investment and Foreign Trade**.

This is a regulator's system. Brokers are the supervised population; government officials are the
primary users. It is not a property marketplace and not a broker's tool.

**Status: Phase 1 (registration, end to end) complete.** A complete application travels from a
broker's phone to an issued registration card, with every hand it passed through named and
timestamped. See [docs/PHASE-1-REPORT.md](docs/PHASE-1-REPORT.md) and
[docs/04-BUILD-PLAN.md](docs/04-BUILD-PLAN.md).

---

## Running it from a cold machine

You need **Node 22.12 or later** and nothing else. Docker is optional — if you don't have it, the
setup script starts a self-contained PostgreSQL that npm has already downloaded.

```bash
npm install
npm run setup
```

`npm run setup` explains each step as it goes. It will:

1. check your Node version;
2. create `.env` from `.env.example` and generate real secrets into it (`.env` is gitignored and is
   never committed);
3. start PostgreSQL on `127.0.0.1:5433` — via Docker if you have it, otherwise a bundled copy;
4. create the schema, install the database guardrails, and seed the rule sets;
5. download Chromium, which is what renders Arabic correctly in generated PDFs.

Then, in two terminals:

```bash
# terminal 1 — the application
npm run dev

# terminal 2 — create the first administrator
npm run admin:create -- --email you@example.com --name "Your Name" --name-ar "اسمك"
```

The activation email is **really sent**. In development the provider is `console`, so the whole
message — including the activation link — is printed in the terminal running `npm run dev`. Open
that link, set a password, and sign in at <http://localhost:3000>.

Arabic is the default language and lives at `/`. English is a full mirror at `/en`.

### A faster way in, and a register with something in it

The route above is the real one and it is the one to test. It is also five steps, and it leaves you
looking at an empty register. One command gives you both the accounts and a demonstration register:

```bash
npm run seed:phase1
```

It creates the accounts below and then **walks fourteen applications through the real workflow** —
through the same functions the Server Actions call — so every file carries a genuine event trail
with real actors and timestamps, and no queue demonstrates empty.

| Address | Password | Role | What it is for |
|---|---|---|---|
| `mahmoud.fawzy@osool.gov.eg` | `MahmoudFawzy@123` | `SYSTEM_ADMIN` | Accounts. Refused all case data. |
| `broker@osool.test` | `DevOnly!Osool2026` | `BROKER_OWNER` | The portal. An empty draft — walk it end to end. |
| `delta@osool.test` | `DevOnly!Osool2026` | `BROKER_OWNER` | A complete draft requesting Category C on EGP 30,000 — the refusal. |
| `clerk@osool.test` | `DevOnly!Osool2026` | `REGISTRY_CLERK` | Intake — temporary numbers and assignment. |
| `examiner@osool.test` | `DevOnly!Osool2026` | `EXAMINER` | The examiner's screen. |
| `examiner2@osool.test` | `DevOnly!Osool2026` | `EXAMINER` | A second examiner, so files can be spread. |
| `reviewer@osool.test` | `DevOnly!Osool2026` | `REVIEWER` | The decision. |
| `reviewer2@osool.test` | `DevOnly!Osool2026` | `REVIEWER` | A second reviewer, so REQ-REG-052 has somewhere to send a file. |
| `issuer@osool.test` | `DevOnly!Osool2026` | `CARD_ISSUER` | Fees, the card, delivery. |
| `data@osool.test` | `DevOnly!Osool2026` | `DATA_MANAGER` | Data extraction, step 7. |
| `files@osool.test` | `DevOnly!Osool2026` | `FILES_HEAD` | Archiving, step 8. |
| `auditor@osool.test` | `DevOnly!Osool2026` | `AUDITOR` | The audit trail. |
| `aml@osool.test` | `DevOnly!Osool2026` | `AML_SUPERVISOR` | No queue yet — Phase 3. |

Twelve more broker accounts (`nile@`, `newcairo@`, `haramain@`, `mohandeseen@`, `zamalek@`,
`alex@`, `giza@`, `maadi@`, `shorouk@`, `aswan@`, `heliopolis@`, `october@`) hold the
applications at every other stage of REQ-REG-050. All use `DevOnly!Osool2026`.

> **These accounts must never exist in any real deployment.** `mahmoud.fawzy@osool.gov.eg` has its
> password set directly, bypassing the activation-email path every real government account must use,
> and `MahmoudFawzy@123` would not survive an afternoon. The seed refuses to run with
> `NODE_ENV=production` or against a non-local database — checked in code, not merely documented —
> but that is a guard, not a substitute for judgement. Before any deployment these accounts are
> removed and the register is seeded empty.

The seed is idempotent and resumable: re-running advances any file that is behind its intended stage
and leaves the rest untouched. Pass `--reset` to reset passwords on accounts that already exist.

`npm run dev:accounts` still exists and still works; it creates one bare account per role with no
register behind it.

### Trying it on a phone

The broker portal is the half of this product that is used on a phone, so test it on one:

```bash
ipconfig | findstr IPv4        # Windows — find your machine's address
```

Open `http://<your-ip>:3000` on a phone on the same Wi-Fi and sign in as `broker@osool.test`.
If anything about it is awkward one-handed, that is the finding that matters most.

### If something goes wrong

| Symptom | What to do |
|---|---|
| `Environment configuration is not valid` | `.env` is missing a value. Compare it with `.env.example`; re-running `npm run setup` fills in the secrets. |
| Setup says PostgreSQL did not come up | Run `npm run db:start` on its own to see the actual error. `npm run db:status` reports what's listening. |
| Port 5433 already in use | Something else is on that port. Stop it, or change `DATABASE_URL` and `docker-compose.yml` to another port. |
| `npm run dev` starts but pages 500 | The schema is probably not applied: `npx prisma migrate deploy`. |
| No activation email | With `EMAIL_PROVIDER=console` it is printed in the `npm run dev` terminal, not sent to an inbox. |

---

## Proving it works

Nothing in this project is reported as working on the strength of the code having been written.
Each of these runs against the real system and prints what it found.

```bash
npm run proof:phase1    # the Phase 1 proof point — the six proofs below
npm run proof:phase0    # the Phase 0 proof point, end to end over HTTP (needs `npm run dev`)
npm run proof:audit     # attacks the audit trail four ways, shows each one detected
npm run proof:rules     # the category/capital rule, and that it is versioned by date
npm run proof:pdf       # generates a registration card and checks the Arabic
npm run audit:verify    # verifies the hash chain over the whole trail
npm run audit:no-deletes # confirms by search that no destructive delete exists
```

`npm run proof:phase0` walks the Phase 0 proof point from
[docs/04-BUILD-PLAN.md](docs/04-BUILD-PLAN.md): an administrator creates an examiner account, the
examiner gets a real email, activates, signs in, and every step appears in the audit trail. It also
checks the things that would be embarrassing to get wrong — that a `SYSTEM_ADMIN` cannot see case
data, that the public sign-up endpoint cannot mint a privileged account, and that suspending someone
takes effect on their *next request* rather than at their next sign-in.

`npm run proof:pdf` writes `.proof/registration-card-ar.pdf` and a PNG of the same document. Open
the PNG: the automated checks cannot tell you whether Arabic letters are correctly joined, so a
human has to look.

`npm run proof:phase1` proves six things, and prints what it found rather than asserting silently:

1. a complete application travels from submission to an issued card — and prints **every hand it
   passed through**, named, with a role and a timestamp;
2. Category C on EGP 30,000 is refused — and prints **the exact Arabic the applicant reads**;
3. an official who examined a file cannot approve it even after being given the reviewer role, and a
   different reviewer can, without difficulty;
4. an incomplete application cannot be submitted, and is told precisely what is missing;
5. the audit chain verifies end to end, and `DELETE` is refused by the database on every table;
6. every route renders in Arabic RTL and English LTR — add `-- --routes` with `npm run dev`
   running.

Nothing in it asserts against a fixture: every proof drives the same functions the Server Actions
drive, against the real database.

```bash
npx tsx .proof/mobile-screens.ts   # screenshots all eight portal steps at 360px and 390px, and
                                   # fails on horizontal overflow or a target under 44px
```

---

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the application on <http://localhost:3000> |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm run ci` | Everything CI runs that needs no database: typecheck, lint, no-deletes, build |
| `npm run db:start` / `db:stop` / `db:status` | Control the local database |
| `npm run db:migrate` | Create and apply a migration after editing the schema |
| `npm run db:deploy` | Apply pending migrations to a deployed database. Additive; never resets |
| `npm run db:seed` | Re-seed transitions and rule sets (idempotent, never deletes) |
| `npm run db:studio` | Browse the database in a GUI |
| `npm run admin:create` | Create the first `SYSTEM_ADMIN` |
| `npm run seed:phase1` | Seed the accounts **and** a demonstration register at every workflow stage |
| `npm run proof:phase1` | The six Phase 1 proofs |
| `npm run dev:accounts` | Seed one bare development account per role (never runs in production) |
| `node .claude/skills/impeccable/scripts/detect.mjs src/` | Scan the UI for design-system drift and anti-patterns |

---

## The design system

`DESIGN.md` at the root is the visual contract, and `.impeccable/design.json` is its machine-readable
sidecar. Between them they carry the palette, the type ramp, the radius scale, and the named rules —
the isolated-run rule, the redundant-signal rule, the logical-only rule — that later phases have to
keep. The detector in the table above reads both files and fails on drift, so a hard-coded colour or
an off-ramp font size is caught at review time rather than at design review.

The component set lives in `src/components/ui/`. Import from `primitives.tsx`; the siblings beside
it are implementation.

---

## How this is put together

Frontend, backend, and database are **one project**. There is no separate API server.

```
src/
├── app/
│   ├── [locale]/          Arabic at /, English at /en
│   │   ├── page.tsx       public landing + verification entry
│   │   ├── login/         sign-in
│   │   ├── activate/      set your own password from an emailed link
│   │   ├── dashboard/      
│   │   ├── admin/users/   SYSTEM_ADMIN only — provisioning
│   │   └── audit/         the hash-chained trail
│   └── api/auth/          Better Auth's HTTP surface
├── lib/
│   ├── applications/      the state machine, completeness, numbering, REQ-REG-050
│   ├── audit/             append-only, hash-chained events + verifyChain()
│   ├── auth/              sessions, roles, guards, provisioning
│   ├── rules/             the versioned rules engine
│   ├── storage/           content-addressed, immutable uploads
│   ├── pdf/               Arabic-correct PDF rendering
│   ├── email/             real transactional email
│   ├── crypto/            AES-GCM for identifying data, keyed HMAC for duplicates
│   ├── reference/         bilingual reference tables (governorates, capacities)
│   ├── validation/        Zod schemas, server-authoritative
│   ├── db.ts  env.ts  cn.ts
├── components/
│   ├── ui/                base components, incl. the bidi primitives
│   └── layout/
├── i18n/
prisma/
├── schema.prisma          the system, in one file — read this first
├── migrations/            includes the guardrails; see below
├── rule-sets/             seed content for the versioned rules
└── seed.ts
```

### If you read one file, read `prisma/schema.prisma`

It is the system. Every model carries a comment explaining why it exists in the shape it does, and
which `REQ-*` requirement it serves.

### Six things worth knowing before you change anything

**1. Rules run on the server.** Authorisation, validation, and every regulatory rule execute in
Server Actions or Server Components. A rule enforced only in the browser does not exist — anyone can
bypass it with one `curl`. The predecessor system failed exactly here.

**2. Nothing is ever deleted.** Not by the application, and not by you with a `psql` session either:
the database has `BEFORE DELETE` and `BEFORE TRUNCATE` triggers on every table of record that raise
an exception. Archive, retention-lock, or place a legal hold instead. The only rows this product
deletes are `session` and `verification` — ephemeral credentials, not records — and the fact of them
is written to the audit trail first.

**3. Thresholds are data, not constants.** Category bands, capital floors, document checklists,
declaration wording, retention periods: all in `rule_set` / `rule_item` with effective dates. Every
lookup is as-of a date, so a decision taken in March stays explainable against March's rules after a
decree amends them in October. The seed content lives under `prisma/rule-sets/`, deliberately
outside `src/` so no runtime code can read a threshold from a TypeScript constant.

**4. Every state change is an audit event.** Append-only and hash-chained: each row folds the
previous row's hash into its own, so altering history breaks the chain and `verifyChain()` says
where. Reads are audited too, not only writes.

**5. Segregation of duties is code.** The examiner and reviewer of one application must be different
people — a `CHECK` constraint in the database and a check in the action. `SYSTEM_ADMIN` manages
accounts and can see no case data at all.

**6. Arabic first, RTL first.** English is a full mirror. Numerals, dates, and reference numbers stay
left-to-right inside right-to-left text — use the `<Ltr>`, `<RefNumber>`, `<Stamp>` and `<Money>`
components in `src/components/ui/bidi.tsx` rather than solving it again. Everything positional uses
CSS logical properties, so one stylesheet serves both directions.

---

## Deploying it · النشر

Full guide, in Arabic and English: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. The short version.

### ما يحدث عند الدفع إلى main

```
git add .
git commit -m "…"
git push origin main
```

ثم، بلا أي خطوة يدوية:

```
GitHub (main)  →  Vercel يلتقط الدفعة  →  npm ci  →  prisma generate
                                              ↓
                                    prisma migrate deploy   (الإنتاج فقط، إضافي لا يحذف)
                                              ↓
                                          next build
                                              ↓
                  نجح: الموقع يُحدَّث   ·   فشل: الإصدار السابق يبقى يعمل كما هو
```

**إن فشل البناء لا يتأثر الإنتاج إطلاقاً.** السبب يُقرأ في
Vercel → المشروع → Deployments → آخر عملية → Build Logs.

### Before the first deployment

Six things, once. All of them are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) with the reasons:

1. a PostgreSQL for production, and a **separate** one for previews;
2. a private S3-compatible bucket for documents;
3. a Resend key and a verified sending domain;
4. import the repository as a Vercel project — `vercel.json` carries the build configuration, so
   nothing needs setting in the dashboard except the variables;
5. the environment variables, per environment — the table is in the deployment guide, and no value
   belongs in this repository;
6. `npm run admin:create` against production, to create the first real `SYSTEM_ADMIN`.

The development accounts listed above **cannot** reach a deployment: both seed scripts refuse a
non-local database and refuse `NODE_ENV=production`, in code rather than in a comment.

### Two commands, and the difference between them

| Command | Runs where | What it produces |
|---|---|---|
| `npm run build` | laptop, container, CI | `next build`, plus `.next/standalone` — a plain Node server, no host assumed |
| `npm run vercel-build` | Vercel | checks the configuration, generates the Prisma client, migrates production, then builds |

`npm` prefers `vercel-build` over `build` where it exists, which is how the hosted path stays out of
the container path. 02-SYSTEM-ARCHITECTURE §10 decision 1 — host-agnostic on purpose.

### CI

`.github/workflows/ci.yml` runs on every push and pull request: types, lint, the no-deletes control,
a production build, and — against a throwaway PostgreSQL — the migrations, the seed's idempotence,
the audit chain, and the tamper-detection proof. **It does not deploy.** Vercel does that, and two
systems publishing the same commit is how a pipeline stops being trusted.

---

## The documents that govern this

| Read | When |
|---|---|
| [docs/00-VISION-AND-SOLUTION.md](docs/00-VISION-AND-SOLUTION.md) | First, always |
| [docs/01-LEGAL-REFERENCE.md](docs/01-LEGAL-REFERENCE.md) | Any rule, threshold, deadline, or citation |
| [docs/02-SYSTEM-ARCHITECTURE.md](docs/02-SYSTEM-ARCHITECTURE.md) | Any architectural or data decision |
| [docs/03-DESIGN-DIRECTION.md](docs/03-DESIGN-DIRECTION.md) + [PRODUCT.md](PRODUCT.md) | Any UI work |
| [docs/04-BUILD-PLAN.md](docs/04-BUILD-PLAN.md) | Phases and their proof points |
| [docs/PHASE-1-REPORT.md](docs/PHASE-1-REPORT.md) | What Phase 1 built, decided, and left |
| [docs/USER-GUIDE-AR.md](docs/USER-GUIDE-AR.md) | دليل الاستخدام — one section per role, in Arabic |
| [docs/DEMO-SCRIPT.md](docs/DEMO-SCRIPT.md) | A ten-minute walkthrough for a government stakeholder |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | النشر — GitHub → Vercel, environment variables, migrations |

`docs/01-LEGAL-REFERENCE.md` is the source of truth for every rule in the system. When counsel
confirms or corrects something, that file is updated **first**, then the code. Every enforcement
point in the codebase cites a `REQ-*` ID from it.

Requirements marked `[NEEDS COUNSEL]` may warn and flag for human review. They never block a user
action until a lawyer has cleared them — `applyCounselGate()` in `src/lib/rules/violation.ts`
enforces that in one place so no evaluator can forget.

---

## Stack

Next.js 15 (App Router, TypeScript) · PostgreSQL · Prisma · Zod · Better Auth · Tailwind CSS v4 ·
next-intl · Chromium for PDF · S3-compatible object storage in production, local disk in development.

Host-agnostic on purpose: no Vercel-only primitive is used, because a government deployment may
require in-country hosting. `npm run build` produces a self-contained Node server in
`.next/standalone` that runs in any container; the Vercel path is additive and lives in one script
and one config file. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
