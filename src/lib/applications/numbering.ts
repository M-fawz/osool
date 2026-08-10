import type { Tx } from '@/lib/db'

/**
 * The two numbers a file carries, and why they are not the same number.
 *
 * REQ-REG-050 step 1 assigns a **temporary number** the moment the papers are
 * entered in the incoming register — before anyone has read them, and whether
 * or not the application is ever granted. Step 5 issues a **permanent
 * registration number** only if it is. Collapsing the two would mean either
 * that a refused application had consumed a registration number, or that a file
 * spent its first week with nothing to call it by at the counter.
 *
 * Both are year-scoped and printed with the year first — `2026/1183` — which is
 * how they are read out over a telephone and how they are filed on paper. Both
 * are allocated under a PostgreSQL advisory lock held for the rest of the
 * caller's transaction, because two clerks accepting files at the same moment
 * must not be handed the same number, and a `MAX(n) + 1` without a lock does
 * exactly that under any real load.
 */

/**
 * Advisory lock keys. Distinct from the audit chain's key (8410077) and from
 * each other, so intake and issuance never wait on one another.
 */
const TEMPORARY_NUMBER_LOCK = 8410078
const REGISTRATION_NUMBER_LOCK = 8410079

const SEQUENCE_WIDTH = 4

/**
 * The offsets are cast to `int` explicitly.
 *
 * Prisma sends a JavaScript number as `bigint`, and PostgreSQL has no
 * `substring(text, bigint)` — the query fails at run time with a function-does-
 * not-exist error rather than at compile time. The cast is the whole fix, and it
 * is easy to lose in a refactor, so it is written down here.
 */

function format(year: number, sequence: number, prefix = ''): string {
  return `${prefix}${year}/${String(sequence).padStart(SEQUENCE_WIDTH, '0')}`
}

/** `T-2026/0042` — the incoming-register number, REQ-REG-050 step 1. */
export async function allocateTemporaryNumber(tx: Tx, now = new Date()): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${TEMPORARY_NUMBER_LOCK}::bigint)`

  const year = now.getUTCFullYear()
  const prefix = `T-${year}/`

  const rows = await tx.$queryRaw<Array<{ max: string | null }>>`
    SELECT MAX(SUBSTRING("temporaryNumber" FROM ${prefix.length + 1}::int)) AS max
    FROM "application"
    WHERE "temporaryNumber" LIKE ${`${prefix}%`}
  `

  const highest = Number(rows[0]?.max ?? 0)
  return format(year, (Number.isFinite(highest) ? highest : 0) + 1, 'T-')
}

/** `2026/1183` — the permanent registration number, REQ-REG-050 step 5. */
export async function allocateRegistrationNumber(tx: Tx, now = new Date()): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REGISTRATION_NUMBER_LOCK}::bigint)`

  const year = now.getUTCFullYear()
  const prefix = `${year}/`

  const rows = await tx.$queryRaw<Array<{ max: string | null }>>`
    SELECT MAX(SUBSTRING("registrationNumber" FROM ${prefix.length + 1}::int)) AS max
    FROM "registration"
    WHERE "registrationNumber" LIKE ${`${prefix}%`}
  `

  const highest = Number(rows[0]?.max ?? 0)
  return format(year, (Number.isFinite(highest) ? highest : 0) + 1)
}

/**
 * `D-2026/0042` — the serial in the delivery ledger, REQ-REG-050 step 6.
 *
 * A third series rather than a reuse of the registration number, because the
 * paper ledger is a separate book: it records the order cards left the counter,
 * not the order they were granted, and the two diverge as soon as one card
 * waits a week to be collected.
 */
export async function allocateDeliverySerial(tx: Tx, now = new Date()): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REGISTRATION_NUMBER_LOCK}::bigint)`

  const year = now.getUTCFullYear()
  const prefix = `D-${year}/`

  const rows = await tx.$queryRaw<Array<{ max: string | null }>>`
    SELECT MAX(SUBSTRING("deliverySerial" FROM ${prefix.length + 1}::int)) AS max
    FROM "card_issuance"
    WHERE "deliverySerial" LIKE ${`${prefix}%`}
  `

  const highest = Number(rows[0]?.max ?? 0)
  return format(year, (Number.isFinite(highest) ? highest : 0) + 1, 'D-')
}
