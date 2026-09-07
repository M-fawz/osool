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
      basePath="/intake"
      searchParams={query}
      roles={['REGISTRY_CLERK']}
      title={t('intakeTitle')}
      lead={t('intakeLead')}
      hrefFor={(row) => `/applications/${row.id}`}
    />
  )
}
