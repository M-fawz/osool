import { getTranslations } from 'next-intl/server'
import { QueuePage } from '@/components/gov/queue-page'

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'gov' })

  return (
    <QueuePage
      locale={locale}
      roles={['DATA_MANAGER']}
      title={t('recordsTitle')}
      lead={t('recordsLead')}
      hrefFor={(row) => `/applications/${row.id}`}
    />
  )
}
