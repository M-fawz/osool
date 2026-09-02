'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/cn'
import { ActionForm } from '@/components/forms/action-form'
import { Button } from '@/components/ui/button'
import { Field, Select, Textarea } from '@/components/ui/form'
import { Status } from '@/components/ui/status'
import { disposeSignalAction, takeSignalAction } from '@/app/[locale]/supervision/actions'

/**
 * One signal, as a card.
 *
 * A table row was the obvious choice and the wrong one. A signal is not a row
 * of columns: it is a claim, a set of facts behind the claim, and a decision
 * somebody has to take about it. The facts are the part that matters most —
 * §8 requires the evidence to travel with the signal precisely "so a human can
 * check the reasoning rather than trust the score" — and evidence does not fit
 * in a column.
 *
 * ── Three things the card is careful about ───────────────────────────────
 *
 * **It never asserts.** The summary states what was observed. The card adds no
 * verdict, no score, and no colour that reads as guilt: severity is drawn as a
 * neutral rank, because HIGH means "look at this first", not "this is worse".
 *
 * **It names the basis.** A supervisor acting on a signal has to know whether
 * the threshold behind it is Decree 578 or a number the Authority chose for
 * triage. One of those is law and the other is an operational parameter, and
 * conflating them in a supervisory decision is exactly the fabrication
 * CLAUDE.md rule 3 forbids. So the card labels it.
 *
 * **Dismissal is not one click.** The reason field is open before the button
 * exists, so writing it is part of closing rather than an obstacle in front of
 * closing. §8: "Dismissal requires a written reason."
 */

export interface SignalView {
  id: string
  signalType: string
  title: string
  summary: string
  family: 'SUPERVISED_POPULATION' | 'PROCESS_INTEGRITY'
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  state: 'OPEN' | 'UNDER_REVIEW' | 'DISMISSED_WITH_REASON' | 'ESCALATED'
  detectedAt: string
  basis: 'LEGAL' | 'OPERATIONAL'
  evidence: Record<string, unknown>
  applicationId: string | null
  applicationRef: string | null
  firmName: string | null
  dispositionReason: string | null
  disposedByName: string | null
}

