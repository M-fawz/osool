# 02 — System Architecture

> One application. One database. One deployment. Frontend, backend, and data live together in a
> single Next.js project. There is no separate API server, because there does not need to be one,
> and because a two-repo split would double the surface area for a team that is frontend-strong.

---

## 1. Stack

| Concern | Choice | Why this one |
|---|---|---|
| Framework | **Next.js 15+, App Router, TypeScript** | Server Components and Server Actions mean the backend is the same project. Compliance logic runs on the server by construction, not by discipline. |
| Database | **PostgreSQL 16** | The ownership graph, recursive queries, JSONB for versioned rule payloads, row-level constraints, and real transactions. Nothing else here is adequate. |
| ORM | **Prisma** | Schema-as-source-of-truth, generated TypeScript types, migrations. Makes a backend-light team productive without writing SQL by hand. |
| Validation | **Zod** | One schema definition; the server is the authority, the client reuses it for immediate feedback. |
| Auth | **Better Auth** (or Auth.js) | Session + role handling with admin-provisioned accounts. Must support server-side session validation on every request. |
| UI | **Tailwind CSS + shadcn/ui** | Owned components in the repo, restyled to the design system rather than a vendor look. |
| i18n | **next-intl** | Arabic-first with full RTL, English mirror. |
| Files | Local disk in dev · **S3-compatible object storage** in production | Every upload hashed and stored immutably. |
| Background work | Postgres-backed job table + a worker route | No extra infrastructure. Sufficient for reminders, digests, and signal recomputation. |
| PDF | **React-PDF** or headless Chromium | Statutory letters and registration cards must render Arabic correctly. Verify Arabic shaping early. |
| Deployment | Vercel or a container on a government-approved host | `[DECISION NEEDED — see §10]` |

**Node 22.12 or later** — required by the Impeccable tooling described in `06-DESIGN-DIRECTION.md`.

---

## 2. How the "backend" works, for a frontend developer

Three mechanisms, and that is the whole backend.

**Server Component** — the default. Runs only on the server, can query the database directly, and
sends rendered HTML to the browser. It never ships to the client, so a database call inside it is
safe.

```tsx
// src/app/(gov)/applications/page.tsx
export default async function ApplicationsPage() {
  const session = await requireRole(['EXAMINER', 'REVIEWER'])
  const items = await db.application.findMany({ where: { assignedTo: session.userId } })
  return <ApplicationQueue items={items} />
}
```

**Client Component** — anything needing interactivity. Marked `'use client'`. Runs in the browser.
**Never trust it with a rule.**

**Server Action** — a function that runs on the server but is called from the client like a normal
function. This replaces what would otherwise be REST endpoints.

```ts
'use server'
export async function submitApplication(input: unknown) {
  const session = await requireRole(['BROKER_OWNER'])          // authorisation
  const data = ApplicationSchema.safeParse(input)              // validation — the authority
  if (!data.success) return { ok: false, errors: data.error.flatten() }
  const violations = await rules.evaluate('APPLICATION_SUBMIT', data.data)  // REQ-REG-021 etc.
  if (violations.length) return { ok: false, violations }
  return db.$transaction(async (tx) => { /* write + audit event */ })
}
```

**Route Handlers** (`src/app/api/.../route.ts`) are used only for things that are genuinely HTTP:
file upload streaming, the public verification lookup, webhooks, and the job worker.

### The one rule that matters

> **Authorisation, validation, and every regulatory rule execute on the server. Without
> exception.**

Client-side checks exist for speed of feedback and nothing else. Anyone can bypass them with a
single `curl` command. The predecessor system's central failure was a rule shown in JavaScript
while the server accepted anything — that must never recur here.

---

## 3. Surfaces and route groups

