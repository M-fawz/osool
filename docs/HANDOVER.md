# Osool — production handover

**Audited and updated:** 12 August 2026 · **Production:** <https://osool-cyan.vercel.app>

**Method:** live browser testing against production, an end-to-end HTTP harness
driving the real Server Actions, direct read-only inspection of the production
database and object store, and source review. Nothing here is inferred from code
alone unless it says so.

Companion documents:

- **`docs/BROKER_DEMO_GUIDE.md`** — the script to follow when demonstrating
- **`docs/TEST_DATA_GUIDE.md`** — every field and document, with demo values
- **`docs/QA_BUSINESS_REPORT.md`** — findings, root causes, risks, readiness
- **`docs/CLOSE-THE-DATABASE.sql`** — the one thing you must run yourself

---

## 1. What changed in this pass

Three problems were reported as "hanging". **None was a hang** — all three were
the interface saying nothing, which is indistinguishable from one. Fixing them
uncovered a fourth that made an entire stage of the workflow impossible.

| Fixed | Was |
|---|---|
| **Card issuance** | Never worked, for anyone. A cash payment was refused against three bank fields that are not rendered for cash, because `FormData.get()` returns `null` and Zod's `.optional()` refuses it. Every file stopped at `APPROVED`. |
| **Validation messages** | Resolved to `undefined` on 8 of 9 forms. A refusal was computed correctly on the server and displayed nowhere. |
| **Refused forms** | Discarded everything typed, because React 19 resets an uncontrolled form after the action settles. |
| **"Start a new application"** | Went idle a second before the page moved; two presses created two firms and stranded the file — the reason signing out and back in appeared to help. |
| **Contract saves** | Appeared to do nothing: the action navigated to the page already open. |
| **Who am I** | Neither product showed the signed-in person. Now an account menu in the chrome of both, with the **role on the trigger**. |
| **Field explanations** | Documents were listed by name alone. Each now answers four questions, and states its accepted formats and size ceiling. |

Full detail, with root causes and commits: **`docs/QA_BUSINESS_REPORT.md` §7**.

---

## 2. Production status

| | |
|---|---|
| Production URL | <https://osool-cyan.vercel.app> (no custom domain) |
| Host | Vercel, project `osool`, region `fra1` |
| Deploys from | GitHub `main`, automatically |
| Database | Supabase PostgreSQL **17.6**, region `aws-0-eu-central-1`, **34 tables** |
| Migrations | **5** applied, none rolled back, checksums match the repository |
| Object storage | Supabase Storage over the S3-compatible endpoint, private bucket |
| Mail | `EMAIL_PROVIDER=manual` — **no outbound mail is sent at all** |
| Locales | Arabic (default, unprefixed) · English under `/en` |

---

## 3. URL map

Arabic is unprefixed; every route also exists under `/en`.

### Public

| URL | Purpose |
|---|---|
| `/` | Landing page |
| **`/login`** | **Sign in — the only entry point.** No sign-up, no password reset |
| `/activate` | Redeem an activation token issued by an administrator |
| `/verify` · `/verify/[number]` | Public register lookup |

### Broker portal

| URL | Purpose |
|---|---|
| **`/application`** | **My applications** — start one, or return to an unfinished one |
| `/application/[id]/[step]` | The 7-step wizard: `capacity` · `entity` · `category` · `contracts` · `documents` · `declarations` · `review`. An agent also gets `power-of-attorney`. |
| `/registration` | The issued registration and the card |

**How a broker finds an existing application:** sign in → land on `/application`.
Every application the firm has ever filed is listed with its status, what is
happening to it now, and — for an unfinished one — a link straight to the first
step that still has something outstanding.

### Government back office

| URL | Role | What happens there |
|---|---|---|
| `/dashboard` | any government role | Landing |
| `/intake` · `/applications/[id]` | `REGISTRY_CLERK` | Book in, number, assign |
| `/examination` · `/examination/[id]` | `EXAMINER` | 16-line review form, completions, recommend |
| `/review` · `/review/[id]` | `REVIEWER` | Approve or refuse |
| `/issuance` · `/issuance/[id]` | `CARD_ISSUER` | Fees, card, delivery |
| `/records` | `DATA_MANAGER` | Data extraction |
| `/archive` | `FILES_HEAD` | Filing |
| `/audit` | `AUDITOR`, `ANALYST`, `AML_SUPERVISOR`, `REVIEWER` | The hash-chained trail |
| `/admin/users` | `SYSTEM_ADMIN` **only** | Account administration |

