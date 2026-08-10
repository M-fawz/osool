# Phase 1 report — registration, end to end

**Proof point (04-BUILD-PLAN.md):** *a complete application travels from a broker's phone to an
issued registration card, with every hand it passed through named and timestamped — and an attempt
to register under Category C with EGP 30,000 capital is refused with an explanation citing Decree
578/2025.*

Both halves are demonstrable by running `npm run proof:phase1`. The report below says what was
built to get there, what was decided and why, what is deliberately unfinished, and what Phase 2
needs from this.

---

## 1. What exists now

### The broker portal — an application from a phone

A guided eight-step flow at `/application`, mobile-first, Arabic-canonical.

| Step | Slug | What it captures | Requirement |
|---|---|---|---|
| 1 | `capacity` | Applicant capacity, name in both scripts, national ID, nationality | REQ-REG-030, CDD §5.1 |
| 2 | `power-of-attorney` | POA type, number, year, notarisation office, two separate validity declarations | REQ-REG-041 |
| 3 | `entity` | Trade name, trade style, premises, PO box, telephone, commercial register (number, office, date, renewal), capital, tax registration and office | REQ-REG-030 |
| 4 | `category` | The four types (multi-select) and the category, checked live against paid-up capital | REQ-REG-010, 020, 021 |
| 5 | `contracts` | Client name in both scripts, nationality, authentication body and number, validity, capacity acted in, subject and address | REQ-REG-030 |
| 6 | `documents` | Driven by the `DOC_CHECKLIST` rule set; camera capture, drag-and-drop, real upload progress, retry, preview | REQ-REG-030, CDD §§5.1–5.2 |
| 7 | `declarations` | The fifteen, each an individually timestamped assertion | REQ-REG-040 |
| 8 | `review` | Full summary, every gap linked, submission gated | — |

Step 2 exists only for an agent, and the progress indicator counts accordingly — an applicant
counting screens gets a true count.

Save-and-resume is not a feature bolted on; each step commits on save and `/application/<id>` sends
a returning applicant to the first step that is not finished.

### The government workflow — REQ-REG-050, unaltered

All eight printed steps, each with its own queue as that role's landing screen.

| Step | Role | Screen | What it produces |
|---|---|---|---|
| 1 | `REGISTRY_CLERK` | `/intake` → `/applications/<id>` | Temporary number `T-2026/0012`, page count, assignment |
| 2 | `EXAMINER` | `/examination` → `/examination/<id>` | The internal review form (REQ-REG-051), itemised completions |
| 3 | `REVIEWER` | `/review` → `/review/<id>` | Approval or refusal with a written reason |
| 4 | `CARD_ISSUER` | `/issuance/<id>` | Fee record, eight headings, method and bank |
| 5 | `CARD_ISSUER` | `/issuance/<id>` | Permanent number `2026/0007`, the PDF card, the Registration, the BrokerageContract rows |
| 6 | `CARD_ISSUER` | `/issuance/<id>` | Delivery serial `D-2026/0004` and two acknowledgements |
| 7 | `DATA_MANAGER` | `/records` → `/applications/<id>` | Data extraction record |
| 8 | `FILES_HEAD` | `/archive` → `/applications/<id>` | Page count, serial register, alphabetical index |

### New database objects

`ApplicationEntityData`, `ApplicationContractData`, `ExaminationRecord`, `ExaminationFieldCheck`,
`FeeRecord`, `FeeLine`, `CardIssuance`, `FileHandlingRecord`; `DocumentKind`, `PaymentMethod`,
`AuthenticationBody`, `ExaminerRecommendation`; `Completion.round`; commercial-register office,
renewal date, and tax office on `Party`; `Application.applicantPartyId`.

Migration `20260808234108_phase1_registration_workflow` adds the tables, the `BEFORE DELETE` and
`BEFORE TRUNCATE` triggers for every one of them, and seven `CHECK` constraints — including a
second, independent enforcement of REQ-REG-052 on `examination_record`, where the two signatures
actually live.

### New rule sets

- **`FEE_SCHEDULE`** — the eight fee headings from REQ-REG-030. **Every amount is `null`.**
- **`EXAMINATION_FORM`** — the sixteen lines of REQ-REG-051, each naming the `DOC_CHECKLIST` item
  it is checked against. This is what makes the examiner's screen a comparison rather than a form.

---

## 2. What we decided, and why

### The examiner's screen is a comparison, not a form

The requirement asks for the submitted data, the documents, the checklist, and the completions on
one screen. The obvious build is four panels. What we built instead makes the internal review form
*be* the comparison: each of the sixteen lines carries the declared fact, the document that answers
it, and the tick, on one row. Selecting a line puts its document in the sticky pane beside it.

