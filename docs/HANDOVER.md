# Osool Production Handover

**Audited:** 11–12 August 2026 · **Production:** https://osool-cyan.vercel.app
**Method:** live browser QA against production, HTTP probing, direct read-only inspection of the
production database and object store, and source review. Nothing in this document is inferred from
code alone unless it says so.

---

## 1. Executive summary

Osool is a **well-built engine wrapped around three holes**, one of which is severe.

The registration workflow was driven end to end through the real UI on production during this audit:
a broker filled a 7-step application, uploaded 7 documents, made 15 declarations and submitted; a
registry clerk booked it in and allocated reference **T-2026/0013**; an examiner raised a completion
request; the broker answered it; the examiner recommended approval; a *different* reviewer approved
it. Every transition was verified in the database, not just on screen. The workflow works.

What is genuinely strong: one row-locked writer of application status, table-driven transitions,
segregation of duties enforced three ways including a database CHECK constraint, an append-only
hash-chained audit trail that **verifies** (277 rows recomputed, zero mismatches, zero link breaks),
content-addressed immutable documents (125/125 objects present and hash-matching), versioned rule
thresholds evaluated `asOf` and stamped onto the file, and four-part refusal copy that names the
decree — a broker who picks a registration category above their capital is refused with
«قرار وزاري ٥٧٨ لسنة ٢٠٢٥، المادة ٢» and told exactly what to do instead.

The three holes:

1. **The database is reachable from the public internet, bypassing the entire application.**
   Supabase's Data API is enabled on the `public` schema, row-level security is off on all 34
   tables, and `anon`/`authenticated` hold full DML. Confirmed live: session tokens, password
   hashes and all case data are readable with the publishable key. Every guarantee in `CLAUDE.md`
   is void through this door.
2. **Brokers cannot get an account.** There is no sign-up route, admin provisioning is restricted
   to `GOVERNMENT_ROLES`, and no mail is sent. The supervised population cannot onboard.
3. **The system never tells anyone anything.** Of ~20 business moments that should notify a broker,
   one does. A completion request reaches the broker only if they happen to log in and look.

None of the three is an architecture problem. Two are configuration and one is unbuilt scope.

**Verdict: yes — a working proposal/demo, after the database is closed.** Detail in §22.

---

## 2. Current production status

| | |
|---|---|
| Production URL | https://osool-cyan.vercel.app (no custom domain) |
| Host | Vercel, project `osool`, region `fra1`, Node 24.x |
| Deploys from | GitHub `main`, automatically |
| Database | Supabase PostgreSQL **17.6**, region `aws-0-eu-central-1`, 34 public tables |
| Migrations | 5 applied, none rolled back, checksums match the repo |
| Object storage | Supabase Storage over the S3-compatible endpoint, private bucket `osool-documents` |
| Mail | `EMAIL_PROVIDER=manual` — **no outbound mail is sent at all** |
| Locales | Arabic (default, unprefixed) and English under `/en` |

Two code changes were made during this audit; both are described in §18.

---

## 3. URL map

Taken from the router (`src/app/[locale]/…`). Arabic is unprefixed; every route also exists under
`/en`. Nothing below is invented.

### Public

| URL | Purpose | Auth | Notes |
|---|---|---|---|
| `/` | Landing page | No | Points at `/verify` |
| `/login` | Sign in | No | Only entry point; no sign-up, no password reset |
| `/activate` | Redeem an activation token | No | Token comes from the admin who provisioned the account |
| `/verify` | Public register lookup | No | Phase 2 surface; deliberately minimal |
| `/verify/[number]` | Look up one registration | No | Will not distinguish "never registered" from "lapsed" — correct |

### Broker portal

| URL | Purpose | Role | Main actions |
|---|---|---|---|
| `/application` | My applications | `BROKER_OWNER`, `BROKER_AGENT`, `BROKER_STAFF` | Open or start an application |
| `/application/[id]/[step]` | The 7-step wizard | broker roles | `step` ∈ `capacity`, `entity`, `category`, `contracts`, `documents`, `declarations`, `review` |
| `/application/[id]` | Application shell | broker roles | Redirects into the wizard |
| `/registration` | The issued registration / card | broker roles | **Unreachable — no link anywhere in the app** |

