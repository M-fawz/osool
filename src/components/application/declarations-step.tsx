'use client'

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/cn'
import { setDeclarationAction } from '@/app/[locale]/application/actions'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/notice'
import { Status } from '@/components/ui/status'
import { Stamp } from '@/components/ui/bidi'
import { Check, Icon } from '@/components/ui/icon'

/**
 * Step 7 — the fifteen declarations. REQ-REG-040.
 *
 * "Each must be captured as a discrete, individually recorded assertion — not a
 *  single 'I agree' checkbox — because each is independently falsifiable and
 *  independently cross-checkable."
 *
 * Read literally, that rules out the obvious implementation: fifteen checkboxes
 * inside one form, submitted together, would write fifteen rows carrying one
 * timestamp — one act, recorded fifteen times. So each declaration posts on its
 * own, the moment it is affirmed, and carries its own `assertedAt`. The trail
 * shows the order they were read in and how long the applicant took, which is
 * the difference between a signature and a scroll to the bottom.
 *
 * The grouping is presentational and says so: three headings so that fifteen
 * legal paragraphs do not arrive as one wall of text. It never merges two
 * assertions into one act.
 *
 * Declaration 10 is not a yes/no — REQ-REG-040 item 10 offers two lawful
 * answers — so it renders as a choice with a named employer, not as a checkbox
 * an honest public employee would have to lie to tick.
 */

export interface DeclarationView {
  key: string
  position: number
  group: string
  text: string
  requiresQualificationWhenNegative: boolean
  record: { affirmed: boolean; qualification: string | null; assertedAt: string } | null
}

export interface DeclarationGroupView {
  key: string
  label: string
  items: DeclarationView[]
}

export function DeclarationsStep({
  applicationId,
  groups,
  total,
  continueHref,
}: {
  applicationId: string
  groups: DeclarationGroupView[]
  total: number
  continueHref: string
}) {
  const t = useTranslations('apply')
  const router = useRouter()
  const [pendingKey, setPendingKey] = React.useState<string | null>(null)

  const affirmed = groups
    .flatMap((g) => g.items)
    .filter((i) => i.record?.affirmed || (i.record && i.record.qualification)).length

  const record = React.useCallback(
    async (input: { declarationKey: string; affirmed: boolean; qualification?: string }) => {
      setPendingKey(input.declarationKey)
      try {
        await setDeclarationAction({ applicationId, ...input })
        router.refresh()
      } finally {
        setPendingKey(null)
      }
    },
    [applicationId, router],
  )

  return (
    <div className="space-y-6">
      <Notice tone="caution">{t('declarationsWarning')}</Notice>

      <p className="text-sm font-medium text-ink-muted" aria-live="polite">
        {t('declarationsProgress', { done: affirmed, total })}
      </p>

      {groups.map((group) => (
        <section key={group.key} className="space-y-3">
          <h2 className="text-md font-semibold text-navy-700">{group.label}</h2>
          <div className="divide-y divide-rule border border-rule bg-paper">
            {group.items.map((item) =>
              item.requiresQualificationWhenNegative ? (
                <QualifiedDeclaration
                  key={item.key}
                  item={item}
                  busy={pendingKey === item.key}
                  onRecord={record}
                />
              ) : (
                <SimpleDeclaration
                  key={item.key}
                  item={item}
                  busy={pendingKey === item.key}
                  onRecord={record}
                />
              ),
            )}
          </div>
        </section>
      ))}

      <div className="border-t border-rule pt-5">
        <Button size="touch" asChild>
          <a href={continueHref}>{t('saveAndContinue')}</a>
        </Button>
      </div>
    </div>
  )
}

function DeclarationBody({
  item,
  children,
}: {
  item: DeclarationView
  children: React.ReactNode
}) {
  const t = useTranslations('apply')

  return (
    <div className="px-4 py-4">
      <div className="flex items-start gap-3">
        {/* The number is the identity of the undertaking on the printed form,
            so it stays visible: an examiner and an applicant discussing "item
            nine" must be discussing the same paragraph. */}
        <span className="ltr-run mt-0.5 shrink-0 text-sm font-semibold text-ink-faint">
          {item.position}.
        </span>
        <p className="min-w-0 flex-1 text-base leading-relaxed text-ink">{item.text}</p>
      </div>
      <div className="mt-3 ps-7">{children}</div>
      {item.record?.affirmed ? (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 ps-7 text-xs text-ink-faint">
          <Icon as={Check} size="xs" className="text-confirmed" />
          <Stamp value={item.record.assertedAt} withTime />
        </p>
      ) : null}
    </div>
  )
}