> The case file has four addresses, one per stage, each guarded to exactly one
> role — so "can this person open this screen" and "may this person take this
> step" are the same question.

### API

| URL | Auth |
|---|---|
| `POST /api/applications/[id]/documents` | broker roles, own firm, editable state |
| `GET /api/documents/[id]` | authorised roles only; anonymous → 401 |
| `/api/auth/[...all]` | Better Auth |

---

## 4. Test accounts

All verified working against production on 12 August 2026. These are seeded
demonstration accounts on a demonstration deployment — the passwords are not
secrets, and documenting them is deliberate.

| Email | Role | Password | Person shown in the UI |
|---|---|---|---|
| `mahmoud.fawzy@osool.gov.eg` | `SYSTEM_ADMIN` | `MahmoudFawzy@123` | — |
| `nile@osool.test` | `BROKER_OWNER` | `DevOnly!Osool2026` | نادية سليم عبد العزيز |
| `broker@osool.test` | `BROKER_OWNER` | `DevOnly!Osool2026` | محمود عبد الرحمن حسن |
| `clerk@osool.test` | `REGISTRY_CLERK` | `DevOnly!Osool2026` | سامية رشدي عطية |
| `examiner@osool.test` | `EXAMINER` | `DevOnly!Osool2026` | أحمد عبد الرحمن سيد |
| `examiner2@osool.test` | `EXAMINER` | `DevOnly!Osool2026` | داليا منير حبيب |
| `reviewer2@osool.test` | `REVIEWER` | `DevOnly!Osool2026` | محمد صبري كامل |
| `issuer@osool.test` | `CARD_ISSUER` | `DevOnly!Osool2026` | ريهام عادل نصار |
| `auditor@osool.test` | `AUDITOR` | `DevOnly!Osool2026` | — |

**Eleven more broker firms**, all `DevOnly!Osool2026`: `giza@`, `maadi@`,
`zamalek@`, `october@`, `shorouk@`, `heliopolis@`, `newcairo@`, `delta@`,
`aswan@`, `haramain@`, `mohandeseen@` — all `@osool.test`. Use a fresh one for a
clean demonstration run.

Also present: `mf01096323986@gmail.com` (`REVIEWER`, `PENDING_ACTIVATION`) —
provisioned 11 August, never activated. Re-issue its link from `/admin/users` if
you want it.

> **Use the full set, not five accounts.** Intake and assignment require
> `REGISTRY_CLERK`; fees, card and delivery require `CARD_ISSUER`. Four roles
> cannot demonstrate a six-role process.

---

## 5. Role permissions

| Role | Sees | Can do | Cannot |
|---|---|---|---|
| `SYSTEM_ADMIN` | Accounts only | Create government accounts, change roles, suspend, reactivate, reissue activation links. Sees and can suspend broker accounts. | **See any case data at all**, including the audit trail. Create a broker account. |
| `REGISTRY_CLERK` | `/intake` | Book in, number, assign | Examine, decide |
| `EXAMINER` | `/examination` | Verify lines, request completions, recommend | Decide any file, including their own |
| `REVIEWER` | `/review`, `/audit` | Approve or refuse | Examine; reach issuance |
| `CARD_ISSUER` | `/issuance` | Record fees, issue, deliver | Examine, decide |
| `AUDITOR` | `/audit` | Read the trail | Any mutation |
| `DATA_MANAGER` | `/records`, issuance | Extract data, record fees | Decide |
| `FILES_HEAD` | `/archive` | File | Decide |
| `AML_SUPERVISOR`, `INSPECTOR`, `ANALYST` | — | — | Sign in to nothing in Phase 1 |
| `BROKER_OWNER` / `_STAFF` / `_AGENT` | Own firm only | Apply, upload, respond, withdraw | Anything governmental |