### Government back office

| URL | Purpose | Role | Main actions |
|---|---|---|---|
| `/dashboard` | Landing for all officials | any government role | Shows name + role; work-list summary is unreliable (§17) |
| `/intake` | Incoming register queue | `REGISTRY_CLERK` | Book in, allocate temporary number, assign to examiner |
| `/examination` · `/examination/[id]` | Examination queue and case | `EXAMINER` | 16-line review form, request completions, sign and refer |
| `/review` · `/review/[id]` | Review queue and case | `REVIEWER` | Approve or refuse with a note |
| `/issuance` · `/issuance/[id]` | Fees and card | `CARD_ISSUER`, `DATA_MANAGER` | Record fees, issue card, deliver |
| `/records` | Data extraction | `DATA_MANAGER` | Never clears (§17) |
| `/archive` | Filing | `FILES_HEAD` | Never clears (§17) |
| `/audit` | Hash-chained audit trail | `AUDITOR`, `ANALYST`, `AML_SUPERVISOR`, `REVIEWER` | Read-only |
| `/applications/[id]` | Full case file | government roles with case-data access | Read the file, act on it at the current stage |
| `/admin/users` | Account administration | `SYSTEM_ADMIN` only | Provision, suspend — **government roles only** |

### API

| URL | Purpose | Auth |
|---|---|---|
| `POST /api/applications/[id]/documents` | Upload a checklist document | broker roles, own firm, editable state |
| `GET /api/documents/[id]` | Fetch a stored document | authorised roles only; anonymous → 401 |
| `/api/auth/[...all]` | Better Auth | — |

`/sign-in` and `/broker/applications` **do not exist** (404). The only sign-in URL is `/login`.

---

## 4. User accounts

All verified working against production. Passwords are the seed's — these are demonstration
accounts on a demonstration deployment, not secrets.

| Email | Role | Password | Person shown in UI |
|---|---|---|---|
| `mahmoud.fawzy@osool.gov.eg` | `SYSTEM_ADMIN` | `MahmoudFawzy@123` | — |
| `broker@osool.test` | `BROKER_OWNER` | `DevOnly!Osool2026` | محمود عبد الرحمن حسن |
| `clerk@osool.test` | `REGISTRY_CLERK` | `DevOnly!Osool2026` | سامية رشدي عطية |
| `examiner@osool.test` | `EXAMINER` | `DevOnly!Osool2026` | أحمد عبد الرحمن سيد |
| `examiner2@osool.test` | `EXAMINER` | `DevOnly!Osool2026` | داليا منير حبيب |
| `reviewer2@osool.test` | `REVIEWER` | `DevOnly!Osool2026` | محمد صبري كامل |
| `issuer@osool.test` | `CARD_ISSUER` | `DevOnly!Osool2026` | ريهام عادل نصار |
| `auditor@osool.test` | `AUDITOR` | `DevOnly!Osool2026` | — |
| `nile@osool.test` | `BROKER_OWNER` (second firm) | `DevOnly!Osool2026` | — |

> **The five accounts previously treated as "the test accounts" cannot demonstrate the workflow.**
> `intake` and `assign` require `REGISTRY_CLERK`; `record_fees`, `issue_card` and `deliver` require
> `CARD_ISSUER`. Use the seven-account set above.

Also present: 14 broker firms, 4 suspended QA residue accounts, and
`mf01096323986@gmail.com` (`REVIEWER`, `PENDING_ACTIVATION`) — provisioned 11 Aug, never activated.
Its activation link was shown once and is not recoverable; re-issue from `/admin/users` if wanted.

---

## 5. Roles and permissions

14 roles exist in the enum. Six are exercised by Phase 1.

| Role | Sees | Can do | Cannot |
|---|---|---|---|
| `SYSTEM_ADMIN` | Accounts only | Provision/suspend government accounts | **See any case data at all**, including the audit trail |
| `REGISTRY_CLERK` | `/intake` | Book in, number, assign | Examine, decide |
| `EXAMINER` | `/examination` | Verify lines, request completions, recommend | Review or decide the same file |
| `REVIEWER` | `/review`, `/audit` | Approve or refuse | Examine; reach issuance |
| `CARD_ISSUER` | `/issuance` | Record fees, issue, deliver | Examine, decide |
| `AUDITOR` | `/audit` | Read the trail | Any mutation |
| `DATA_MANAGER` | `/records`, issuance | Extract data, record fees | Decide |
| `FILES_HEAD` | `/archive` | File | Decide |
| `AML_SUPERVISOR`, `INSPECTOR`, `ANALYST` | — | — | **Sign in to nothing in Phase 1** |
| `BROKER_OWNER` / `_AGENT` / `_STAFF` | Own firm only | Apply, upload, respond, withdraw | Anything governmental |

