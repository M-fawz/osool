'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from '@/i18n/navigation'
import { signIn } from '@/lib/auth/client'
import { useHydrated } from '@/lib/hooks/use-hydrated'
import { BlockedAction, Button, Field, Input } from '@/components/ui/primitives'

/**
 * Sign-in.
 *
 * The failure copy follows the four-part shape from 03-DESIGN-DIRECTION §6 —
 * never a bare "invalid credentials".
 *
 * What it deliberately does *not* do is tell the caller which of the two was
 * wrong, or whether the address is registered at all. That is an ordinary
 * account-enumeration defence, and it matters more than usual here: the set of
 * people holding accounts on this system is itself sensitive, because it
 * identifies who examines and approves registrations.
 *
 * The router is next-intl's, not Next's. With the plain one, signing in from
 * `/en/login` pushed the bare path `/dashboard` — which is the *Arabic*
 * canonical route, since Arabic is unprefixed — and an English-speaking
 * official was silently switched into Arabic at the moment they authenticated.
 */
export function SignInForm({
  labels,
  headings,
}: {
  labels: Record<string, string>
  headings: { what: string; why: string; next: string; who: string }
}) {
  const router = useRouter()
  const ready = useHydrated()
  const [pending, startTransition] = useTransition()
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<'none' | 'credentials' | 'suspended'>('none')

  /*
   * Warm `/dashboard` while the credentials are still being typed.
   *
   * Signing in is the one navigation in the product whose destination is known
   * before the user acts, and it is also the one the user is least willing to
   * wait for: they have just handed over a password and cannot tell whether it
   * was accepted. Fetching the destination up front moves that wait to a moment
   * when nobody is waiting.
   *
   * It matters most in development, where a route is compiled on first request
   * and `/dashboard` — the whole signed-in shell — is one of the slowest in the
   * product. Without this, the first sign-in after a server restart sits on the
   * submit button for the length of that compile with the screen unchanged, and
   * reads as an authentication failure rather than a build step. That is
   * exactly how this was reported.
   */
  useEffect(() => {
    router.prefetch('/dashboard')
  }, [router])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFailure('none')
    setSubmitting(true)

    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')

    const { error } = await signIn.email({ email, password })

    setSubmitting(false)

    if (error) {
      // A suspended account is told so plainly, because there is nothing the
      // holder can do about it and pretending the password was wrong would
      // send them round a loop they cannot exit.
      const suspended = error.status === 403 || /suspend|banned|disabled/i.test(error.message ?? '')
      setFailure(suspended ? 'suspended' : 'credentials')
      return
    }

    startTransition(() => {
      router.push('/dashboard')
      router.refresh()
    })
  }

  /*
   * Two different waits, and they must not look the same.
   *
   * `submitting` is "the password is being checked"; `pending` is "it was
   * accepted, and the dashboard is being fetched". Labelling both "Checking…"
   * means the one fact the person at the keyboard actually wants — was I let
   * in? — is withheld for the whole of the second wait, and a slow navigation
   * becomes indistinguishable from a rejected password.
   */
  const busy = submitting || pending
  const busyLabel = submitting ? labels.submitting! : labels.signingIn!

  return (
    /*
     * `method="post"` on a form whose submission is handled in JavaScript is
     * not redundant. See src/lib/hooks/use-hydrated.ts: before hydration this
     * is a plain HTML form, and the HTML default would put the password in the
     * query string. The method decides where the fields go if that ever
     * happens; `ready` below decides that it does not.
     */
    <form method="post" onSubmit={onSubmit} className="space-y-5" noValidate>
      {failure !== 'none' ? (
        <BlockedAction
          what={failure === 'suspended' ? labels.suspendedTitle! : labels.failedTitle!}
          why={failure === 'suspended' ? labels.suspendedWhy! : labels.failedWhy!}
          nextStep={failure === 'suspended' ? labels.suspendedNext! : labels.failedNext!}
          whoToAsk={failure === 'suspended' ? labels.suspendedWho! : labels.failedWho!}
          headings={headings}
          tone={failure === 'suspended' ? 'blocking' : 'caution'}
        />
      ) : null}

      <Field label={labels.email!} htmlFor="email" required>
        <Input
          name="email"
          type="email"
          dir="ltr"
          autoComplete="username"
          required
          className="ltr-run"
        />
      </Field>

      <Field label={labels.password!} htmlFor="password" required>
        <Input name="password" type="password" dir="ltr" autoComplete="current-password" required />
      </Field>

      <Button
        type="submit"
        size="touch"
        className="w-full"
        busy={busy || !ready}
        disabled={!ready}
      >
        {busy ? busyLabel : labels.submit!}
      </Button>
    </form>
  )
}
