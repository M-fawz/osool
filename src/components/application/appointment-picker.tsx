'use client'

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { ActionForm } from '@/components/forms/action-form'
import { Field, Input } from '@/components/ui/form'
import { Panel } from '@/components/ui/panel'
import { Notice } from '@/components/ui/notice'
import { Status } from '@/components/ui/status'
import { Check, Icon, X } from '@/components/ui/icon'
import { bookAppointmentAction } from '@/app/[locale]/appointments/actions'

/**
 * Choosing a time at the counter.
 *
 * ── Why the unavailable periods are shown ────────────────────────────────
 *
 * A picker that lists only what is free leaves an applicant wondering whether
 * they are seeing everything — particularly on a Tuesday that looks empty
 * because it is full rather than because it is not offered. Full and closed
 * periods are drawn, marked, and unclickable, which answers "is there really
 * nothing on Tuesday?" without anyone having to ask.
 *
 * ── The commitment, stated before the button ─────────────────────────────
 *
 * Booking a place at a government counter takes it away from somebody else.
 * The sentence saying so sits above the button rather than in a confirmation
 * afterwards, because a commitment explained after the fact is not one anyone
 * agreed to. It is also honest about the other half: cancelling is one click
 * and frees the place, so the obligation is to *tell us*, not to attend
 * whatever happens.
 *
 * ── Times ────────────────────────────────────────────────────────────────
 *
 * Rendered in Africa/Cairo explicitly, never in the browser's zone. A broker
 * checking their booking from abroad must see the time the counter will
 * actually be open, and a picker that quietly shifts by two hours is the kind
 * of bug that makes someone miss an appointment.
 */

export interface SlotOption {
  id: string
  startsAt: string
  endsAt: string
  locationAr: string
  locationEn: string | null
  remaining: number
  capacity: number
  state: 'AVAILABLE' | 'FULL' | 'UNAVAILABLE' | 'BOOKED_BY_YOU'
}

