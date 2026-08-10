import { PrismaClient } from '@prisma/client'

/**
 * The Prisma client, as a single instance.
 *
 * Two different hosts want the same thing here for two different reasons.
 *
 * In development, Next.js hot-reloads modules, which would otherwise create a
 * new connection pool on every file save until PostgreSQL refuses new
 * connections.
 *
 * On a serverless host, a warm function instance re-enters this module across
 * invocations, and each pool it leaves behind holds real connections on the
 * database for as long as the instance lives. That is the classic way a
 * Postgres with a hundred connections is exhausted by a site with very little
 * traffic.
 *
 * Stashing the client on `globalThis` answers both. It is a per-instance
 * singleton, not a shared one — nothing crosses between function instances,
 * which is why the pooling note in docs/DEPLOYMENT.md still matters: the
 * *number of instances* is what a connection pooler is there to absorb.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

globalForPrisma.prisma = db

export type Db = typeof db

/**
 * A transaction handle. Server Actions that write a record *and* its audit
 * event must pass the same handle to both, so that a failure leaves neither.
 */
export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