```
src/app/
├── (public)/                      no session required
│   ├── page.tsx                   landing / about the register
│   ├── verify/[number]/           public broker verification lookup
│   └── login/
│
├── (broker)/                      role: BROKER_*  — the supervised population
│   ├── dashboard/
│   ├── application/               new registration, guided
│   ├── registration/              current status, card, renewal
│   ├── contracts/                 brokerage contracts register
│   ├── compliance/                compliance manager appointment + letters
│   ├── documents/
│   └── notifications/             30-day change notifications
│
├── (gov)/                         role: government staff
│   ├── intake/                    REGISTRY_CLERK
│   ├── examination/               EXAMINER
│   ├── review/                    REVIEWER
│   ├── issuance/                  CARD_ISSUER
│   ├── registry/                  the register itself, searchable
│   ├── supervision/               AML_SUPERVISOR — compliance managers, inspections
│   ├── signals/                   integrity signals queue
│   ├── analytics/                 ANALYST
│   └── audit/                     AUDITOR — the trail
│
├── (admin)/                       SYSTEM_ADMIN only
│   └── users/                     account provisioning
│
└── api/
    ├── upload/
    ├── verify/
    └── jobs/
```

---

## 4. Roles and segregation of duties

### Government roles

| Role | Arabic | Can do | Explicitly cannot |
|---|---|---|---|
| `SYSTEM_ADMIN` | مسؤول النظام | Create, suspend, and reactivate accounts; assign roles | **See any application, registration, or supervisory case.** Administration is not access. |
| `REGISTRY_CLERK` | كاتب القيد | Intake, assign temporary number, record page count | Examine, decide |
| `EXAMINER` | الفاحص | Review documents, extract data, request completions, recommend | Approve, review own examination |
| `REVIEWER` | المراجع | Approve or reject after examination | Examine and review the **same** application |
| `CARD_ISSUER` | كاتب التسليم | Issue and record delivery of the registration card | Alter a decision |
| `DATA_MANAGER` | مدير إدارة البيانات | Data extraction and correction with reason | Decide applications |
| `FILES_HEAD` | رئيس قسم الملفات | Archive, indexing | Decide applications |
| `AML_SUPERVISOR` | مسؤول الرقابة | Compliance-manager register, inspections, supervisory findings | Decide registrations |
| `INSPECTOR` | مفتش | Field inspection records | Decide registrations |
| `ANALYST` | محلل | Analytics and signals, aggregate | See document contents |
| `AUDITOR` | مراجع داخلي | Read everything, including the audit trail | Change anything |

### Broker roles

`BROKER_OWNER` (the applicant) · `BROKER_STAFF` (delegated data entry) · `BROKER_AGENT` (acting
under a registered power of attorney, with the POA recorded).

### Account provisioning

- **Government accounts are created only by `SYSTEM_ADMIN`.** No self-registration. The admin
  creates the account with a role and an activation link; the employee sets their own password.
  **The activation link must be delivered by real email** — the predecessor system wrote emails to
  a database table and required an administrator to copy links by hand. That is not acceptable here.
- **Broker accounts self-register** with email and phone verification, because the supervised
  population is large and must be able to onboard without contacting the Authority.

### The controls that make this an integrity system

1. **`EXAMINER` ≠ `REVIEWER` on the same application.** Enforced in a database constraint *and* in
   the action, not by policy.
2. **`SYSTEM_ADMIN` has no case access.** The person who manages accounts cannot approve anything.
3. **Role changes take effect immediately**, including on live sessions. Session state is
   re-validated against the database on every request — never trusted from a cookie for the
   session's lifetime.
4. **Assignment is not self-service.** An examiner does not choose which files they get; assignment
   is recorded, and repeated pairings between an official and an applicant become a signal.

---

## 5. The application state machine

Every transition is an event. There is no field that anyone "just updates".

