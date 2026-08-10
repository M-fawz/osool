import { getTranslations } from 'next-intl/server'
import { QueuePage } from '@/components/gov/queue-page'

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'gov' })

  return (
    <QueuePage
      locale={locale}
      roles={['EXAMINER']}
      title={t('examinationTitle')}
      lead={t('examinationLead')}
      hrefFor={(row) => `/examination/${row.id}`}
    />
  )
}
