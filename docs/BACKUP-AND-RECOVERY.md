# Backup and recovery

**Status: procedure written, never rehearsed.** Nothing in this document has been
executed against a production database, because at the time of writing there is
no provisioned production database to execute it against. Every command here is
written to be run; none of them is reported as having been run. The rehearsal in
§6 is the step that turns this from a document into a capability, and it has not
happened.

---

## 1. Why this register is not a generic restore

Three properties of Osool make "restore last night's dump" insufficient, and each
one adds a verification step that a generic runbook does not have.

**The audit trail is hash-chained.** `audit_event` rows carry a `seq` and a hash
over the previous row. A restore that loses the tail of the chain is not a
partial loss of history — it is a chain whose head no longer matches what was
last observed, and there is no way to tell from inside the database whether the
missing events were lost or removed. The head hash therefore has to be recorded
*outside* the database while the system is healthy (§4), and checked after every
restore (§5.4).

**Nothing is ever deleted.** `CLAUDE.md` rule 2 and the statement-level triggers
in the schema mean the database only grows. Retention is expressed as
`retentionUntil` and `legalHold` columns, not as deletion, so a backup policy
that "ages out" old rows would be deleting records the triggers exist to protect.
Backups are additive; pruning happens to *backup copies* on the schedule in §3,
never to rows.

**Documents are content-addressed and live outside the database.** The database
holds a hash and a storage key; the bytes are in object storage. Restoring the
database to a point *later* than the object store leaves rows pointing at
objects that do not exist. Restoring it *earlier* leaves orphaned objects, which
is harmless. So the ordering rule is: **object storage must be at or ahead of the
database**, never behind (§5.2).

---

## 2. What has to be backed up

| # | Asset | Contains | If lost |
|---|---|---|---|
| 1 | PostgreSQL database | Every application, registration, audit event, notification, appointment, signal, user | Total loss of the register |
| 2 | Object storage bucket | Every uploaded document and rendered card PDF | Files exist as rows with no readable evidence behind them |
| 3 | `PII_ENCRYPTION_KEY` | The key national IDs are encrypted under | Encrypted columns are permanently unreadable — a database backup **without this key is not a usable backup** |
| 4 | `BETTER_AUTH_SECRET` | Session signing | All sessions invalid; recoverable by forcing re-authentication |
| 5 | Migration history | `prisma/migrations/` | In git; no separate backup needed |
| 6 | Audit chain head | The last `seq` and hash (§4) | The restore cannot be proved complete |

Items 3 and 4 are secrets and must **not** live in the same store as items 1 and 2.
A backup archive that contains both the encrypted data and the key that decrypts
it provides confidentiality against nobody.

---

## 3. Policy

These are the values to configure. They are **operational defaults proposed
here, not legal requirements** — `docs/01-LEGAL-REFERENCE.md` sets retention
periods for records, and says nothing about backup frequency. The Authority owns
these numbers and should confirm them.

| Parameter | Proposed | Note |
|---|---|---|
| Database backup | Continuous (PITR) + daily full | PITR is what makes §5.3 possible |
| PITR retention window | 7 days minimum | The window inside which a mistake can be undone |
| Daily backup retention | 35 days | |
| Monthly archival | 12 months | |
| Object storage | Versioning enabled + cross-region replication | Versioning is what makes an overwrite recoverable; the product never overwrites, but the bucket should still refuse to |
| RPO (max data loss) | ≤ 5 minutes | Achievable with PITR; **not** achievable with daily dumps alone |
| RTO (max downtime) | ≤ 4 hours | The figure the rehearsal in §6 must actually demonstrate |
| Restore rehearsal | Quarterly | An untested backup is not a backup |

---

## 4. Recording the audit head (do this before you need it)

The chain's head must be observable from outside the database, or a restore
cannot be proved complete. Run this on a schedule and write the output somewhere
that is not the database:

```bash
npm run sweep -- audit
```

It prints `scope`, `events checked`, `range`, and `head`. Retain the `head` hash
and the last `seq` with each backup, alongside the timestamp. This is the value
§5.4 compares against.

---

## 5. Restore procedure

### 5.1 Stop writes first

Restoring under live traffic produces a database whose audit chain has two
branches. Put the application into maintenance (scale to zero, or remove the
deployment's database URL) before starting.

### 5.2 Restore object storage first, then the database

Per §1, storage must end up at or ahead of the database. Restore the bucket to a
point at or after the database target time.

### 5.3 Restore the database

**Point in time (preferred).** With PITR configured, restore to the moment before
the incident. On a managed Postgres this is a console operation; the target time
is the value to get right.

**From a dump (fallback).**

```bash
# Against an empty target database.
pg_restore \
  --dbname "$DATABASE_URL" \
  --no-owner --no-privileges \
  --exit-on-error \
  osool-YYYY-MM-DD.dump
```

`--exit-on-error` matters: a restore that reports success while having skipped
failing statements is how a register acquires missing rows nobody looks for.

### 5.4 Verify before reopening

Four checks, in order. **Do not restore service until all four pass.**

```bash
# 1. Schema is at the expected migration.
npx prisma migrate status

# 2. The audit chain verifies from event 1 — not a window.
npm run sweep -- audit
#    Expect: scope FULL, and INTACT.

# 3. The head matches what was recorded in §4 for this backup.
#    Compare the printed `head` and last `seq`. A shorter chain that still
#    verifies means the tail was lost: the chain is internally consistent and
#    incomplete, which is exactly the case a self-check cannot detect.

# 4. Documents referenced by the database are present in storage.
npm run qa:database
```

Then re-run the hardening in `docs/CLOSE-THE-DATABASE.sql` — §7.

### 5.5 Reopen and record

Restore traffic, then record the restore itself: what was lost, the window, and
the head hash before and after. A restore is a material event in the life of a
government register and the account of it should not live only in a chat log.

---

## 6. Rehearsal — the step that has not been done

Quarterly, and once before go-live:

1. Provision a scratch database and bucket.
2. Restore the most recent production backup into them.
3. Run all four checks in §5.4.
4. Time it end to end and compare against the RTO in §3.
5. Record the result, including the time.
6. Destroy the scratch copy — it contains real personal data and is subject to
   the same protections as production.

**A rehearsal that has not been timed has not tested the RTO.** The number in §3
is a target, not a measurement, until step 4 has been done.

---

## 7. Provisioning must include the hardening

`docs/CLOSE-THE-DATABASE.sql` revokes the privileges that let the database be
read around the application. It is **not** part of any migration, so a restored
or newly provisioned database does not have it. Any database created by the
procedure above — including the scratch copy in §6 — must have it applied before
it is reachable.

This is the ordering that matters:

```
create database → run migrations → apply CLOSE-THE-DATABASE.sql → point the app at it
```

Applying it after the application is live leaves a window in which the second
door is open.

---

## 8. What this document does not cover

- **Automated backup verification.** Nothing currently checks that a backup is
  restorable except a person following §6.
- **Key rotation for `PII_ENCRYPTION_KEY`.** Rotating it requires re-encrypting
  every affected column, and no procedure for that exists. Until one does, the
  key's loss is unrecoverable and its compromise is unremediable.
- **Cross-region failover.** Out of scope; this document restores, it does not
  fail over.
- **Backups of the object store's own versioning history.** Versioning protects
  against overwrite, not against bucket deletion.
