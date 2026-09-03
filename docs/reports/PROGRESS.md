# Osool — live progress log

Updated as work happens, not at the end. If context is lost, this file plus
`git log` is enough to resume.

**Branch:** `chore/checkpoint-uncommitted`
**Baseline:** `docs/reports/00-BASELINE-TRUTH.md`

---

## Phase 0 — checkpoint the uncommitted work

| Item | State | Commit | Evidence |
|---|---|---|---|
| Verify working tree | done | — | 72 changed paths on `main` |
| Secret scan before commit | done | — | no matches; `.env*` ignored |
| Commit in coherent groups | done | `8550132`..`fa9adb7` (14) | `git log main..HEAD` |
| Working tree clean | done | — | `git status --porcelain` → 0 lines |

## Phase 1 — baseline truth

| Item | State | Evidence |
|---|---|---|
| `npx tsc --noEmit` | **PASS** | exit 0, no output |
| `npx eslint .` | **PASS** | exit 0, no output |
| `npm run build` | **PASS** | exit 0, all routes emitted |
| `npm run audit:no-deletes` | **PASS** | exit 0 |
| `npm run i18n:check` | **PASS** | ar 858 / en 858, parity |
| `npm test` | **FAIL** | 1 failed / 70 passed (71) |
| `npm audit --omit=dev` | **FAIL** | 6 high, 3 chains |
| Reconcile prior report IDs | **BLOCKED** | reports not in repo — see baseline §0 |
| Substantive concerns assessed | done | baseline §2, 14 rows |
| Flaky test root-caused | done | baseline §3 — 3 fails / 10 runs, mechanism identified |
| Dead-code register | done | baseline §4 — 3 symbols, 0 callers each |
| Retention-control audit | done | baseline §4b — `retentionUntil`/`legalHold` 0 refs |
| Unwritten-model register | done | baseline §4c — 7 of 39 |
| Comment-vs-code drift spot check | done | `numbering.ts` comments verified true |
| Report to user + priority confirmed | done | user granted standing authority |
| Production exposure check (read-only) | done | `evidence/prod-postgrest-check.md` — project NXDOMAIN, SUPERSEDED |

## Phase 2 — correctness closure

In progress.

| Item | State | Commit | Evidence |
|---|---|---|---|
| Flaky test (numbering) — root-caused and fixed | done | `f6f9b43` | 3 fail/10 before → 20 pass/20 after; ADR 0001 |
| Second accumulation failure (notifications) | done | `d57cb9c` | permanent failure (5/5) → per-run schema; ADR 0002 |
| Capture driver silently dropping messages | done | `d57cb9c` | ceiling that throws, nothing discarded |
| Full suite 20 consecutive runs | **done** | — | `.proof/suite2/run-1..20.log`, 78 passed each |
| Broker list pagination caller | done | `d975f0b` | 4 contract tests; browser proof deferred to Phase 3 |
| `test:unit` gating CI on an empty set | done | `f89596f` | `tests/unit/` created; `ci` runs full suite; 92 tests |
| F-12 printed-card hard-coded periods | done | `3ce423b` | 4 of 6 tests fail before fix, all pass after |
| SEC-4 written acceptance | done | pending commit | `SECURITY-ADVISORY-ACCEPTANCE.md`, per-chain reachability |
| Retention lock / legal hold | done | `5257132` | 12 tests; ADR 0003; one-archiver gate in CI |
| F-11 `verifyStoredDocument` — wired | done | `f8dc11b` | sweep runs it; 2,016 docs INTACT; 6 tests incl. tamper detection |
| Local DB port configurable; db.mjs error handling | done | `5257132` | Windows orphaned-socket recovery |
| Rule-set caching | **next** | | 4 queries per transition |
| Audit chain incremental verification + growth ADR | open | | |
| Refusal handling for thrown auth errors | open | | |

Original queue (baseline §7):
- [x] **Gate zero:** production exposure — checked read-only, project no longer
      exists. SEC-1/F-02 SUPERSEDED, F-01 stays OPEN. Provisioning fix carried
      into Phase 4 as a fixed requirement.
- [ ] Flaky test — design the class out  **← HERE**
- [ ] Broker list pagination caller
- [ ] `test:unit` gates CI on an empty set
- [ ] Retention lock / legal hold — implement or strike
- [ ] `verifyStoredDocument` — wire or delete
- [ ] F-12 printed-card hard-coded windows
- [ ] SEC-4 advisories — upgrade or written acceptance

## Phases 3–6

Not started.

---

## Decisions taken

| Decision | Outcome |
|---|---|
| Production exposure | Checked read-only. Project unreachable (NXDOMAIN). Not remediated — nothing to remediate. Provisioning fix is now a fixed Phase 4 requirement. |
| Retention lock / legal hold | **Implement both in Phase 2**, server-enforced and audited. |
| SEC-4 advisories | **Written per-CVE acceptance now**, `next@16` major upgrade tracked separately. |
| Authority | Standing authority granted for read-only observation, local/scratch environments, and all in-repo technical choices. Production writes, migration rewrites, audit-chain/transition-table changes, spending, and real personal data still require explicit confirmation each time. Decisions recorded as ADRs. |

## Open questions for the user

1. **The two prior assessment reports** — do they exist outside the repo?
   (baseline §0). Not blocking; every substantive concern is assessed regardless.
