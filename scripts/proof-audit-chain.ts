/**
 * Proof that the audit chain detects tampering.
 *
 *   npm run proof:audit
 *
 * A hash chain that has never been attacked is an untested claim. This writes
 * events, verifies them, then tampers with the trail four different ways and
 * shows that each is caught.
 *
 * Every attack runs inside a transaction that is always rolled back, and every
 * statement in it — including the ALTER TABLE that disables the guard triggers,
 * and the verification itself — uses that transaction's handle. Using `db`
 * anywhere inside would run on a different connection, outside the transaction,
 * and the "rollback" would silently leave real damage behind.
 *
 * The guard triggers have to be disabled for the attacks to land at all, which
 * is exactly the threat model worth proving against: someone with direct
 * database access, not someone using the application.
 */

import { db } from '@/lib/db'
import { recordAuditEvent, recordReadAccess, verifyChain, computeAuditHash } from '@/lib/audit'

function heading(text: string) {
  console.log(`\n${text}\n${'─'.repeat(text.length)}`)
}

async function main() {
  heading('1. Write events through src/lib/audit')

  const a = await recordAuditEvent({
    action: 'PROOF_EVENT_ALPHA',
    entityType: 'Proof',
    entityId: 'alpha',
    actorLabel: 'proof-script',
    reason: 'First event in the tampering proof.',
  })
  const b = await recordAuditEvent({
    action: 'PROOF_EVENT_BETA',
    entityType: 'Proof',
    entityId: 'beta',
    actorLabel: 'proof-script',
    fromState: 'DRAFT',
    toState: 'SUBMITTED',
  })
  const c = await recordReadAccess({
    action: 'PROOF_READ',
    entityType: 'Proof',
    entityId: 'beta',
    actorLabel: 'proof-script',
  })

  console.log(`seq ${a.seq}  hash ${a.hash.slice(0, 16)}…  prev ${a.prevHash.slice(0, 16)}…`)
  console.log(`seq ${b.seq}  hash ${b.hash.slice(0, 16)}…  prev ${b.prevHash.slice(0, 16)}…`)
  console.log(`seq ${c.seq}  hash ${c.hash.slice(0, 16)}…  prev ${c.prevHash.slice(0, 16)}…  (READ — REQ-DPA-002)`)
  console.log(`\nEach prevHash equals its predecessor's hash: ${b.prevHash === a.hash && c.prevHash === b.hash}`)

  heading('2. Verify the untouched chain')
  const clean = await verifyChain()
  console.log(`ok=${clean.ok}  events=${clean.eventsChecked}  breaks=${clean.breaks.length}`)

  let allDetected = true

  async function attack(label: string, mutate: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<void>) {
    heading(label)
    try {
      await db.$transaction(async (tx) => {
        // ALTER TABLE is transactional in PostgreSQL, so these re-enable
        // themselves on rollback along with everything else.
        await tx.$executeRawUnsafe('ALTER TABLE "audit_event" DISABLE TRIGGER no_update_audit_event')
        await tx.$executeRawUnsafe('ALTER TABLE "audit_event" DISABLE TRIGGER no_delete_audit_event')

        await mutate(tx)

        const result = await verifyChain({ client: tx })
        console.log(`ok=${result.ok}  breaks=${result.breaks.length}`)
        for (const brk of result.breaks) {
          const at = 'seq' in brk ? brk.seq : brk.foundSeq
          console.log(`  detected: ${brk.kind} at seq ${at}`)
        }
        if (result.ok) {
          allDetected = false
          console.log('  *** NOT DETECTED — the chain failed to catch this ***')
        }
        throw new Error('__rollback__')
      })
    } catch (error) {
      if ((error as Error).message !== '__rollback__') throw error
    }
  }

  await attack('3. Attack: rewrite the reason on an existing event', async (tx) => {
    await tx.$executeRawUnsafe(`UPDATE "audit_event" SET reason = 'Silently rewritten' WHERE seq = ${a.seq}`)
  })

  await attack('4. Attack: delete an event from the middle of the trail', async (tx) => {
    // no-delete-allowed: a simulated attack, inside a transaction that is always
    // rolled back, whose entire purpose is to prove the chain detects this.
    await tx.$executeRawUnsafe(`DELETE FROM "audit_event" WHERE seq = ${b.seq}`)
  })

  await attack('5. Attack: rewrite an event AND repair its hash to cover the tracks', async (tx) => {
    const row = await tx.auditEvent.findFirstOrThrow({ where: { seq: a.seq } })
    const forged = { ...row, reason: 'Rewritten, with the hash repaired' }
    const forgedHash = computeAuditHash(forged)
    await tx.$executeRawUnsafe(
      `UPDATE "audit_event" SET reason = '${forged.reason}', hash = '${forgedHash}' WHERE seq = ${a.seq}`,
    )
    console.log('  (the row now hashes to its own contents — only the link from the *next* row betrays it)')
  })

  await attack('6. Attack: remove the first events, so the trail appears to start later', async (tx) => {
    // no-delete-allowed: as above — a rolled-back simulation of front-truncation.
    await tx.$executeRawUnsafe(`DELETE FROM "audit_event" WHERE seq IN (${a.seq}, ${b.seq})`)
    await tx.$executeRawUnsafe(
      `UPDATE "audit_event" SET "prevHash" = '${'0'.repeat(64)}' WHERE seq = ${c.seq}`,
    )
    console.log('  (front of the chain removed and the new first row re-pointed at genesis)')
  })

  heading('7. Verify again — every attack was rolled back')
  const after = await verifyChain()
  console.log(`ok=${after.ok}  events=${after.eventsChecked}  breaks=${after.breaks.length}`)
  console.log(`head hash: ${after.lastHash}`)

  heading('Result')
  const restored = after.ok && after.eventsChecked === clean.eventsChecked
  console.log(`Every attack detected      : ${allDetected}`)
  console.log(`Trail intact after attacks : ${restored}`)
  if (!allDetected || !restored) process.exitCode = 1

  await db.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await db.$disconnect()
  process.exit(1)
})
