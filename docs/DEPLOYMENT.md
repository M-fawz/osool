# النشر — Deployment

> دليل النشر على Vercel عبر GitHub. الجزء العربي أولاً، ثم المرجع الكامل بالإنجليزية.

`02-SYSTEM-ARCHITECTURE.md` §10 قرار 1 يترك اختيار الاستضافة مفتوحاً: **Vercel، أو حاوية على
خادم حكومي معتمد.** هذا الملف يشرح المسار الأول. المسار الثاني لم يُلغَ ولم يُكسر — `npm run build`
ما زال يُنتج خادم Node قائماً بذاته في `.next/standalone`، ولا يوجد في المشروع أي شيء خاص بـ Vercel
لا يعمل بدونه.

---

## بالعربية — الخلاصة

### ماذا يحدث عندما تكتب `git push origin main`

```
جهازك  →  GitHub (فرع main)  →  Vercel يلتقط الدفعة تلقائياً
                                        ↓
                              npm ci  (تثبيت الحزم)
                                        ↓
                              prisma generate
                                        ↓
                              prisma migrate deploy   ← الإنتاج فقط
                                        ↓
                              next build
                                        ↓
                       إن نجح: الموقع يُحدَّث · إن فشل: الإصدار السابق يبقى يعمل
```

لا يوجد أمر يدوي بينها. ولا يوجد نظام نشر ثانٍ: GitHub Actions في هذا المستودع **يفحص ولا ينشر**.

### أهم أربع نقاط

1. **إن فشل البناء، لا يتغير شيء في الإنتاج.** الإصدار العامل يبقى يخدم المستخدمين. تقرأ سبب الفشل
   في Vercel → المشروع → Deployments → آخر عملية → Build Logs.
2. **الترحيلات (migrations) تُطبَّق تلقائياً في الإنتاج فقط،** بأمر `prisma migrate deploy` وهو أمر
   **إضافي لا يحذف ولا يعيد التهيئة**. أوامر الحذف والتصفير غير موجودة في أي مسار نشر.
3. **قاعدة بيانات المعاينة (Preview) يجب أن تكون منفصلة** عن قاعدة الإنتاج. المعاينة لا تُطبِّق
   ترحيلات افتراضياً، تحديداً حتى لا يمسّ فرعٌ لم يُراجَع بعدُ سجلَّ الإنتاج.
4. **لا تضع أي سر في المستودع.** كل الأسرار في إعدادات Vercel. ملف `.env` محلي فقط ومستبعد من Git.

### الخطوات اليدوية المطلوبة منك مرة واحدة

| # | الخطوة | أين |
|---|---|---|
| 1 | أنشئ قاعدة PostgreSQL للإنتاج (Neon أو Supabase أو أي مزود) واحصل على رابطين: المجمَّع (pooled) والمباشر (direct) | لدى مزوّد قاعدة البيانات |
| 2 | أنشئ حاوية تخزين S3 للمستندات | أي مزود متوافق مع S3 |
| 3 | أنشئ مفتاح Resend وفعِّل نطاق الإرسال | resend.com |
| 4 | اربط مستودع GitHub بمشروع Vercel جديد | vercel.com → Add New → Project |
| 5 | أدخل متغيرات البيئة (الجدول أدناه) لكل بيئة | Vercel → Settings → Environment Variables |
| 6 | ادفع إلى `main` | من جهازك |

بعدها لن تحتاج إلى أي خطوة يدوية في كل مرة.

### توليد الأسرار

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

مرة لـ `BETTER_AUTH_SECRET` ومرة أخرى لـ `PII_ENCRYPTION_KEY`. **مفتاحان مختلفان.**

> ⚠︎ `PII_ENCRYPTION_KEY` يُشفّر بيانات التعريف الشخصية في القاعدة. تغييره بعد حفظ بيانات
> حقيقية يجعل تلك البيانات غير قابلة للقراءة نهائياً. ولّده مرة واحدة، واحفظه في مكان آمن خارج
> Vercel أيضاً.

---

## Environment variables

Set these in **Vercel → your project → Settings → Environment Variables**. Each row says which
environments it belongs to. Values are never printed in this repository.

