# BUILD-PROMPT.md

> **How to use this.** Open Claude Code in `C:\Users\Fawzy\Desktop\osool`. Paste **Prompt 0** first
> and let it finish. Then paste **Prompt 1**, and so on. Do not paste them all at once — each one
> ends in a working, verifiable state, and that is the point.

---

## Prompt 0 — Orientation and scaffold

```
Read CLAUDE.md, then docs/00-VISION-AND-SOLUTION.md, docs/02-SYSTEM-ARCHITECTURE.md,
docs/03-DESIGN-DIRECTION.md, and docs/04-BUILD-PLAN.md in full before doing anything. Skim
docs/01-LEGAL-REFERENCE.md now and return to it whenever you touch a rule.

You are the architect and the engineer on this project. I am a senior frontend developer with no
backend background — explain backend decisions as you make them, in one or two sentences, in your
summaries. Do not stop to ask me for permission or preferences. Decide, act, and tell me what you
decided and why. If something is genuinely ambiguous, pick the safest defensible option, implement
it, and flag it at the end.

Build Phase 0 from docs/04-BUILD-PLAN.md.

Set up the project:
- Next.js 15 App Router with TypeScript, in this directory.
- Tailwind, shadcn/ui, next-intl, Prisma, Zod, Better Auth.
- PostgreSQL. Give me a docker-compose.yml for local Postgres so I do not have to install it.
  Include a one-command setup script and document it in README.md.
- .env.example committed, .env gitignored. No secret ever enters the repository.

Then build, in this order:

1. The Prisma schema for the core entities in docs/02-SYSTEM-ARCHITECTURE.md section 9. Every
   table gets created_at, updated_at, archived_at, retention_until, legal_hold. No entity gets a
   delete path — not now, not ever.

2. src/lib/audit/ — append-only, hash-chained audit events. Every event stores actor, role, action,
   entity, from-state, to-state, reason, timestamp, IP, and the rule-set version in force. Provide
   a verifyChain() function that detects tampering. Read access is audited as well as writes.

3. src/lib/rules/ — the versioned rules engine. RuleSet and RuleItem tables with effective dates.
   Seed BROKER_CATEGORY, BROKER_TYPE, DOC_CHECKLIST, DECLARATIONS, and RETENTION from
   docs/01-LEGAL-REFERENCE.md. Evaluation is always as-of a date. No threshold appears as a
   constant anywhere in the code.

4. Better Auth. Government accounts are created only by SYSTEM_ADMIN — no self-registration.
   Broker accounts self-register with email verification. Activation emails must actually be sent:
   wire a real transactional provider (Resend is fine) with a dev fallback that writes to the
   console. Never a fake outbox table that requires a human to copy links. Roles are re-read from
   the database on every request; a suspended or role-changed user loses access immediately, not at
   next login.

5. src/lib/storage/ — uploads hashed with SHA-256 on receipt, stored content-addressed, never
   overwritten. Replacement creates a new version and supersedes. Local disk in dev, S3-compatible
   interface for production.

6. next-intl with Arabic as the default locale and RTL as the default direction, English as a full
   mirror. Set up the messages files and the direction switching properly, using CSS logical
   properties throughout.

7. The design foundation. Read the logo in public/logo/ and derive the palette and geometry from
   it. Establish tokens and the base component set following docs/03-DESIGN-DIRECTION.md. Do not
   use the AI-default look catalogued in section 3 of that document.

Then prove it works: run the app, create an admin, have the admin create an examiner account, send
the activation email, activate it, sign in, and show me the audit trail for that whole sequence.
Verify the hash chain. Then write to README.md exactly how I run this from a cold machine.

Report at the end: what you built, what you decided and why, what is stubbed, and anything you
flagged. No time estimates.
```

---

## Prompt 1 — Design system pass

