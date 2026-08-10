/**
 * Development-only test accounts.
 *
 *   npm run dev:accounts
 *
 * Why this exists: the real provisioning path is deliberately awkward — a
 * SYSTEM_ADMIN creates an account, the holder receives an activation email and
 * chooses their own password. That is correct, and it is not something to walk
 * through five times before every design review.
 *
 * So this script creates one account per role with a known password, purely so
 * that the interface can be exercised as each role sees it. It changes nothing
 * about how the application behaves:
 *
 *   · passwords go through Better Auth's ordinary sign-up API, so they are
 *     hashed exactly as a real one would be — there is no back door here;
 *   · every account it creates is written to the audit trail, marked as a
 *     development bootstrap, so the trail never quietly gains accounts;
 *   · it refuses to run against a production environment or a non-local
 *     database, checked below and not merely documented.
 *
 * The addresses all sit on the reserved `.test` TLD (RFC 2606), which can never
 * resolve, so no mail can escape even by accident.
 */

import { parseArgs } from 'node:util'
import type { Role } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { recordAuditEvent } from '@/lib/audit'

/**
 * Written out rather than generated, so that it is greppable and so that
 * nobody can mistake it for a credential worth protecting.
 */
const DEV_PASSWORD = 'DevOnly!Osool2026'

const ACCOUNTS: Array<{
  email: string
  name: string
  nameAr: string
  role: Role
  note: string
}> = [
  {
    email: 'admin@osool.test',
    name: 'Dev System Administrator',
    nameAr: 'مسؤول النظام (تجريبي)',
    role: 'SYSTEM_ADMIN',
    note: 'Accounts screen; must be refused case data.',
  },
  {
    email: 'auditor@osool.test',
    name: 'Dev Internal Auditor',
    nameAr: 'مراجع داخلي (تجريبي)',
    role: 'AUDITOR',
    note: 'Audit trail; the densest table in the product.',
  },
  {
    email: 'examiner@osool.test',
    name: 'Dev Examiner',
    nameAr: 'الفاحص (تجريبي)',
    role: 'EXAMINER',
    note: 'Government role with no admin rights — the refusal path.',
  },
  {
    email: 'reviewer@osool.test',
    name: 'Dev Reviewer',
    nameAr: 'المراجع (تجريبي)',
    role: 'REVIEWER',
    note: 'Second pair of eyes; segregation of duties.',
  },
  {
    email: 'broker@osool.test',
    name: 'Dev Broker Owner',
    nameAr: 'صاحب المنشأة (تجريبي)',
    role: 'BROKER_OWNER',
    note: 'The portal side — touch targets, one thing per screen.',
  },
  {
    email: 'suspended@osool.test',
    name: 'Dev Suspended Officer',
    nameAr: 'حساب موقوف (تجريبي)',
    role: 'REGISTRY_CLERK',
    note: 'Suspended, to exercise the suspension refusal copy.',
  },
]

function refuseOutsideDevelopment() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'dev-accounts refuses to run with NODE_ENV=production. These are test credentials with a ' +
        'published password; they must never exist on a deployed system.',
    )
  }

  const url = process.env.DATABASE_URL ?? ''
  const host = (() => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  })()

  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(
      `dev-accounts refuses to run against a non-local database (host: ${host || 'unparseable'}). ` +
        'It is only ever meant to seed a developer machine.',
    )
  }
}

async function main() {
  const { values } = parseArgs({
    options: { reset: { type: 'boolean', default: false } },
    allowPositionals: true,
  })

  refuseOutsideDevelopment()

  console.log('\nDevelopment test accounts')
  console.log(`Password for every account below: ${DEV_PASSWORD}\n`)

  for (const account of ACCOUNTS) {
    const existing = await db.user.findUnique({
      where: { email: account.email },
      select: { id: true, role: true, status: true },
    })

    if (existing) {
      // Accounts are never deleted (CLAUDE.md rule 2), so re-running this
      // script reconciles rather than recreates. The password is left alone
      // unless --reset is passed, since resetting it is a real credential
      // change and should be asked for.
      const status = account.role === 'REGISTRY_CLERK' ? 'SUSPENDED' : 'ACTIVE'
      await db.user.update({
        where: { id: existing.id },
        data: { role: account.role, status, nameAr: account.nameAr },
      })

      if (values.reset) {
        const ctx = await auth.$context
        const hash = await ctx.password.hash(DEV_PASSWORD)
        await ctx.internalAdapter.updatePassword(existing.id, hash)
      }

      console.log(
        `  = ${account.email.padEnd(24)} ${account.role.padEnd(14)} ${status.padEnd(9)} (existing${values.reset ? ', password reset' : ''})`,
      )
      continue
    }

    const created = await auth.api.signUpEmail({
      body: { email: account.email, password: DEV_PASSWORD, name: account.name },
    })

    if (!created?.user?.id) {
      throw new Error(`Could not create ${account.email}`)
    }

    const status = account.role === 'REGISTRY_CLERK' ? 'SUSPENDED' : 'ACTIVE'

    await db.user.update({
      where: { id: created.user.id },
      data: {
        role: account.role,
        status,
        nameAr: account.nameAr,
        // A real account activates by email. These are pre-activated, which is
        // the entire difference between this path and the production one.
        emailVerified: true,
        suspendedReason:
          status === 'SUSPENDED' ? 'Development fixture: exercises the suspension refusal.' : null,
        suspendedAt: status === 'SUSPENDED' ? new Date() : null,
      },
    })

    await recordAuditEvent({
      action: 'DEV_ACCOUNT_SEEDED',
      entityType: 'User',
      entityId: created.user.id,
      actorUserId: null,
      actorRole: null,
      actorLabel: 'development seed (command line)',
      toState: status,
      reason: `Development test account created for ${account.email}. Not a production path.`,
      payload: { email: account.email, role: account.role, status },
    })

    console.log(
      `  + ${account.email.padEnd(24)} ${account.role.padEnd(14)} ${status.padEnd(9)} ${account.note}`,
    )
  }

  console.log('\nSign in at http://localhost:3000/login\n')
  await db.$disconnect()
}

main().catch(async (error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`)
  await db.$disconnect()
  process.exit(1)
})
