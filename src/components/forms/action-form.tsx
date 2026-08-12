'use client'

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
// The locale-aware pair, never next/navigation's: `usePathname` here returns
// the path *without* the locale prefix, which is exactly what a comparison
// against an action's `next` needs.
import { usePathname, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { BlockedAction } from '@/components/ui/notice'
import type { RuleViolation } from '@/lib/rules/violation'
import { ActionFormContext } from './form-state'

export { useActionPending, useFieldError } from './form-state'

/**
 * The shape every action in this product answers with.
 *
 * Declared here rather than imported from one of the `actions.ts` modules,
 * because both the broker portal and the back office render forms with this
 * component and neither should have to depend on the other's actions to do it.
 * The two result types are structurally identical to this one by design.
 */
export type ActionOutcome =
  | { ok: true; next?: string }
  | { ok: false; kind: 'validation'; errors: Record<string, string> }
  | { ok: false; kind: 'refused'; violation: RuleViolation }

/**
 * The machinery every form in this product shares.
 *
 * Five jobs, and each one is here so that no step has to solve it again:
 *
 *   · run the Server Action through `useActionState`, so a step keeps working
 *     with JavaScript disabled and the button reports its own busy state;
 *   · publish the field errors and the busy flag on a context that `Field` and
 *     `ChoiceGroup` read from *inside* the form — see ./form-state.tsx for why
 *     that indirection is not decoration;
 *   · **put back what the applicant typed when the save is refused** (below);
 *   · stay busy until the next screen is actually on the screen (below);
 *   · render a refusal as the four-part notice rather than as a red line,
 *     because a refusal from the rules engine is a legal finding and must not
 *     look like a typo.
 *
 * ── Why the values have to be restored by hand ─────────────────────────────
 *
 * React 19 resets an uncontrolled `<form action={…}>` once the action settles.
 * That is the right default for a form that succeeded and the wrong one for a
 * form that was refused: the applicant's eleven fields are wiped along with the
 * mistake, and the screen they are left looking at is identical to the one they
 * started from. Making every control in the product controlled would be the
 * other fix, and it would be a much larger change for a worse result on a
 * phone. So the submitted `FormData` is snapshotted on the way out and written
 * back over the reset controls when — and only when — the answer is a refusal.
 *
 * ── Why the button stays busy after the action returns ─────────────────────
 *
 * `useActionState`'s `pending` goes false the moment the action resolves, and
 * the navigation that follows it has not started. Measured on production: the
 * button stopped showing busy at 604 ms and the next screen appeared at
 * 1601 ms — a full second in which the applicant has pressed a button, nothing
 * has visibly happened, and the obvious thing to do is press it again. On a
 * cold serverless start that window is several seconds, and on the *first*
 * application pressing twice used to create two firms. `useTransition` around
 * the push holds the busy state until the destination has rendered.
 */

export function ActionForm({
  action,
  applicationId,
  children,
  submitLabel,
  secondary,
  className,
  /** Where "save and exit" goes. Omitted on forms that are not a wizard step. */
  onSavedGoTo,
  showAutoSaveNote = true,
  /**
   * Run after a successful action, before navigating. The contracts step uses
   * it to close its editor so the saved contract is shown as a card instead of
   * as a form that still looks unsaved.
   */
  onSuccess,
}: {
  action: (previous: ActionOutcome | null, formData: FormData) => Promise<ActionOutcome>
  applicationId: string
  children: React.ReactNode
  submitLabel: string
  /** Extra controls beside the primary button. */
  secondary?: React.ReactNode
  className?: string
  onSavedGoTo?: string
  /**
   * The "everything is saved as you go" reassurance under the buttons. On by
   * default because it is the sentence that makes a long form bearable; off for
   * the one-button forms — a confirm, a withdrawal — where it is not true and
   * would be noise.
   */
  showAutoSaveNote?: boolean
  onSuccess?: () => void
}) {
  const t = useTranslations('apply')
  const tBlocked = useTranslations('blocked')
  const locale = useLocale() as 'ar' | 'en'
  const router = useRouter()
  const pathname = usePathname()

  const [state, formAction, pending] = React.useActionState(action, null)
  const [exitAfterSave, setExitAfterSave] = React.useState(false)
  const [navigating, startNavigation] = React.useTransition()

  const formRef = React.useRef<HTMLFormElement>(null)
  const submitted = React.useRef<FormData | null>(null)
  const noticeRef = React.useRef<HTMLDivElement>(null)

  const onSuccessRef = React.useRef(onSuccess)
  onSuccessRef.current = onSuccess

  /**
   * Snapshot on the way out, so a refusal has something to put back.
   *
   * In `onSubmit` rather than by wrapping the action, and the difference is not
   * stylistic. `formAction` from `useActionState` is a serialisable reference
   * to the Server Action, and React renders the hidden `$ACTION_*` inputs from
   * it that make the form work with no JavaScript at all. Wrapping it in a
   * client closure — which is what the first attempt at this did — leaves React
   * nothing to serialise: the hidden inputs disappear and every form in the
   * product silently becomes JavaScript-only. `onSubmit` runs first, does not
   * cancel the submission, and leaves the action reference untouched.
   */
  const snapshot = React.useCallback((event: React.FormEvent<HTMLFormElement>) => {
    submitted.current = new FormData(event.currentTarget)
  }, [])

  React.useEffect(() => {
    if (!state) return

    if (state.ok) {
      submitted.current = null
      onSuccessRef.current?.()

      const destination = exitAfterSave && onSavedGoTo ? onSavedGoTo : state.next
      if (!destination) return

      // A push to the address already open is a no-op, and the step that just
      // saved would sit there looking exactly as unsaved as before. The list of
      // contracts is rendered on the server, so what this needs is a re-read.
      startNavigation(() => {
        if (samePath(destination, pathname)) router.refresh()
        else router.push(destination)
      })
      return
    }

    restore(formRef.current, submitted.current)

    // A refusal that appears below the fold is a refusal the applicant does not
    // know about; they press the button again and conclude the form is broken.
    noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [state, exitAfterSave, onSavedGoTo, pathname, router])

  const errors = state && !state.ok && state.kind === 'validation' ? state.errors : {}
  const violation = state && !state.ok && state.kind === 'refused' ? state.violation : null
  const busy = pending || navigating

  return (
    <ActionFormContext.Provider value={{ errors, pending: busy, inForm: true }}>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={snapshot}
        className={cn('space-y-6', className)}
        noValidate
      >
        <input type="hidden" name="applicationId" value={applicationId} />

        <div ref={noticeRef}>
          {violation ? (
            <BlockedAction
              what={locale === 'ar' ? violation.ar.blocked : violation.en.blocked}
              why={locale === 'ar' ? violation.ar.why : violation.en.why}
              nextStep={locale === 'ar' ? violation.ar.nextStep : violation.en.nextStep}
              whoToAsk={locale === 'ar' ? violation.ar.whoToAsk : violation.en.whoToAsk}
              legalSource={violation.legalSource}
              headings={{
                what: tBlocked('whatHeading'),
                why: tBlocked('whyHeading'),
                next: tBlocked('nextHeading'),
                who: tBlocked('whoHeading'),
              }}
            />
          ) : null}

          {/* The summary that says a refusal happened at all. Without it, a
              form whose only faulty field is below the fold answers a press of
              the Save button with silence. */}
          {Object.keys(errors).length > 0 ? <ValidationSummary errors={errors} /> : null}
        </div>

        {children}

        <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-5">
          <Button type="submit" size="touch" busy={busy} onClick={() => setExitAfterSave(false)}>
            {submitLabel}
          </Button>

          {onSavedGoTo ? (
            <Button
              type="submit"
              size="touch"
              variant="secondary"
              disabled={busy}
              onClick={() => setExitAfterSave(true)}
            >
              {t('saveAndExit')}
            </Button>
          ) : null}

          {secondary}
        </div>

        {/* The one sentence that tells the applicant what the button is doing
            while it is doing it. §6: never a spinner with no words. */}
        <p className="text-xs text-ink-faint" aria-live="polite">
          {busy ? t('saving') : showAutoSaveNote ? t('autoSaved') : null}
        </p>
      </form>
    </ActionFormContext.Provider>
  )
}

/**
 * The refusal summary.
 *
 * Every refused field named, in the order the schema reported them, each a link
 * that focuses the control that has to change. A twenty-field form refused on
 * its fourteenth field must not make the applicant hunt for the red one — and
 * on a phone the faulty field is almost always off-screen.
 *
 * The field *names* come from the form's own `<label>` elements rather than
 * from a parallel catalogue of field titles. A second catalogue would be a
 * second thing to keep in step with the first, and the first is already on the
 * screen, already translated, and already the words the applicant just read.
 */
function ValidationSummary({ errors }: { errors: Record<string, string> }) {
  const t = useTranslations('errors')
  const errorText = useErrorTextLocal()
  const named = Object.entries(errors).filter(([field]) => field !== '_')

  const [labels, setLabels] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    const found: Record<string, string> = {}
    for (const [field] of named) {
      const escaped = CSS.escape(field)

      // A `Field` names its control with `label[for]`. A `ChoiceGroup` is a
      // fieldset and names itself with a `legend` — so a radio group refused
      // for being unanswered would otherwise appear in this list as a bare
      // "This field is required." with nothing to say which field.
      const naming =
        document.querySelector<HTMLElement>(`label[for="${escaped}"]`) ??
        document
          .querySelector<HTMLElement>(`[name="${escaped}"]`)
          ?.closest('fieldset')
          ?.querySelector<HTMLElement>('legend')

      const text = naming?.textContent?.replace(/\s*\*\s*$/, '').trim()
      if (text) found[field] = text
    }
    setLabels(found)
    // The identity of `errors` is what changed; the derived list follows it.
  }, [errors]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      role="alert"
      className="border-s-2 border-blocking bg-blocking-soft px-4 py-3 text-sm text-ink"
    >
      <p className="font-semibold text-blocking">
        {named.length > 0 ? t('summaryTitle', { count: named.length }) : errorText(errors._)}
      </p>

      {named.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {named.map(([field, key]) => (
            <li key={field}>
              {labels[field] ? (
                <>
                  <a
                    href={`#${field}`}
                    className="font-medium underline underline-offset-2 hover:text-blocking"
                  >
                    {labels[field]}
                  </a>
                  {' — '}
                </>
              ) : null}
              {errorText(key)}
            </li>
          ))}
        </ul>
      ) : null}

      {named.length > 0 && errors._ ? <p className="mt-2">{errorText(errors._)}</p> : null}
    </div>
  )
}

