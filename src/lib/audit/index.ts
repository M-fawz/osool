import { createHash } from 'node:crypto'
import type { AuditAccessType, Prisma, Role } from '@prisma/client'
import { db, type Tx } from '@/lib/db'
import { canonicalAuditPayload } from './canonical'

/**
 * The audit trail. 02-SYSTEM-ARCHITECTURE §7.
 *
 * Append-only and hash-chained: each row carries the SHA-256 of the previous
 * row's hash folded into its own, so altering any historic row breaks every
 * hash after it and `verifyChain()` reports exactly where.
 *
 * This module is the only writer. It exposes no update and no delete, and the
 * database refuses both anyway (see the guardrails in the init migration).
 *
 * Read access is audited as well as writes — REQ-DPA-002. Who *viewed* a file
 * is as sensitive as who changed it, and several integrity signals in
 * 00-VISION §5 are computed from read patterns.
 */

/** Genesis predecessor: the hash a first row points at. */
export const GENESIS_HASH = '0'.repeat(64)

/**
 * PostgreSQL advisory lock key that serialises audit writers. Two concurrent
 * transactions must not both read the same tail row and then both claim to
 * follow it — that would fork the chain. Recorded as a COMMENT on the table
 * too, so the number has one documented home.
 */
const AUDIT_LOCK_KEY = 8410077

export interface AuditInput {
  /** Null only for unauthenticated events: a public verification lookup, a failed sign-in. */
  actorUserId?: string | null
  actorRole?: Role | null
  /** Human-readable actor, kept as text so the trail stays readable after a rename. */
  actorLabel?: string | null

  accessType?: AuditAccessType
  /** Verb in SCREAMING_SNAKE_CASE, e.g. USER_PROVISIONED, APPLICATION_APPROVED. */
  action: string

  entityType: string
  entityId?: string | null

  fromState?: string | null
  toState?: string | null
  reason?: string | null

  ipAddress?: string | null
  userAgent?: string | null

  /** The rule-set versions in force, so the event stays re-explainable. */
  ruleSetVersions?: Prisma.InputJsonValue | null
  /** Anything else worth evidencing, already redacted of content that must not be retained. */
  payload?: Prisma.InputJsonValue | null
}

export interface AuditRecord {
  id: string
  seq: bigint
  hash: string
  prevHash: string
  occurredAt: Date
}

/** The fields that go into the hash, in one place so writing and verifying cannot drift. */
function hashableFields(row: {
  seq: bigint
  occurredAt: Date
  actorUserId: string | null
  actorRole: Role | null
  actorLabel: string | null
  accessType: AuditAccessType
  action: string
  entityType: string
  entityId: string | null
  fromState: string | null
  toState: string | null
  reason: string | null
  ipAddress: string | null
  userAgent: string | null
  ruleSetVersions: unknown
  payload: unknown
  prevHash: string
}): Record<string, unknown> {
  return {
    seq: row.seq.toString(),
    occurredAt: row.occurredAt,
    actorUserId: row.actorUserId,
    actorRole: row.actorRole,
    actorLabel: row.actorLabel,
    accessType: row.accessType,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    fromState: row.fromState,
    toState: row.toState,
    reason: row.reason,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    ruleSetVersions: row.ruleSetVersions ?? null,
    payload: row.payload ?? null,
    prevHash: row.prevHash,
  }
}

export function computeAuditHash(row: Parameters<typeof hashableFields>[0]): string {
  return createHash('sha256').update(canonicalAuditPayload(hashableFields(row)), 'utf8').digest('hex')
}

/**
 * Append one event to the chain.
 *
 * Pass `tx` whenever the event evidences a write, so that the record and its
 * audit event commit or fail together. An event that survived a rolled-back
 * write would describe something that never happened.
 */