```
Install and initialise Impeccable:
  npx impeccable install
  /impeccable init

Point it at the existing PRODUCT.md in this repo rather than generating a new one.

Then bring the design foundation from Phase 0 up to standard:
- Run /impeccable typeset on the type system. The Arabic face leads; the Latin face is paired to
  it. Numerals stay Latin. Mixed Arabic-and-Latin in a single line is the normal case here, not
  an edge case — solve it once in a component.
- Run /impeccable polish on the base components, then /impeccable audit.
- Run /impeccable document to emit DESIGN.md.

Constraints while you do this: read docs/03-DESIGN-DIRECTION.md section 3 first and avoid every
tell listed there. This is an 'operate' surface — density and speed beat whitespace and delight.
The reference points are Egyptian government forms and the official gazette, not SaaS dashboards.

Show me the component set in both RTL and LTR when you are done, and tell me what the detector
flagged and what you changed.
```

---

## Prompt 2 — Registration, end to end

```
Build Phase 1 from docs/04-BUILD-PLAN.md.

The broker portal side:
- The registration application as a guided multi-step form, mobile-first. Fields per REQ-REG-030.
- The fifteen declarations from REQ-REG-040 as discrete recorded assertions, each stored
  individually with its own timestamp. Not one blanket checkbox.
- Power of attorney capture per REQ-REG-041, composite-keyed on number + year + notarisation
  office so reuse across applicants is detectable later.
- Document upload driven by the DOC_CHECKLIST rule set. Phone camera capture, drag and drop,
  progress, failure, retry. This step cannot be skipped.
- Save and resume. An incomplete application is visually distinct everywhere it appears and cannot
  be submitted.
- Submission validated server-side. Category against paid-up capital per REQ-REG-020 and
  REQ-REG-021, read from the rule set as-of the submission date.

The government side — digitise the workflow in REQ-REG-050 exactly as printed on the GOEIC forms.
Do not redesign the process:
- Intake by REGISTRY_CLERK: temporary number, page count.
- Examination by EXAMINER: document review, data extraction onto the internal review form per
  REQ-REG-051, itemised completions per REQ-REG-052. Completions are structured items, never free
  text alone.
- Review by REVIEWER: approve or reject.
- Fee recording, card issuance with the permanent registration number, delivery, data extraction,
  archiving.

Enforce segregation of duties in a database constraint and in the action: the examiner and the
reviewer of the same application must be different people. SYSTEM_ADMIN can see no case data at all.

Every transition writes an event. Status is never assignable directly — only through a transition
that the allowed-transitions table permits.

Blocked-action copy follows docs/03-DESIGN-DIRECTION.md section 6: what is blocked, why with the
rule named plainly, the exact next step, who to ask.

Prove it: seed realistic Egyptian test data — plausible company names, Arabic personal names,
Cairo and Giza addresses, realistic EGP capital figures. Then run a full application from broker
submission to issued card, and show me the event trail. Then show me an application attempting
Category C with EGP 30,000 capital being refused, with the message the user sees.

Run /impeccable audit on every screen before you call this done.
```

---

## Prompt 3 — Register and public verification

```
Build Phase 2 from docs/04-BUILD-PLAN.md.

- The register: searchable across both Arabic and Latin names simultaneously, filterable by
  category, type, governorate, and status. Design for 50,000 rows, not 50 — no unbounded dropdowns,
  no full-table LIKE scans, windowed pagination.
- Registration validity, the 90-day renewal window per REQ-REG-060, renewal applications, and
  lapse handling.
- Brokerage contract registration per REQ-REG-063, with the capacity acted in validated against
  the types the broker actually holds per REQ-REG-010, and the value checked against the category
  ceiling per REQ-REG-022.
- The 30-day change notification obligation per REQ-REG-062, with tracking of whether it was met.
- Public verification: one page, unauthenticated, a registration number in and a definitive answer
  out — registered or not, for what types, which category, valid until when. Fast, and readable on
  a phone in sunlight. This page is 'read' mode, not 'operate'.

Then show me the register with 5,000 seeded rows and tell me the query timings.
```

---

## Prompt 4 — AML supervision

