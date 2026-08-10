import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/cn'
import { Check, Icon } from '@/components/ui/icon'
import type { ApplicationStep } from '@/lib/applications/steps'
import type { StepState } from '@/lib/applications/completeness'

/**
 * Where you are, how many are left, and what is still missing.
 *
 * "Show progress honestly" is the requirement, and honesty here has a precise
 * meaning: the count is of the steps *this* application has, so an agent sees
 * eight and a sole trader sees seven, and a step is only marked complete when
 * the server agrees it is complete. A progress bar that fills up because pages
 * were visited is the most common lie a multi-step form tells.
 *
 * Every step is a link, always. A form that will not let you go back to step 3
 * from step 5 is a form people abandon at step 4 — and nothing here can be got
 * irreversibly wrong, so there is nothing to protect them from.
 *
 * Two shapes, one component. Narrow screens get the sentence and a bar, because
 * eight labelled dots at 390px are eight illegible dots. Wide screens get the
 * list, because there is room for it and it is a better map.
 */
export async function StepProgress({
  applicationId,
  current,
  steps,
  stepLabels,
}: {
  applicationId: string
  current: ApplicationStep
  steps: StepState[]
  /** Translated short label per step. */
  stepLabels: Record<ApplicationStep, string>
}) {
  const t = await getTranslations('apply')
  const index = steps.findIndex((s) => s.step === current)
  const position = index >= 0 ? index + 1 : 1

  return (
    <nav aria-label={t('stepsHeading')} className="mb-6">
      <p className="text-sm font-medium text-ink-muted">
        {/* Latin numerals, direction-isolated, so "3 / 8" cannot reorder
            inside the Arabic sentence around it. */}
        {t('stepOf', { current: position, total: steps.length })}
      </p>

      {/* The bar. Not a decoration — it is the only progress mark that survives
          a 320px screen, so it carries the same value the list does. */}
      <div
        className="mt-2 flex h-1.5 gap-1"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={position}
        aria-valuetext={t('stepOf', { current: position, total: steps.length })}
      >
        {steps.map((state) => (
          <span
            key={state.step}
            className={cn(
              'flex-1',
              state.step === current
                ? 'bg-brass-500'
                : state.complete
                  ? 'bg-navy-600'
                  : state.started
                    ? 'bg-navy-200'
                    : 'bg-rule',
            )}
          />
        ))}
      </div>

      <ol className="mt-3 hidden flex-wrap gap-x-1 gap-y-1 sm:flex">
        {steps.map((state) => {
          const isCurrent = state.step === current
          return (
            <li key={state.step}>
              <Link
                href={`/application/${applicationId}/${state.step}`}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-xs px-2 text-xs',
                  isCurrent
                    ? 'bg-navy-50 font-semibold text-navy-700'
                    : 'text-ink-muted hover:bg-paper hover:text-navy-600',
                )}
              >
                {state.complete ? (
                  <Icon as={Check} size="xs" className="text-confirmed" />
                ) : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'inline-block h-3.5 w-3.5 shrink-0 rounded-xs border',
                      state.started ? 'border-navy-300 bg-navy-100' : 'border-rule-strong',
                    )}
                  />
                )}
                <span>{stepLabels[state.step]}</span>
                {/* The count is the information. A step with three things
                    outstanding and a step with one look identical otherwise. */}
                {state.gapCount > 0 ? (
                  <span className="ltr-run text-2xs text-ink-faint">({state.gapCount})</span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