`SYSTEM_ADMIN`'s exclusion from case data is deliberate and correct — administration is not access.
It should not be weakened. What is missing is a different role: see §14.

---

## 6. Complete business workflow

Twelve statuses, sixteen seeded transitions. This is the Authority's own eight-step process.

```
DRAFT ──submit──▶ SUBMITTED ──intake──▶ UNDER_INTAKE ──assign──▶ UNDER_EXAMINATION
                                                                    │        ▲
                                              request_completions   │        │ resubmit
                                                                    ▼        │
                                                          AWAITING_COMPLETION┘
                                                                    │
                                        recommend ◀─────────────────┘
                                            │
                                            ▼
                                      UNDER_REVIEW ──approve──▶ APPROVED ──record_fees──▶
                                            │                                  AWAITING_PAYMENT
                                            └──reject──▶ REJECTED (terminal)         │
                                                                          issue_card │
                                                                                     ▼
                                                        ACTIVE ◀──deliver── CARD_ISSUED
```

`WITHDRAWN` is reachable by the broker from `DRAFT` (terminal). Three further seeded `withdraw`
transitions exist but the UI never renders the button for them.

**Terminal dead ends:** `REJECTED` (no appeal, no re-open), `WITHDRAWN` (no reinstatement),
`ACTIVE` (no renewal, lapse or suspension — Phase 2).

---

## 7. Broker journey — as actually performed

1. Sign in at `/login`. Land on `/application`.
2. "ابدأ طلب قيد جديد" — note this **resumes an existing draft** if one exists, silently.
3. Seven steps: capacity → entity → category → contracts → documents → declarations → review.
   Each step saves on its own; a step will accept values the final submit later refuses.
4. Documents: the checklist filters itself by legal form. A sole trader sees **7 required items**;
   power of attorney is marked «غير مطلوب في حالتك». Each item offers camera capture or file choice.
5. Declarations: 15 binding items, each timestamped individually.
6. Review and submit. Rule violations are refused here with the decree named.
7. **The broker receives no reference number and no acknowledgement.** The card shows
   «رقم الطلب — لم يُخصّص بعد» until a clerk books the file in, which may be days later.
8. Once booked in, the reference (`T-2026/0013`) appears on the card and the status reads «مُقدَّم».
9. If completions are requested, the card shows «مطلوب منك استيفاء ١ بنداً» and the review step
   shows the examiner's exact wording under «استيفاءات مطلوبة من الهيئة». Editing re-opens.
10. Replace the document (the old version is retained — «النسخة ٢ — النسخ السابقة محفوظة ولا تُحذف»)
    and press «إعادة إرسال الطلب بعد الاستيفاء».
11. Outcome: the broker is never told. They must log in and look.

Sign out and back in and the application is found again at `/application` — verified.

---

## 8. Government journey — as actually performed

| Stage | Who | What happened |
|---|---|---|
| Intake | `clerk@osool.test` | Entered page count 12, allocated **T-2026/0013** |
| Assign | `clerk@osool.test` | Chose أحمد عبد الرحمن سيد. The screen states the examiner does not pick their own files |
| Examination | `examiner@osool.test` | 16-line form, each line paired with the document that evidences it |
| Completion | `examiner@osool.test` | Raised one item, **required** to cite a checklist item — free text alone is refused |
| Resubmission | `broker@osool.test` | Uploaded v2 of the criminal record; v1 retained |
| Recommend | `examiner@osool.test` | Signed and referred. Refused first, correctly, citing GOEIC form **CR-CA-QR-31** |
| Approve | `reviewer2@osool.test` | Approved with a note. Different person from the examiner |
| Issuance | — | **Not exercised** (§19) |

