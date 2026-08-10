# CLAUDE.md — Osool (أصول)

## What this is

A proposal-stage platform for the **Government of Egypt**: the digital Real Estate Brokers Register
(سجل الوسطاء العقاريين) operated by **GOEIC** (الهيئة العامة للرقابة على الصادرات والواردات) under
the **Ministry of Investment and Foreign Trade**, with AML/CFT supervision of brokers and automated
process-integrity signals.

**This is a regulator's system, not a broker's tool, and not a property marketplace.** Brokers are
the supervised population. Government officials are the primary users.

## Read before working

| When | Read |
|---|---|
| Always, first session | `docs/00-VISION-AND-SOLUTION.md` |
| Any rule, threshold, deadline, or legal reference | `docs/01-LEGAL-REFERENCE.md` |
| Any architectural or data decision | `docs/02-SYSTEM-ARCHITECTURE.md` |
| Any UI work | `docs/03-DESIGN-DIRECTION.md` and `PRODUCT.md` |

Do not restate these files back to the user. Read them and act.

## Stack

Next.js 15 (App Router, TypeScript) · PostgreSQL 16 · Prisma · Zod · Better Auth · Tailwind +
shadcn/ui · next-intl · S3-compatible object storage. Node 22.12+. Frontend, backend, and database
are **one project**. There is no separate API server.

## The rules that override everything else

1. **Enforce on the server. Always.** Authorisation, validation, and every regulatory rule run in
   Server Actions or Route Handlers. Client-side checks are for feedback speed only. A rule that is
   not enforced server-side does not exist. The predecessor system failed precisely here.
2. **Nothing is ever deleted.** No `DELETE`, no cascade destruction, anywhere, for any entity.
   Archive, retention lock, legal hold. If you are about to write a delete, stop and re-read
   `docs/02-SYSTEM-ARCHITECTURE.md` §7.
3. **Every regulatory rule cites its requirement ID.** Comment the `REQ-*` ID from
   `docs/01-LEGAL-REFERENCE.md` at each enforcement point. If a rule has no ID there, it does not
   go into the code — raise it instead.
4. **Thresholds are versioned data, never constants.** Category bands, capital floors, document
   checklists, retention periods, declarations: all in the `RuleSet` tables with effective dates.
   A decree amendment must be a configuration change, not a deployment.
5. **Every state change is an append-only, hash-chained audit event** — actor, role, from-state,
   to-state, reason, timestamp, IP, rule version. Read access is audited too, not only writes.
6. **Segregation of duties is code.** The examiner and the reviewer of the same application must be
   different people. `SYSTEM_ADMIN` manages accounts and can see no case data.
7. **Arabic first, RTL first.** English is a full mirror, not a courtesy. Numerals, dates, and
   reference numbers stay LTR inside RTL text.
8. **Signals inform; they never decide.** No automatic rejection, sanction, or accusation.
   Dismissal of a signal requires a written reason and is audited.
9. **No suspicious-transaction content lives in this platform.** It records that a supervised
   entity has a reporting capability. Nothing may reveal to any unauthorised user that a specific
   report exists — the no-tipping-off constraint, `REQ-AML-021`.
10. **`[NEEDS COUNSEL]` requirements never gate a user action.** They may warn and flag for human
    review. They do not block until a lawyer has cleared them.

## Blocked-action copy

Every refusal states, in this order: what is blocked · why, naming the rule in plain language ·
the exact next step · who to ask. Never a bare error.

## Conventions

- Server Components by default; `'use client'` only where interactivity requires it.
- Zod schemas in `src/lib/validation/`, shared, **server-authoritative**.
- Rule evaluation through `src/lib/rules/`, always with an `asOf` date.
- Audit writes through `src/lib/audit/` — never write the table directly.
- Prisma migrations only; never edit the database by hand.
- No secrets in the repository, ever. `.env` is gitignored; `.env.example` is committed.
- File uploads: hash on receipt, store content-addressed, never overwrite — supersede.
- Commits: `feat(scope):`, `fix(scope):`, `docs(scope):`. Reference the `REQ-*` ID where relevant.

## Working style expected here

- Read the relevant doc before proposing an approach; do not ask questions the docs answer.
- Do not stop to ask permission mid-task. Decide, act, and state clearly what you decided and why.
- When something is genuinely ambiguous, choose the safest defensible default, implement it, and
  flag it in your summary rather than blocking.
- Test what you build. Run it. Do not report something as working that you have not seen work.
- Never fabricate a legal citation. If it is not in `docs/01-LEGAL-REFERENCE.md`, say so.
- No time estimates in any output.

## Do not build

Property listings or search · payments · STR transmission to the EMLCU · property title
registration · anything that automatically rejects, sanctions, or accuses.
