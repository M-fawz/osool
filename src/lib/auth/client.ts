'use client'

import { createAuthClient } from 'better-auth/react'

/**
 * The browser-side auth client.
 *
 * Used only for sign-in, sign-out, and setting a password from an activation
 * link — the flows that genuinely happen in the browser. It is never used to
 * decide what a user may do: 02-SYSTEM-ARCHITECTURE §2, "Client-side checks
 * exist for speed of feedback and nothing else."
 */
export const authClient = createAuthClient()

export const { signIn, signOut, useSession } = authClient
