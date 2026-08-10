import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth'

/**
 * Better Auth's HTTP surface: sign-in, sign-out, email verification, password
 * reset, and the activation link's token exchange.
 *
 * This is a Route Handler rather than a Server Action because these are
 * genuinely HTTP concerns — links arrive from an email client, not from the
 * application — which is the distinction 02-SYSTEM-ARCHITECTURE §2 draws.
 *
 * Note that sign-*up* through this handler can only ever produce a broker
 * account: `role` is `input: false` in the Better Auth configuration, so a
 * request body cannot carry one, and the User model defaults to the
 * least-privileged role. Government accounts are provisioned server-side.
 */
export const { GET, POST } = toNextJsHandler(auth)