`SYSTEM_ADMIN`'s exclusion from case data is **intentional and correct** —
"administration is not access". It should not be weakened. What is missing is a
*supervisor* role that can reassign a stuck file; see the QA report §9.

---

## 6. The complete business workflow

Twelve statuses, sixteen seeded transitions, one row-locked writer. A status is
never assignable directly — only a transition in the table can move a file.

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

**Driven end to end on production on 12 August 2026.** The state path came out of
the database, not off a screen:

```
DRAFT → SUBMITTED → UNDER_INTAKE → UNDER_EXAMINATION → AWAITING_COMPLETION
      → UNDER_EXAMINATION → UNDER_REVIEW → APPROVED → AWAITING_PAYMENT
      → CARD_ISSUED → ACTIVE
```

`WITHDRAWN` is reachable by the broker from `DRAFT`. `REJECTED`, `WITHDRAWN` and
`ACTIVE` are terminal — no appeal, no reinstatement, no renewal yet.

---

## 7. What each role does

| Role | In one sentence |
|---|---|
| **Broker** | Files the application, uploads the evidence, signs fifteen declarations, answers completion requests, and receives the card. |
| **Registry clerk** | Books the file into the incoming register, allocates its temporary number, and assigns an examiner. |
| **Examiner** | Checks sixteen substantive lines against the documents, requests completions where something is missing, and **recommends** — never decides. |
| **Reviewer** | A different person, who decides. Approve or refuse, with a note. |
| **Card issuer** | Records the fees, issues the card under a permanent registration number, and records its delivery with two acknowledgements. |
| **Auditor** | Reads the hash-chained trail. Changes nothing. |
| **System administrator** | Creates and suspends accounts. Sees no case data whatsoever. |

---

## 8. How things are stored

### Applications

`application` holds the status, the requested category and types, the paid-up
capital, the temporary number, and the four officials who touched it
(`intakeClerkId`, `examinerId`, `reviewerId`, `cardIssuerId`). The applicant's
own data hangs off it in `application_entity_data` (one row) and
`application_contract_data` (many, positioned, archived rather than deleted).

`submittedUnderRuleSetIds` stamps the rule versions in force at submission onto
the file, so every later evaluation uses those and never today's.

### Users and roles

`user` carries `role`, `status` (`PENDING_ACTIVATION` / `ACTIVE` / `SUSPENDED`)
and `brokerEntityId`. Both `role` and `status` are `input: false` in Better Auth,
so neither can arrive from a request body — the public sign-up endpoint could
never mint an administrator. **Session state is re-validated against the database
on every request**, never trusted from a cookie: a suspended examiner loses access
on their next request, not at their next sign-in.

Credentials live in `account`; sessions in `session` — the one thing this product
deletes, and the audit event is written before the row goes.

### Decisions

The decision is `application.status` plus `rejectionReason`, moved by a row in
`application_event` recording the transition. The examiner's work is a separate
`examination_record` with a `recommendation`, and its per-line verifications are
`examination_field_check` rows. Recommendation and decision are different tables
because they are different acts by different people.

### Audit events