```
Build Phase 3 from docs/04-BUILD-PLAN.md. Read Part B of docs/01-LEGAL-REFERENCE.md first.

- The compliance-manager register: manager and deputy as tenures with start and end dates per
  REQ-AML-010, never as overwritable columns. Appointment history is preserved.
- Generate the two statutory notification letters — to the Authority and to the Unit — pre-filled
  and print-ready. They must render correct Arabic in the PDF. Prove this with an actual generated
  file, not a claim.
- Training records per REQ-AML-050.
- Inspection scheduling, with checklists derived from REQ-AML-040, findings, and remediation
  tracking.
- Retention applied per record type using the six distinct clock-start rules in REQ-AML-030. Show
  me the archive, retention-lock, and legal-hold behaviour working, and show me what a user sees
  when they try to remove a record that is still within its retention window.

Important: this platform holds no suspicious-transaction content. It records only that a supervised
entity has a reporting capability. Nothing anywhere may reveal that a specific report exists —
REQ-AML-021.
```

---

## Prompt 5 — Integrity signals

```
Build Phase 4 from docs/04-BUILD-PLAN.md. Read section 5 of docs/00-VISION-AND-SOLUTION.md first —
this is the phase that carries the political argument for the whole platform.

Implement both signal families: signals about the supervised population, and signals about the
Authority's own process.

Each signal records its type, subject, severity, the evidence that produced it, the rule version
used, and its state. Disposition requires a written reason and is audited. Escalation creates a case.

Nothing is automatic. No rejection, no sanction, no accusation. The interface must say so in words
on the screen: a signal is triage, not a verdict.

Wording on these screens is neutral and evidential. 'This application was approved while two
required documents were absent' — never 'suspicious officer'.

Seed data that actually triggers several signals of each family, so the queue is demonstrable, and
then walk me through the two screens that make the strongest case: approvals with missing
documents, and repeated completion requests followed by an abrupt approval with no new upload.
```

---

## Prompt 6 — Hardening and handover

```
Build Phase 5 from docs/04-BUILD-PLAN.md, then harden.

- Security review against docs/02-SYSTEM-ARCHITECTURE.md sections 4, 7, and 10. Specifically:
  no unscoped record access by raw id, session state re-validated from the database on every
  request, rate limiting on authentication, no secret in the repository, PII encrypted at rest.
- Confirm by search that no destructive delete exists anywhere in the codebase.
- Confirm every regulatory enforcement point carries its REQ-* comment.
- Accessibility audit: WCAG AA, keyboard-only operation of the back office, no meaning carried by
  colour alone.
- npx impeccable detect src/ with zero findings.
- Load test the register.

Then write me:
- README.md — how to run this from a cold machine, step by step, assuming no backend knowledge.
- docs/OPERATIONS.md — deployment, backup, and how to restore.
- docs/USER-GUIDE-AR.md — how to use the system, in Arabic, one section per role, written for a
  government employee who has never used it.
- docs/DEMO-SCRIPT.md — a ten-minute walkthrough for a government stakeholder. Open with the
  problem, not the software. End on the integrity signals.
```

---

## Plugins and tooling to install

| Tool | Command | What it gives you |
|---|---|---|
| **Impeccable** | `npx impeccable install` then `/impeccable init` | Design vocabulary, slop detector, and the `/polish` `/audit` `/typeset` `/distill` commands. Node 22.12+. |
| **Prisma extension** | VS Code marketplace | Schema syntax, formatting, autocomplete |
| **Tailwind IntelliSense** | VS Code marketplace | Class autocomplete and hover previews |
| **Error Lens** | VS Code marketplace | Inline errors — worth a lot when learning the backend side |
| **Docker Desktop** | Install once | Local Postgres without installing Postgres |

Optional but useful: the Impeccable Chrome extension to run the detector overlay against your
running app, and `npx impeccable detect src/` as a pull-request gate.

---

## What to expect of yourself, and what to expect of Claude Code

You are strong on the frontend and new to the backend. That is a workable position on this project,
because in Next.js the backend is the same codebase — Server Components, Server Actions, and Prisma.
There is no second server to learn.

Two habits worth forming from the start:

**After each prompt, read the Prisma schema it wrote.** That file is the system. If you understand
`prisma/schema.prisma`, you understand the backend. Ask Claude Code to walk you through any model
you do not follow.

**Do not accept "it works" without seeing it work.** Run it yourself. Every prompt above ends with
a demonstration for exactly this reason.
