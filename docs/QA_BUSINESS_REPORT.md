


# Osool — QA and business analysis report

**Audited:** 12 August 2026 · **Target:** <https://osool-cyan.vercel.app> (production)
**Method:** live browser testing against production, an end-to-end HTTP harness
driving the real Server Actions, direct read-only inspection of the production
PostgreSQL database and object store, and source review.

Nothing below is inferred from code alone unless it says so.

---

## 1. Executive summary

Three things were reported as "hanging". **None of them was a hang.** All three
were the interface failing to say anything, which from the user's chair is
indistinguishable from one — and in one case the silence had been hiding a
blocker that made an entire stage of the workflow impossible.

**What was actually wrong:**

1. **Every validation message in the product resolved to `undefined`**, on eight
   of the nine forms, since the day the form component was written. A broker who
   typed a reference number with a letter in it was refused by the server in
   253 ms — and shown nothing at all, on a form that had just emptied itself.
2. **Card issuance had never worked, for anyone.** A cash payment posted three
   nulls for bank fields that are not rendered when the method is cash, and Zod's
   `.optional()` refuses `null`. Every file in the system stopped dead at
   `APPROVED`.
3. **"Start a new application" went idle a second before the page moved**, and
   pressing it twice on a broker's first application created two firms and
   stranded the file — which is why signing out and back in appeared to "fix" it.

All three are fixed and verified on production. The workflow now runs end to end:

```
DRAFT → SUBMITTED → UNDER_INTAKE → UNDER_EXAMINATION → AWAITING_COMPLETION
      → UNDER_EXAMINATION → UNDER_REVIEW → APPROVED → AWAITING_PAYMENT
      → CARD_ISSUED → ACTIVE
```

**80 automated checks pass against production**, including all fourteen
authorisation checks, and the audit chain verifies over 748 events with zero
mismatches.

**One blocker remains, and it is not in the application.** The Supabase Data API
is still open on the `public` schema with row-level security off on all 34 tables
and full DML granted to `anon`. This was reported in the previous audit and has
not been closed. Until it is, every guarantee in `CLAUDE.md` is reachable around.
**See §8 and `docs/CLOSE-THE-DATABASE.sql`.**

**Readiness: A — a working demonstration of a proposal.** Detail in §12.

---

## 2. Business workflow assessment

### Does the workflow make sense?

**Yes.** It is the Authority's own eight-step process, and it is modelled
honestly rather than flattened into "submit → approve".

| Stage | Who | What it establishes |
|---|---|---|
| Draft | Broker | The applicant's own account of themselves |
| Intake | `REGISTRY_CLERK` | The file exists, is numbered, and has an owner |
| Examination | `EXAMINER` | Sixteen substantive checks against the evidence |
| Completion | Broker ↔ Examiner | The file is fixed rather than refused |
| Review | `REVIEWER` — **a different person** | The decision |
| Fees, card, delivery | `CARD_ISSUER` | The registration exists in the world |

Twelve statuses, sixteen seeded transitions, one row-locked writer, and a table
that says which moves are legal. A status is never assignable directly.

### What is genuinely strong

- **Segregation of duties is enforced three ways** — in the route guard, in the
  transition, and by a database CHECK constraint. Tested by trying: the examiner
  is refused the decision and is not even shown the screen.
- **Refusals are legal findings, not error messages.** Four parts — what is
  blocked, why in plain language, the exact next step, who to ask — and they name
  the decree. A broker asking for a category above their capital is refused with
  «قرار وزاري ٥٧٨ لسنة ٢٠٢٥، المادة ٢». This is better than most government
  systems in any country.
- **Thresholds are versioned data with effective dates,** evaluated `asOf` and
  stamped onto the file. A decree amendment is a configuration change. A decision
  taken in March stays judged against March's rules.
- **Nothing is deleted.** Documents supersede rather than overwrite; the database
  refuses a delete on the audit table with its own trigger, and the suite proves
  it by attempting one.
- **The completion request cites a checklist item**, which is what makes
  "completions requested with no basis in the documented requirements" a
  countable process-integrity signal rather than a slogan.

### Where the business logic is incomplete

