import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * The test runner.
 *
 * Two projects, because the two kinds of test have genuinely different needs
 * and mixing them makes the fast ones slow:
 *
 *   · `unit`        — pure functions. No database, no environment. Milliseconds.
 *   · `integration` — the domain layer against a real PostgreSQL. These are the
 *                     ones that matter: the rules this system exists to enforce
 *                     are enforced in transactions, advisory locks, and CHECK
 *                     constraints, and a mocked Prisma client proves none of it.
 *
 * Integration tests run single-file-at-a-time (`fileParallelism: false`). They
 * share one database and several of them deliberately contend on the same
 * advisory locks; running files in parallel would make the concurrency tests
 * assert against each other's noise rather than against the code.
 *
 * Nothing here truncates or deletes. It cannot: the delete and truncate guards
 * from the Phase 0 migrations are installed on the development database too.
 * Fixtures are therefore append-only and namespaced per run.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: false,
    // Integration files run one at a time. They share one database and several
    // of them deliberately contend on the same rows and advisory locks; running
    // files in parallel would make the concurrency tests assert against each
    // other's noise rather than against the code.
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/setup/database.ts'],
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
