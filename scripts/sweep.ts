/**
 * The scheduled sweeps.
 *
 *   npm run sweep            → everything
 *   npm run sweep -- signals → the integrity detectors only
 *   npm run sweep -- lifecycle
 *   npm run sweep -- reminders
 *   npm run sweep -- audit
 *
 * Three things in this product happen because time passed rather than because
 * somebody clicked: a registration reaches its expiry, an appointment comes
 * round tomorrow, and a detector notices a shape in the data. None of them has
 * an actor, and none of them can be driven from a screen.
 *
 * This is one entry point for all of them, so a host's scheduler has one thing
 * to call and an operator has one command to run by hand when they want to see
 * what it would do. `--dry` reports without writing, which is what you run the
 * first time on a production database.
 *
 * ── Why not a Vercel cron per job ────────────────────────────────────────
 *
 * 02-SYSTEM-ARCHITECTURE §10 decision 1: "Build host-agnostic … Do not adopt
 * Vercel-only primitives." A scheduled HTTP route would tie the register's
 * clock to one platform. A command any scheduler can run — cron, systemd
 * timer, Kubernetes CronJob, or a Vercel cron hitting a thin route that shells
 * to this — ties it to none.
 */

import { loadEnvFile } from './lib/load-env.mjs'

loadEnvFile()

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const requested = args.filter((a) => !a.startsWith('--'))
const wanted = (name: string) => requested.length === 0 || requested.includes(name)

const rule = '─'.repeat(72)
let failures = 0

function heading(title: string) {
  console.log(`\n${title}\n${rule}`)
}

async function step(name: string, run: () => Promise<void>) {
  const started = Date.now()
  try {
    await run()
    console.log(`  done in ${Date.now() - started} ms`)
  } catch (error) {
    failures += 1
    console.error(`  FAILED — ${(error as Error).message}`)
  }
}