```
DRAFT
  └─ submit ──────────► SUBMITTED
                          └─ intake ────────► UNDER_INTAKE      (temp number assigned)
                                                └─ assign ─────► UNDER_EXAMINATION
    ┌──────────────────────────────────────────────┤
    │                                              ├─ request completions ─► AWAITING_COMPLETION
    │                                              │        └─ resubmit ──► UNDER_EXAMINATION
    │                                              └─ recommend ──────────► UNDER_REVIEW
    │                                                        ├─ reject ──► REJECTED
    │                                                        └─ approve ─► APPROVED
    │                                                                       └─ fees ──► AWAITING_PAYMENT
    │                                                                                     └─ issue ──► CARD_ISSUED
    │                                                                                                   └─ deliver ──► ACTIVE
    └────────────────── withdraw ────────────────────────────────────────────────────────────────────► WITHDRAWN

ACTIVE ─ expiry approaching (90 days) ─► RENEWAL_DUE ─► (renewal application) ─► ACTIVE
ACTIVE ─ expiry passed ────────────────► LAPSED
ACTIVE ─ supervisory decision ─────────► SUSPENDED / CANCELLED
```

Implementation rules:
- Allowed transitions live in one table, `application_transitions`, and are checked server-side.
  A status is never assignable directly.
- Every transition writes an `ApplicationEvent` row: actor, role, from-state, to-state, reason,
  timestamp, IP, and the configuration version in force.
- `AWAITING_COMPLETION` requires at least one structured completion item — free text alone is not
  accepted, because "استيفاءات" is the most exploitable step in the paper process and must be
  itemised to be auditable.

---

## 6. The rules engine

Regulatory thresholds are **data with an effective date**, never constants in code.

```
rule_set          id, code, description, effective_from, effective_to, published_by, version
rule_item         rule_set_id, key, payload (jsonb)
```

Seeded rule sets:

| Code | Contains | Source |
|---|---|---|
| `BROKER_CATEGORY` | The four A/B/C/D rows — value band and capital floor | `REQ-REG-020` |
| `BROKER_TYPE` | The four types and their definitions | `REQ-REG-010` |
| `DOC_CHECKLIST` | Required documents per applicant kind | `REQ-REG-030`, Part C |
| `DECLARATIONS` | The fifteen declarations as discrete items | `REQ-REG-040` |
| `RETENTION` | Six record types with their periods and clock-start rules | `REQ-AML-030` |
| `RED_FLAGS` | The indicative indicators, bilingual | `REQ-AML-060` |
| `SIGNALS` | Integrity-signal definitions and thresholds | `00-VISION §5` |
| `FOREIGN_OWNERSHIP` | Two-property limit, 4,000 m², five-year lock | `REQ-FGN-003/005/006` |

Evaluation is always as-of a date:

```ts
const rules = await ruleSet('BROKER_CATEGORY', { asOf: application.submittedAt })
```

A decision taken in March is forever re-explainable against the March rules, even after a decree
amends them in October. This is not a nicety — it is what makes a decision defensible to an
inspector.

---

## 7. Audit, immutability, and retention

**Audit events are append-only and hash-chained.** Each row stores the SHA-256 of the previous
row's canonical form plus its own payload, so any tampering breaks the chain and is detectable.

**Read access is audited.** Who *viewed* a file is recorded, not only who changed it. This is both
a data-protection duty (`REQ-DPA-002`) and the mechanism behind several integrity signals.

**There is no destructive delete in this product.** Not for applications, registrations, documents,
users, or supervisory records. The operations that exist are:

| Operation | Effect |
|---|---|
| Archive | Removed from working views, fully retrievable, retention clock running |
| Retention lock | Cannot be archived or altered until the computed eligibility date |
| Legal hold | Cannot be archived at all, regardless of date, until the hold is lifted with a reason |

Retention start-points are computed per record type from `REQ-AML-030`, because they differ — end
of relationship, end of operation, date of report, date of sending, date of shelving decision, and
end of training programme are six different clocks.

**Documents are immutable.** On upload: content hashed (SHA-256), size and MIME recorded, stored
under a content-addressed key. A "replacement" creates a new version and supersedes the old one;
it never overwrites. The hash is what allows the Authority to prove that the document reviewed in
March is byte-identical to the one in the archive today.

---

## 8. The integrity signals engine