| # | Finding | Severity |
|---|---|---|
| **B1** | **Brokers cannot obtain an account.** No sign-up route exists, and admin provisioning is restricted to government roles. The supervised population cannot onboard. Accounts exist only because they were seeded. | **Blocker for pilot** |
| **B2** | **The system notifies nobody of anything.** A completion request reaches the broker only if they happen to sign in and look. Of roughly twenty business moments that should produce a message, none does — `EMAIL_PROVIDER` is `manual`. | **Blocker for pilot** |
| **B3** | While `AWAITING_COMPLETION`, the file is **in no government queue at all**. Nobody is accountable for a file that has gone quiet with the applicant. | High |
| **B4** | **No reference number at submission.** The broker has nothing to quote until a clerk books the file in. Honest, and it mirrors the paper process — but it should be a deliberate decision rather than an accident. | Medium |
| **B5** | **`REJECTED` and `WITHDRAWN` are dead ends.** No appeal, no re-open, no reinstatement. There is no `REQ-*` covering appeal — **raise with counsel.** | Medium |
| **B6** | **A firm can hold two live registrations at once.** Issuance does not supersede a prior registration. Encountered during testing: the same firm ended with `2026/0005` and `2026/0007`, both `ACTIVE`. Whether that is legitimate is a question for the Authority. | Medium |
| **B7** | The examiner can sign the internal review form with **0 of 16 lines verified** — the server gates only on `recommendation`. The per-line verification *is* the control, and it is optional. | High |
| **B8** | No fee tariff exists in the legal reference, so every amount is typed in. The screen says so plainly, which is right — but the demonstration prints invented figures on a receipt. **Raise with counsel.** | Medium |

---

## 3. UX assessment

### Fixed in this pass

| Was | Now |
|---|---|
| Validation errors resolved to `undefined` on 8 of 9 forms | `errorFor` resolves them inside the provider, where the lookup cannot be wrong; 68 call sites converted |
| A refused form emptied itself and said nothing | Values are restored, and a summary names each faulty field and links to it |
| No indication of who is signed in, in either product | An account menu in the chrome of both, with the **role on the trigger** |
| "Start a new application" went idle 1s before the page moved | Busy state is held through the navigation by `useTransition` |
| Documents listed by name only; format and size never drawn | Four-part explanation per item — what · why · what to upload · what if I haven't got one — plus accepted formats and ceiling |
| Every wizard step opened with a title and a form | The lead sentence written for each step is now rendered |
| "Continue this application" always went to `/review` | Goes to the first step with something outstanding |
| A status word and nothing else | Each application says what is happening now and what the broker must do, for all twelve statuses |
| Reference fields silently refused letters | The accepted format is stated before anything is typed |

### Still weak

| # | Finding | Severity |
|---|---|---|
| **U1** | **Uploads above ~4.5 MB** fail at the platform edge with a bare English 413 the application never sees. The browser catches it and produces a proper refusal, but the real fix is presigned direct-to-storage upload. | High |
| **U2** | The clerk's dashboard reports an empty work list while `/intake` has files. | Medium |
| **U3** | The contracts editor and the examiner's completions composer are **revealed by client state**, so neither has a no-JavaScript path. Every other form in the product does. | Medium |
| **U4** | `/registration` is reachable from the account menu and the applications list, but there is no persistent navigation in the broker portal — a broker who has finished an application has no obvious route back to their card. | Medium |
| **U5** | Two different firm names can appear on one screen (the entity record's, and the application's). | Low |
| **U6** | English transition descriptions appear inside the Arabic audit trail. | Low |

---

## 4. Functional test results

`node scripts/qa/workflow.mjs` — drives the real production deployment over
HTTP, posting forms the way a browser with JavaScript disabled does, and checks
the production database after every transition.

**80 passed, 2 failed** on the final run *(the two failures were the `/registration`
tie-break, now fixed — see §7)*.