async function main(): Promise<void> {
  console.log(`\nOsool scheduled sweeps${dry ? ' (dry run — nothing will be written)' : ''}`)
  console.log(rule)

  // ── Registration lifecycle ─────────────────────────────────────────────────
  if (wanted('lifecycle')) {
    heading('Registration lifecycle')
    await step('lifecycle', async () => {
      const { sweepLifecycle } = await import('../src/lib/registry/lifecycle')
      if (dry) {
        const { db } = await import('../src/lib/db')
        const due = await db.registration.count({
          where: {
            status: { in: ['ACTIVE', 'RENEWAL_DUE'] },
            archivedAt: null,
            validTo: { lte: new Date(Date.now() + 90 * 86_400_000) },
          },
        })
        console.log(`  ${due} registration(s) inside the renewal window or past expiry`)
        return
      }

      const result = await sweepLifecycle()
      console.log(`  examined        ${result.examined}`)
      console.log(`  → RENEWAL_DUE   ${result.renewalDue.length}`)
      console.log(`  → LAPSED        ${result.lapsed.length}`)
      console.log(`  held for counsel ${result.heldForCounsel.length}`)

      // Not a footnote. These are registrations the sweep deliberately did not
      // lapse because the expiry rests on an unconfirmed rule (CLAUDE.md rule 10),
      // and somebody has to decide about each one.
      for (const held of result.heldForCounsel) {
        console.log(`      ${held.registrationNumber} — expired ${held.validTo.toISOString().slice(0, 10)}`)
      }
    })
  }

  // ── Integrity signals ──────────────────────────────────────────────────────
  if (wanted('signals')) {
    heading('Integrity signals')
    await step('signals', async () => {
      const { sweepSignals } = await import('../src/lib/signals')
      if (dry) {
        const { DETECTORS } = await import('../src/lib/signals/detectors')
        for (const detector of DETECTORS) console.log(`  ${detector.key} — ${detector.looksFor}`)
        return
      }

      const result = await sweepSignals()
      console.log(`  raised          ${result.raised}`)
      console.log(`  already open    ${result.alreadyOpen}`)
      console.log(`  rule set        INTEGRITY_SIGNALS v${result.ruleSetVersion}\n`)
      for (const entry of result.byDetector) {
        console.log(
          `      ${entry.key.padEnd(34)} found ${String(entry.found).padStart(4)}  raised ${String(entry.raised).padStart(4)}  ${entry.ms} ms`,
        )
      }
    })
  }

  // ── Appointment reminders ──────────────────────────────────────────────────
  if (wanted('reminders')) {
    heading('Appointment reminders')
    await step('reminders', async () => {
      const { db } = await import('../src/lib/db')
      const { notify } = await import('../src/lib/notifications')
      const { appointmentSubject } = await import('../src/lib/notifications/subjects')

      /*
       * Tomorrow's bookings, reminded once.
       *
       * `reminderSentAt` is the guard rather than the dedupe key alone: the
       * notification table would refuse a second send anyway, but writing the
       * timestamp means the next sweep does not even look at the row. On a
       * register with a busy counter that is the difference between a query over
       * tomorrow and a query over every appointment ever booked.
       */
      const from = new Date(Date.now() + 12 * 60 * 60 * 1000)
      const to = new Date(Date.now() + 36 * 60 * 60 * 1000)

      const due = await db.appointment.findMany({
        where: {
          status: 'BOOKED',
          reminderSentAt: null,
          slot: { startsAt: { gte: from, lte: to }, closedAt: null },
        },
        select: { id: true },
      })

      console.log(`  ${due.length} appointment(s) in the reminder window`)
      if (dry) return

      for (const appointment of due) {
        const subject = await appointmentSubject(appointment.id)
        if (!subject) continue
        await notify({ event: 'APPOINTMENT_REMINDER', subject: { appointment: subject } })
        await db.appointment.update({
          where: { id: appointment.id },
          data: { reminderSentAt: new Date() },
        })
      }
      console.log(`  reminded ${due.length}`)
    })
  }

  // ── Audit chain, since the last checkpoint ─────────────────────────────────
  if (wanted('audit-since')) {
    heading('Audit chain — since the last checkpoint')
    await step('audit-since', async () => {
      /*
       * The check that can afford to run often. It verifies forward from the
       * last recorded checkpoint, so its cost tracks how much has happened
       * rather than how much has ever happened.
       *
       * It does not replace `audit`. Verifying from a checkpoint proves nothing
       * has been altered *since* that point; only the full walk proves nothing
       * has been removed from the trail before it. Both belong on a schedule,
       * at different frequencies.
       */
      const { verifyChainSince } = await import('../src/lib/audit')

      if (dry) {
        const result = await verifyChainSince({ writeCheckpoint: false })
        console.log(`  would check     ${result.eventsChecked} event(s)`)
        console.log(`  from checkpoint ${result.fromCheckpointSeq ?? '— none, would walk in full'}`)
        return
      }

      const result = await verifyChainSince()
      console.log(`  scope           ${result.scope}`)
      console.log(`  from checkpoint ${result.fromCheckpointSeq ?? '— none'}`)
      if (result.fellBackBecause) console.log(`  full walk because ${result.fellBackBecause}`)
      console.log(`  events checked  ${result.eventsChecked}`)
      console.log(`  new checkpoint  ${result.wroteCheckpointSeq ?? '— none written'}`)

      if (!result.ok) {
        console.error(`\n  CHAIN BROKEN — ${result.breaks.length} break(s):`)
        for (const problem of result.breaks.slice(0, 20)) {
          console.error(`      ${JSON.stringify(problem, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`)
        }
        throw new Error('the audit chain did not verify')
      }

      console.log('  INTACT since the checkpoint')
    })
  }

  // ── Audit chain, in full ───────────────────────────────────────────────────
  if (wanted('audit')) {
    heading('Audit chain — full verification')
    await step('audit', async () => {
      /*
       * The screen verifies only the page it shows. This is the other half of
       * that decision: the full sweep, from event 1, which is the only check that
       * proves nothing has been *removed*. It belongs on a schedule rather than
       * on a page render — see the note in src/lib/audit.
       */
      const { verifyChain } = await import('../src/lib/audit')
      const result = await verifyChain()
      console.log(`  scope           ${result.scope}`)
      console.log(`  events checked  ${result.eventsChecked}`)
      console.log(`  range           ${result.firstSeq ?? '—'} … ${result.lastSeq ?? '—'}`)
      console.log(`  head            ${result.lastHash ?? '—'}`)

      if (!result.ok) {
        console.error(`\n  CHAIN BROKEN — ${result.breaks.length} break(s):`)
        for (const problem of result.breaks.slice(0, 20)) {
          console.error(`      ${JSON.stringify(problem, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`)
        }
        throw new Error('the audit chain did not verify')
      }

      console.log('  INTACT')
    })
  }

  // ── Archive integrity ──────────────────────────────────────────────────────
  if (wanted('documents')) {
    heading('Archive integrity — stored documents')
    await step('documents', async () => {
      /*
       * Re-hash what is in the store and confirm each object still matches the
       * content-addressed key it is filed under. 02-SYSTEM-ARCHITECTURE §7: the
       * hash is what lets the Authority prove the document reviewed in March is
       * byte-identical to the one in the archive today — and a hash nobody
       * recomputes proves nothing at all.
       *
       * `verifyStoredDocument` had been written, exported, and never called
       * from anywhere. It was a documented control that did not run, which is
       * the same defect as retention lock and legal hold and is fixed the same
       * way: by giving it a caller on a schedule.
       */
      const { db } = await import('../src/lib/db')
      const { verifyStoredDocument } = await import('../src/lib/storage')

      const documents = await db.document.findMany({
        where: { archivedAt: null },
        select: { id: true, storageKey: true, originalFilename: true, sha256: true },
        orderBy: { createdAt: 'asc' },
      })

      if (dry) {
        console.log(`  ${documents.length} document(s) would be re-hashed`)
        return
      }

      let checked = 0
      let missing = 0
      let mismatched = 0
      let repointed = 0
      const problems: { id: string; name: string; detail: string }[] = []

      for (const document of documents) {
        const name = document.originalFilename ?? '(no filename recorded)'
        checked += 1

        /*
         * Two different questions, and both are worth asking.
         *
         * `verifyStoredDocument` re-hashes the bytes and compares them to the
         * key they are filed under — it catches the stored object changing
         * underneath us. It cannot catch the *row* being repointed at some
         * other object that is itself internally consistent, because that
         * object hashes correctly for its own key. Comparing the row's recorded
         * sha256 against the key closes that second door.
         */
        const result = await verifyStoredDocument(document.storageKey)

        if (result.actualHash === null) {
          missing += 1
          problems.push({ id: document.id, name, detail: 'not present in the store' })
        } else if (!result.ok) {
          mismatched += 1
          problems.push({ id: document.id, name, detail: `bytes hash to ${result.actualHash}` })
        }

        if (result.expectedHash && document.sha256 !== result.expectedHash) {
          repointed += 1
          problems.push({
            id: document.id,
            name,
            detail: `row records ${document.sha256} but is filed under ${result.expectedHash}`,
          })
        }
      }

      console.log(`  checked         ${checked}`)
      console.log(`  missing         ${missing}`)
      console.log(`  hash mismatch   ${mismatched}`)
      console.log(`  key/row mismatch ${repointed}`)

      if (problems.length > 0) {
        console.error(`\n  ARCHIVE INTEGRITY FAILED — ${problems.length} finding(s):`)
        for (const problem of problems.slice(0, 20)) {
          console.error(`      ${problem.id}  ${problem.name}  ${problem.detail}`)
        }
        throw new Error('one or more stored documents did not match their content hash')
      }

      console.log('  INTACT')
    })
  }

  console.log(`\n${rule}`)
  console.log(failures === 0 ? 'All sweeps completed.' : `${failures} sweep(s) failed.`)

  const { db } = await import('../src/lib/db')
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)

}

void main()