Signals are computed by scheduled jobs, written to a `signal` table, and surfaced in a queue.
Each signal carries: type, subject, severity, the evidence that produced it, the rule version
used, and its state (`OPEN` → `UNDER_REVIEW` → `DISMISSED_WITH_REASON` | `ESCALATED`).

**A signal is never an accusation and never triggers an automatic action.** Dismissal requires a
written reason. Escalation creates a case. Both are audited. The interface must say this in words,
on the screen — not just in documentation.

Signal families, from `00-VISION §5`: category-ceiling breach · threshold clustering · registered
activity without register entry · lapsed-but-trading · dormant registration · identity reuse across
entities · power-of-attorney reuse · compliance-manager reuse · declaration contradiction ·
approval with missing documents · implausible decision speed · repeated examiner–applicant pairing ·
segregation-of-duties breach attempt · completions-then-sudden-approval · unfounded completions ·
out-of-hours decisions · abnormal dwell time.

---

## 9. Data model outline

Detailed schema lives in `03-DATA-MODEL.md`. The entities and the reasoning:

| Entity | Why it exists in this shape |
|---|---|
| `Party` | One table for persons and organisations, with a type discriminator and **dual-script names** (Arabic and Latin). Everything that can own, control, apply, or be screened is a Party. |
| `Ownership` | Edge with a percentage between two Parties. This is what makes the 25% cascade computable — `REQ-CDD-002`. |
| `BrokerEntity` | The supervised firm. |
| `Registration` | **Time-bounded**: category, types, capital, valid from/to, status. A firm has a history of registrations, not a mutable set of columns. |
| `Application` | The request that produces or renews a Registration. Carries its own state machine. |
| `ApplicationEvent` | Append-only transition log. |
| `Completion` | An itemised requested completion, with who asked, why, and what satisfied it. |
| `Declaration` | Each of the fifteen as a discrete recorded assertion — `REQ-REG-040`. |
| `PowerOfAttorney` | Number, year, notarisation office, validity declaration. Composite-keyed so reuse is detectable. |
| `BrokerageContract` | Client name in both scripts, nationality, authentication reference, validity, subject property, capacity acted in, value. |
| `ComplianceOfficerTenure` | Appointment as a tenure with start and end, for manager and deputy — never inline columns. |
| `Document` | First-class, hashed, versioned, immutable, typed against `DOC_CHECKLIST`. |
| `Inspection` / `Finding` | Supervisory activity. |
| `Signal` | Integrity signals and their disposition. |
| `AuditEvent` | Hash-chained, includes reads. |
| `RuleSet` / `RuleItem` | Versioned regulatory configuration. |
| `User` / `Session` | Accounts, with role validated from the database on every request. |

Every table carries `created_at`, `updated_at`, `archived_at` (nullable), `retention_until`
(nullable), `legal_hold` (boolean). **No table carries a hard-delete path.**

---

## 10. Decisions still open

| # | Decision | Default if unanswered |
|---|---|---|
| 1 | Hosting — Vercel, or a container on a government-approved host? A government system may require in-country hosting. | Build host-agnostic: Docker + managed Postgres. Do not adopt Vercel-only primitives. |
| 2 | Is this a single national deployment, or per-governorate instances? | Single deployment, with governorate as a data dimension. |
| 3 | Does the platform ever hold suspicious-transaction content? | **No.** It records participation only. This keeps the tipping-off surface as small as possible. |
| 4 | National ID verification against a government source? | Checksum validation locally; no external call assumed. |
| 5 | Integration with the Commercial Register for cross-checking? | Manual entry now; design the field so an integration can populate it later. |
| 6 | Arabic PDF rendering approach for letters and cards | Prototype in the first phase. This has broken projects before; do not defer it. |

---

## 11. What we deliberately are not building

- No property listings, search, or matching. This is a register, not a marketplace.
- No payment processing. Fees are recorded; money moves through existing channels.
- No transmission to the EMLCU. That obligation belongs to the broker.
- No property title registration. That is الشهر العقاري's function.
- No automated rejection, sanction, or accusation. Humans decide; the system evidences.
