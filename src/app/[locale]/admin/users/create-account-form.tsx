'use client'

import { useState, useTransition } from 'react'
import { createGovernmentAccountAction } from './actions'
import { BlockedAction, Button, Field, Input, Notice, Select } from '@/components/ui/primitives'

/**
 * Create a government account.
 *
 * The refusal copy used to be three English sentences written inline — which
 * meant an Arabic-speaking administrator, the only person who ever sees this
 * screen, was told in a language the rest of the page is not written in why
 * their action had failed. All four parts now come from the catalogue.
 *
 * The server action remains the only thing that decides whether an account is
 * created. This form reports what it was told; it does not check anything.
 */
export function CreateAccountForm({
  roles,
  labels,
  createdLeadTemplate,
  headings,
}: {
  roles: Array<{ value: string; label: string }>
  labels: Record<string, string>
  createdLeadTemplate: string
  headings: { what: string; why: string; next: string; who: string }
}) {
  const [pending, startTransition] = useTransition()
  const [created, setCreated] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ message: string } | null>(null)

  function onSubmit(formData: FormData) {
    setFailure(null)
    setCreated(null)
    startTransition(async () => {
      const result = await createGovernmentAccountAction(formData)
      if (result.ok) setCreated(result.email)
      else setFailure({ message: result.message })
    })
  }

  const [leadBefore, leadAfter] = createdLeadTemplate.split('{email}')

  return (
    <form action={onSubmit} className="space-y-4">
      {created ? (
        <Notice tone="confirmed" title={labels.createdTitle!} live>
          <p>
            {leadBefore}
            <span className="ltr-run font-medium text-ink">{created}</span>
            {leadAfter}
          </p>
          <p className="mt-1">{labels.createdNext!}</p>
        </Notice>
      ) : null}

      {failure ? (
        <BlockedAction
          what={labels.failedTitle!}
          why={failure.message}
          nextStep={labels.failedNext!}
          whoToAsk={labels.failedWho!}
          headings={headings}
          tone="caution"
        />
      ) : null}

      <Field label={labels.name!} htmlFor="name" required>
        <Input name="name" dir="ltr" required autoComplete="off" className="ltr-run" />
      </Field>

      <Field label={labels.nameAr!} htmlFor="nameAr">
        <Input name="nameAr" dir="rtl" lang="ar" autoComplete="off" />
      </Field>

      <Field label={labels.email!} htmlFor="email" required>
        <Input name="email" type="email" dir="ltr" required autoComplete="off" className="ltr-run" />
      </Field>

      <Field label={labels.role!} htmlFor="role" required>
        <Select name="role" required defaultValue="EXAMINER">
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>

      <Button type="submit" size="touch" className="w-full" busy={pending}>
        {pending ? labels.creating! : labels.create!}
      </Button>
    </form>
  )
}
