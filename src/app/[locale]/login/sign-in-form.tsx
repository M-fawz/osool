'use client'

import { useState, useTransition } from 'react'
import { useRouter } from '@/i18n/navigation'
import { signIn } from '@/lib/auth/client'
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
  const [pending, startTransition] = useTransition()
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<'none' | 'credentials' | 'suspended'>('none')

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

  const busy = submitting || pending

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
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

      <Button type="submit" size="touch" className="w-full" busy={busy}>
        {busy ? labels.submitting! : labels.submit!}
      </Button>
    </form>
  )
}
