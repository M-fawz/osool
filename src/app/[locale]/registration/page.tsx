import { getTranslations, setRequestLocale } from 'next-intl/server'
import { guard } from '@/lib/auth/guard'
import { AccessRefused } from '@/components/layout/access-refused'
import { PortalShell } from '@/components/layout/portal-shell'
import { BROKER_ROLES } from '@/lib/auth/roles'
import { db } from '@/lib/db'
import { ruleSet } from '@/lib/rules'
import { governorateLabels } from '@/lib/reference/governorates'
import type { Locale } from '@/i18n/routing'
import { Link } from '@/i18n/navigation'
import { EmptyState, KeyValue, KeyValueItem, PageHeader, Panel } from '@/components/ui/panel'
import { Notice } from '@/components/ui/notice'
import { Status } from '@/components/ui/status'
import { Ltr, Money, Stamp } from '@/components/ui/bidi'
import { Button } from '@/components/ui/button'
import { ShieldCheck } from '@/components/ui/icon'

/**
 * The broker's own registration.
 *
 * What a registrant needs from this screen is small and specific: the number
 * they must print on everything (REQ-REG-061), when it expires, and the card
 * itself. So that is what it holds, in that order, and nothing else.
 *
 * The renewal date is stated as a date rather than as "expires in N months",
 * because REQ-REG-060 makes renewal fall due ninety days *before* expiry, and a
 * countdown to the wrong event is worse than no countdown. The ninety comes
 * from OBLIGATION_PERIODS, not from this file.
 */
export default async function RegistrationPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const gate = await guard(BROKER_ROLES, { caseData: true })
  if (!gate.ok) return <AccessRefused result={gate} locale={locale as Locale} />

  const session = gate.session
  const loc = locale as Locale
  const [t, tApply] = await Promise.all([getTranslations('portal'), getTranslations('apply')])

  const entity = session.brokerEntityId
    ? await db.brokerEntity.findUnique({
        where: { id: session.brokerEntityId },
        select: {
          tradeNameAr: true,
          tradeNameEn: true,
          headOfficeAddress: true,
          governorate: true,
        },
      })
    : null

  const registration = session.brokerEntityId
    ? await db.registration.findFirst({
        where: { brokerEntityId: session.brokerEntityId, archivedAt: null },
        orderBy: { validFrom: 'desc' },
        include: { cardIssuance: { select: { documentId: true, deliveredAt: true } } },
      })
    : null

  const firmName = entity
    ? loc === 'ar'
      ? entity.tradeNameAr
      : (entity.tradeNameEn ?? entity.tradeNameAr)
    : null

  if (!registration) {
    return (
      <PortalShell locale={loc} session={session} firmName={firmName}>
        <PageHeader title={t('registrationTitle')} lead={t('registrationLead')} />
        <Panel flush>
          {/* Three different situations look identical if they are all drawn as
              "empty". This one is "not yet", and it says what produces the card
              rather than leaving the applicant to guess. */}
          <EmptyState
            icon={ShieldCheck}
            title={t('noRegistrationTitle')}
            description={t('noRegistrationLead')}
            action={
              <Button size="touch" asChild>
                <Link href="/application">{t('title')}</Link>
              </Button>
            }
          />
        </Panel>
      </PortalShell>
    )
  }

  // As of the registration's own start date, not today: the category labels a
  // registrant sees are the ones their registration was granted under.
  const asOf = registration.validFrom
  const [categories, types, obligations] = await Promise.all([
    ruleSet<{ labelAr: string; labelEn: string }>('BROKER_CATEGORY', { asOf }),
    ruleSet<{ labelAr: string; labelEn: string }>('BROKER_TYPE', { asOf }),
    ruleSet<{ daysBeforeExpiry?: number }>('OBLIGATION_PERIODS', { asOf }),
  ])

  const label = loc === 'ar' ? ('labelAr' as const) : ('labelEn' as const)
  const renewalDays = obligations.byKey.get('RENEWAL_WINDOW')?.payload.daysBeforeExpiry ?? 90
  const renewalDue = new Date(registration.validTo.getTime() - renewalDays * 86_400_000)

  return (
    <PortalShell locale={loc} session={session} firmName={firmName}>
      <PageHeader title={t('registrationTitle')} lead={t('registrationLead')} />

      <Panel>
        <p className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
          {t('registrationNumber')}
        </p>
        {/* The largest thing on the screen, because REQ-REG-061 requires the
            registrant to put it on everything they issue. */}
        <p className="mt-1 text-2xl font-bold text-navy-700">
          <Ltr>{registration.registrationNumber}</Ltr>
        </p>

        <div className="mt-4 border-t border-rule pt-4">
          <KeyValue columns={2}>
            <KeyValueItem label={t('registrationValidity')}>
              <Stamp value={registration.validFrom} /> — <Stamp value={registration.validTo} />
            </KeyValueItem>
            <KeyValueItem label={tApply('categoryHeading')}>
              {categories.byKey.get(registration.category)?.payload[label] ?? registration.category}
            </KeyValueItem>
            <KeyValueItem label={tApply('typesHeading')}>
              <span className="flex flex-wrap gap-1.5">
                {registration.types.map((type) => (
                  <Status key={type} tone="informational" size="sm">
                    {types.byKey.get(type)?.payload[label] ?? type}
                  </Status>
                ))}
              </span>
            </KeyValueItem>
            <KeyValueItem label={tApply('paidUpCapital')}>
              <Money amount={Number(registration.paidUpCapital)} locale={loc} />
            </KeyValueItem>
            {entity?.governorate ? (
              <KeyValueItem label={tApply('governorate')}>
                {governorateLabels[entity.governorate][loc]}
              </KeyValueItem>
            ) : null}
          </KeyValue>
        </div>

        {registration.cardIssuance?.documentId ? (
          <div className="mt-4 border-t border-rule pt-4">
            <Button size="touch" asChild>
              <a
                href={`/api/documents/${registration.cardIssuance.documentId}`}
                target="_blank"
                rel="noreferrer"
              >
                {t('downloadCard')}
              </a>
            </Button>
          </div>
        ) : null}
      </Panel>

      {/* REQ-REG-060 and REQ-REG-061, stated as obligations rather than as
          facts about the record — they are things the registrant must do. */}
      <Notice tone="informational" className="mt-6" title={t('obligationsHeading')}>
        <ul className="space-y-1.5">
          <li>{t('obligationNumber')}</li>
          <li>
            {t('obligationRenewalBefore')} <Stamp value={renewalDue} />
            {t('obligationRenewalAfter', { days: renewalDays })}
          </li>
          <li>{t('obligationNotify')}</li>
        </ul>
      </Notice>
    </PortalShell>
  )
}
