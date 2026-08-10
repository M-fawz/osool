'use client'

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { BlockedAction } from '@/components/ui/notice'
import type { RuleViolation } from '@/lib/rules/violation'

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
 * Three jobs, and each one is here so that no step has to solve it again:
 *
 *   · run the Server Action through `useActionState`, so a step keeps working
 *     with JavaScript disabled and the button reports its own busy state;
 *   · turn the action's field-error *keys* into sentences in the reader's
 *     language, because the Zod schemas deliberately carry keys and not prose
 *     (see src/lib/validation/application.ts);
 *   · render a refusal as the four-part notice rather than as a red line,
 *     because a refusal from the rules engine is a legal finding and must not
 *     look like a typo.
 *
 * Navigation happens on success, in the client, using the locale-aware router —
 * so the Arabic form goes to the Arabic next step without the action needing to
 * know which language the applicant is reading.
 */

interface ActionFormContext {
  errors: Record<string, string>
  pending: boolean
}

const Context = React.createContext<ActionFormContext>({ errors: {}, pending: false })

/**
 * Resolve a validation *key* into a sentence.
 *
 * The Zod schemas emit keys rather than prose so the Arabic lives in the
 * message catalogue with the rest of the Arabic. The cast is needed because the
 * key is only known at runtime; the `has` check is what makes it safe — a key
 * the catalogue does not carry falls back to the generic sentence rather than
 * printing `needsArabic` at the applicant.
 */
function useErrorText(): (key: string | undefined) => string | undefined {
  const t = useTranslations('errors')
  return React.useCallback(
    (key) => {
      if (!key) return undefined
      const translate = t as unknown as (k: string) => string
      return t.has(key) ? translate(key) : translate('required')
    },
    [t],
  )
}

/** The translated message for a field, or undefined. */
export function useFieldError(name: string): string | undefined {
  const { errors } = React.useContext(Context)
  return useErrorText()(errors[name])
}

export function useActionPending(): boolean {
  return React.useContext(Context).pending
}

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
}) {
  const t = useTranslations('apply')
  const tBlocked = useTranslations('blocked')
  const errorText = useErrorText()
  const locale = useLocale() as 'ar' | 'en'
  const router = useRouter()
  const [state, formAction, pending] = React.useActionState(action, null)
  const [exitAfterSave, setExitAfterSave] = React.useState(false)
  const noticeRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!state) return

    if (state.ok) {
      const destination = exitAfterSave && onSavedGoTo ? onSavedGoTo : state.next
      if (destination) router.push(destination)
      return
    }

    // A refusal that appears below the fold is a refusal the applicant does not
    // know about; they press the button again and conclude the form is broken.
    noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [state, exitAfterSave, onSavedGoTo, router])

  const errors = state && !state.ok && state.kind === 'validation' ? state.errors : {}
  const violation = state && !state.ok && state.kind === 'refused' ? state.violation : null

  return (
    <Context.Provider value={{ errors, pending }}>
      <form action={formAction} className={cn('space-y-6', className)} noValidate>
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

          {/* A validation failure with no field to attach to — the schema's
              cross-field checks land here rather than vanishing. */}
          {errors._ ? (
            <p role="alert" className="border border-blocking/30 bg-blocking-soft px-3 py-2 text-sm text-blocking">
              {errorText(errors._)}
            </p>
          ) : null}
        </div>

        {children}

        <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-5">
          <Button type="submit" size="touch" busy={pending} onClick={() => setExitAfterSave(false)}>
            {submitLabel}
          </Button>

          {onSavedGoTo ? (
            <Button
              type="submit"
              size="touch"
              variant="secondary"
              disabled={pending}
              onClick={() => setExitAfterSave(true)}
            >
              {t('saveAndExit')}
            </Button>
          ) : null}

          {secondary}
        </div>

        {showAutoSaveNote ? <p className="text-xs text-ink-faint">{t('autoSaved')}</p> : null}
      </form>
    </Context.Provider>
  )
}