export function AppointmentPicker({
  applicationId,
  purpose,
  slots,
  defaultAttendeeName,
}: {
  applicationId: string
  purpose: 'DOCUMENT_HANDOVER' | 'CARD_COLLECTION'
  slots: SlotOption[]
  defaultAttendeeName: string
}) {
  const t = useTranslations('appointments')
  const locale = useLocale() as 'ar' | 'en'
  const [selected, setSelected] = React.useState<string | null>(null)

  const byDay = groupByDay(slots, locale)

  if (slots.length === 0) {
    return (
      <Panel title={t('pickTitle')}>
        <Notice tone="informational" title={t('noneOpenTitle')}>
          {t('noneOpenLead')}
        </Notice>
      </Panel>
    )
  }

  return (
    <Panel title={t('pickTitle')} description={t('pickLead')}>
      <div className="space-y-5">
        {byDay.map(([day, daySlots]) => (
          <section key={day}>
            <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
              {day}
            </h3>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {daySlots.map((slot) => (
                <li key={slot.id}>
                  <SlotButton
                    slot={slot}
                    locale={locale}
                    selected={selected === slot.id}
                    onSelect={() => setSelected(slot.id)}
                    labels={{
                      full: t('stateFull'),
                      unavailable: t('stateUnavailable'),
                      yours: t('stateYours'),
                      remaining: t('placesLeft'),
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {selected ? (
        <div className="mt-6 border-t border-rule pt-5">
          <ActionForm
            action={bookAppointmentAction}
            applicationId={applicationId}
            submitLabel={t('confirmBooking')}
            showAutoSaveNote={false}
          >
            <input type="hidden" name="slotId" value={selected} />
            <input type="hidden" name="purpose" value={purpose} />

            <Field label={t('attendeeName')} htmlFor="attendee-name" required>
              <Input
                id="attendee-name"
                name="attendeeName"
                defaultValue={defaultAttendeeName}
                required
                autoComplete="name"
              />
            </Field>

            <Field
              label={t('attendeePhone')}
              htmlFor="attendee-phone"
              hint={t('attendeePhoneHint')}
            >
              <Input
                id="attendee-phone"
                name="attendeePhone"
                type="tel"
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
              />
            </Field>

            {/* The commitment, before the button. */}
            <Notice tone="caution" title={t('commitmentTitle')}>
              {t('commitmentLead')}
            </Notice>
          </ActionForm>
        </div>
      ) : (
        <p className="mt-5 border-t border-rule pt-4 text-sm text-ink-muted">
          {t('chooseFirst')}
        </p>
      )}
    </Panel>
  )
}

function SlotButton({
  slot,
  locale,
  selected,
  onSelect,
  labels,
}: {
  slot: SlotOption
  locale: 'ar' | 'en'
  selected: boolean
  onSelect: () => void
  labels: { full: string; unavailable: string; yours: string; remaining: string }
}) {
  const time = formatTime(slot.startsAt, locale)
  const disabled = slot.state !== 'AVAILABLE'

  if (slot.state === 'BOOKED_BY_YOU') {
    return (
      <span className="flex h-full flex-col items-start gap-1 rounded-xs border border-confirmed bg-confirmed-soft p-2.5 text-start">
        <span className="ltr-run text-sm font-semibold tabular-nums text-confirmed">{time}</span>
        <span className="inline-flex items-center gap-1 text-2xs font-medium text-confirmed">
          <Icon as={Check} size="xs" />
          {labels.yours}
        </span>
      </span>
    )
  }

  if (disabled) {
    return (
      <span
        className="flex h-full flex-col items-start gap-1 rounded-xs border border-rule bg-paper-sunk p-2.5 text-start opacity-70"
        aria-disabled="true"
      >
        <span className="ltr-run text-sm font-medium tabular-nums text-ink-faint line-through">
          {time}
        </span>
        <span className="inline-flex items-center gap-1 text-2xs text-ink-faint">
          <Icon as={X} size="xs" />
          {slot.state === 'FULL' ? labels.full : labels.unavailable}
        </span>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex h-full w-full flex-col items-start gap-1 rounded-xs border p-2.5 text-start transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600',
        selected
          ? 'border-navy-600 bg-navy-600 text-paper'
          : 'border-rule bg-paper hover:border-navy-300 hover:bg-navy-50',
      )}
    >
      <span
        className={cn(
          'ltr-run text-sm font-semibold tabular-nums',
          selected ? 'text-paper' : 'text-navy-700',
        )}
      >
        {time}
      </span>
      <span className={cn('text-2xs', selected ? 'text-navy-100' : 'text-ink-muted')}>
        {labels.remaining}: <span className="tabular-nums">{slot.remaining}</span>
      </span>
    </button>
  )
}

/** Cairo, always. See the note at the top of this file. */
function formatTime(iso: string, locale: 'ar' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'en-GB' : 'en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

function groupByDay(slots: SlotOption[], locale: 'ar' | 'en'): Array<[string, SlotOption[]]> {
  const formatter = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    timeZone: 'Africa/Cairo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    // Latin digits inside the Arabic label: reference numbers and dates stay
    // LTR in this product, per CLAUDE.md rule 7.
    numberingSystem: 'latn',
  })

  const groups = new Map<string, SlotOption[]>()
  for (const slot of slots) {
    const day = formatter.format(new Date(slot.startsAt))
    const bucket = groups.get(day)
    if (bucket) bucket.push(slot)
    else groups.set(day, [slot])
  }

  return [...groups.entries()]
}

/** The booking an applicant already holds, with the two ways out of it. */
export function CurrentAppointment({
  appointment,
  children,
}: {
  appointment: {
    startsAt: string
    locationAr: string
    locationEn: string | null
    attendeeName: string
    purpose: 'DOCUMENT_HANDOVER' | 'CARD_COLLECTION'
  }
  /** The cancel form, rendered by the server component that owns the action. */
  children?: React.ReactNode
}) {
  const t = useTranslations('appointments')
  const locale = useLocale() as 'ar' | 'en'

  const when = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    timeZone: 'Africa/Cairo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    numberingSystem: 'latn',
  }).format(new Date(appointment.startsAt))

  return (
    <Panel
      title={t('bookedTitle')}
      description={t('bookedLead')}
      actions={<Status tone="confirmed">{t('stateBooked')}</Status>}
    >
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
            {t('when')}
          </dt>
          <dd className="mt-0.5 text-base font-semibold text-navy-700">{when}</dd>
        </div>
        <div>
          <dt className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
            {t('where')}
          </dt>
          <dd className="mt-0.5 text-base">
            <bdi>{locale === 'ar' ? appointment.locationAr : (appointment.locationEn ?? appointment.locationAr)}</bdi>
          </dd>
        </div>
        <div>
          <dt className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
            {t('attending')}
          </dt>
          <dd className="mt-0.5 text-base">
            <bdi>{appointment.attendeeName}</bdi>
          </dd>
        </div>
        <div>
          <dt className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
            {t('bringWhat')}
          </dt>
          <dd className="mt-0.5 text-sm text-ink-muted">{t('bringWhatLead')}</dd>
        </div>
      </dl>

      {children ? <div className="mt-5 border-t border-rule pt-4">{children}</div> : null}
    </Panel>
  )
}
