import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Role } from '@prisma/client'
import { guard } from '@/lib/auth/guard'
import { AccessRefused } from '@/components/layout/access-refused'
import { Shell } from '@/components/layout/shell'
import type { Locale } from '@/i18n/routing'
import { PageHeader } from '@/components/ui/panel'
import { Notice } from '@/components/ui/notice'
import type { QueueRow } from '@/lib/applications/queues'
import { RoleQueue } from './queue'

/**
 * Six queue screens, one implementation.
 *
 * Each government role's landing page is the same object — "what is waiting for
 * me" — and the only differences are which role is allowed in, what the heading
 * says, and where a row goes. Writing six pages would have meant six chances
 * for the sticky header, the empty state, or the waiting column to drift.
 */
export async function QueuePage({
  locale,
  roles,
  title,
  lead,
  hrefFor,
  notice,
}: {
  locale: string
  /** Roles permitted here. The first is the one whose queue is shown. */
  roles: Role[]
  title: string
  lead: string
  hrefFor: (row: QueueRow) => string
  /** A standing fact about this screen — segregation of duties, for instance. */
  notice?: { title: string; body: string }
}) {
  setRequestLocale(locale)

  const gate = await guard(roles, { caseData: true })
  if (!gate.ok) return <AccessRefused result={gate} locale={locale as Locale} />

  const session = gate.session
  const loc = locale as Locale

  return (
    <Shell locale={loc} session={session}>
      <PageHeader title={title} lead={lead} />

      {notice ? (
        <Notice tone="informational" title={notice.title} className="mb-6">
          {notice.body}
        </Notice>
      ) : null}

      <RoleQueue
        role={session.role}
        actorUserId={session.userId}
        locale={loc}
        hrefFor={hrefFor}
      />
    </Shell>
  )
}

/** Shared translations for the queue pages, so each page stays three lines. */
export async function queueStrings() {
  return getTranslations('gov')
}
