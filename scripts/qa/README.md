# Production regression suite

Four scripts that interrogate a *running deployment* rather than a build. They exist because
every serious fault this deployment has had was invisible to `tsc`, `eslint`, and `next build`, and
visible within seconds of asking the deployed system a question:

| What was wrong | What found it |
|---|---|
| Every database-backed route returned 500 — `EMAIL_PROVIDER=resend` with no key, so the environment guard refused to start on every cold start | `routes.mjs` |
| The homepage's only public action, "Verify a broker's registration", posted to a route that did not exist | `routes.mjs`, then opening the page |
| A provisioned employee could set a password and still never sign in — nothing moved the account out of `PENDING_ACTIVATION` | `account-lifecycle.mjs` |
| No registration card could be issued: the Arabic typefaces were not traced into the serverless function | the REQ-REG-050 walk |

None of those are type errors. All four are things a deployment does, and only a deployment can be
asked.

## Running them

They need `DATABASE_URL` for the deployment under test, and take the base URL from `QA_BASE`
(default `https://osool-cyan.vercel.app`).

```bash
QA_BASE=https://your-deployment.vercel.app DATABASE_URL=… node scripts/qa/routes.mjs
QA_BASE=…                                  DATABASE_URL=… node scripts/qa/database.mjs
QA_BASE=…                                  DATABASE_URL=… node scripts/qa/administration.mjs
QA_BASE=…                                  DATABASE_URL=… node scripts/qa/account-lifecycle.mjs
```

Each exits non-zero on the first failure it reports, so they compose into a check.

## What each one asks

**`routes.mjs`** — every route, as every role. An anonymous visitor, then each of the eleven
government roles and a broker, against the whole route table: what each may open, what each must be
refused, and that a refusal is the four-part notice rather than a 500. Also the CSRF origin check,
the sign-in rate limit, account-enumeration resistance, the Arabic/English mirror, and a
cross-tenant probe with one broker's session against another broker's file.

**`database.mjs`** — the database, asked of the database. That no foreign key cascades on delete,
that the delete and truncate guards actually refuse (it tries), that there are no orphans, no
duplicate registration numbers, no gaps in the audit sequence, that the first audit event points at
genesis, that read access is audited and not only writes, that no application was examined and
reviewed by the same person, and that national IDs are ciphertext with a keyed hash beside them.

**`administration.mjs`** — the accounts screen, driven over HTTP as Server Actions and asserted
against the database rather than against the response body. Create, change role, suspend,
reactivate, re-issue an activation link; then the refusals that matter — an administrator cannot
change their own role, an official cannot be moved to a broker role, and no other role can create a
`SYSTEM_ADMIN` or suspend the administrator.

**`account-lifecycle.mjs`** — one employee, from the administrator's click to their first
signed-in page. Provision, follow the one-time link, set a password, sign in, land on the queue the
role owns, and confirm the link cannot be replayed.

## A note on Server Action ids

Three of these invoke Next Server Actions. Action ids are **not stable between builds**, so the
scripts harvest them from the running deployment's own client bundles before calling anything. A
hard-coded id produces a 404 that is indistinguishable from a broken route — which cost an hour
once already.

## These scripts assume the demonstration register

They sign in as the accounts `scripts/seed-phase1.ts` creates, whose passwords are published in
this repository. Against a register that supervises real brokers they will simply fail to sign in,
which is the correct outcome and not a bug to fix.