### Required

| Variable | Purpose | Development | Preview | Production |
|---|---|:---:|:---:|:---:|
| `DATABASE_URL` | PostgreSQL connection. On a serverless host this must be the **pooled** endpoint — see [Database](#database). | ✅ local | ✅ **separate DB** | ✅ |
| `BETTER_AUTH_SECRET` | Signs session cookies and activation tokens. 32 random bytes. Different per environment. | ✅ | ✅ | ✅ |
| `PII_ENCRYPTION_KEY` | AES-GCM key for identifying personal data, REQ-DPA-002. 32 random bytes. **Never rotate without re-encrypting.** | ✅ | ✅ | ✅ |
| `EMAIL_PROVIDER` | `resend` in anything that serves real users. `console` only locally. | `console` | `resend` | `resend` |
| `RESEND_API_KEY` | Resend API key. Required when `EMAIL_PROVIDER=resend`. | — | ✅ | ✅ |
| `EMAIL_FROM` | Sender identity on activation and verification email. Must be a verified Resend domain. | — | ✅ | ✅ |
| `STORAGE_DRIVER` | `s3` in anything hosted. `local` is refused at startup in production. | `local` | `s3` | `s3` |
| `S3_BUCKET` | Bucket for content-addressed documents. Preview must not share production's. | — | ✅ | ✅ |
| `S3_REGION` | Bucket region. | — | ✅ | ✅ |
| `S3_ACCESS_KEY_ID` | Write access to the bucket. | — | ✅ | ✅ |
| `S3_SECRET_ACCESS_KEY` | Paired secret. | — | ✅ | ✅ |

### Optional

| Variable | Purpose | Where |
|---|---|---|
| `DIRECT_DATABASE_URL` | Unpooled connection, used **only** by migrations. Required whenever `DATABASE_URL` goes through PgBouncer / Supabase 6543 / a Neon `-pooler` host. | Production, and Preview if it migrates |
| `APP_URL` | Overrides the derived public address. Only needed behind a domain the platform does not report. | Any |
| `BETTER_AUTH_URL` | Defaults to `APP_URL`. | Any |
| `EXTRA_TRUSTED_ORIGINS` | Comma-separated extra origins allowed to post to auth — a second custom domain, say. | Any |
| `S3_ENDPOINT` | Non-AWS S3-compatible endpoint (MinIO, Supabase Storage, a national provider). Enables path-style addressing. | Any |
| `S3_SESSION_TOKEN` | Only for a provider issuing temporary credentials — AWS STS, or Supabase Storage, which accepts the project ref as key id, the anon key as secret and a service-role JWT here. Not sent when empty. | Any |
| `RUN_MIGRATIONS_ON_BUILD` | `true` makes this environment apply migrations during its build; `false` stops it. Default: production yes, preview no. | Preview |
| `UPLOAD_MAX_REQUEST_MB` | Overrides the request-body ceiling. Derived automatically: 4.5 on a serverless host, 25 elsewhere. | Any |
| `PDF_RENDERER` | `serverless-chromium` or `bundled-chromium`. Detected from the host; set only to force. | Any |
| `DEFAULT_LOCALE` | `ar` or `en`. Arabic is the default and should stay so. | Any |

### Do not set

| Variable | Why |
|---|---|
| `NODE_ENV` | Vercel sets it. Setting it to `development` in a hosted environment disables production hardening — secure cookies, the storage and email guards, everything. |
| `VERCEL_*` | The platform's own. The application reads them; it must never be told them. |

---

## First deployment

### 1. A database

Any PostgreSQL 16 reachable from Vercel. Neon and Supabase are the usual choices because both give
you the two URLs this project wants:

- a **pooled** URL for `DATABASE_URL` — what the running application uses;
- a **direct** URL for `DIRECT_DATABASE_URL` — what migrations use.

Create a **second, separate database** for Preview. It will hold disposable data and must never be
the live register.

### 2. Object storage

Documents are content-addressed and immutable (`02-SYSTEM-ARCHITECTURE` §7). Any S3-compatible
bucket works; set `S3_ENDPOINT` for anything that is not AWS. Keep the bucket **private** — every
document is served through `/api/documents/[id]`, which authorises the reader and writes an audit
event first. A public bucket would route around both.

### 3. Email

Activation links are really sent; there is no outbox table an administrator reads links out of.
Verify a sending domain in Resend and set `EMAIL_FROM` to an address on it.

### 4. Connect the repository

Vercel → **Add New → Project** → import `M-fawz/osool`. Vercel reads `vercel.json` and needs no
configuration in the dashboard:

```json
{
  "framework": "nextjs",
  "installCommand": "npm ci --no-audit --no-fund",
  "buildCommand": "npm run vercel-build",
  "regions": ["fra1"]
}
```

`fra1` is Frankfurt — the closest Vercel region to Egypt. Put the database in the same region;
a function and its database on different continents pays that latency on every query.

### 5. Environment variables, then push

Fill in the table above for Production and Preview, then:

```bash
git push origin main
```

### 6. Create the first administrator

The seeded development accounts **must never exist in a real deployment**, and cannot: both seed
scripts refuse to run against a non-local database and refuse `NODE_ENV=production`, in code.

Create the first real account from your machine, pointed at production:

```bash
# PowerShell
$env:DATABASE_URL="<the production DIRECT url>"
npm run admin:create -- --email you@goeic.gov.eg --name "Your Name" --name-ar "اسمك"
```

The activation email is sent by Resend to that address. Open the link, set a password, sign in.
Every other account is then provisioned through the interface, by a `SYSTEM_ADMIN`.

---

## What a push to `main` does

`npm` prefers a `vercel-build` script over `build`, so the hosted build is
[`scripts/vercel-build.mjs`](../scripts/vercel-build.mjs) and `npm run build` stays a plain
`next build` for containers and laptops.

1. **`npm ci`** — a strict install from the lockfile, nothing resolved at deploy time.
   `postinstall` runs `prisma generate`.
2. **Configuration check** — `DATABASE_URL`, `BETTER_AUTH_SECRET`, `PII_ENCRYPTION_KEY`. A missing
   one stops here with a one-line message naming it.
3. **`prisma generate`** — again, so a cached install cannot leave a stale client.
4. **`prisma migrate deploy`** — production only, unless `RUN_MIGRATIONS_ON_BUILD` says otherwise.
5. **`next build`**.

Any failure stops the build. Nothing is promoted, and the deployment currently serving traffic is
untouched — a failed push cannot take the register down.

### Regenerating the lockfile

Three deployments failed in three seconds at the install step, with this:

```
npm error code EUSAGE
npm error `npm ci` can only install packages when your package.json and
npm error package-lock.json ... are in sync.
npm error Missing: @emnapi/runtime@1.11.3 from lock file
npm error Missing: @emnapi/core@1.11.3 from lock file
```

The committed lockfile really was incomplete. It listed `@emnapi/wasi-threads`
and `@napi-rs/wasm-runtime` at the top level while omitting `@emnapi/core` and
`@emnapi/runtime`, which those same entries require — a lockfile that could not
describe a valid tree on any platform. `npm ci` is the only install command that
checks, which is why it was the only one that complained.

**It is not a Windows problem, and not a `sharp` problem.** Both were blamed
here previously and both are wrong. npm's lockfile is platform-independent by
design: it records every platform's optional variants, and a resolution run on
Windows and one targeted at Linux with `--os=linux --cpu=x64 --libc=glibc`
produce byte-identical files. Verified by generating both and diffing them.

What actually causes it: **npm rebuilds the tree from `node_modules` when one is
present.** Regenerating the lockfile in a working checkout therefore hydrates it
from the packages that happen to be installed on that machine — and the wasm32
variants' dependencies are not among them, because nothing on a normal platform
installs them. The gap gets written into the lockfile and committed. Deleting
`package-lock.json` alone does not help; `node_modules` is still there, and npm
still reads it.

So the lockfile is regenerated **away from `node_modules`**:

```bash
# from the repository root
mkdir ../lockgen && cp package.json ../lockgen/ && cd ../lockgen
npm install --package-lock-only --ignore-scripts
cp package-lock.json ../osool/            # then delete ../lockgen
```

Then, back in the repository, prove it before committing it:

```bash
npm ci        # the same strict install Vercel and CI run
npm run ci    # typecheck, lint, no-deletes, production build
```

`npm ci` in `.github/workflows/ci.yml` is what stops this recurring: it is the
only install that fails on a drifted lockfile, so the next time one is generated
badly, a pull request says so instead of a production deployment.

### Where to read a failure

Vercel → the project → **Deployments** → the failed one → **Build Logs**. The step that failed is
the last one printed. For a runtime error after a successful deploy, the same deployment's
**Runtime Logs** (or **Logs** in the project sidebar) carry `console` output and stack traces.

---

## Preview and Production

| | Preview | Production |
|---|---|---|
| Triggered by | any branch, any pull request | a push to `main` |
| Address | `osool-git-<branch>-<team>.vercel.app` | the production domain |
| Database | **its own, disposable** | the register |
| Migrations during build | no, unless `RUN_MIGRATIONS_ON_BUILD=true` | yes |
| `NODE_ENV` | `production` — it is a production build | `production` |
| Storage bucket | its own | the register's |

A preview runs with `NODE_ENV=production`, so it enforces the same guards: `EMAIL_PROVIDER=console`
and `STORAGE_DRIVER=local` are refused there too. That is deliberate — a preview's filesystem is
read-only, so `local` storage would not degrade, it would throw on the first upload.

The application distinguishes the two through `deployment` in `src/lib/env.ts`, not through
`NODE_ENV`, which cannot tell them apart.

---

## Database

### Connection pooling — why the pooled URL matters

Each serverless function instance creates its own Prisma connection pool. Traffic that spawns forty
instances holds forty pools open on the database, and a small Postgres refuses new connections long
before the traffic looks heavy. `src/lib/db.ts` keeps one client per instance, which is as far as
the application can help; absorbing the *number of instances* is a pooler's job.

So: `DATABASE_URL` points at the pooler, and for a transaction-mode pooler Prisma wants to be told:

```
postgresql://…@…-pooler.…/osool?pgbouncer=true&connection_limit=1
```

And migrations cannot use that connection at all — DDL and Prisma's advisory lock need one session
that stays put — which is what `DIRECT_DATABASE_URL` is for.

### Applying migrations by hand

Automatic on production. To do it deliberately instead:

```bash
$env:DATABASE_URL="<production pooled url>"
$env:DIRECT_DATABASE_URL="<production direct url>"
npm run db:deploy
```

`scripts/db-deploy.mjs` runs `prisma migrate deploy` and nothing else. It prints the target host,
never the credentials.

### What must never be run against a deployed database

```
prisma migrate reset        # drops every table
prisma db push --force-reset
npm run seed:phase1         # refuses a non-local host in code — do not defeat the guard
npm run dev:accounts        # same
```

`db:seed` (rule sets and workflow transitions) **is** safe: it is idempotent, it never deletes, and
production needs it. It runs as part of the migration path.

Beyond that, the database refuses to help: every table of record carries `BEFORE DELETE` and
`BEFORE TRUNCATE` triggers that raise an exception. A destructive statement typed into `psql`
against production fails at the database. `CLAUDE.md` rule 2.

---

## Authentication in production

| Concern | How it is handled |
|---|---|
| Base URL | Derived per environment from the platform's own hostname — production, per-branch preview, per-deployment. Never a literal. `src/lib/env.ts`. |
| Trusted origins | All of the above, plus `EXTRA_TRUSTED_ORIGINS`. A sign-in posted from a preview's branch address and from its deployment address are both genuine. |
| Secure cookies | Set from the scheme of `BETTER_AUTH_URL`, so https deployments get `Secure` and local http still works. A `Secure` cookie sent over http is dropped silently, and the symptom is a sign-in that returns 200 and leaves you signed out. |
| `SameSite` | `Lax`. Activation and reset links arrive from an email client, which is a cross-site navigation; `Strict` would drop the cookie on arrival. |
| Session lifetime | Eight hours — a working day. |
| Role and suspension | Re-read from the database on **every request**; the session cookie never carries a role. Suspending an examiner takes effect on their next request, not their next sign-in. `02-SYSTEM-ARCHITECTURE` §4 control 3. |
| Cookie caching | Deliberately disabled. Do not enable it — it would cache the role and break the line above. |

Sessions live in the database, so they survive a deployment. Rotating `BETTER_AUTH_SECRET` signs
everyone out; that is the intended emergency control.

---

## Arabic PDF rendering on a serverless host

Registration cards are rendered by Chromium, because Chromium shapes Arabic correctly
(`02-SYSTEM-ARCHITECTURE` §10 decision 6). A serverless function has no Playwright browser cache
and a read-only filesystem, so the renderer picks its browser by host:

| Host | Package |
|---|---|
| Laptop, container | `playwright` — the browser `npx playwright install chromium` put on disk |
| Vercel, Lambda | `playwright-core` + `@sparticuz/chromium`, unpacked into `/tmp` on first use |

Two things make that work on Vercel and are easy to lose:

- `next.config.ts` → `outputFileTracingIncludes` carries `@sparticuz/chromium/bin/**` into the
  issuance function. Nothing imports the 64 MB browser archive, so dependency tracing cannot see it,
  and without this line the deployment ships the launcher without the browser.
- `src/app/[locale]/issuance/[id]/page.tsx` → `export const maxDuration = 60`. A cold start unpacks
  a browser before it renders anything, and the default serverless timeout is shorter than that.

The traced issuance function is ~99 MB against Vercel's 250 MB limit. Every other route is ~25–33 MB.

**This path has not been exercised on a live Vercel deployment.** It is the one thing in this
document that is reasoned rather than observed — verify a card issues before the register is
relied on.

---

## Upload sizes

Vercel rejects a request body over **4.5 MB** at the edge, before any application code runs. A
commercial register photographed on a mid-range Android phone is routinely six.

The document step reads `uploadRequestCeilingMb` and refuses an oversized file **in the browser**,
with the same four-part Arabic refusal a server rule would produce, before the phone spends two
minutes uploading something the platform will discard. The per-document limits in the
`DOC_CHECKLIST` rule set are unchanged and are still enforced on the server — this is a hosting
ceiling, not a regulatory one.

If brokers routinely hold documents larger than this, the answer is a pre-signed direct-to-S3
upload, not a raised limit. That is not built.

---

## Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every push to `main` and every
pull request. It **does not deploy** — Vercel does that, and two systems publishing the same commit
is how a pipeline stops being trusted.

| Job | What it proves |
|---|---|
| `checks` | TypeScript, ESLint, the no-destructive-delete control, and a production build |
| `database` | Migrations apply from empty, the seed is idempotent, the audit hash chain verifies, the versioned rules engine answers as-of a date, and the trail detects four kinds of tampering |

Everything runs against a throwaway PostgreSQL created for the run. No deployment secret is exposed
to CI, and it cannot reach any deployed database.

**Not in CI, and why.** `proof:phase0` and the route sweep in `proof:phase1` need a running dev
server and would double the workflow's runtime for a check the build already covers. `proof:pdf`
downloads a 300 MB Chromium on every run and then asks a **human** to look at the PNG, because no
automated check can tell whether Arabic letters are correctly joined — an assertion that always
passes is worse than no assertion. Both are documented in the README as commands to run locally.

---

## Rollback

Vercel → Deployments → a known-good one → **⋯ → Promote to Production**. It is instant, because the
build already exists.

That rolls back *code*. It does not roll back a migration, and nothing in this system should ever
try to: the schema is append-only by design, and every migration to date only adds. If a migration
has to be undone, it is a new forward migration, reviewed, with the data path written down first.

---

## Related

| Document | For |
|---|---|
| [`../README.md`](../README.md) | Running it locally |
| [`02-SYSTEM-ARCHITECTURE.md`](02-SYSTEM-ARCHITECTURE.md) | §7 immutability and retention, §10 the hosting decision |
| [`01-LEGAL-REFERENCE.md`](01-LEGAL-REFERENCE.md) | Every rule the system enforces |
| [`../CLAUDE.md`](../CLAUDE.md) | The rules that override everything else |
