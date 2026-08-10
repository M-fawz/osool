import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { guard } from '@/lib/auth/guard'
import { AccessRefused } from '@/components/layout/access-refused'
import { BROKER_ROLES } from '@/lib/auth/roles'
import { evaluateCompleteness, loadApplicationDetail } from '@/lib/applications/completeness'
import { redirect } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'

/**
 * `/application/<id>` with no step.
 *
 * Sends the applicant to the first step that is not finished, which is where
 * somebody returning to a half-completed form expects to land. When everything
 * is done, that is the review step — the place they are trying to get to.
 *
 * The route exists because it is the natural thing to bookmark and the natural
 * thing to type; a 404 here would be correct and useless.
 */
export default async function ApplicationIndexPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)

  const gate = await guard(BROKER_ROLES, { caseData: true })
  if (!gate.ok) return <AccessRefused result={gate} locale={locale as Locale} />

  const application = await loadApplicationDetail(id)

  if (
    !application ||
    !gate.session.brokerEntityId ||
    application.brokerEntityId !== gate.session.brokerEntityId
  ) {
    notFound()
  }

  // A submitted file is no longer a form to finish; it is a status to read.
  if (application.status !== 'DRAFT' && application.status !== 'AWAITING_COMPLETION') {
    redirect({ href: `/application/${id}/review`, locale: locale as Locale })
  }

  const completeness = await evaluateCompleteness(application)
  const firstIncomplete = completeness.steps.find((s) => !s.complete && s.step !== 'review')

  redirect({
    href: `/application/${id}/${firstIncomplete?.step ?? 'review'}`,
    locale: locale as Locale,
  })
}