function useErrorTextLocal() {
  const t = useTranslations('errors')
  return (key: string | undefined) => {
    if (!key) return undefined
    const translate = t as unknown as (k: string) => string
    return t.has(key) ? translate(key) : translate('required')
  }
}

/** Do two hrefs address the same screen? Locale prefix and query set aside. */
function samePath(destination: string, current: string): boolean {
  const strip = (value: string) =>
    value.split('?')[0]!.replace(/^\/(ar|en)(?=\/|$)/, '').replace(/\/$/, '')
  return strip(destination) === strip(current)
}

/**
 * Write a submitted `FormData` back over a form React has just reset.
 *
 * File inputs are skipped — a browser will not let a value be assigned to one,
 * and the upload step does not use this component. `applicationId` and React's
 * own `$ACTION_*` fields are skipped because they are already correct and
 * writing to them would be meddling with the action's own plumbing.
 */
function restore(form: HTMLFormElement | null, data: FormData | null) {
  if (!form || !data) return

  const values = new Map<string, string[]>()
  for (const [name, value] of data.entries()) {
    if (typeof value !== 'string') continue
    values.set(name, [...(values.get(name) ?? []), value])
  }

  for (const element of Array.from(form.elements)) {
    const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    const name = control.name
    if (!name || name.startsWith('$ACTION') || name === 'applicationId') continue
    if (control instanceof HTMLInputElement && control.type === 'file') continue

    const submittedValues = values.get(name)

    if (control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio')) {
      control.checked = Boolean(submittedValues?.includes(control.value))
      continue
    }

    if (submittedValues?.[0] !== undefined) control.value = submittedValues[0]
  }
}