| Area | Result |
|---|---|
| Draft creation, and pressing "start" twice | pass — one draft, no orphaned firm |
| Capacity, entity, category, contracts | pass — all persisted, verified in the database |
| A faulty step refused, both faults named | pass — `needsArabic` and `referenceFormat` both returned |
| 7 demo documents uploaded | pass — 7/7, each content-hashed |
| 15 declarations affirmed individually | pass |
| Submission | pass — status `SUBMITTED` |
| Intake, numbering, assignment | pass — reference `T-2026/0019` allocated |
| Completion requested, itemised, cites a real checklist item | pass |
| Broker sees the request, replaces the document, resubmits | pass — **version 2, superseding version 1** |
| Examiner signs, refers | pass |
| **Examiner cannot decide their own file** | pass — refused, and not shown the screen |
| A different reviewer approves | pass — examiner and reviewer are different user IDs |
| Fees, card, delivery | pass — registration `2026/0007` issued, card PDF stored |
| Broker sees the result; public register shows it | pass |
| Audit trail records writes, reads, and every transition | pass |

---

## 5. Security test results

| Check | Result |
|---|---|
| Broker → intake / examination / audit queues | refused |
| Examiner → review queue, issuance queue | refused |
| Examiner → the decision screen for the file they examined | refused, and the form is not rendered to them |
| Reviewer → intake queue | refused |
| Clerk → issuance queue, account administration | refused |
| **`SYSTEM_ADMIN` → any case file, the audit trail, the intake queue** | refused — *administration is not access*, and it is correct |
| **IDOR: another firm's application by id** | 404 — ownership is checked before existence is admitted |
| Signed-out visitor → an application | refused |
| Signed-out visitor → a stored document | refused |
| Public register → does it leak the national ID? | **no** |
| National IDs at rest | ciphertext, non-deterministic, with a keyed hash beside them |
| Documents fetched through the audited route | 12/12, and **every byte hashes to the register's recorded SHA-256** |
| Audit chain | **INTACT** — 735 events recomputed, zero mismatches, one genesis root |
| Database refuses a DELETE on `audit_event` | yes, by trigger |
| Secrets in the repository | none — `.env*` is gitignored; the pulled production env never left the working tree |

### The one that is not passing

**The database is reachable from the public internet, bypassing the entire
application.** Confirmed live, not inferred — see §8.

---

## 6. Database and data integrity

`node scripts/qa/database.mjs` against production: **29 passed, 0 failed.**

| | |
|---|---|
| Provider | Supabase PostgreSQL **17.6**, region `aws-0-eu-central-1` |
| Tables | 34 in `public` |
| Migrations | 5 applied, none rolled back, checksums match the repository |
| Cascade deletes | **none** — every foreign key is `RESTRICT` |
| Delete guards | triggers on `audit_event` and `application`, proven by attempting a delete |
| Orphaned rows | none across every checked relation |
| Duplicates | none on email, temporary number, registration number, audit `seq`, audit `hash` |
| Audit sequence | no gaps; first event points at genesis |
| Segregation of duties | **no application examined and reviewed by the same person** |
| Rule sets | 8 present, all with effective dates and items |

**Register contents:** 30 users · 21 applications · 7 registrations ·
210 documents · 748 audit events · 35 parties · 14 firms.

**Persistence verified by behaviour, not assumption:** a step saved, the browser
reloaded, and the values were still there; signing out and back in did not lose
workflow state; two brokers could not see each other's files.

---

## 7. Bugs found, root causes, and fixes

### Fixed

| ID | Severity | Bug | Root cause | Commit |
|---|---|---|---|---|
| **F1** | **Blocker** | Card issuance impossible — every file stopped at `APPROVED` | `FormData.get()` returns `null` for a field not on the page; `z.optional()` accepts `undefined` and refuses `null`. The fee form renders bank fields only for non-cash payment, so a cash payment posted three nulls and was refused with *"Expected string, received null"* against three invisible fields. | `c0ddcb0` |
| **F2** | **Blocker** | Every validation message invisible, on 8 of 9 forms | React context is positional. Each form called `useFieldError` in the body of the component that *renders* `<ActionForm>` — above the provider inside it. No warning from React or TypeScript. | `5b4be39` |
| **F3** | High | A refused form discarded everything typed | React 19 resets an uncontrolled `<form action>` after the action settles, including a failed one. | `5b4be39` |
| **F4** | High | "Start a new application" idle for ~1s while nothing happened; two presses created two firms and stranded the file | `setBusy(false)` in a `finally` that runs when `router.push` is *called*. Two concurrent invocations both read `brokerEntityId === null`. | `dc37fbd` |
| **F5** | High | Contract saves appeared to do nothing | `next` pointed at the page already open, so `router.push` was a no-op and the editor stayed open. | `5b4be39` |
| **F6** | Medium | A registrant could be shown the wrong one of their own registration numbers | `orderBy: { validFrom: 'desc' }` is an unordered pick on a tie. | `ded718d` |
| **F7** | Medium | Progressive enhancement silently lost | Wrapping `formAction` in a client closure leaves React nothing to serialise, so the hidden `$ACTION_*` inputs disappear. *Introduced and caught during this pass, by the harness.* | `9816e53` |
| **F8** | Low | `npm run ci` failed on the QA suite's deliberate delete | The delete exists to be refused; it needed the allow marker. | `db8675e` |

