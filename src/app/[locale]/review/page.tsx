import { getTranslations } from 'next-intl/server'
import { QueuePage } from '@/components/gov/queue-page'

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'gov' })

  return (
    <QueuePage
      locale={locale}
      roles={['REVIEWER']}
      title={t('reviewTitle')}
      lead={t('reviewLead')}
      hrefFor={(row) => `/review/${row.id}`}
      notice={{ title: t('sodNoticeTitle'), body: t('sodNoticeLead') }}
    />
  )
}