The consequence worth naming: **`ExaminationFieldCheck` is a row per line, not a boolean per form.**
A single "I checked it" flag records that somebody clicked. Sixteen rows record what they looked
at, and make "approved while the tax number was never checked against the tax card" a computable
fact rather than an unanswerable question. That is the same reasoning that itemises الاستيفاءات.

### The fifteen declarations save one at a time

REQ-REG-040 requires "a discrete, individually recorded assertion — not a single 'I agree'
checkbox". Fifteen checkboxes in one form, submitted together, would write fifteen rows carrying
one timestamp: one act, recorded fifteen times. Each declaration therefore posts on its own the
moment it is affirmed, and carries its own `assertedAt`. The wording is copied onto the row as it
is asserted, so the register can always show what was signed rather than what the current rule-set
version says today.

Declaration 10 is not a yes/no. REQ-REG-040 item 10 offers two lawful answers — "not a public
employee", or "here is the employer, and I consent to their being notified" — so it renders as a
choice with a named employer. Treating the second as unanswered would have forced an honest
applicant to lie to proceed.

### Declared data is separate from the register's data

`ApplicationEntityData` holds what the applicant *said*; `BrokerEntity` and `Party` hold what the
register *holds*. If they were one set of columns, a firm correcting its telephone number in 2027
would silently rewrite the document an examiner approved in 2026. The projection runs one way, at
issuance, and never the reverse.

### The national ID is stored twice, on purpose

`nationalIdEnc` is AES-256-GCM — reversible, authenticated, different ciphertext every time, so the
column cannot be used to compare anything. `nationalIdHash` is a keyed HMAC — deterministic, so
duplicates are computable, and keyed so the ten-digit space cannot be enumerated the way a bare
SHA-256 of a national ID can. Neither substitutes for the other. `src/lib/crypto/pii.ts`.

The number is **never rendered back** — not on the review screen, not on the examiner's screen.
Re-entering it is safer than displaying it.

### The category screen shows the rule while the applicant is still deciding

Capital comes before category, because the capital is the fact and the category is the consequence.
As the figure is typed, the category list re-labels itself. Nothing is disabled: an applicant may
save a category their capital does not support and come back, because the capital figure is often
the thing that turns out to be wrong. **The refusal lands at submission**, in full, with the decree
cited — and it is computed on the server against `BROKER_CATEGORY` as of the submission date.

### The submit button is never disabled

Pressing it on an incomplete application produces the server's refusal naming the missing items. A
control that cannot be pressed and does not say why is the commonest dead end in a government form,
and here the "why" is a list the applicant needs anyway.

### The workflow logic lives in `src/lib/applications/workflow.ts`

The Server Actions authorise, parse, and delegate. This exists so the demonstration seed and the
proof script walk files through the *same* code an official walks them through. A seed that inserted
rows at chosen statuses would have produced a register whose event trail was fiction — and the trail
is the proof point.

### Fees carry no tariff

`01-LEGAL-REFERENCE.md` lists the eight headings and states no figure for any of them. CLAUDE.md
rule 3 is explicit, so `FEE_SCHEDULE` seeds `amount: null` and `amountSource:
'NOT_IN_LEGAL_REFERENCE'` on every item, and the treasurer's screen says so in words. Invented fee
amounts would have looked authoritative on a printed receipt and nobody downstream would have known
they were guessed. **This is a `[NEEDS COUNSEL]` item — see §5.**

### Removal is archiving, and the copy says so

"Remove this contract" sets `archivedAt`. The confirmation text reads *«لن يُحذف العقد من السجل،
وإنما يُستبعد من هذا الطلب»* rather than letting the applicant believe otherwise.

---

## 3. What was proved, by running it

`npm run proof:phase1` (add `--routes` with `npm run dev` running for proof 6).

| # | Proof | Result |
|---|---|---|
| 1 | A complete application travels from submission to an issued card | **PASS** — 11 steps, 8 transitions, 5 distinct people, card stored and hashed |
| 2 | Category C below the capital floor is refused | **PASS** — refused by the engine *and* at submission; the file stays a draft |
| 3 | The same official cannot examine and then approve | **PASS** — refused; the file does not move; a different reviewer approves it without difficulty |
| 4 | An incomplete application cannot be submitted | **PASS** — 30 items named, in both languages, each linked to its step |
| 5 | The audit chain is intact; no destructive delete exists | **PASS** — chain verified end to end; `DELETE` refused by the database on all eight new tables |
| 6 | Every route renders in Arabic RTL and English LTR | **PASS** — 24 routes × 2 locales |

