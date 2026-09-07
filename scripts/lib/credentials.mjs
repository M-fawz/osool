/**
 * Where the QA harnesses get an account to sign in with.
 *
 * These scripts previously carried a named administrator's real address and
 * real password as literals, in six files, and those literals are in the git
 * history from `d691022`. A credential in a repository is a credential that has
 * been published: it does not stop being published when it is deleted from the
 * working tree, and anybody who has ever cloned this project has it.
 *
 * The replacement has to satisfy two things at once. The harnesses must still
 * run with no setup against a developer's own machine — a test suite that needs
 * a ceremony before it will start is a test suite nobody runs. And it must be
 * impossible to point them at a deployed register using a credential that came
 * out of the source.
 *
 * So the default is the demonstration account: `admin@osool.test`, on the
 * reserved `.test` TLD that can never resolve, with the password
 * `scripts/dev-accounts.ts` publishes on purpose and
 * `scripts/lib/demonstration-gate.ts` guards. That account is *meant* to be
 * known — it is the one the seed creates so the product can be opened at all.
 *
 * And the default is refused the moment the target is not local. Against
 * anything else the harness demands `OSOOL_QA_ADMIN_EMAIL` and
 * `OSOOL_QA_ADMIN_PASSWORD` from the environment and stops if they are absent,
 * so reaching a hosted deployment always takes a credential somebody supplied
 * deliberately and no credential that ships with the code will ever open one.
 */

/** Published on purpose, on a TLD reserved by RFC 2606 so it cannot resolve. */
const DEMONSTRATION_ADMIN = {
  email: 'admin@osool.test',
  password: 'DevOnly!Osool2026',
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** True when `base` addresses this machine. */
export function isLocalTarget(base) {
  try {
    return LOCAL_HOSTS.has(new URL(base).hostname)
  } catch {
    return false
  }
}

/**
 * The administrator credential for a harness run against `base`.
 *
 * Throws rather than falling back, because the failure this guards against is
 * silent: a harness that quietly tried a published password against a live
 * register would look like an ordinary authentication failure in the logs.
 */
export function adminCredentials(base) {
  const email = process.env.OSOOL_QA_ADMIN_EMAIL?.trim()
  const password = process.env.OSOOL_QA_ADMIN_PASSWORD

  if (email && password) return { email, password, source: 'environment' }

  if (!isLocalTarget(base)) {
    throw new Error(
      `This harness is pointed at ${base}, which is not this machine.\n\n` +
        'It will not use the demonstration credential that ships with the repository against a\n' +
        'deployment. Supply the account to sign in with:\n\n' +
        '  OSOOL_QA_ADMIN_EMAIL=…  OSOOL_QA_ADMIN_PASSWORD=…  npm run qa:routes\n\n' +
        'Set them in the shell for one run rather than in a file, so neither is written to disk.\n' +
        (email || password
          ? '\nOne of the two is set and the other is not; both are required.\n'
          : ''),
    )
  }

  return { ...DEMONSTRATION_ADMIN, source: 'demonstration account' }
}

/** The published password for the `*@osool.test` fixtures, overridable. */
export function demonstrationPassword() {
  return process.env.OSOOL_DEMO_PASSWORD?.trim() || DEMONSTRATION_ADMIN.password
}
