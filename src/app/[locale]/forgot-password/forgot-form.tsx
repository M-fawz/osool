'use client'

import { useState } from 'react'
import { Link } from '@/i18n/navigation'
import { authClient } from '@/lib/auth/client'
import { Button, Field, Input, Notice } from '@/components/ui/primitives'

/**
 * Asking for a reset link.
 *
 * The one rule this screen exists to keep: **the answer never depends on
 * whether the address is registered.** A form that says "no such account" for
 * one address and "check your email" for another is an account-enumeration
 * oracle, and on this register the accounts are named government officers and
 * the owners of supervised firms — precisely the list an attacker would want.
 * Better Auth's endpoint already answers uniformly; this screen must not undo
 * that by reporting the error it gets back differently.
 *
 * So there is exactly one success state, it is shown for every well-formed
 * address, and a transport failure is reported as a transport failure rather
 * than as anything about the account.
 */
export function ForgotPasswordForm({
  labels,
}: {
  labels: Record<string, string>
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'unreachable'>('idle')

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim()
    if (!email) return

    setState('busy')

    /*
     * `redirectTo` is where Better Auth sends the browser once it has checked
     * the token — the page that actually collects the new password. It reuses
     * the activation form component, because the mechanism underneath is the
     * same reset token, but under its own route and its own copy: somebody who
     * has forgotten a password is not activating anything.
     */
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
    })

    // Deliberately not branched on the account: only on whether the request
    // itself got through at all.
    setState(error ? 'unreachable' : 'sent')
  }

  if (state === 'sent') {
    return (
      <div className="space-y-4">
        <Notice tone="confirmed" title={labels.sentTitle!} live>
          {labels.sentLead!}
        </Notice>
        <Button asChild size="touch" className="w-full">
          <Link href="/login">{labels.backToSignIn!}</Link>
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {state === 'unreachable' ? (
        <Notice tone="blocking" title={labels.unreachableTitle!} live>
          {labels.unreachableLead!}
        </Notice>
      ) : null}

      <Field label={labels.email!} htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          dir="ltr"
          inputMode="email"
        />
      </Field>

      <Button type="submit" size="touch" className="w-full" disabled={state === 'busy'}>
        {state === 'busy' ? labels.submitting! : labels.submit!}
      </Button>

      <p className="text-center text-xs text-ink-faint">
        <Link href="/login" className="underline underline-offset-2 hover:text-ink">
          {labels.backToSignIn!}
        </Link>
      </p>
    </form>
  )
}