`audit_event` is append-only and hash-chained: each row carries `prevHash` (the
previous row's `hash`; 64 zeros for genesis) and `hash` over its own canonical
form including `prevHash`. Altering any historical row breaks every hash after
it. Each row records actor, role, from-state, to-state, reason, timestamp, IP,
user agent, and the rule-set versions in force. **`accessType` distinguishes
`READ` from `WRITE` — reads are audited too.**

Verified independently: `npx tsx scripts/verify-chain.ts` recomputed **735
events, zero mismatches, one genesis root**.

### Files

Uploads are hashed on receipt and stored **content-addressed** at
`documents/<aa>/<bb>/<sha256>`. A replacement never overwrites: it becomes a new
`document` row with `version + 1` and `supersedesDocumentId` pointing at the one
it replaces, which stays exactly where it was.

**Storage verified byte-for-byte:** 12 documents fetched through the authorised,
audited route, and every byte sequence hashed to the SHA-256 the register had
recorded.

### Ten most important tables

`audit_event` · `application` · `document` · `user` · `registration` ·
`application_event` · `declaration` · `examination_record` ·
`application_entity_data` · `rule_set` / `rule_item`

*(By row count today: `audit_event` 748, `declaration` 315,
`examination_field_check` 240, `document` 210, `session` 195,
`application_event` 111, `rule_item` 72, `fee_line` 35, `party` 35, `user` 30.)*

### How Vercel reaches the database

Prisma over the Supabase connection pooler, as the `postgres` role, from
`DATABASE_URL` in Vercel's production environment. Most of this project's own
variables are marked **Sensitive**, so `vercel env pull` returns `[SENSITIVE]`
for them; the Supabase integration's variables are not marked Sensitive and
carry the same credentials, which is how the tooling in `scripts/` reaches
production for read-only inspection.

The application has **never** used the anon key for data access.

---

## 9. What was tested, and what passed

| | |
|---|---|
| **End-to-end workflow** | **80 checks passed** against production — `node scripts/qa/workflow.mjs` |
| **Database integrity** | **29 passed, 0 failed** — `node scripts/qa/database.mjs` |
| **Audit chain** | **INTACT** — 735 events recomputed, zero mismatches |
| **Authorisation** | **14 of 14** — role isolation, IDOR, anonymous access, admin exclusion |
| **Document storage** | 12/12 fetched and byte-for-byte hash-matched |
| **Arabic and English** | Both walked end to end |
| **Arabic in PDFs** | Verified as an image, not a text extraction |
| **Typecheck · lint · no-deletes audit · production build** | all clean |

### What failed, and was fixed

Everything in **`docs/QA_BUSINESS_REPORT.md` §7** — eight defects, each with its
root cause and commit. The two that matter most: card issuance was impossible for
anyone, and every validation message in the product was invisible.

### What is still broken

| | Severity |
|---|---|
| **The database is open to the internet** (§10) | **Blocker** |
| Brokers cannot obtain an account | Blocker for pilot |
| Nothing notifies anyone of anything | Blocker for pilot |
| `AWAITING_COMPLETION` sits in no queue | High |
| The examiner can sign with 0 of 16 lines verified | High |
| Uploads above ~4.5 MB fail at the platform edge | High |
| A firm can hold two live registrations | Medium |
| No appeal from refusal; no renewal | Medium — needs counsel |
| The contracts editor and completions composer have no no-JavaScript path | Medium |
| Mobile verified from the markup, **not measured on a device** | Medium |

---

## 10. What you must do yourself

1. **Close the database. Nothing else on this list matters until it is done.**
   Run `docs/CLOSE-THE-DATABASE.sql` in the Supabase SQL editor, then disable the
   Data API, rotate the publishable key, invalidate every session, and reset the
   demonstration passwords. The file explains each step and why.
   *It has not been run for you: revoking privileges on a live database is your
   call.*

2. **Decide the broker onboarding story.** Either build a sign-up route, or let
   the administrator create broker accounts, or state openly in the
   demonstration that accounts are provisioned by the Authority. Right now
   brokers exist only because they were seeded.

3. **Turn on a real mail driver** and build the notification module, invoked from
   `transition()`.

4. **Check the broker journey on a real phone.** It was verified from the
   responsive rules and the rendered markup, not measured on a device.

5. **Raise with counsel:** the appeal route against refusal, the fee tariff, and
   whether a firm may hold two live registrations. None has a `REQ-*` today.

---

## 11. Readiness

> ### Is Osool:
> ### **A — a working demonstration of a proposal** ✅
> ### B — a pilot-ready system ❌
> ### C — a production government system ❌

**A.**

It is a strong demonstration and more than a technical one. The workflow runs end
to end on production across six roles. The refusals name the decree. The audit
trail withstands independent recomputation. The segregation of duties is enforced
in three places and survives being attacked deliberately. A stakeholder can be
walked from an empty application to an issued card and shown why each control
exists.

It is **not** a pilot, because the supervised population cannot obtain an
account, the system cannot notify anyone of anything, a file can go silent with
nobody accountable for it, the examiner's substantive control is optional, and —
until the database is closed — the application's authorisation is decorative,
because the data sits behind a second door that is open.

Being deployed on Vercel says nothing about any of this.

**The path to B and to C is in `docs/QA_BUSINESS_REPORT.md` §12**, as a numbered
list of what must be built.