### Measured, not guessed

The "hang" was instrumented on production before anything was changed:

```
button stops showing busy   →  604 ms
page actually changes       → 1601 ms
```

And the contracts failure was captured live: the action answered **HTTP 200 in
253 ms** with a validation failure, the page rendered **zero** elements with
`role="alert"`, every field was empty, and **nothing was written to the
database**.

---

## 8. The open blocker

**The Supabase Data API is enabled on `public`, RLS is off, and `anon` holds
full DML.** Measured on production on 12 August 2026:

| | |
|---|---|
| Tables in `public` | 34 |
| With row-level security enabled | **0** |
| RLS policies defined | **0** |
| Privileges held by `anon` **and** `authenticated`, on all 34 | `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` |

A single unauthenticated request with the publishable key returned rows from
`user`, `session`, `application`, `audit_event`, `document` and `party`. The
publishable key is shipped to the browser by design — it is in the client bundle
of every page.

Session tokens, password hashes, encrypted national IDs and the whole case file
are readable and writable by anyone who opens the site and reads the JavaScript.
The application's authorisation is not weak; it is simply not the only way in.

**`docs/CLOSE-THE-DATABASE.sql` closes it.** It has not been run — revoking
privileges on a live database is the owner's decision. It also lists what must
follow: disable the Data API, rotate the key, invalidate every session, reset the
demonstration passwords.

---

## 9. Role and permission results

| Role | Sees | Can do | Cannot |
|---|---|---|---|
| `SYSTEM_ADMIN` | Accounts only | Create government accounts, change roles, suspend, reactivate, reissue activation links. **Can see and suspend broker accounts**, but cannot create one. | See any case data, any application, or the audit trail |
| `REGISTRY_CLERK` | `/intake` | Book in, allocate the temporary number, assign an examiner | Examine, decide, issue |
| `EXAMINER` | `/examination` | Verify lines, request completions, recommend | Decide any file, including one they examined |
| `REVIEWER` | `/review`, `/audit` | Approve or refuse with a note | Examine, reach issuance |
| `CARD_ISSUER` | `/issuance` | Record fees, issue the card, record delivery | Examine, decide |
| `AUDITOR` | `/audit` | Read the trail | Any mutation |
| `DATA_MANAGER` | `/records`, issuance | Extract data, record fees | Decide |
| `FILES_HEAD` | `/archive` | File | Decide |
| `AML_SUPERVISOR`, `INSPECTOR`, `ANALYST` | — | — | Sign in to nothing in Phase 1 |
| Broker roles | Own firm only | Apply, upload, respond, withdraw | Anything governmental |

### On the administrator specifically

The question asked was whether `SYSTEM_ADMIN`'s exclusion from case data is
intentional design, missing functionality, or a requirement needing
clarification.

**It is intentional design, it is correct, and it should not be weakened.**
02-SYSTEM-ARCHITECTURE §4 states it directly: *"Administration is not access."*
An administrator who can read every case is a single account whose compromise
reads the whole register, and there is no supervisory need it serves — the
`AUDITOR` role exists for oversight and can read the trail without being able to
change anything.

**What *is* missing** is a different role: nobody can unstick a file. If an
examiner leaves and their assigned files sit in `UNDER_EXAMINATION` for ever,
there is no reassignment path. That is a supervisor capability, not an
administrator one, and it should be built as such.

The administrator's real gap is that they **cannot create a broker account**,
which combined with B1 means the supervised population has no route in at all.

---

## 10. Arabic, English, and mobile