export async function recordAuditEvent(input: AuditInput, tx?: Tx): Promise<AuditRecord> {
  const client = tx ?? db

  const write = async (handle: Tx | typeof db): Promise<AuditRecord> => {
    // Serialise writers for the remainder of this transaction. Without it, two
    // concurrent appends can read the same tail and fork the chain.
    //
    // $executeRaw, not $queryRaw: the lock function returns void, which Prisma
    // cannot deserialise as a result column.
    await handle.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY}::bigint)`

    const previous = await handle.auditEvent.findFirst({
      orderBy: { seq: 'desc' },
      select: { seq: true, hash: true },
    })

    const seq = (previous?.seq ?? 0n) + 1n
    const prevHash = previous?.hash ?? GENESIS_HASH
    const occurredAt = new Date()

    const row = {
      seq,
      occurredAt,
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? null,
      actorLabel: input.actorLabel ?? null,
      accessType: (input.accessType ?? 'WRITE') as AuditAccessType,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      fromState: input.fromState ?? null,
      toState: input.toState ?? null,
      reason: input.reason ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      ruleSetVersions: input.ruleSetVersions ?? null,
      payload: input.payload ?? null,
      prevHash,
    }

    const hash = computeAuditHash(row)

    const created = await handle.auditEvent.create({
      data: {
        ...row,
        ruleSetVersions: (input.ruleSetVersions ?? undefined) as Prisma.InputJsonValue | undefined,
        payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
        hash,
      },
      select: { id: true, seq: true, hash: true, prevHash: true, occurredAt: true },
    })

    return created
  }

  // Already inside a caller's transaction: join it, so the audit event shares
  // that transaction's fate.
  if (tx) return write(client as Tx)

  return db.$transaction((handle) => write(handle))
}

/**
 * Convenience wrapper for REQ-DPA-002 read logging. Reads are frequent, so this
 * exists to make auditing one cheap call at the point of access rather than
 * something a developer has to remember to assemble.
 */
export async function recordReadAccess(
  input: Omit<AuditInput, 'accessType' | 'fromState' | 'toState'>,
  tx?: Tx,
): Promise<AuditRecord> {
  return recordAuditEvent({ ...input, accessType: 'READ' }, tx)
}

// ── Verification ────────────────────────────────────────────────────────────

export type ChainBreak =
  | { kind: 'HASH_MISMATCH'; seq: bigint; id: string; expected: string; found: string }
  | { kind: 'BROKEN_LINK'; seq: bigint; id: string; expectedPrevHash: string; foundPrevHash: string }
  | { kind: 'SEQUENCE_GAP'; expectedSeq: bigint; foundSeq: bigint; id: string }
  | { kind: 'DUPLICATE_SEQ'; seq: bigint; ids: string[] }
  | { kind: 'BAD_CHAIN_START'; foundSeq: bigint; id: string }

export interface ChainVerification {
  ok: boolean
  /**
   * FULL — the whole trail from seq 1 was walked, so "nothing was removed" is
   * proved. WINDOW — a segment was walked and anchored to its predecessor, so
   * those rows are proved unaltered but the rest of the trail was not read.
   */
  scope: 'FULL' | 'WINDOW'
  eventsChecked: number
  firstSeq: bigint | null
  lastSeq: bigint | null
  lastHash: string | null
  breaks: ChainBreak[]
}

/**
 * Walk the chain and report any tampering.
 *
 * Three independent things are checked, because they fail differently:
 *
 *   · the recorded hash still matches a recomputation of the row's contents
 *     — catches a row whose fields were altered;
 *   · each row's prevHash matches its predecessor's hash
 *     — catches a row spliced in or swapped;
 *   · the sequence is gapless from 1
 *     — catches a row removed outright, which the two hash checks alone would
 *       miss if the remover also fixed up the links.
 *
 * Streams in batches so a register with millions of events verifies without
 * loading the trail into memory.
 *
 * ── Verifying a window instead of everything ─────────────────────────────
 *
 * `fromSeq` and `toSeq` verify a segment. This exists because the audit screen
 * used to call this function with no bounds on every single page load: opening
 * the screen re-hashed the entire trail, so the cost of looking at the last
 * hundred events grew with the total number of events ever recorded. On a
 * register that keeps everything for five years and audits reads as well as
 * writes, that is a screen that gets slower every day it is used and eventually
 * cannot be opened at all.
 *
 * Verifying a window is not a weaker check, provided it is anchored. The
 * segment's first row must link to its real predecessor's hash — read from the
 * database, not assumed — so a segment that verifies proves that *those* rows
 * are unaltered and correctly linked into the chain before them. What a window
 * cannot prove is that nothing was removed from a part of the trail it did not
 * look at; that remains the job of the full sweep, which runs from the command
 * line and on a schedule rather than on a page render.
 *
 * The distinction is reported honestly: `scope` says which of the two was done,
 * and the screen says so in words rather than implying it proved more than it
 * did.
 */
export async function verifyChain(
  options: {
    batchSize?: number
    client?: Tx | typeof db
    /** Verify from this sequence number. Anchored to the row before it. */
    fromSeq?: bigint
    /** Verify up to and including this sequence number. */
    toSeq?: bigint
  } = {},
): Promise<ChainVerification> {
  const batchSize = options.batchSize ?? 1000
  // Accepting a transaction handle is what lets the tampering proof mutate the
  // trail, verify, and roll back — all inside one transaction that never
  // touches the real chain.
  const client = options.client ?? db

  const windowed = options.fromSeq !== undefined || options.toSeq !== undefined

  const breaks: ChainBreak[] = []
  let eventsChecked = 0
  let firstSeq: bigint | null = null
  let lastSeq: bigint | null = null
  let expectedSeq = 1n
  let cursor: bigint | null = options.fromSeq !== undefined ? options.fromSeq - 1n : null

  /*
   * The anchor.
   *
   * A window starting at seq N must be checked against the real hash of N-1,
   * fetched from the database. Starting from the genesis value instead would
   * make every window report a broken link at its own first row, which is the
   * obvious way to get this wrong and would have made the whole feature useless.
   */
  let expectedPrevHash = GENESIS_HASH
  if (options.fromSeq !== undefined && options.fromSeq > 1n) {
    const predecessor = await client.auditEvent.findFirst({
      where: { seq: options.fromSeq - 1n },
      select: { hash: true },
    })
    if (!predecessor) {
      return {
        ok: false,
        scope: 'WINDOW',
        eventsChecked: 0,
        firstSeq: null,
        lastSeq: null,
        lastHash: null,
        breaks: [
          { kind: 'SEQUENCE_GAP', expectedSeq: options.fromSeq - 1n, foundSeq: options.fromSeq, id: '—' },
        ],
      }
    }
    expectedPrevHash = predecessor.hash
  }

  for (;;) {
    const batch: Array<{
      id: string
      seq: bigint
      occurredAt: Date
      actorUserId: string | null
      actorRole: Role | null
      actorLabel: string | null
      accessType: AuditAccessType
      action: string
      entityType: string
      entityId: string | null
      fromState: string | null
      toState: string | null
      reason: string | null
      ipAddress: string | null
      userAgent: string | null
      ruleSetVersions: Prisma.JsonValue | null
      payload: Prisma.JsonValue | null
      prevHash: string
      hash: string
    }> = await client.auditEvent.findMany({
      where: {
        ...(cursor === null ? {} : { seq: { gt: cursor } }),
        ...(options.toSeq !== undefined ? { seq: { ...(cursor === null ? {} : { gt: cursor }), lte: options.toSeq } } : {}),
      },
      orderBy: { seq: 'asc' },
      take: batchSize,
    })

    if (batch.length === 0) break

    for (const row of batch) {
      if (firstSeq === null) {
        firstSeq = row.seq
        expectedSeq = row.seq
        // The chain must begin at 1. If it begins anywhere else, events were
        // removed from the front — and a remover who also set the new first
        // row's prevHash to the genesis value would otherwise slip past both
        // the hash check and the link check.
        //
        // Only meaningful for a full sweep: a window is *expected* to start
        // somewhere other than 1, and reporting that as tampering would make
        // every windowed check cry wolf.
        if (!windowed && row.seq !== 1n) {
          breaks.push({ kind: 'BAD_CHAIN_START', foundSeq: row.seq, id: row.id })
        }
      }

      if (row.seq !== expectedSeq) {
        breaks.push({ kind: 'SEQUENCE_GAP', expectedSeq, foundSeq: row.seq, id: row.id })
        expectedSeq = row.seq
      }

      const recomputed = computeAuditHash(row)
      if (recomputed !== row.hash) {
        breaks.push({ kind: 'HASH_MISMATCH', seq: row.seq, id: row.id, expected: recomputed, found: row.hash })
      }

      if (row.prevHash !== expectedPrevHash) {
        breaks.push({
          kind: 'BROKEN_LINK',
          seq: row.seq,
          id: row.id,
          expectedPrevHash,
          foundPrevHash: row.prevHash,
        })
      }

      expectedPrevHash = row.hash
      expectedSeq = row.seq + 1n
      lastSeq = row.seq
      eventsChecked += 1
      cursor = row.seq
    }

    if (batch.length < batchSize) break
  }

  const tail = lastSeq === null ? null : await client.auditEvent.findFirst({
    where: { seq: lastSeq },
    select: { hash: true },
  })

  return {
    ok: breaks.length === 0,
    scope: windowed ? 'WINDOW' : 'FULL',
    eventsChecked,
    firstSeq,
    lastSeq,
    lastHash: tail?.hash ?? null,
    breaks,
  }
}


// ── Checkpointed verification ───────────────────────────────────────────────

/** The action a verification checkpoint is recorded under. */
export const CHAIN_CHECKPOINT_ACTION = 'AUDIT_CHAIN_VERIFIED'

export interface IncrementalVerification extends ChainVerification {
  /** The checkpoint this run started from, or null if it had to start at 1. */
  fromCheckpointSeq: bigint | null
  /** Why a full walk happened, when one did. */
  fellBackBecause: 'NO_CHECKPOINT' | 'CHECKPOINT_HASH_CHANGED' | null
  /** The seq of the checkpoint written by this run, if it wrote one. */
  wroteCheckpointSeq: bigint | null
}

/**
 * Verify the chain from the last checkpoint rather than from event 1.
 *
 * ── The problem ───────────────────────────────────────────────────────────
 *
 * The full sweep re-hashes every event ever recorded. Measured on this
 * development trail: 6,255 events in 1,007 ms, about 161 microseconds each.
 * That is fine now and is not a fixed cost — this product audits reads as well
 * as writes, so the trail grows with *use*, and the sweep gets slower every day
 * the register is used. At a million events it is a couple of minutes; at ten
 * million it is most of an hour.
 *
 * ── The checkpoint ────────────────────────────────────────────────────────
 *
 * A successful verification appends an ordinary audit event recording the
 * sequence number and head hash it verified through. The next run finds that
 * event, confirms the stored hash at that sequence still matches what the
 * checkpoint recorded, and verifies only forward from there.
 *
 * The checkpoint lives *in the chain it describes*, deliberately: it needs no
 * new table, it inherits the append-only guarantees of everything else here,
 * and an attempt to move a checkpoint is itself an audit event.
 *
 * ── What this proves, and what it does not ────────────────────────────────
 *
 * It proves nothing has been altered **since** the checkpoint.
 *
 * It does **not** prove the trail before the checkpoint is sound. Someone who
 * altered an old event without recomputing every hash after it would leave the
 * stored hash at the checkpoint unchanged — so the checkpoint still matches and
 * this run still passes, while a break sits earlier in the trail. Recomputing
 * the hashes forward *would* change the stored hash at the checkpoint and be
 * caught, so this is not useless; it is simply narrower than a full walk.
 *
 * Therefore the full sweep does not go away. This is the check that can afford
 * to run often; `verifyChain()` with no bounds remains the one that proves
 * nothing was removed, and it must stay on a schedule. Saying otherwise would
 * be exactly the sort of overstated assurance this trail exists to avoid.
 */
export async function verifyChainSince(
  options: { client?: Tx | typeof db; writeCheckpoint?: boolean; actorLabel?: string } = {},
): Promise<IncrementalVerification> {
  const client = options.client ?? db

  const checkpoint = await client.auditEvent.findFirst({
    where: { action: CHAIN_CHECKPOINT_ACTION },
    orderBy: { seq: 'desc' },
    select: { seq: true, payload: true },
  })

  let fromCheckpointSeq: bigint | null = null
  let fellBackBecause: IncrementalVerification['fellBackBecause'] = null

  if (!checkpoint) {
    fellBackBecause = 'NO_CHECKPOINT'
  } else {
    const recorded = checkpoint.payload as { throughSeq?: string; headHash?: string } | null
    const throughSeq = recorded?.throughSeq ? BigInt(recorded.throughSeq) : null
    const headHash = recorded?.headHash ?? null

    const actual = throughSeq
      ? await client.auditEvent.findFirst({ where: { seq: throughSeq }, select: { hash: true } })
      : null

    if (throughSeq && headHash && actual?.hash === headHash) {
      fromCheckpointSeq = throughSeq
    } else {
      // The trail moved underneath a checkpoint that claimed otherwise. Fall
      // back to the full walk rather than trusting a starting point that has
      // already been contradicted.
      fellBackBecause = 'CHECKPOINT_HASH_CHANGED'
    }
  }

  const result = await verifyChain(
    fromCheckpointSeq === null ? { client } : { client, fromSeq: fromCheckpointSeq + 1n },
  )

  let wroteCheckpointSeq: bigint | null = null
  if (result.ok && options.writeCheckpoint !== false && result.lastSeq && result.lastHash) {
    const written = await recordAuditEvent({
      action: CHAIN_CHECKPOINT_ACTION,
      entityType: 'AuditEvent',
      entityId: String(result.lastSeq),
      actorUserId: null,
      actorRole: null,
      actorLabel: options.actorLabel ?? 'Scheduled verification (no human actor)',
      reason:
        fromCheckpointSeq === null
          ? 'The full audit chain was verified and found intact.'
          : `The audit chain was verified intact from ${fromCheckpointSeq + 1n} onwards.`,
      payload: { throughSeq: String(result.lastSeq), headHash: result.lastHash },
    })
    wroteCheckpointSeq = written.seq
  }

  return { ...result, fromCheckpointSeq, fellBackBecause, wroteCheckpointSeq }
}

export { canonicalAuditPayload, canonicalJson } from './canonical'
