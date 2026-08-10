import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Load `.env` for a plain Node script.
 *
 * Next.js and the Prisma CLI each read `.env` on their own, so a script that
 * only shells out to them never notices it is missing. A script that reads
 * `process.env` itself — to decide what to do before shelling out — does, and
 * the symptom is a confident "DATABASE_URL is not set" on a machine where it
 * plainly is.
 *
 * A real environment variable always wins. On a host there is no `.env` file at
 * all, and where there is one it must never quietly override what the platform
 * or the shell has already set.
 */
export function loadEnvFile() {
  const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
  const path = join(root, '.env')
  if (!existsSync(path)) return

  const before = { ...process.env }
  process.loadEnvFile(path)

  for (const [key, value] of Object.entries(before)) {
    if (value !== undefined) process.env[key] = value
  }

  /*
   * `NODE_ENV` is never taken from the file, whatever it says there.
   *
   * It is not configuration; it is which mode the tool being run is in, and it
   * belongs to that tool. This repository's `.env` carries NODE_ENV=development
   * because that is correct for `next dev`. Letting it through here would hand
   * `next build` a development NODE_ENV, and the way that fails is worth
   * describing so nobody spends an afternoon on it a second time: the build
   * compiles cleanly, then dies prerendering /404 with "<Html> should not be
   * imported outside of pages/_document" — an error about a file this project
   * does not have, in a router it does not use. Next.js ignores NODE_ENV in
   * .env files for exactly this reason, and so does this.
   */
  if (before.NODE_ENV === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = before.NODE_ENV
}