Proof 3 is worth describing precisely, because it tests the realistic failure rather than a
tautology: an examiner completes and signs a file, is then **given the reviewer role**, and tries to
approve it. That is how segregation of duties actually fails in a real organisation — not two job
titles, but one person holding both at different moments. The attempt is refused, the file does not
move, no reviewer is recorded, and the role is restored.

The exact Arabic the applicant reads on the capital refusal:

> **ما الذي تعذّر:** لا يمكن تقديم هذا الطلب.
> **السبب:** رأس المال المدفوع 30,000 جنيه مصري لا يبلغ الحد الأدنى المقرر لـفئة ج وهو 50,000 جنيه
> مصري — قرار وزاري ٥٧٨ لسنة ٢٠٢٥، المادة ٢.
> **الخطوة التالية:** إمّا زيادة رأس المال المدفوع إلى 50,000 جنيه مصري على الأقل، أو التقدم تحت
> فئة د، التي تسمح بعقود حتى 10,000,000 جنيه مصري.
> **لمن تتوجه:** للاستفسار، تواصل مع الإدارة المركزية للسجلات التجارية بالهيئة العامة للرقابة على
> الصادرات والواردات.

Both figures in that sentence are interpolated from the rule set. A decree amendment changes the
message and the outcome together, without anyone editing code.

### Mobile

`npx tsx .proof/mobile-screens.ts` screenshots all eight steps at 360px and 390px and asserts two
things a screenshot alone hides: **no horizontal overflow** on any screen at either width, and **no
touch target under 44px**. Screenshots land in `.proof/mobile/`.

Prompt 1's report flagged sub-500px as untested. It is now tested, the test is repeatable, and it
found three real failures on the first run, all now fixed:

| Finding | Fix |
|---|---|
| Sign-out button 32px in the portal chrome | `SignOutButton` takes a `size`; the portal passes `touch`, the back office keeps `sm`. Same control, two products — the back office is a desk and a `touch` button there costs a row of the queue. |
| Wordmark link 36px | `min-h-11` on the link. |
| "تعديل" links on the review step 36px | `min-h-11`, and the label went from 13px to 15px. |

A fourth finding came from looking at the screenshot rather than from the assertions: the
**registration-type definitions were printing in English under Arabic labels**, because
`BROKER_TYPE` carries `definitionEn` only. The Arabic reader now gets the label alone — سمسار بيع
already says what the type is — and supplying `definitionAr` is a rule-set version bump. Same
treatment as the document descriptions.

### The design detector

`node .claude/skills/impeccable/scripts/detect.mjs src/` exits 0.

### The card, verified against the register

`npx tsx .proof/extract-card.ts` pulls the most recently issued card out of storage, **re-hashes it
and compares with the hash recorded at issuance**, and renders the same registration's data through
the same template to `.proof/issued-card.png` so the Arabic shaping can be looked at. Number
`2026/0014` verified byte-identical; Arabic correctly joined; the registration number and the dates
not reversed.

### Three things in existing code that Phase 1 broke or found broken

Reported rather than quietly repaired, because each one is a lesson:

1. **`proof:phase0` failed** after this phase's work — not because the foundation broke, but because
   it detected a rendered dashboard by matching Phase 0's own build-status sentence, which Phase 1
   updated. Its marker now matches the dashboard's *title*. A marker should identify the screen, not
   the moment.
2. **`proof:rules` failed on its second run.** It publishes a hypothetical `BROKER_CATEGORY` v2 and
   archives it on the way out — so the next run looked for a version it had itself put beyond the
   reach of `ruleSet()`, and failed with "no version in force", which reads like a defect in the
   rules engine. It now un-archives on re-entry.
3. **`audit:no-deletes` flagged the Phase 1 proof**, correctly: proof 5 issues a real `DELETE` to
   demonstrate that the database refuses it. It now carries the checker's own `no-delete-allowed:`
   marker and the reason. The checker was right to ask.

---

## 4. What is stubbed or deliberately absent