The case file shows a «مسار الطلب» trail naming every hand, in order, with timestamps.

---

## 9. Database architecture

**Supabase PostgreSQL 17.6**, database `postgres`, 34 public base tables, ~14 MB, 5 migrations
applied 10 Aug 2026.

### The ten that matter

| Table | Rows | What it holds |
|---|---|---|
| `user` | 30 | Who can sign in and as what. Broker users carry `brokerEntityId`; government users must not |
| `session` | ~127 | Live logins |
| `account` | 30 | Credentials (password hashes) |
| `broker_entity` | 14 | The supervised firm — the tenant boundary |
| `application` | 14 | The request being processed: status, category, capital, `temporaryNumber`, and the clerk/examiner/reviewer/issuer who touched it |
| `document` | 125 | Every uploaded file: SHA-256, content-addressed `storageKey`, version, `supersedesDocumentId` |
| `audit_event` | ~297 | Append-only hash-chained trail; reads as well as writes |
| `rule_set` / `rule_item` | 8 / 72 | The regulations as versioned data with effective dates |
| `examination_record` + `examination_field_check` | 9 / 144 | Where the examiner's findings and signature live |
| `application_transition` + `application_event` | 16 / 69 | The rulebook, and the log of every move |

### Relationships and delete protection

- **64 foreign keys, every one `ON DELETE RESTRICT`. Zero cascades.** Verified against
  `information_schema`, not assumed.
- **62 `BEFORE DELETE/TRUNCATE` triggers across 31 tables.** The three exempt tables are `session`,
  `verification` and `_prisma_migrations` — exactly the right three.
- Zero delete calls in `src/`. Every grep hit is a doc, a CI guard, or a deliberate negative test.
- Archive / retention / legal-hold columns exist on every table and are **100% unpopulated** — the
  alternative to deletion is schema-only so far.

### Audit trail — verified, not asserted

The chain was independently recomputed: **277 rows, 0 hash mismatches, 0 link breaks, gapless
sequence 1–277, genesis correct.** 124 READ events across 7 read actions, including
`AUDIT_TRAIL_VIEWED` — viewing the trail is itself audited (`REQ-DPA-002` is real).

### Reference number

Format `T-YYYY/NNNN` (e.g. `T-2026/0013`) — a *temporary* number allocated at intake, unique,
sequential and therefore guessable. The permanent registration number is issued separately.

### How Vercel connects — variable names only

