import { PrismaClient } from '@prisma/client'

/**
 * The Prisma client, as a single instance.
 *
 * Next.js hot-reloads modules in development, which would otherwise create a
 * new connection pool on every file save until PostgreSQL refuses new
 * connections. Stashing the client on `globalThis` survives the reload.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

export type Db = typeof db

/**
 * A transaction handle. Server Actions that write a record *and* its audit
 * event must pass the same handle to both, so that a failure leaves neither.
 */
export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
