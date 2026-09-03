import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { CHAIN_CHECKPOINT_ACTION, recordAuditEvent, verifyChain, verifyChainSince } from '@/lib/audit'
import { makeUser, ns } from '../support/fixtures'

/**
 * Checkpointed verification of the audit chain.
 *
 * The full sweep re-hashes every event ever recorded — 6,255 events in 1,007 ms
 * measured on the development trail, about 161 microseconds each. That cost is
 * not fixed: this product audits reads as well as writes, so the trail grows
 * with use and the sweep gets slower every day the register is used.
 *
 * `verifyChainSince()` verifies forward from the last checkpoint, so its cost
 * tracks what has happened rather than what has ever happened. The last test in
 * this file is the important one: it pins down what that *cannot* prove, so the
 * narrower guarantee can never quietly be sold as the stronger one.
 */

async function anEvent(reason: string) {
  const actor = await makeUser({ role: 'AUDITOR' })
  return recordAuditEvent({
    action: 'TEST_FIXTURE_CREATED',
    entityType: 'Application',
    entityId: `checkpoint-${ns()}`,
    actorUserId: actor.id,
    actorRole: actor.role,
    actorLabel: 'checkpoint test',
    reason,
  })
}

/**
 * Tamper inside a transaction, verify, then roll back — the same idiom as
 * scripts/proof-audit-chain.ts. ALTER TABLE is transactional in PostgreSQL, so
 * the triggers re-enable themselves on rollback along with the damage.
 */
async function tamperAndCheck<T>(
  mutate: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<void>,
  check: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  let captured: T | undefined
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE "audit_event" DISABLE TRIGGER no_update_audit_event')
      await mutate(tx)
      captured = await check(tx)
      throw new Error('__rollback__')
    })
  } catch (error) {
    if ((error as Error).message !== '__rollback__') throw error
  }
  return captured as T
}

describe('verifying from a checkpoint', () => {
  it('walks the whole trail when there is no checkpoint to start from', async () => {
    // The suite runs on a fresh schema, so the first call has nothing to resume
    // from and must not silently verify nothing.
    const first = await verifyChainSince()

    expect(first.ok).toBe(true)
    expect(first.scope).toBe('FULL')
    expect(first.fromCheckpointSeq).toBeNull()
    expect(first.fellBackBecause).toBe('NO_CHECKPOINT')
    expect(first.wroteCheckpointSeq).not.toBeNull()
  })

  it('checks only what happened since, on the next run', async () => {
    await verifyChainSince()
    await anEvent('something happened after the checkpoint')
    await anEvent('and something else')

    const second = await verifyChainSince()

    expect(second.ok).toBe(true)
    expect(second.scope).toBe('WINDOW')
    expect(second.fromCheckpointSeq).not.toBeNull()
    expect(second.fellBackBecause).toBeNull()
    // The two events above plus the checkpoint event the previous run wrote —
    // a handful, not the whole trail.
    expect(second.eventsChecked).toBeLessThan(20)
  })

  it('records the checkpoint in the chain it describes', async () => {
    const run = await verifyChainSince()

    const checkpoint = await db.auditEvent.findFirst({
      where: { seq: run.wroteCheckpointSeq! },
    })

    expect(checkpoint).not.toBeNull()
    expect(checkpoint!.action).toBe(CHAIN_CHECKPOINT_ACTION)
    // No new table: the checkpoint is an ordinary audit event, so it inherits
    // the append-only guarantees of everything else in the trail.
    const payload = checkpoint!.payload as { throughSeq: string; headHash: string }
    expect(payload.headHash).toHaveLength(64)
    expect(BigInt(payload.throughSeq)).toBeLessThan(run.wroteCheckpointSeq!)
  })

  it('detects tampering that happened after the checkpoint', async () => {
    await verifyChainSince()
    const target = await anEvent('this event will be rewritten')

    const result = await tamperAndCheck(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE "audit_event" SET reason = 'Silently rewritten' WHERE seq = ${target.seq}`,
        )
      },
      (tx) => verifyChainSince({ client: tx, writeCheckpoint: false }),
    )

    expect(result.ok).toBe(false)
    expect(result.breaks.length).toBeGreaterThan(0)
  })

  it('falls back to a full walk when the checkpoint no longer describes the trail', async () => {
    const first = await verifyChainSince()
    const throughSeq = BigInt(
      (
        (await db.auditEvent.findFirst({ where: { seq: first.wroteCheckpointSeq! } }))!
          .payload as { throughSeq: string }
      ).throughSeq,
    )

    const result = await tamperAndCheck(
      async (tx) => {
        // Rewriting the event the checkpoint anchors to changes its stored
        // hash, so the checkpoint's claim is contradicted by the trail.
        await tx.$executeRawUnsafe(
          `UPDATE "audit_event" SET hash = repeat('f', 64) WHERE seq = ${throughSeq}`,
        )
      },
      (tx) => verifyChainSince({ client: tx, writeCheckpoint: false }),
    )

    // It must not trust a starting point the trail has already contradicted.
    expect(result.fellBackBecause).toBe('CHECKPOINT_HASH_CHANGED')
    expect(result.scope).toBe('FULL')
    expect(result.ok).toBe(false)
  })
})

describe('what a checkpoint cannot prove', () => {
  it('does not catch an old event altered without recomputing the hashes after it', async () => {
    /*
     * This test asserts a *limitation*, deliberately, so that nobody later
     * mistakes the cheap check for the thorough one.
     *
     * Alter an event from before the checkpoint and leave every later hash
     * alone: the stored hash at the checkpoint is untouched, so the checkpoint
     * still matches, and verification from that point forward sees nothing
     * wrong. The break is real and sits earlier in the trail.
     *
     * The full walk does catch it — asserted below in the same transaction, on
     * the same tampered data — which is precisely why `npm run sweep -- audit`
     * must stay on a schedule and this cannot replace it.
     */
    const early = await anEvent('an old event, from before the checkpoint')
    await verifyChainSince()
    await anEvent('activity after the checkpoint')

    const { incremental, full } = await tamperAndCheck(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE "audit_event" SET reason = 'quietly changed' WHERE seq = ${early.seq}`,
        )
      },
      async (tx) => ({
        incremental: await verifyChainSince({ client: tx, writeCheckpoint: false }),
        full: await verifyChain({ client: tx }),
      }),
    )

    // The narrow check passes on tampered data …
    expect(incremental.ok).toBe(true)
    expect(incremental.scope).toBe('WINDOW')

    // … and the full walk is what actually catches it.
    expect(full.ok).toBe(false)
    expect(full.breaks.length).toBeGreaterThan(0)
  })
})