| Variable | Use |
|---|---|
| `DATABASE_URL` | Pooled runtime connection used by Prisma |
| `DIRECT_DATABASE_URL` | Direct connection for migrations |
| `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_DATABASE`, `POSTGRES_PASSWORD` | Supplied by the Supabase integration |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_SESSION_TOKEN` | Object storage |
| `STORAGE_DRIVER` | `s3` in production; the app refuses to boot on `local` |
| `BETTER_AUTH_SECRET`, `PII_ENCRYPTION_KEY` | Session signing; field-level PII encryption |
| `EMAIL_PROVIDER` | `manual` — no mail leaves the system |
| `APP_URL`, `DEFAULT_LOCALE`, `EXTRA_TRUSTED_ORIGINS` | Application configuration |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, … | Supabase integration — **see §13 B1** |

No values appear in this document, and none should.

---

## 10. Storage architecture

`STORAGE_DRIVER=s3`, pointing at the **private** Supabase bucket `osool-documents`.

- Files are hashed on receipt; the SHA-256 *is* the storage key:
  `documents/<h[0:2]>/<h[2:4]>/<hash>`.
- **125 of 125** document rows have a matching stored object; zero missing, zero size mismatches.
- Replacing a document supersedes it — the previous version stays retrievable and unchanged.
- Neither driver exposes a delete. That is deliberate.
- The bucket is **not** publicly readable; `/api/documents/[id]` is the only path, and it authorises.

**Practical ceiling: ~4.5 MB, not the 10–25 MB the checklist advertises.** Measured on production:
files up to 4 MB reach the application; at 5 MB and above Vercel returns a bare English
`FUNCTION_PAYLOAD_TOO_LARGE` 413 and the app's own Arabic size refusal never runs. A phone photo of
a commercial register routinely exceeds 4.5 MB. See §17 T3.

---

## 11. Authentication and authorisation

- Better Auth, email + password, with a CSRF `Origin` check and sign-in rate limiting.
- Sessions are HTTP-only cookies; forged or tampered cookies are rejected (HMAC holds).
- Authorisation runs server-side in `guard()` / `requireRole`, and every workflow action
  re-authorises inside the single `transition()` engine — role, firm ownership and segregation of
  duties, in-transaction.
- **Segregation of duties is enforced three ways**, including a live database CHECK constraint. It
  is not UI-only.
- Refusals render the four-part shape: what is blocked · why · the exact next step · who to ask.
  Verified on wrong file type, sub-threshold category, wrong role, wrong state, and unsigned form.

---

## 12. QA test results

| # | Test | Result |
|---|---|---|
| 1 | All 9 accounts sign in on production | ✅ |
| 2 | Broker completes 7-step wizard | ✅ |
| 3 | Invalid national ID (3 digits) | ✅ refused: «الرقم القومي يتكوّن من ١٤ رقماً» |
| 4 | Wrong file type (.txt) | ✅ four-part refusal in the real UI |
| 5 | Oversize file, 12 MB | ⚠️ bare platform 413, no app copy (§17 T3) |
| 6 | Category above capital floor | ✅ refused at submit, decree cited |
| 7 | Submit → `SUBMITTED` in DB | ✅ |
| 8 | Reference number on submit | ❌ none issued (§17 B4) |
| 9 | Intake → `T-2026/0013` allocated | ✅ |
| 10 | Assign to examiner | ✅ |
| 11 | Examiner sees documents beside data | ✅ each line cites its source document |
| 12 | Completion request | ✅ after fix — crashed before (§18) |
| 13 | Completion must cite a checklist item | ✅ free text alone refused |
| 14 | Broker sees the completion request | ✅ in-app; ❌ no notification |
| 15 | File visible to government while awaiting completion | ❌ absent from every queue |
| 16 | Document replacement supersedes, v1 retained | ✅ |
| 17 | Resubmit → back to examination | ✅ |
| 18 | Sign without recommendation | ✅ refused, cites form CR-CA-QR-31 |
| 19 | Sign with **0 of 16** lines verified | ❌ **accepted** (§17 B2) |
| 20 | Reviewer ≠ examiner enforced | ✅ |
| 21 | Approve → `APPROVED` | ✅ |
| 22 | Card issuance | ⏸ not exercised (§19) |
| 23 | Log out / log in, application still findable | ✅ |
| 24 | Arabic RTL throughout | ✅ with exceptions in §15 |
| 25 | Audit chain integrity | ✅ 277 rows recomputed, 0 breaks |

---

## 13. Security test results

Full authorisation matrix run across 22 routes × 6 accounts × anonymous, by direct URL.

### BLOCKER — B1: the database is open to the internet

Supabase's Data API is enabled on `public`; **RLS is off on all 34 tables**; `anon` and
`authenticated` hold `SELECT, INSERT, UPDATE, DELETE, TRUNCATE`.

Confirmed live and independently, three times, with the publishable key:

```
GET /rest/v1/user         → 200, 30 rows
GET /rest/v1/session      → 200   (exposes session.token — live tokens)
GET /rest/v1/account      → 200   (exposes account.password — hashes)
GET /rest/v1/application  → 200
GET /rest/v1/audit_event  → 200
```

No write was executed, but the grants make tampering certain — including `UPDATE` and `DELETE` on
`audit_event`, which makes the hash-chained trail forgeable and erasable, and `UPDATE` on
`user.role`, which is full privilege escalation.

**One mitigating fact, stated precisely:** the anon key is **not** present in the deployed client
bundle (13 chunks checked, plus inline HTML). Exploitation requires obtaining a key that is designed
to be public and is stored under a `NEXT_PUBLIC_` name — it would ship the moment any client
component used `supabase-js`. Treat this as "not yet trivially exploitable", not "safe".

**Fix — do all three:** disable the Data API for the project; `REVOKE ALL … FROM anon,
authenticated` with `ALTER DEFAULT PRIVILEGES`; `ENABLE` and `FORCE ROW LEVEL SECURITY` on every
table. Then rotate the key, invalidate all sessions, and force a password reset. The app never uses
the Data API — `supabase-js` is not even a dependency of the running code.

### Other findings

| Sev | Finding | Fix |
|---|---|---|
| HIGH | Session tokens and password hashes were exposed for the lifetime of B1 | Rotate credentials; do not treat the config fix as sufficient |
| MEDIUM | Refused access attempts are **not** audited — contradicts `CLAUDE.md` rule 5 and hides reconnaissance | Write an `ACCESS_DENIED` event in `guard()` |
| MEDIUM | No `Content-Security-Policy` header (all other security headers present and strong) | Add a strict CSP |
| LOW | `GET /api/documents/[id]` returns 403 for another firm's document but 404 for a nonexistent one — confirms existence | Return 404 in both cases, as the broker case pages already do |

### Confirmed **not** vulnerabilities — do not be alarmed twice

- `/admin/users`, `/dashboard`, `/audit` returning **HTTP 200 to anonymous**: these are RSC flight
  payloads carrying `NEXT_REDIRECT;replace;/login;307`. Genuine redirects, not access.
- App-layer authorisation across all 22 routes — no role reaches a screen it should not.
- Wrong-role workflow actions — all re-authorised server-side.
- Segregation of duties — enforced, including at the database.
- Cross-firm IDOR on documents and case pages — properly refused.
- The storage bucket is private.
- No secrets in the client bundle.

---

## 14. Business analysis findings

**The engine is not the problem. The problem is that the engine cannot tell anyone it has moved,
the supervised population cannot get onto it, and nobody's job is to unstick a file.**

| Sev | Finding |
|---|---|
| **BLOCKER** | **Brokers cannot get an account.** No `/register` route exists; `createGovernmentAccountAction` validates `role: z.enum(GOVERNMENT_ROLES)`; mail is discarded. Verified directly. The 14 broker accounts exist only because they were seeded. |
| **BLOCKER** | **A completion request reaches nobody in government.** Confirmed by probing every queue: while `AWAITING_COMPLETION`, the file appears in **none** of them — not even to the examiner who raised it. (The broker *does* see it in-app; the earlier claim that it is invisible from both ends is wrong.) |
| **BLOCKER** | **Eleven Phase-1 broker notifications do not exist as code.** Switching `EMAIL_PROVIDER` to a real driver fixes none of them. Of ~20 business moments, 1 notifies anyone. |
| HIGH | **A file assigned to an examiner can never be reassigned.** An examiner who leaves strands every file they hold. |
| HIGH | **Any examiner can act on another examiner's file** — `request_completions` and `recommend` check role but not assignment. |
| HIGH | **No supervisor view.** Nobody can answer "how many files are stuck, and where". |
| HIGH | **Refusal is a dead end** — no appeal, no re-open, and the reason is buried in a timeline panel. |
| HIGH | **No self-service password reset.** The documented remedy is to telephone the administrator — the precedent failure the architecture explicitly rejects. |
| MEDIUM-HIGH | `/records` and `/archive` never clear — they list every `ACTIVE` application forever. |
| MEDIUM-HIGH | The reviewer cannot return a file to the examiner; approve or refuse only. |
| MEDIUM-HIGH | Fees and card issuance are the same hand; `REQ-REG-050` step 4 assigns fees to a treasurer role that does not exist. |
| MEDIUM | Completions are uncapped and untimed against `REQ-REG-051`'s four rounds. |
| MEDIUM | A firm could be issued two registration numbers — only a second *draft* is blocked. |
| MEDIUM | No fee tariff; amounts are free-typed. No `REQ-*` covers a tariff — raise with counsel. |

### The admin question, answered

`SYSTEM_ADMIN`'s total exclusion from case data **is correct and should not be weakened.** Merging
administration with case access would destroy the separation that makes the register trustworthy.

But that leaves a real operational job undone: no one can reassign a file, unstick a queue, or see
the register as a whole. **Recommendation: add a `REGISTRY_SUPERVISOR` role** (رئيس قسم القيد — an
existing GOEIC post) that can reassign, return to examination and reinstate, each with a mandatory
reason, and sees a register-wide view — but cannot decide an application or provision accounts.
That is a third role, not a super-admin.

---

## 15. UX findings

- **Identity is asymmetric.** Government users see «مسجّل الدخول باسم … — الفاحص» plus name, Latin
  name and role in the sidebar. **The broker portal shows no person at all** — no name, no email,
  no role — and the firm name is hidden below 640px, i.e. on a broker's phone. This is the direct
  cause of "who am I logged in as?". The translation key `portal.signedInAs` means "Firm:" while
  `dashboard.signedInAs` means "Signed in as" — same name, two meanings.
- **Two firm names on one screen.** The portal header shows the broker entity's trade name while the
  application card shows the application's trade name. During this audit they read
  «مؤسسة الأصالة للوساطة العقارية» and «مؤسسة أصول التجريبية للوساطة العقارية» simultaneously.
- **"Start a new application" silently resumes the existing draft** with no message.
- **A validation failure wipes fields the user already typed** — the entered name was not echoed back.
- **The clerk dashboard says «قائمتك خالية الآن» while `/intake` holds two files.**
- **Step counts disagree:** the card says "0 of 6 steps", the wizard says "الخطوة ١ من ٧".
- **Untranslated strings inside the Arabic trail:** "Entered in the incoming register", "Assigned
  for examination", "1 completion item(s) requested" — including a raw `item(s)` plural.
- **The crash page tells you to copy a fault code it never displays.**
- `/registration` — the issued card, the whole point for the broker — has no link anywhere.
- The document preview pane renders a broken-file placeholder rather than the PDF.
- «قيد القيد الوارد» collides on itself and is hard to read.
- «بانتظار السداد» reads as a debt when the payment has already been recorded.

---

## 16. Technical findings

- **Two crash bugs of the same class, both on the main workflow** — fixed, see §18.
- **Upload ceiling ~4.5 MB** versus an advertised 10–25 MB, with a bare English platform error.
- **No `ACCESS_DENIED` auditing.**
- **Archive/retention/legal-hold columns are entirely unpopulated** — rule 2's alternative to
  deletion exists in the schema but is not operational.
- **125 documents but only 2 `DOCUMENT_UPLOADED` audit events** — most seeded documents were
  inserted without their audit event. Worth reconciling before anyone reads the trail as complete.
- **`/verify` is unthrottled and appends to the audit chain under a global advisory lock** — an
  anonymous scraper could stall every government write. Rate-limit it.
- 12 business rules currently rest on application code alone with no database constraint.
- `typecheck` and `lint` both pass clean.
- **`npm run ci` is currently red on `main`, and was before this audit.** `npm run audit:no-deletes`
  exits 1 because the guard's grep matches a line in its own regression suite
  (`scripts/qa/database.mjs:61`), where a raw `DELETE FROM audit_event` is issued *deliberately* to
  prove the database trigger blocks it. The guard is right to be blunt, and the test is right to
  exist — but the two contradict each other, so the pipeline cannot go green. Add a narrowly scoped
  allowance for that file (or move the negative test behind a marker the guard understands) rather
  than softening the guard.

---

## 17. Bugs found

| ID | Sev | Bug |
|---|---|---|
| **B1** | BLOCKER | Supabase Data API open, RLS off — §13 |
| **B2** | HIGH | The examiner can sign off the internal review form with **0 of 16** lines verified; the server gates only on `recommendation`. The per-line verification *is* the control, and it is optional. |
| **B3** | HIGH | While `AWAITING_COMPLETION`, the file is in no government queue at all. |
| **B4** | HIGH | No reference number is issued at submission; the broker has nothing to quote until a clerk acts. |
| **T1** | HIGH | *(fixed)* Typing into the completion field crashed the examination screen. |
| **T2** | HIGH | *(fixed)* Same defect on the issuance fee form. |
| **T3** | HIGH | Uploads above ~4.5 MB fail with a bare English platform 413. |
| **U1** | MEDIUM | Validation failure discards already-entered field values. |
| **U2** | MEDIUM | Clerk dashboard reports an empty work list while `/intake` has files. |
| **U3** | MEDIUM | "Start new application" silently resumes an existing draft. |
| **U4** | MEDIUM | Crash page references a fault code it does not render. |
| **U5** | LOW | Two different firm names on one screen. |
| **U6** | LOW | English transition descriptions inside the Arabic trail. |

---

## 18. Fixes made

**Commit `0d91928` — `fix(gov): read input values before the state updater runs`**

Four handlers passed `event.currentTarget.value` *into* a functional `setState` updater:

```js
onChange={(event) => setDraft((c) => ({ ...c, descriptionAr: event.currentTarget.value }))}
```

React may invoke that updater after the synthetic event has been recycled, at which point
`currentTarget` is `null`. The page threw `Cannot read properties of null (reading 'value')` from
*inside* React's state machinery and the route error boundary replaced the whole screen.

Found on production by typing into the field with real keystrokes — not an automation artifact; the
stack trace confirms the throw is in `useState`, not in the handler. It blocked the examiner from
raising any completion request, and the same pattern sat on the issuance fee form.

Fixed by capturing the value in the handler and closing over it:
`src/components/gov/examination-screen.tsx` (3 sites), `src/components/gov/issuance-forms.tsx` (1).
`typecheck` and `lint` clean. Deployed and verified working on production.

No other code was changed.

---

## 19. Remaining issues

Everything in §17 that is not marked *(fixed)*.

**Not exercised in this audit — stated plainly rather than assumed:**

- **Card issuance (`record_fees` → `issue_card` → `deliver`).** The screens exist and are correctly
  role-gated (a reviewer is refused). The fee form's crash bug was found and fixed. But the three
  transitions were **not** driven end to end: after roughly eight role switches the browser sign-in
  stopped taking, while the same credentials returned HTTP 200 over the API. This is a test-harness
  limitation, not a known product defect — but it is **not** evidence that issuance works. Verify it
  before demonstrating it.
- Mobile/responsive behaviour was reasoned about from the CSS, not measured on a device.
- English (`/en`) was spot-checked, not walked end to end.

---

## 20. Things Mahmoud must do

1. **Close the database.** Disable the Supabase Data API, revoke `anon`/`authenticated` grants,
   enable and force RLS. Then rotate the anon key, invalidate all sessions, force password resets.
   Nothing else on this list matters until this is done.
2. **Decide the demonstration story for broker onboarding**, since brokers cannot self-register.
   Either build the sign-up screen or state openly that accounts are provisioned by the Authority.
3. **Turn on a real mail driver and build the notification module**, invoked from `transition()`.
4. **Add `AWAITING_COMPLETION` to a queue** so a file out with the applicant is still visible.
5. **Make the 16 verification lines mandatory before signature.**
6. **Fix the upload ceiling** — presigned direct-to-storage upload, or lower the advertised limits
   and catch the 413 with the four-part refusal.
7. **Show the broker who they are**, and link `/registration`.
8. **Verify card issuance end to end** before any demonstration.
9. Raise with counsel: the appeal route against refusal, and the fee tariff. Neither has a `REQ-*`.

---

## 21. Demo/test data guide

See **`docs/USER_GUIDE.md`**, which contains the full field-by-field demo data set, the document
checklist with accepted types and sizes, and a step-by-step script for each role.

---

## 22. Production readiness assessment

> ### Is Osool ready to give to an external person?
>
> **Yes — as a working proposal/demo — but only after the database is closed (§13 B1).**

Not "internal only": the workflow genuinely runs end to end on production, the refusals are of a
quality most government systems never reach, and the audit trail withstands independent
recomputation. It is more than a technical demonstration — a stakeholder can be walked through a
real registration from application to approval and shown why each control exists.

Not a pilot, and emphatically **not a production government system**, because:

- the supervised population cannot obtain an account;
- the system cannot notify anyone of anything;
- a file can go silent between government and applicant with no queue holding it;
- the examiner's substantive control — the 16 verified lines — is optional;
- and, until B1 is closed, the application's authorisation is decorative, because the data sits
  behind a second door that is open.

Being deployed on Vercel says nothing about any of this.

**Before a pilot:** B1 closed and credentials rotated · broker onboarding · notifications ·
`AWAITING_COMPLETION` visible · verification lines mandatory · upload ceiling fixed · issuance
verified · a supervisor role that can unstick a file.

**Before production:** the above, plus appeal and renewal, a fee tariff as versioned data, retention
and legal hold actually operating, `ACCESS_DENIED` auditing, rate limiting on `/verify`, and a
security review of the closed configuration by someone who did not build it.
