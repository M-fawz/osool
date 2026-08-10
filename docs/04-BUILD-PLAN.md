# 04 — Build Plan

Ordered by dependency and by what each phase makes demonstrable. No time estimates — sequence only.

Each phase names the **proof point**: the single thing you can put in front of a government
stakeholder to show that phase landed.

---

## Phase 0 — Foundation

Project scaffold; Postgres running; Prisma schema for the core entities; Better Auth with
admin-provisioned government accounts and self-registering broker accounts; real transactional
email for activation; next-intl with Arabic-RTL primary and English mirror; design tokens and the
base component set derived from the logo; the audit module with hash chaining; the rules engine
with seeded rule sets; storage with content hashing.

**Proof point:** an administrator creates an examiner account, the examiner receives a real email,
activates, signs in, and every one of those steps is visible in the audit trail.

**Do not proceed until:** there is no code path anywhere that deletes a row, and Arabic renders
correctly in a generated PDF.

---

## Phase 1 — Registration, end to end

The broker portal application flow: guided form, document upload from a phone camera, the fifteen
declarations as discrete assertions, power-of-attorney capture, save-and-resume, submission.

The government workflow exactly as printed on the GOEIC forms: intake with a temporary number,
examination with itemised completions, review, approval, fee recording, card issuance, delivery,
data extraction, archiving. Segregation of duties enforced. Every transition an event.

Category enforcement against paid-up capital, from versioned configuration.

**Proof point:** a complete application travels from a broker's phone to an issued registration
card, with every hand it passed through named and timestamped — and an attempt to register under
Category C with EGP 30,000 capital is refused with an explanation citing Decree 578/2025.

---

## Phase 2 — The register and public verification

The register itself: searchable across Arabic and Latin names, filterable by category, type,
governorate, and status. Registration validity, the 90-day renewal window, lapse handling.
Brokerage contract registration. The 30-day change-notification obligation with tracking.

Public verification: one page, a registration number in, a definitive answer out.

**Proof point:** a citizen types a registration number and learns in one screen whether that broker
is genuinely registered, for what, and until when. That capability does not exist today at all.

---

## Phase 3 — AML supervision

The compliance-manager register as tenures for manager and deputy. Generation of the two statutory
notification letters, pre-filled and print-ready in correct Arabic. Training records. Inspection
scheduling, checklists derived from the Regulatory Controls, findings, and remediation tracking.
Retention rules applied per record type with their six distinct clock-start rules.

**Proof point:** the Authority can see, for the first time, who every broker's compliance manager
is — and that the same individual is listed for eleven unrelated firms.

---

## Phase 4 — Integrity signals

The signals engine, the queue, evidence display, disposition with mandatory written reasons,
escalation to a case. Both families: signals about the supervised population, and signals about the
Authority's own process.

**Proof point:** the screen showing applications approved while required documents were absent, and
the screen showing repeated completion requests followed by an abrupt approval with no new document
uploaded. This is the phase that makes the political argument.

---

## Phase 5 — Analytics, export, and hardening

Supervisory analytics by governorate, category, and type. The inspector's evidence pack export.
Foreign-buyer advisory checks. Data-protection tooling for subject requests, with the retention
conflict surfaced explicitly. Security review, load testing, and accessibility audit.

**Proof point:** an inspector requests everything about one broker and receives a complete,
hash-verified evidence pack.

---

## Rules that apply to every phase

- No phase is complete while a server-side rule exists only client-side.
- No phase is complete while any code path can destroy a record.
- Every screen passes `/impeccable audit` before it is considered done.
- Every regulatory enforcement point cites its `REQ-*` ID.
- Anything marked `[NEEDS COUNSEL]` warns and flags; it does not block.