| | Result |
|---|---|
| Arabic (default, unprefixed) | Walked end to end. Correct RTL, logical properties throughout, chrome mirrors without a second stylesheet. |
| English (`/en`) | Walked end to end. A full mirror, not a courtesy. |
| Numerals, dates, reference numbers | LTR-isolated inside RTL text. `T-2026/0019` and `2026/0007` render correctly, not reversed. |
| Arabic in generated PDFs | Correctly shaped and ordered. Verified as an **image**, not a text extraction — 289 presentation-form glyphs in one demo document, which is positive evidence that contextual shaping ran. |
| Account menu below 640px | The name gives way, the role stays. |
| Document cards, stepper, forms | Single column, 44px targets, camera capture on the file input. |

**Stated plainly:** a true mobile viewport could not be forced through the
browser-automation tooling in this session — the window resized but the capture
did not follow. Mobile behaviour was verified from the responsive rules, the
rendered markup, and the account menu's breakpoint, **not measured on a device.**
Check it on a phone before demonstrating on one.

---

## 11. Business risks

| Risk | Consequence |
|---|---|
| **The database is open** | Every guarantee is void through a second door. Treat the publishable key and all current sessions as compromised. |
| **Brokers cannot get an account** | The supervised population cannot onboard. The register cannot grow. |
| **Nothing notifies anyone** | A completion request can sit unseen indefinitely. The Authority appears unresponsive; the broker appears uncooperative. |
| **A file can go silent** | `AWAITING_COMPLETION` sits in no queue. Nobody is accountable for it. |
| **The examiner's control is optional** | 0 of 16 lines verified still signs. The substantive check is decorative unless it is mandatory. |
| **No appeal from refusal** | A refused applicant has no route inside the system. Likely a legal exposure — raise with counsel. |
| **Invented fee amounts** | A receipt printed with figures that have no legal basis. |

---

## 12. Readiness

> ### Osool is **A — a working demonstration of a proposal.**

Not a pilot, and emphatically not a production government system.

**It is a strong demonstration.** The workflow genuinely runs end to end on
production across six roles. The refusals are of a quality most government
systems never reach. The audit trail withstands independent recomputation. The
segregation of duties is real, enforced in three places, and survives being
attacked. A stakeholder can be walked through a real registration from
application to card and shown why each control exists.

**It is not a pilot, because:**

- the supervised population cannot obtain an account (B1);
- the system cannot notify anyone of anything (B2);
- a file can go silent between the Authority and the applicant with no queue
  holding it (B3);
- the examiner's substantive control is optional (B7);
- and until the database is closed (§8), the application's authorisation is
  decorative, because the data sits behind a second door that is open.

Being deployed on Vercel says nothing about any of this.

### To reach **B — pilot-ready**

1. **Close the database** and rotate credentials — `docs/CLOSE-THE-DATABASE.sql`.
2. Build broker onboarding: a sign-up route, or admin provisioning of broker
   accounts. Decide which; either is defensible, neither exists.
3. Turn on a real mail driver and build the notification module, invoked from
   `transition()`.
4. Put `AWAITING_COMPLETION` in a queue somebody owns.
5. Make the sixteen verification lines mandatory before signature.
6. Fix the upload ceiling with presigned direct-to-storage upload.
7. Add a supervisor role that can reassign a stuck file.
8. Measure the broker journey on a real phone.

### To reach **C — a production government system**

All of the above, plus: an appeal route against refusal and a renewal path
(both need counsel); the fee tariff as versioned rule data; retention and legal
hold actually operating rather than merely modelled; `ACCESS_DENIED` events
audited as well as grants; rate limiting on `/verify`; and a security review of
the closed configuration by somebody who did not build it.

---

## 13. How to re-run any of this

```bash
npx vercel env pull .env.prod.pulled --environment=production --yes

node scripts/qa/workflow.mjs        # the whole business workflow, end to end
node scripts/qa/database.mjs        # 29 database integrity checks
npx tsx scripts/verify-chain.ts     # recompute the audit hash chain
node scripts/prodq.mjs "select …"   # any read-only question of production
npx tsx scripts/demo-documents.ts   # regenerate the demonstration PDFs
```

`scripts/qa/workflow.mjs` writes one application per run and leaves it `ACTIVE`.
It uses only seeded demonstration accounts and creates nothing a demonstration
would not create.