| Thing | State | Why |
|---|---|---|
| Public verification lookup | Absent | Phase 2. The landing page's search box is not wired. |
| The register, searchable | Absent | Phase 2. |
| Renewal and lapse | Absent | Phase 2. `OBLIGATION_PERIODS` carries the 90-day window and the registration page shows the renewal date; nothing computes a lapse yet. |
| `AML_SUPERVISOR`, `INSPECTOR`, `ANALYST` screens | Absent | Phases 3–5. Their accounts exist and their sidebars correctly show no queue rather than a greyed-out one. |
| Integrity signals | Absent | Phase 4 — but the data they need is being recorded now. See §6. |
| Broker self-registration | Partial | Better Auth's sign-up works; there is no public "create a broker account" screen. The demonstration seeds broker accounts. |
| Amendment and renewal application kinds | Enum only | `ApplicationKind` carries them; only `NEW_REGISTRATION` has a flow. |
| Arabic descriptions in rule data | Partial | `DOC_CHECKLIST` carries `descriptionEn` and `BROKER_TYPE` carries `definitionEn`; neither has an Arabic counterpart. The Arabic screens show the label alone rather than English prose on an Arabic page. Fixing it is a rule-set version bump, not a code change — and it is the highest-value small thing left. |
| Fee amounts | By design | See §2 and §5. |

---

## 5. Flagged for counsel

| Item | Where | What is needed |
|---|---|---|
| **Fee tariff** | `prisma/rule-sets/fee-schedule.ts` | `01-LEGAL-REFERENCE.md` states no figure for any of the eight headings. Amounts are entered from the treasury receipt. If a published tariff exists it becomes `FEE_SCHEDULE` v2 with an effective date. |
| **Registration validity period** | `OBLIGATION_PERIODS.REGISTRATION_VALIDITY` | Carried forward from Phase 0 and still unconfirmed. Five years is a working value marked `needsCounsel: true`. Issuance uses the examiner's proposed dates where they exist and falls back to the default only where they do not; **the audit event records which of the two was used** (`validityYearsSource`). |
| **Declaration wording** | `prisma/rule-sets/declarations.ts` | All fifteen are marked `wordingStatus: 'WORKING_TRANSLATION'`. The applicant is signing a binding declaration with criminal exposure behind it; the wording asserted must eventually be the wording the Authority printed. Replacing the strings is a version bump — every declaration already asserted stays bound to the wording actually shown. |
| **Category ceilings** | `prisma/rule-sets/broker-category.ts` | The decree states each band as a lower bound. The upper bounds are derived by reading the four rows as a ladder and are marked `ceilingDerived: true` on each item. |
| **Completion re-examination round** | `Completion.round` | The system permits unlimited rounds. Whether the Authority caps them is a policy question, not a technical one. |
| **National ID checksum** | `src/lib/crypto/pii.ts` | Structural validation only — century, decodable date of birth, governorate code in range. It proves the number is *well-formed*, never that the person exists, and the error key says `nationalIdFormat` rather than `nationalIdNotFound` so no screen can imply otherwise. |

None of these gates a user action. `applyCounselGate()` downgrades any `needsCounsel` violation from
BLOCKING to ADVISORY in one place, so no evaluator can forget.

---

## 6. What Phase 4 can already compute from Phase 1's records

Listed here because it is the argument for the shape of the data model, and because it would be easy
to lose:

| Signal (00-VISION §5) | The record that makes it computable |
|---|---|
| Approval with missing documents | `ExaminationFieldCheck` per line + `DOC_CHECKLIST` resolution at decision time |
| Unfounded completions | `Completion.checklistItemKey` — null is recorded, and the audit event carries `uncitedCount` |
| Completions then sudden approval | `Completion.round` + `ApplicationEvent` timestamps + `Document.uploadedAt` |
| Power-of-attorney reuse | `PowerOfAttorney` composite key (number, year, office) — one row however many applicants cite it |
| Identity reuse across entities | `Party.nationalIdHash`, the keyed fingerprint |
| Implausible decision speed | `ApplicationEvent.occurredAt` on every transition |
| Out-of-hours decisions | The same |
| Repeated examiner–applicant pairing | `Application.examinerId` + `brokerEntityId` |
| Segregation-of-duties breach attempt | The refusal is a `TRANSITION`-level event; the *attempt* is not yet written to the trail — **see the note below** |
| Abnormal dwell time | `updatedAt` on the application, already the queue's waiting column |

**One gap worth naming:** a refused action currently writes nothing. The refusal is correct, the
file does not move, and nothing records that somebody tried. For most refusals that is right — an
applicant hitting the capital floor is not an integrity event. For **segregation-of-duties
attempts** it is not right, and Phase 4 will want them. Adding it means writing an audit event from
the refusal path in `transition()`. It was left out of Phase 1 rather than half-built.

---

## 7. What Phase 2 needs from this

1. **The register is populated.** `Registration` rows carry number, category, types, capital,
   validity, and the rule-set version they were decided under. Public verification is a read.
2. **`BrokerageContract` rows exist** and are attached to a `Registration` — created at issuance
   from the declared contract data. Phase 2's contract registration extends this rather than
   starting it.
