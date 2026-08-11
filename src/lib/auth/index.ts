import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { db } from '@/lib/db'
import { recordAuditEvent } from '@/lib/audit'
import { env, trustedOrigins } from '@/lib/env'
import { sendEmail } from '@/lib/email'
import {
  brokerVerificationEmail,
  governmentActivationEmail,
  passwordResetEmail,
} from '@/lib/email/templates'
import { roleLabel } from './roles'
import { noteIssuedLink } from './link-capture'

/**
 * Better Auth configuration. 02-SYSTEM-ARCHITECTURE §4.
 *
 * Three properties of this configuration are load-bearing:
 *
 *   1. `role` and `status` are `input: false`. Neither can ever arrive from a
 *      request body, so the public sign-up endpoint cannot be used to mint a
 *      SYSTEM_ADMIN. Government roles are set server-side by provisioning.
 *
 *   2. `cookieCache` is disabled. Better Auth can cache the session — role
 *      included — in a signed cookie to save a database round trip. That is a
 *      good default for most products and the wrong one here: §4 control 3
 *      requires a role change or suspension to take effect immediately,
 *      including on live sessions. A cached role means a suspended examiner
 *      keeps working until their cookie expires.
 *
 *   3. Emails are really sent, through src/lib/email. There is no outbox table.
 */

const ACTIVATION_EXPIRY_HOURS = 24

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: 'postgresql' }),

  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  emailAndPassword: {
    enabled: true,
    // The supervised population is large and must be able to onboard without
    // contacting the Authority, but an unverified address must not become a
    // working account.
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,

    sendResetPassword: async ({ user, url }) => {
      // The same mechanism serves two purposes that read very differently to
      // the recipient: a government employee activating a newly provisioned
      // account, and anyone resetting a forgotten password. A PENDING_ACTIVATION
      // account has never had a password, so "reset" would be the wrong word.
      const record = await db.user.findUnique({
        where: { id: user.id },
        select: { status: true, role: true, name: true, nameAr: true },
      })

      const displayName = record?.nameAr ?? record?.name ?? user.name

      // Before the send, not after: a provider that rejects the message must
      // not also lose the link. See src/lib/auth/link-capture.ts.
      noteIssuedLink({
        kind: record?.status === 'PENDING_ACTIVATION' ? 'activation' : 'reset',
        to: user.email,
        url,
      })

      if (record?.status === 'PENDING_ACTIVATION') {
        const labels = roleLabel(record.role)
        await sendEmail(
          governmentActivationEmail({
            to: user.email,
            name: displayName,
            roleLabelAr: labels.ar,
            roleLabelEn: labels.en,
            url,
            expiresInHours: ACTIVATION_EXPIRY_HOURS,
          }),
        )
        return
      }

      await sendEmail(
        passwordResetEmail({
          to: user.email,
          name: displayName,
          url,
          expiresInHours: ACTIVATION_EXPIRY_HOURS,
        }),
      )
    },

    /**
     * The moment an account actually becomes usable.
     *
     * Provisioning leaves the account PENDING_ACTIVATION with an unverified
     * address, which is right: it has no password anyone chose and nobody has
     * proved they can read the mailbox. Setting a password from the one-time
     * link proves both — the link only ever went to that address, and the
     * password is the holder's own.
     *
     * Without this the account is stranded. It has a working password and
     * `requireEmailVerification` still refuses the sign-in, so the employee
     * gets "Email not verified" on a screen that has just told them their
     * password was set. That is not a state any employee could get themselves
     * out of, and no administrator could either.
     *
     * An ordinary forgotten-password reset lands here too and must change
     * nothing: an ACTIVE account stays ACTIVE, and — this is the important one
     * — a SUSPENDED account is not quietly reinstated by its holder resetting
     * their own password. Only the PENDING_ACTIVATION transition is applied.
     */
    onPasswordReset: async ({ user }) => {
      const record = await db.user.findUnique({
        where: { id: user.id },
        select: { status: true, role: true, emailVerified: true },
      })
      if (record?.status !== 'PENDING_ACTIVATION') return

      await db.user.update({
        where: { id: user.id },
        data: { status: 'ACTIVE', emailVerified: true },
      })

      await recordAuditEvent({
        action: 'ACCOUNT_ACTIVATED',
        entityType: 'User',
        entityId: user.id,
        // The holder is acting, and they have no session yet — they are
        // proving who they are by holding the link. Naming them as the actor
        // is accurate; inventing an administrator would not be.
        actorUserId: user.id,
        actorRole: record.role,
        actorLabel: `${user.email} (account holder)`,
        fromState: 'PENDING_ACTIVATION',
        toState: 'ACTIVE',
        reason:
          'The holder set their own password from the one-time activation link, which proves control of the address the link was issued to.',
        payload: { email: user.email, role: record.role },
      })
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }) => {
      const record = await db.user.findUnique({
        where: { id: user.id },
        select: { nameAr: true, name: true },
      })
      noteIssuedLink({ kind: 'verification', to: user.email, url })
      await sendEmail(
        brokerVerificationEmail({
          to: user.email,
          name: record?.nameAr ?? record?.name ?? user.name,
          url,
          expiresInHours: ACTIVATION_EXPIRY_HOURS,
        }),
      )
    },
  },

  user: {
    additionalFields: {
      // input: false on both — see note 1 above.
      role: { type: 'string', required: false, input: false },
      status: { type: 'string', required: false, input: false },
      nameAr: { type: 'string', required: false, input: false },
      brokerEntityId: { type: 'string', required: false, input: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 8, // eight hours — a working day, not a fortnight
    updateAge: 60 * 30,
    cookieCache: {
      // See note 2. Do not enable this.
      enabled: false,
    },
  },

  advanced: {
    // Sessions are the one thing this product deletes; see the Session model.
    // The audit event is written before the row goes.
    database: { generateId: false },

    // Better Auth already marks cookies Secure when NODE_ENV is production.
    // This states it from the address instead, which is the thing that actually
    // decides whether a Secure cookie can be set at all: a Secure cookie sent
    // over http is dropped by the browser silently, and the symptom is a
    // sign-in that returns 200 and leaves the user signed out.
    useSecureCookies: env.BETTER_AUTH_URL.startsWith('https://'),

    defaultCookieAttributes: {
      httpOnly: true,
      // Lax, not Strict. The activation and password-reset links arrive from an
      // email client, which is a cross-site navigation; under Strict the cookie
      // set at the end of that flow would not be sent on the next request and
      // the employee would land back on the sign-in screen.
      sameSite: 'lax',
    },
  },

  // Derived, never a literal: production, each preview branch, and each
  // immutable deployment address are all legitimate origins. See src/lib/env.ts.
  trustedOrigins,
})

export type Auth = typeof auth
