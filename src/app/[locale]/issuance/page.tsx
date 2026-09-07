import { getTranslations } from 'next-intl/server'
import { QueuePage } from '@/components/gov/queue-page'

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  const query = await searchParams
  const t = await getTranslations({ locale, namespace: 'gov' })

  return (
    <QueuePage
      locale={locale}
      basePath="/issuance"
      searchParams={query}
      roles={['CARD_ISSUER']}
      title={t('issuanceTitle')}
      lead={t('issuanceLead')}
      hrefFor={(row) => `/issuance/${row.id}`}
    />
  )
}
