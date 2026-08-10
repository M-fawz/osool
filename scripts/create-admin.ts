/**
 * Create the first system administrator.
 *
 *   npm run admin:create -- --email you@example.gov.eg --name "Your Name" [--name-ar "اسمك"]
 *
 * This exists because of a genuine chicken-and-egg problem: government accounts
 * are created only by a SYSTEM_ADMIN, so the first one cannot be. It is a
 * deliberately awkward, command-line-only, once-per-deployment act, recorded in
 * the audit trail as `SYSTEM_BOOTSTRAP` with no acting user — because there was
 * no user yet, and the trail should say so rather than invent one.
 *
 * It refuses to run if a SYSTEM_ADMIN already exists. After that, every
 * account comes through the application, with a named administrator attached.
 */

import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { recordAuditEvent } from '@/lib/audit'

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      'name-ar': { type: 'string' },
      force: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  })

  const email = values.email?.trim().toLowerCase()
  const name = values.name?.trim()

  if (!email || !name) {
    console.error('Usage: npm run admin:create -- --email <address> --name "<name>" [--name-ar "<الاسم>"]')
    process.exit(1)
  }

  const existingAdmin = await db.user.findFirst({
    where: { role: 'SYSTEM_ADMIN', archivedAt: null },
    select: { email: true },
  })

  if (existingAdmin && !values.force) {
    console.error(
      `A system administrator already exists (${existingAdmin.email}).\n` +
        'Create further accounts through the application, so that each one has a named administrator\n' +
        'attached to it in the audit trail. Pass --force only if you genuinely intend a second bootstrap.',
    )
    process.exit(1)
  }

  const taken = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (taken) {
    console.error(`An account already exists for ${email}. Accounts are never deleted.`)
    process.exit(1)
  }

  const throwaway = randomBytes(32).toString('base64url')
  const created = await auth.api.signUpEmail({ body: { email, password: throwaway, name } })
  if (!created?.user?.id) {
    console.error('The account could not be created.')
    process.exit(1)
  }

  await db.user.update({
    where: { id: created.user.id },
    data: {
      role: 'SYSTEM_ADMIN',
      status: 'PENDING_ACTIVATION',
      nameAr: values['name-ar']?.trim() || null,
    },
  })

  await recordAuditEvent({
    action: 'SYSTEM_BOOTSTRAP',
    entityType: 'User',
    entityId: created.user.id,
    // No actor: there was no user in the system to act. Recording a fictional
    // one would be the only dishonest row in the trail.
    actorUserId: null,
    actorRole: null,
    actorLabel: 'bootstrap (command line)',
    toState: 'PENDING_ACTIVATION',
    reason: `First system administrator created from the command line for ${email}.`,
    payload: { email, name, role: 'SYSTEM_ADMIN' },
  })

  await auth.api.requestPasswordReset({
    body: { email, redirectTo: `${env.APP_URL}/activate` },
  })

  console.log(`\nSystem administrator created: ${email}`)
  console.log(`An activation email has been sent (driver: ${env.EMAIL_PROVIDER}).`)
  if (env.EMAIL_PROVIDER === 'console') {
    console.log('The console driver printed the message above — open the activation link from it.')
  }
  console.log('Set a password from that link, then sign in at /login.\n')

  await db.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await db.$disconnect()
  process.exit(1)
})