3. **`OBLIGATION_PERIODS`** carries the 90-day renewal window and the 30-day notification duties as
   versioned data. Phase 2 computes against it; nothing needs to be re-derived.
4. **Search will need an index.** `Party.nameAr`, `nameEn`, and `commercialRegisterNo` are indexed;
   cross-script search over both at once is not, and Phase 2 should add a trigram or full-text index
   rather than filtering in application code.
5. **The public verification page must not leak.** It answers "is this number registered, for what,
   until when" — and nothing else. In particular it must not reveal application history, examiner
   identity, or the existence of a refused application.

---

## 8. Accounts

`npm run seed:phase1` creates them. All are development accounts with weak passwords.

| Account | Password | Role |
|---|---|---|
| `mahmoud.fawzy@osool.gov.eg` | `MahmoudFawzy@123` | `SYSTEM_ADMIN` |
| `clerk@osool.test` | `DevOnly!Osool2026` | `REGISTRY_CLERK` |
| `examiner@osool.test`, `examiner2@osool.test` | `DevOnly!Osool2026` | `EXAMINER` |
| `reviewer@osool.test`, `reviewer2@osool.test` | `DevOnly!Osool2026` | `REVIEWER` |
| `issuer@osool.test` | `DevOnly!Osool2026` | `CARD_ISSUER` |
| `data@osool.test` | `DevOnly!Osool2026` | `DATA_MANAGER` |
| `files@osool.test` | `DevOnly!Osool2026` | `FILES_HEAD` |
| `auditor@osool.test` | `DevOnly!Osool2026` | `AUDITOR` |
| `aml@osool.test` | `DevOnly!Osool2026` | `AML_SUPERVISOR` |
| 14 broker accounts (`broker@`, `nile@`, `delta@`, …) | `DevOnly!Osool2026` | `BROKER_OWNER` |

> ### These accounts must never exist in any real deployment
>
> `mahmoud.fawzy@osool.gov.eg` has its password **set directly**, bypassing the activation-email
> path that every real government account must use. `MahmoudFawzy@123` is eight characters of a
> name and three digits; it would not survive an afternoon.
>
> The seed refuses to run with `NODE_ENV=production` or against a non-local database, checked in
> code rather than documented. That is a guard, not a substitute for judgement: **before any
> deployment, these accounts are removed and the register is seeded empty.**
>
> Two examiners and two reviewers exist deliberately. REQ-REG-052 only becomes visible when there
> is somebody else to pass a file to; one of each makes segregation of duties look like a rule
> about job titles rather than about people.

The demonstration register holds fourteen applications with **one at every stage** of REQ-REG-050 —
including a refused one, an incomplete draft, one awaiting completions, and Delta Misr's Category C
request on EGP 30,000 that cannot be submitted. No queue demonstrates empty.

It grows every time `npm run proof:phase1` runs, because the proof walks a *fresh* application from
end to end rather than re-walking one that already reached ACTIVE — re-walking would append events
for movements that never happened, and the trail the proof prints is the point. Nothing is deleted
to make room. `npx tsx .proof/register-state.ts` reports what the register currently holds.

---

## 9. Things it would be easy to break

1. **`transition()` is the only writer of `application.status`.** Nothing else in the codebase sets
   that column. If a second writer appears, "every transition is an event" stops being a property of
   the system and becomes a habit.
2. **Adding a table means adding it to the delete-guard array.** The guarantee in CLAUDE.md rule 2
   is only as good as the least-recently-updated list in the migration.
3. **`SUBSTRING(... FROM $n)` needs `::int`.** Prisma sends a JavaScript number as `bigint`, and
   PostgreSQL has no `substring(text, bigint)`. It fails at run time, not at compile time. Written
   down in `src/lib/applications/numbering.ts` because it cost an hour.
4. **Validation messages are keys, not sentences.** The Zod schemas emit `needsArabic`, not "Write
   this in Arabic", so the Arabic lives in the message catalogue with the rest of the Arabic.
   Returning prose from a schema puts English on an Arabic screen.
5. **Do not assert against raw HTML.** Next inlines the whole message catalogue into the development
   bundle, so a substring search of the response body finds any string you ask it for. The route
   proof asserts against the rendered DOM through a real browser.
6. **The locale cookie is real behaviour.** Arabic is unprefixed, so an unprefixed request resolves
   from `NEXT_LOCALE` and then from `Accept-Language`. A test that does not state the cookie is
   measuring the browser's language preference, not the route.

---

*Phase 1 is complete against 04-BUILD-PLAN.md. Phase 2 is the register and public verification.*
