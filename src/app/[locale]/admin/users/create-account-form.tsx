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
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [failure, setFailure] = useState<{ message: string } | null>(null)

  function onSubmit(formData: FormData) {
    setFailure(null)
    setCreated(null)
    setLink(null)
    setCopied(false)
    startTransition(async () => {
      const result = await createGovernmentAccountAction(formData)
      if (result.ok) {
        setCreated(result.email)
        // Non-null only where this deployment has no outbound mail, in which
        // case the administrator is the delivery mechanism and this is the
        // only time the link will ever be visible.
        setLink(result.activationUrl ?? null)
      } else setFailure({ message: result.message })
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

      {link ? (
        <Notice tone="caution" title={labels.linkTitle!} live>
          <p>{labels.linkLead!}</p>
          {/* Rendered as selectable text as well as behind the copy button: a
              browser that denies clipboard access must not make the link
              unreachable, because no second copy exists anywhere. */}
          <p className="ltr-run mt-2 break-all border border-rule bg-paper p-2 font-mono text-xs text-ink">
            {link}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(link).then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
              }}
            >
              {copied ? labels.linkCopied! : labels.linkCopy!}
            </Button>
            <span className="text-xs text-ink-muted">{labels.linkOnce!}</span>
          </p>
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
