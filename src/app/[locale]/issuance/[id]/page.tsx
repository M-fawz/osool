import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { guard } from '@/lib/auth/guard'
import { AccessRefused } from '@/components/layout/access-refused'
import { Shell } from '@/components/layout/shell'
import { db } from '@/lib/db'
import { auditedRead } from '@/lib/auth/session'
import { loadApplicationDetail } from '@/lib/applications/completeness'
import { ruleSet } from '@/lib/rules'
import { paymentMethodLabels } from '@/lib/reference/capacities'
import type { Locale } from '@/i18n/routing'
import { KeyValue, KeyValueItem, Panel } from '@/components/ui/panel'
import { Notice } from '@/components/ui/notice'
import { Ltr, Money, Stamp } from '@/components/ui/bidi'
import { Button } from '@/components/ui/button'
import { CaseHeader } from '@/components/gov/case-header'
import { CaseSummary } from '@/components/gov/case-summary'
import { EventTrail } from '@/components/gov/event-trail'
import { DeliveryForm, FeesForm, IssueCardForm } from '@/components/gov/issuance-forms'

/**
 * Issuing the card starts Chromium and renders a PDF, and a Server Action runs
 * inside the function of the page that invoked it — so the ceiling that matters
 * is this page's. A serverless default of ten or fifteen seconds is not enough
 * for a cold start that has to unpack a browser first, and the failure it
 * produces is a truncated request with no error anyone can act on. Sixty is the
 * most a Vercel Hobby function allows and is ample for a warm one.
 */
export const maxDuration = 60

/**
 * Fees, the card, and delivery — REQ-REG-050 steps 4, 5, and 6.
 *
 * One screen, because it is one visit to the counter. Which of the three forms
 * appears is decided by the file's own state rather than by tabs: an official
 * arriving at this screen should see the next thing to do, not a choice of
 * three things two of which are not possible yet.
 */
export default async function IssuanceCasePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)

  const gate = await guard(['CARD_ISSUER'], { caseData: true })
  if (!gate.ok) return <AccessRefused result={gate} locale={locale as Locale} />

  const session = gate.session
  const loc = locale as Locale

  const application = await auditedRead(
    session,
    { entityType: 'Application', entityId: id, action: 'APPLICATION_VIEWED_FOR_ISSUANCE' },
    () => loadApplicationDetail(id),
  )

  if (!application) notFound()

  const t = await getTranslations('gov')
  const asOf = application.submittedAt ?? new Date()

  const [fees, feeRecord, issuance] = await Promise.all([
    ruleSet<{ labelAr: string; labelEn: string; mandatory: boolean }>('FEE_SCHEDULE', { asOf }),
    db.feeRecord.findUnique({ where: { applicationId: id }, include: { lines: true } }),
    db.cardIssuance.findUnique({
      where: { applicationId: id },
      include: { registration: true, document: { select: { id: true, sha256: true } } },
    }),
  ])

  return (
    <Shell locale={loc} session={session}>
      <CaseHeader application={application} locale={loc} backHref="/issuance" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
        <div className="min-w-0 space-y-6">
          {application.status === 'APPROVED' ? (
            <FeesForm
              applicationId={id}
              headings={fees.items.map((item) => ({
                key: item.key,
                label: item.payload[loc === 'ar' ? 'labelAr' : 'labelEn'],
                mandatory: item.payload.mandatory,
              }))}
            />
          ) : null}

          {feeRecord ? (
            <Panel title={t('feesTitle')}>
              <KeyValue columns={2}>
                <KeyValueItem label={t('receiptNumber')}>
                  <Ltr>{feeRecord.receiptNumber}</Ltr>
                </KeyValueItem>
                <KeyValueItem label={t('paymentMethod')}>
                  {paymentMethodLabels[feeRecord.paymentMethod][loc]}
                  {feeRecord.bankName ? ` — ${feeRecord.bankName}` : ''}
                  {feeRecord.bankBranch ? ` / ${feeRecord.bankBranch}` : ''}
                </KeyValueItem>
                <KeyValueItem label={t('feeTotal')}>
                  <Money amount={Number(feeRecord.totalAmount)} locale={loc} />
                </KeyValueItem>
                <KeyValueItem label={t('colSubmitted')}>
                  <Stamp value={feeRecord.recordedAt} withTime />
                </KeyValueItem>
              </KeyValue>

              <ul className="mt-4 divide-y divide-rule border-t border-rule pt-2">
                {feeRecord.lines.map((line) => (
                  <li key={line.id} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0 flex-1 text-sm text-ink-muted">
                      {fees.byKey.get(line.feeKey)?.payload[loc === 'ar' ? 'labelAr' : 'labelEn'] ??
                        line.feeKey}
                    </span>
                    <Money amount={Number(line.amount)} locale={loc} className="text-sm" />
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {application.status === 'AWAITING_PAYMENT' ? <IssueCardForm applicationId={id} /> : null}

          {issuance ? (
            <Panel title={t('issuedCard')}>
              <KeyValue columns={2}>
                <KeyValueItem label={t('registrationNumber')}>
                  <Ltr className="text-lg font-semibold text-navy-700">
                    {issuance.registration.registrationNumber}
                  </Ltr>
                </KeyValueItem>
                <KeyValueItem label={t('validity')}>
                  <Stamp value={issuance.registration.validFrom} /> —{' '}
                  <Stamp value={issuance.registration.validTo} />
                </KeyValueItem>
                {issuance.deliverySerial ? (
                  <KeyValueItem label={t('deliverySerial')}>
                    <Ltr>{issuance.deliverySerial}</Ltr>
                  </KeyValueItem>
                ) : null}
                {issuance.deliveredToName ? (
                  <KeyValueItem label={t('deliveredToName')}>{issuance.deliveredToName}</KeyValueItem>
                ) : null}
              </KeyValue>

              {issuance.document ? (
                <div className="mt-4 border-t border-rule pt-4">
                  <Button size="default" variant="secondary" asChild>
                    <a href={`/api/documents/${issuance.document.id}`} target="_blank" rel="noreferrer">
                      {t('issuedCard')}
                    </a>
                  </Button>
                  {/* The hash is what lets the Authority prove the card in
                      somebody's hand is the card it issued. */}
                  <p className="mt-2 font-mono text-2xs text-ink-faint">
                    <Ltr>{issuance.document.sha256}</Ltr>
                  </p>
                </div>
              ) : null}
            </Panel>
          ) : null}

          {application.status === 'CARD_ISSUED' ? <DeliveryForm applicationId={id} /> : null}

          {application.status === 'ACTIVE' ? (
            <Notice tone="confirmed" title={t('deliveryTitle')}>
              {t('recordDelivery')}
            </Notice>
          ) : null}

          <CaseSummary application={application} locale={loc} />
        </div>

        <EventTrail applicationId={id} locale={loc} />
      </div>
    </Shell>
  )
}
