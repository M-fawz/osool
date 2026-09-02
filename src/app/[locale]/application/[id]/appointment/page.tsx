import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/auth/guard'
import { AccessRefused } from '@/components/layout/access-refused'
import { PortalShell } from '@/components/layout/portal-shell'
import { BROKER_ROLES } from '@/lib/auth/roles'
import type { Locale } from '@/i18n/routing'
import {
  appointmentHistory,
  liveAppointment,
  purposeLabels,
  slotsFor,
} from '@/lib/appointments'
import { PageHeader, Panel } from '@/components/ui/panel'
import { Notice } from '@/components/ui/notice'
import { Status } from '@/components/ui/status'
import { Stamp } from '@/components/ui/bidi'
import {
  AppointmentPicker,
  CurrentAppointment,
  type SlotOption,
} from '@/components/application/appointment-picker'
import { CancelAppointmentForm } from '@/components/application/cancel-appointment'

/**
 * The applicant's appointment screen.
 *
 * Which attendance is due is decided from the state of the file rather than
 * offered as a choice: an applicant at SUBMITTED is coming to hand papers over,
 * one at AWAITING_PAYMENT is coming to collect a card, and asking them to pick
 * between two things they have no way to distinguish would be a question the
 * system already knows the answer to.
 *
 * Where neither is due, the screen says so plainly and says what has to happen
 * first — rather than showing an empty calendar, which reads as a fault.
 */
export default async function AppointmentPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)

  const gate = await guard(BROKER_ROLES, { caseData: true })
  if (!gate.ok) return <AccessRefused result={gate} locale={locale as Locale} />

  const session = gate.session
  const loc = locale as Locale
  const t = await getTranslations('appointments')

  const application = await db.application.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      brokerEntityId: true,
      temporaryNumber: true,
      entityData: { select: { tradeNameAr: true } },
      brokerEntity: { select: { tradeNameAr: true } },
    },
  })

  // Ownership before existence: probing ids must not distinguish a stranger's
  // application from a missing one.
  if (
    !application ||
    !session.brokerEntityId ||
    application.brokerEntityId !== session.brokerEntityId
  ) {
    notFound()
  }

  const firmName = application.entityData?.tradeNameAr ?? application.brokerEntity.tradeNameAr

  const purpose = purposeFor(application.status)
  const history = await appointmentHistory(id)

  if (!purpose) {
    return (
      <PortalShell
        locale={loc}
        session={session}
        firmName={firmName}
        backHref={`/application/${id}/review`}
        backLabel={t('backToApplication')}
      >
        <PageHeader title={t('title')} lead={t('lead')} />
        <Notice tone="informational" title={t('notDueTitle')}>
          {t('notDueLead')}
        </Notice>
        {history.length > 0 ? <History history={history} locale={loc} /> : null}
      </PortalShell>
    )
  }

  const [live, slots] = await Promise.all([
    liveAppointment(id, purpose),
    slotsFor({ purpose, applicationId: id }),
  ])

  const options: SlotOption[] = slots.map((slot) => ({
    id: slot.id,
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
    locationAr: slot.locationAr,
    locationEn: slot.locationEn,
    remaining: slot.remaining,
    capacity: slot.capacity,
    state: slot.state,
  }))

  return (
    <PortalShell
      locale={loc}
      session={session}
      firmName={firmName}
      backHref={`/application/${id}/review`}
      backLabel={t('backToApplication')}
    >
      <PageHeader
        title={t('title')}
        lead={loc === 'ar' ? purposeLabels[purpose].ar : purposeLabels[purpose].en}
        meta={
          application.temporaryNumber ? (
            <Status tone="neutral">{application.temporaryNumber}</Status>
          ) : null
        }
      />

      <div className="space-y-6">
        {live ? (
          <CurrentAppointment
            appointment={{
              startsAt: live.slot.startsAt.toISOString(),
              locationAr: live.slot.locationAr,
              locationEn: live.slot.locationEn,
              attendeeName: live.attendeeName,
              purpose,
            }}
          >
            <CancelAppointmentForm appointmentId={live.id} applicationId={id} />
          </CurrentAppointment>
        ) : (
          <AppointmentPicker
            applicationId={id}
            purpose={purpose}
            slots={options}
            defaultAttendeeName={session.nameAr ?? session.name}
          />
        )}

        {history.length > 0 ? <History history={history} locale={loc} /> : null}
      </div>
    </PortalShell>
  )
}

/** Which attendance the file is at, or none. */
function purposeFor(
  status: string,
): 'DOCUMENT_HANDOVER' | 'CARD_COLLECTION' | null {
  if (['SUBMITTED', 'UNDER_INTAKE', 'AWAITING_COMPLETION', 'UNDER_EXAMINATION'].includes(status)) {
    return 'DOCUMENT_HANDOVER'
  }
  if (['APPROVED', 'AWAITING_PAYMENT', 'CARD_ISSUED'].includes(status)) {
    return 'CARD_COLLECTION'
  }
  return null
}

/**
 * Every appointment this file has ever had.
 *
 * Cancelled and missed ones included, deliberately. An applicant seeing their
 * own history is the least surprising place for it to appear, and hiding a
 * no-show from the person it belongs to while the Authority can see it would be
 * a record kept about somebody rather than with them.
 */
async function History({
  history,
  locale,
}: {
  history: Awaited<ReturnType<typeof appointmentHistory>>
  locale: Locale
}) {
  const t = await getTranslations('appointments')

  const tone = {
    BOOKED: 'informational',
    ATTENDED: 'confirmed',
    NO_SHOW: 'caution',
    CANCELLED: 'neutral',
    RESCHEDULED: 'neutral',
  } as const

  return (
    <Panel title={t('historyTitle')} description={t('historyLead')}>
      <ul className="divide-y divide-rule">
        {history.map((appointment) => (
          <li key={appointment.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
            <Stamp
              value={appointment.slot.startsAt}
              withTime
              className="text-sm tabular-nums text-ink"
            />
            <bdi className="text-sm text-ink-muted">
              {locale === 'ar'
                ? purposeLabels[appointment.purpose].ar
                : purposeLabels[appointment.purpose].en}
            </bdi>
            <Status tone={tone[appointment.status]} size="sm">
              {t(`state${appointment.status}` as 'stateBOOKED')}
            </Status>
            {appointment.cancelledReason ? (
              <span className="w-full text-xs text-ink-faint">
                <bdi>{appointment.cancelledReason}</bdi>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
