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
 * from the Phase 0 migrations are installed on the development database too, and
 * inside the per-run test schema as well — a test that tries to delete a row
 * still fails, exactly as production would. Fixtures are append-only within a
 * run; between runs they do not accumulate, because each run gets its own
 * schema and drops it afterwards. tests/setup/global.ts explains why.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: false,
    /*
     * Every run writes a report to disk as well as to the terminal.
     *
     * A previous session lost a failure because the only record of it was
     * scrollback. A suite whose result exists only in a terminal buffer has not
     * really been run — nobody can be shown the failure afterwards, and "it was
     * green on my machine" is unanswerable. `.proof/` is gitignored, so these
     * accumulate locally and never enter the repository.
     */
    reporters: [
      'default',
      ['json', { outputFile: '.proof/test-reports/results.json' }],
      ['junit', { outputFile: '.proof/test-reports/results.xml' }],
    ],
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
          // One fresh schema for the whole run — see tests/setup/global.ts for
          // why per-run and not per-file.
          globalSetup: ['tests/setup/global.ts'],
          setupFiles: ['tests/setup/database.ts'],
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
