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
| **Report to user + await priority confirmation** | **← HERE** | |

## Phase 2 — correctness closure

Not started. Gated on confirmation of the priority order.

Queue as proposed (baseline §7):
- [ ] **Gate zero:** production exposure decision (`CLOSE-THE-DATABASE.sql`)
- [ ] Flaky test — design the class out
- [ ] Broker list pagination caller
- [ ] `test:unit` gates CI on an empty set
- [ ] Retention lock / legal hold — implement or strike
- [ ] `verifyStoredDocument` — wire or delete
- [ ] F-12 printed-card hard-coded windows
- [ ] SEC-4 advisories — upgrade or written acceptance

## Phases 3–6

Not started.

---

## Open questions for the user

1. **Production exposure** — verify current state, and apply
   `CLOSE-THE-DATABASE.sql`? (baseline §5)
2. **The two prior assessment reports** — do they exist outside the repo?
   (baseline §0)
3. **Retention lock / legal hold** — implement, or strike from CLAUDE.md?
4. **`next@16` major upgrade** — accept the breaking change to clear 5 of 6
   advisories, or record a reasoned acceptance?
