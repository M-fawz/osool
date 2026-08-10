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
 */
export async function verifyChain(
  options: { batchSize?: number; client?: Tx | typeof db } = {},
): Promise<ChainVerification> {
  const batchSize = options.batchSize ?? 1000
  // Accepting a transaction handle is what lets the tampering proof mutate the
  // trail, verify, and roll back — all inside one transaction that never
  // touches the real chain.
  const client = options.client ?? db

  const breaks: ChainBreak[] = []
  let eventsChecked = 0
  let firstSeq: bigint | null = null
  let lastSeq: bigint | null = null
  let expectedPrevHash = GENESIS_HASH
  let expectedSeq = 1n
  let cursor: bigint | null = null

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
      where: cursor === null ? {} : { seq: { gt: cursor } },
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
        if (row.seq !== 1n) {
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
    eventsChecked,
    firstSeq,
    lastSeq,
    lastHash: tail?.hash ?? null,
    breaks,
  }
}

export { canonicalAuditPayload, canonicalJson } from './canonical'