export function SignalCard({
  signal,
  canDispose,
  locale,
}: {
  signal: SignalView
  canDispose: boolean
  locale: 'ar' | 'en'
}) {
  const t = useTranslations('supervision')
  const [open, setOpen] = React.useState(false)

  const live = signal.state === 'OPEN' || signal.state === 'UNDER_REVIEW'

  return (
    <article
      className={cn(
        'border border-rule bg-paper',
        // A severity stripe on the leading edge, mirrored automatically by the
        // logical property. It ranks; it does not accuse.
        signal.severity === 'HIGH'
          ? 'border-s-4 border-s-blocking'
          : signal.severity === 'MEDIUM'
            ? 'border-s-4 border-s-caution'
            : 'border-s-4 border-s-rule-strong',
      )}
    >
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-navy-700">
              <bdi>{signal.title}</bdi>
            </h2>
            <p className="ltr-run mt-0.5 text-2xs text-ink-faint">{signal.signalType}</p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Status
              tone={
                signal.severity === 'HIGH'
                  ? 'blocking'
                  : signal.severity === 'MEDIUM'
                    ? 'caution'
                    : 'neutral'
              }
              size="sm"
            >
              {t(`severity${signal.severity}` as 'severityHIGH')}
            </Status>
            <Status tone="neutral" size="sm">
              {t(`family${signal.family}` as 'familyPROCESS_INTEGRITY')}
            </Status>
            <Status
              tone={
                signal.state === 'ESCALATED'
                  ? 'blocking'
                  : signal.state === 'DISMISSED_WITH_REASON'
                    ? 'confirmed'
                    : signal.state === 'UNDER_REVIEW'
                      ? 'informational'
                      : 'caution'
              }
              size="sm"
            >
              {t(`state${signal.state}` as 'stateOPEN')}
            </Status>
          </div>
        </div>

        <p className="mt-2.5 max-w-reading text-base text-ink">
          <bdi>{signal.summary}</bdi>
        </p>

        {/* Where the threshold came from. Law, or a number the Authority set. */}
        <p className="mt-2 text-xs text-ink-muted">
          <span className="font-semibold">{t('basisLabel')}:</span>{' '}
          {signal.basis === 'LEGAL' ? t('basisLegal') : t('basisOperational')}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          {signal.applicationId ? (
            <Link
              href={`/applications/${signal.applicationId}`}
              className="font-medium text-navy-600 underline-offset-2 hover:underline"
            >
              {signal.applicationRef ?? t('openCase')}
            </Link>
          ) : null}
          {signal.firmName ? (
            <span>
              <bdi>{signal.firmName}</bdi>
            </span>
          ) : null}
          <span className="ltr-run tabular-nums">
            {new Intl.DateTimeFormat('en-GB', {
              timeZone: 'Africa/Cairo',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }).format(new Date(signal.detectedAt))}
          </span>
        </div>

        {/* The facts. §8: so a human can check the reasoning rather than trust
            a score. Collapsed, because a supervisor scanning twenty cards wants
            the claim first — but one click away, not one page away. */}
        <details className="mt-3 border-t border-rule pt-3">
          <summary className="cursor-pointer text-sm font-medium text-navy-600">
            {t('evidenceTitle')}
          </summary>
          <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {Object.entries(signal.evidence)
              .filter(([key]) => key !== 'summaryAr' && key !== 'summaryEn')
              .map(([key, value]) => (
                <div key={key} className="flex flex-wrap items-baseline gap-2">
                  <dt className="ltr-run text-2xs uppercase tracking-wider text-ink-faint">{key}</dt>
                  <dd className="min-w-0 text-xs text-ink">
                    <bdi>{formatEvidence(value)}</bdi>
                  </dd>
                </div>
              ))}
          </dl>
        </details>

        {signal.dispositionReason ? (
          <div className="mt-3 border-t border-rule pt-3">
            <p className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
              {t('dispositionTitle')}
            </p>
            <p className="mt-1 text-sm text-ink">
              <bdi>{signal.dispositionReason}</bdi>
            </p>
            {signal.disposedByName ? (
              <p className="mt-0.5 text-2xs text-ink-faint">
                <bdi>{signal.disposedByName}</bdi>
              </p>
            ) : null}
          </div>
        ) : null}

        {canDispose && live ? (
          <div className="mt-4 border-t border-rule pt-4">
            {open ? (
              <ActionForm
                action={disposeSignalAction}
                applicationId={signal.applicationId ?? ''}
                submitLabel={t('recordDisposition')}
                showAutoSaveNote={false}
                secondary={
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    {t('cancel')}
                  </Button>
                }
              >
                <input type="hidden" name="signalId" value={signal.id} />

                <Field label={t('dispositionLabel')} htmlFor={`disposition-${signal.id}`} required>
                  <Select
                    id={`disposition-${signal.id}`}
                    name="disposition"
                    defaultValue="DISMISS"
                  >
                    <option value="DISMISS">{t('dispositionDismiss')}</option>
                    <option value="ESCALATE">{t('dispositionEscalate')}</option>
                  </Select>
                </Field>

                <Field
                  label={t('reasonLabel')}
                  htmlFor={`reason-${signal.id}`}
                  hint={t('reasonHint')}
                  required
                >
                  <Textarea
                    id={`reason-${signal.id}`}
                    name="reason"
                    rows={3}
                    required
                    minLength={10}
                    lang={locale}
                    dir={locale === 'ar' ? 'rtl' : 'ltr'}
                  />
                </Field>
              </ActionForm>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => setOpen(true)}>
                  {t('reviewThis')}
                </Button>
                {signal.state === 'OPEN' ? (
                  <TakeForm signalId={signal.id} label={t('takeForReview')} />
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </article>
  )
}

/** Claiming a signal, without disposing of it. */
function TakeForm({ signalId, label }: { signalId: string; label: string }) {
  const [state, formAction, pending] = React.useActionState(takeSignalAction, null)

  return (
    <form action={formAction}>
      <input type="hidden" name="signalId" value={signalId} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {label}
      </Button>
      {state && !state.ok && state.kind === 'refused' ? (
        <p className="mt-1 text-xs text-blocking">{state.violation.en.blocked}</p>
      ) : null}
    </form>
  )
}

/**
 * Evidence values, rendered readably.
 *
 * Arrays and objects arrive from a JSON column and would otherwise render as
 * `[object Object]`, which is worse than useless on a screen whose whole
 * purpose is showing somebody the facts.
 */
function formatEvidence(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}
