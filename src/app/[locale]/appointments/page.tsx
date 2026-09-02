import { getTranslations, setRequestLocale } from 'next-intl/server'
import { guard } from '@/lib/auth/guard'
import { AccessRefused } from '@/components/layout/access-refused'
import { Shell } from '@/components/layout/shell'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { dayPeriods, daySchedule, purposeLabels } from '@/lib/appointments'
import {
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  Status,
  Table,
  TableEmptyRow,
  Td,
  Th,
  Toolbar,
} from '@/components/ui/primitives'
import { ClipboardList } from '@/components/ui/icon'
import { AttendanceControls } from '@/components/gov/attendance-controls'
import { OpenSlotsForm } from '@/components/gov/open-slots-form'

/**
 * The counter's day.
 *
 * One screen, two jobs, and they belong together because the same officer does
 * both: seeing who is expected today, and opening the periods for next week.
 * Splitting them would mean a clerk who notices the diary is empty has to
 * navigate somewhere else to fix it.
 *
 * The date is a URL parameter rather than component state, so a clerk can send
 * a colleague "the twelfth looks overbooked" as a link, and so the browser's
 * back button steps through days.
 */
export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { locale } = await params
  const { date } = await searchParams
  setRequestLocale(locale)

  const gate = await guard(['REGISTRY_CLERK', 'CARD_ISSUER', 'DATA_MANAGER', 'AUDITOR'], {
    caseData: true,
  })
  if (!gate.ok) return <AccessRefused result={gate} locale={locale as Locale} />

  const session = gate.session
  const loc = locale as Locale
  const t = await getTranslations('appointments')

  const on = parseDay(date)
  const [schedule, periods] = await Promise.all([daySchedule({ on }), dayPeriods({ on })])

  const dayLabel = new Intl.DateTimeFormat(loc === 'ar' ? 'ar-EG' : 'en-GB', {
    timeZone: 'Africa/Cairo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    numberingSystem: 'latn',
  }).format(on)

  const canRecord = session.role === 'REGISTRY_CLERK' || session.role === 'CARD_ISSUER'

  return (
    <Shell locale={loc} session={session}>
      <PageHeader
        title={t('scheduleTitle')}
        lead={t('scheduleLead')}
        actions={
          <nav className="flex items-center gap-1" aria-label={t('scheduleTitle')}>
            <DayLink date={shiftDays(on, -1)} label={t('previousDay')} />
            <DayLink date={new Date()} label={t('today')} emphasis />
            <DayLink date={shiftDays(on, 1)} label={t('nextDay')} />
          </nav>
        }
        meta={<Status tone="neutral">{t('showingDay', { date: dayLabel })}</Status>}
      />

      <div className="space-y-6">
        <Panel flush>
          <Toolbar>
            <p className="text-xs text-ink-muted">
              {t('expectedCount', { count: schedule.length })}
            </p>
          </Toolbar>

          <Table caption={t('scheduleTitle')} layout="fixed" minWidth="56rem">
            <thead>
              <tr>
                <Th className="w-20" numeric>
                  {t('colTime')}
                </Th>
                <Th className="w-auto">{t('colApplicant')}</Th>
                <Th className="w-44">{t('colPurpose')}</Th>
                <Th className="w-40">{t('colAttendee')}</Th>
                <Th className="w-28">{t('colStatus')}</Th>
                {canRecord ? <Th className="w-52">{t('colAttendance')}</Th> : null}
              </tr>
            </thead>
            <tbody>
              {schedule.length === 0 ? (
                <TableEmptyRow colSpan={canRecord ? 6 : 5}>
                  <EmptyState
                    icon={ClipboardList}
                    title={t('scheduleEmpty')}
                    description={t('scheduleEmptyLead')}
                    size="sm"
                  />
                </TableEmptyRow>
              ) : (
                schedule.map((appointment) => (
                  <tr key={appointment.id}>
                    <Td numeric className="font-medium">
                      <span className="ltr-run tabular-nums">
                        {formatTime(appointment.slot.startsAt)}
                      </span>
                    </Td>
                    <Td>
                      <Link
                        href={`/applications/${appointment.application.id}`}
                        className="font-medium text-navy-600 underline-offset-2 hover:underline"
                      >
                        <bdi>
                          {appointment.application.entityData?.tradeNameAr ??
                            appointment.application.brokerEntity.tradeNameAr}
                        </bdi>
                      </Link>
                      {appointment.application.temporaryNumber ? (
                        <span className="ltr-run mt-0.5 block text-2xs text-ink-faint">
                          {appointment.application.temporaryNumber}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="text-xs">
                      <bdi>
                        {loc === 'ar'
                          ? purposeLabels[appointment.purpose].ar
                          : purposeLabels[appointment.purpose].en}
                      </bdi>
                    </Td>
                    <Td>
                      <bdi className="text-sm">{appointment.attendeeName}</bdi>
                      {appointment.attendeePhone ? (
                        <span className="ltr-run mt-0.5 block text-2xs text-ink-faint">
                          {appointment.attendeePhone}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <Status
                        tone={
                          appointment.status === 'ATTENDED'
                            ? 'confirmed'
                            : appointment.status === 'NO_SHOW'
                              ? 'caution'
                              : 'informational'
                        }
                        size="sm"
                      >
                        {t(`state${appointment.status}` as 'stateBOOKED')}
                      </Status>
                    </Td>
                    {canRecord ? (
                      <Td>
                        {appointment.status === 'BOOKED' ? (
                          <AttendanceControls appointmentId={appointment.id} />
                        ) : (
                          <span className="text-2xs text-ink-faint">—</span>
                        )}
                      </Td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Panel>

        {canRecord ? (
          <Notice tone="informational" title={t('colAttendance')}>
            {t('attendanceNote')}
          </Notice>
        ) : null}

        {/*
          * What is on offer, as distinct from who is coming.
          *
          * Opening a day's periods used to produce no visible result until a
          * broker happened to book into one: the diary lists appointments, and
          * a freshly opened day has none. A clerk had no way to tell a
          * successful action from a failed one except by running it again.
          */}
        <Panel flush title={t('periodsTitle')} description={t('periodsLead')}>
          <Table caption={t('periodsTitle')} layout="fixed" minWidth="44rem">
            <thead>
              <tr>
                <Th className="w-24" numeric>
                  {t('colTime')}
                </Th>
                <Th className="w-40">{t('colPurpose')}</Th>
                <Th className="w-auto">{t('colLocation')}</Th>
                <Th className="w-28" numeric>
                  {t('colPlaces')}
                </Th>
                <Th className="w-28">{t('colPeriodState')}</Th>
              </tr>
            </thead>
            <tbody>
              {periods.length === 0 ? (
                <TableEmptyRow colSpan={5}>
                  <EmptyState
                    icon={ClipboardList}
                    title={t('periodsEmptyTitle')}
                    description={t('periodsEmptyLead')}
                    size="sm"
                  />
                </TableEmptyRow>
              ) : (
                periods.map((period) => {
                  const free = period.capacity - period.bookedCount
                  return (
                    <tr key={period.id}>
                      <Td numeric className="text-xs font-medium">
                        <span className="ltr-run tabular-nums">{formatTime(period.startsAt)}</span>
                      </Td>
                      <Td className="text-xs">
                        <bdi>{purposeLabels[period.purpose][loc]}</bdi>
                      </Td>
                      <Td className="text-xs">
                        <bdi>{(loc === 'ar' ? period.locationAr : period.locationEn) || period.locationAr}</bdi>
                      </Td>
                      <Td numeric className="text-xs">
                        {/* Taken of total, not "free": the clerk is reading
                            occupancy, and 2/3 says more at a glance than 1. */}
                        <span className="tabular-nums">
                          {period.bookedCount}/{period.capacity}
                        </span>
                      </Td>
                      <Td>
                        <Status tone={period.closedAt ? 'neutral' : free > 0 ? 'confirmed' : 'caution'}>
                          {period.closedAt
                            ? t('periodClosed')
                            : free > 0
                              ? t('periodOpen')
                              : t('periodFull')}
                        </Status>
                      </Td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </Table>
        </Panel>

        {session.role !== 'AUDITOR' ? <OpenSlotsForm /> : null}
      </div>
    </Shell>
  )
}

function DayLink({
  date,
  label,
  emphasis,
}: {
  date: Date
  label: string
  emphasis?: boolean
}) {
  const iso = date.toISOString().slice(0, 10)
  return (
    <Link
      href={`/appointments?date=${iso}`}
      className={
        emphasis
          ? 'inline-flex h-9 items-center rounded-xs border border-navy-600 bg-navy-600 px-3 text-sm font-medium text-paper hover:bg-navy-700'
          : 'inline-flex h-9 items-center rounded-xs border border-rule bg-paper px-3 text-sm text-ink hover:border-rule-strong hover:bg-navy-50'
      }
    >
      {label}
    </Link>
  )
}

/** A `YYYY-MM-DD` from the URL, or today. Anything unparseable is today. */
function parseDay(value: string | undefined): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  return today
}

function shiftDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000)
}

function formatTime(value: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value)
}