function SimpleDeclaration({
  item,
  busy,
  onRecord,
}: {
  item: DeclarationView
  busy: boolean
  onRecord: (input: { declarationKey: string; affirmed: boolean }) => void
}) {
  const t = useTranslations('apply')
  const affirmed = item.record?.affirmed ?? false

  return (
    <DeclarationBody item={item}>
      {affirmed ? (
        <Status tone="confirmed">{t('declarationAffirmed')}</Status>
      ) : (
        <Button
          type="button"
          size="touch"
          variant="secondary"
          busy={busy}
          onClick={() => onRecord({ declarationKey: item.key, affirmed: true })}
        >
          {t('declarationAffirm')}
        </Button>
      )}
    </DeclarationBody>
  )
}

function QualifiedDeclaration({
  item,
  busy,
  onRecord,
}: {
  item: DeclarationView
  busy: boolean
  onRecord: (input: { declarationKey: string; affirmed: boolean; qualification?: string }) => void
}) {
  const t = useTranslations('apply')
  const [mode, setMode] = React.useState<'none' | 'not-employee' | 'employee'>(
    item.record === null ? 'none' : item.record.affirmed ? 'not-employee' : 'employee',
  )
  const [employer, setEmployer] = React.useState(item.record?.qualification ?? '')
  const answered = item.record !== null && (item.record.affirmed || Boolean(item.record.qualification))

  return (
    <DeclarationBody item={item}>
      <fieldset className="min-w-0 border-0 p-0">
        <legend className="mb-2 text-sm font-medium text-ink-muted">{t('decl10Choice')}</legend>

        <div className="space-y-2">
          <Choice
            name={`${item.key}-mode`}
            checked={mode === 'not-employee'}
            label={t('decl10NotEmployee')}
            onSelect={() => {
              setMode('not-employee')
              onRecord({ declarationKey: item.key, affirmed: true })
            }}
          />
          <Choice
            name={`${item.key}-mode`}
            checked={mode === 'employee'}
            label={t('decl10IsEmployee')}
            onSelect={() => setMode('employee')}
          />
        </div>

        {mode === 'employee' ? (
          <div className="mt-3 space-y-3 border-s-2 border-brass-300 ps-3">
            <Field label={t('decl10Employer')} htmlFor={`${item.key}-employer`} required>
              <Input
                id={`${item.key}-employer`}
                value={employer}
                onChange={(event) => setEmployer(event.currentTarget.value)}
              />
            </Field>
            <Button
              type="button"
              size="touch"
              variant="secondary"
              busy={busy}
              disabled={employer.trim().length === 0}
              onClick={() =>
                onRecord({
                  declarationKey: item.key,
                  affirmed: false,
                  qualification: employer.trim(),
                })
              }
            >
              {t('declarationAffirm')}
            </Button>
          </div>
        ) : null}

        {answered ? (
          <p className="mt-2">
            <Status tone="confirmed">{t('declarationAffirmed')}</Status>
          </p>
        ) : null}
      </fieldset>
    </DeclarationBody>
  )
}

function Choice({
  name,
  checked,
  label,
  onSelect,
}: {
  name: string
  checked: boolean
  label: string
  onSelect: () => void
}) {
  return (
    <label
      className={cn(
        'flex min-h-11 cursor-pointer items-start gap-2.5 border px-3 py-2.5',
        checked ? 'border-navy-600 bg-navy-50' : 'border-rule-strong bg-paper',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border bg-paper',
          checked ? 'border-navy-600 bg-navy-600' : 'border-rule-strong',
        )}
      >
        {checked ? <Icon as={Check} size="xs" className="text-white" /> : null}
      </span>
      <span className="min-w-0 text-sm leading-relaxed text-ink">{label}</span>
    </label>
  )
}
