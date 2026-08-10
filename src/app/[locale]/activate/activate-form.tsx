'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { authClient } from '@/lib/auth/client'
import { BlockedAction, Button, Field, Input, Notice } from '@/components/ui/primitives'

const MIN_PASSWORD_LENGTH = 12

export function ActivateForm({
  token,
  hadLinkError,
  labels,
  headings,
}: {
  token: string | null
  hadLinkError: boolean
  labels: Record<string, string>
  headings: { what: string; why: string; next: string; who: string }
}) {
  const router = useRouter()
  const [problem, setProblem] = useState<'none' | 'mismatch' | 'tooShort' | 'invalidToken'>(
    !token || hadLinkError ? 'invalidToken' : 'none',
  )
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) { setProblem('invalidToken'); return }

    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') ?? '')
    const confirm = String(form.get('confirm') ?? '')

    if (password.length < MIN_PASSWORD_LENGTH) { setProblem('tooShort'); return }
    if (password !== confirm) { setProblem('mismatch'); return }

    setProblem('none')
    setBusy(true)
    const { error } = await authClient.resetPassword({ newPassword: password, token })
    setBusy(false)

    if (error) { setProblem('invalidToken'); return }
    setDone(true)
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Notice tone="confirmed" title={labels.successTitle!} live>
          {labels.successLead!}
        </Notice>
        <Button size="touch" className="w-full" onClick={() => router.push('/login')}>
          {labels.signIn!}
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {problem === 'invalidToken' ? (
        <BlockedAction
          what={labels.invalidTitle!} why={labels.invalidWhy!}
          nextStep={labels.invalidNext!} whoToAsk={labels.invalidWho!}
          headings={headings}
        />
      ) : null}
      {problem === 'mismatch' ? (
        <BlockedAction
          what={labels.mismatchTitle!} why={labels.mismatchWhy!}
          nextStep={labels.mismatchNext!} whoToAsk={labels.mismatchWho!}
          headings={headings} tone="caution"
        />
      ) : null}
      {problem === 'tooShort' ? (
        <BlockedAction
          what={labels.mismatchTitle!} why={labels.tooShortWhy!}
          nextStep={labels.tooShortNext!} whoToAsk={labels.mismatchWho!}
          headings={headings} tone="caution"
        />
      ) : null}

      <Field
        label={labels.password!}
        htmlFor="password"
        hint={labels.hint!}
        error={problem === 'tooShort' ? labels.tooShortWhy! : undefined}
        required
      >
        <Input name="password" type="password" dir="ltr" autoComplete="new-password" required
          minLength={MIN_PASSWORD_LENGTH} disabled={problem === 'invalidToken'} />
      </Field>

      <Field
        label={labels.confirm!}
        htmlFor="confirm"
        error={problem === 'mismatch' ? labels.mismatchWhy! : undefined}
        required
      >
        <Input name="confirm" type="password" dir="ltr" autoComplete="new-password" required
          minLength={MIN_PASSWORD_LENGTH} disabled={problem === 'invalidToken'} />
      </Field>

      <Button type="submit" size="touch" className="w-full" busy={busy}
        disabled={problem === 'invalidToken'}>
        {busy ? labels.submitting! : labels.submit!}
      </Button>
    </form>
  )
}
