import { getTranslations } from 'next-intl/server'
import type { ApplicationStatus } from '@prisma/client'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { statusLabels } from '@/lib/applications/refusals'
import { PageHeader } from '@/components/ui/panel'
import { Status, type StatusTone } from '@/components/ui/status'
import { Ltr, Stamp } from '@/components/ui/bidi'
import { Icon, forwardChevron } from '@/components/ui/icon'

/** Status → tone. The word and the icon carry the meaning; colour reinforces. */
const TONES: Record<ApplicationStatus, StatusTone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'informational',
  UNDER_INTAKE: 'informational',
  UNDER_EXAMINATION: 'informational',
  AWAITING_COMPLETION: 'caution',
  UNDER_REVIEW: 'informational',
  APPROVED: 'confirmed',
  REJECTED: 'blocking',
  AWAITING_PAYMENT: 'caution',
  CARD_ISSUED: 'confirmed',
  ACTIVE: 'confirmed',
  WITHDRAWN: 'neutral',
}

/**
 * The identifying line of a case screen.
 *
 * The temporary number leads, because that is what an official reads out on the
 * telephone and writes on the folder. The trade name is second; the status is a
 * pill, not a heading, because an examiner opening a file already knows why they
 * opened it.
 */
export async function CaseHeader({
  application,
  locale,
  backHref,
}: {
  application: {
    id: string
    status: ApplicationStatus
    temporaryNumber: string | null
    submittedAt: Date | null
    entityData: { tradeNameAr: string; tradeNameEn: string | null } | null
  }
  locale: Locale
  backHref: string
}) {
  const t = await getTranslations('gov')

  return (
    <>
      <Link
        href={backHref}
        className="mb-4 inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-navy-600 hover:underline"
      >
        <Icon as={forwardChevron(locale === 'ar' ? 'en' : 'ar')} size="sm" />
        {t('backToQueue')}
      </Link>

      <PageHeader
        title={
          application.temporaryNumber
            ? `${t('applicationRef')} ${application.temporaryNumber}`
            : t('fileTitle')
        }
        lead={application.entityData?.tradeNameAr ?? undefined}
        meta={
          <>
            <Status tone={TONES[application.status]}>{statusLabels[application.status][locale]}</Status>
            {application.submittedAt ? (
              <span className="text-xs text-ink-faint">
                {t('colSubmitted')}: <Stamp value={application.submittedAt} />
              </span>
            ) : null}
            {application.temporaryNumber ? (
              <span className="text-xs text-ink-faint">
                <Ltr>{application.temporaryNumber}</Ltr>
              </span>
            ) : null}
          </>
        }
      />
    </>
  )
}
