/**
 * The gate in front of every script that creates accounts with known passwords.
 *
 * Two scripts do that — `seed:phase1` and `dev:accounts` — and both used to
 * refuse outright unless the database was on localhost. That refusal was
 * correct and it was also too narrow: this product is proposal-stage, and the
 * thing it most needs to be is *openable*. A register nobody outside the
 * project can sign into demonstrates nothing.
 *
 * So a hosted deployment may hold the demonstration register, and it takes two
 * independent keys to put it there:
 *
 *   1. `DEMONSTRATION_DEPLOYMENT=true` in the environment — a deliberate act by
 *      whoever administers the deployment, made once, visible in the platform's
 *      own configuration screen alongside every other variable.
 *   2. `--demonstration-deployment` on the command line — a deliberate act by
 *      whoever is running the script, made every single time.
 *
 * Neither alone is enough. A live register that never sets the variable cannot
 * be seeded by someone who mistypes a command; a script run for another purpose
 * cannot seed by inheriting an environment. That is the property the localhost
 * check was protecting, kept, without also making the demonstration impossible.
 *
 * What this is not: a way to weaken authentication. These accounts are created
 * through Better Auth's ordinary sign-up, hashed identically to any other, and
 * every one of them is written to the audit trail marked as a demonstration
 * fixture. The trail never quietly gains accounts.
 */

export interface GateOptions {
  /** The script asking, for the message. */
  script: string
  /** True when `--demonstration-deployment` was passed. */
  flagGiven: boolean
}

function databaseHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? '').hostname
  } catch {
    return ''
  }
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1']

/** True where this is a developer's own machine and no gate is needed. */
export function isLocalDatabase(): boolean {
  return LOCAL_HOSTS.includes(databaseHost())
}

/**
 * Throw unless this script is allowed to create known-password accounts here.
 *
 * Returns whether it is running against a hosted deployment, so the caller can
 * say so in its output rather than printing "sign in at localhost:3000" to
 * someone who is not.
 */
export function requireSeedableTarget(options: GateOptions): { hosted: boolean } {
  if (isLocalDatabase()) return { hosted: false }

  const host = databaseHost() || 'unparseable'
  const envKey = process.env.DEMONSTRATION_DEPLOYMENT === 'true'

  if (!envKey || !options.flagGiven) {
    const missing = [
      envKey ? null : '  · DEMONSTRATION_DEPLOYMENT=true is not set in the environment.',
      options.flagGiven ? null : '  · --demonstration-deployment was not passed on the command line.',
    ].filter(Boolean)

    throw new Error(
      `${options.script} refuses to run against a non-local database (host: ${host}).\n\n` +
        'It creates accounts whose passwords are published in this repository. Putting those on a\n' +
        'register that supervises real brokers would hand every role in the Authority to anyone who\n' +
        'has read the source.\n\n' +
        `${missing.join('\n')}\n\n` +
        'Both are required, and deliberately so — one is set by whoever administers the deployment,\n' +
        'the other typed by whoever runs the script. If this really is a demonstration deployment,\n' +
        'set the variable and pass the flag. If it is not, you have just been stopped from a very\n' +
        'bad afternoon.\n',
    )
  }

  return { hosted: true }
}

/**
 * The banner. Printed before the work, not after, so that someone who has
 * realised they are pointed at the wrong database can still interrupt.
 */
export function announceDemonstrationTarget(hosted: boolean): void {
  if (!hosted) return
  const rule = '═'.repeat(72)
  console.log(`\n${rule}`)
  console.log('  HOSTED DEMONSTRATION DEPLOYMENT')
  console.log(`  Database host: ${databaseHost()}`)
  console.log('')
  console.log('  This creates accounts with passwords published in the repository, and a')
  console.log('  register of invented brokers. It is a demonstration, not a register of')
  console.log('  record. Before this deployment supervises anyone real: suspend every')
  console.log('  *@osool.test account, and rotate the administrator password.')
  console.log(`${rule}\n`)
}
