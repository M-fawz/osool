import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { db } from '@/lib/db'
import { roleLabel } from '@/lib/auth/roles'
import { statusLabels } from '@/lib/applications/refusals'
import { Panel } from '@/components/ui/panel'
import { Stamp } from '@/components/ui/bidi'

/**
 * Every hand the file passed through.
 *
 * The proof point of Phase 1 is that this list exists and is complete, so it is
 * on every case screen rather than behind a tab. It reads from
 * `ApplicationEvent`, which is append-only and which no code path can write
 * except through `transition()` — so a step that happened is here, and a step
 * that is not here did not happen.
 *
 * Name *and* role on every line. "Approved by Nadia Selim" is a fact about a
 * person; "approved by Nadia Selim — Reviewer" is a fact about a process, and
 * the second is what makes segregation of duties legible on the page.
 */
export async function EventTrail({
  applicationId,
  locale,
}: {
  applicationId: string
  locale: Locale
}) {
  const t = await getTranslations('gov')

  const events = await db.applicationEvent.findMany({
    where: { applicationId },
    orderBy: { occurredAt: 'asc' },
    include: { actor: { select: { name: true, nameAr: true } } },
  })

  return (
    <Panel title={t('eventTrailTitle')} description={t('eventTrailLead')}>
      {events.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('noEvents')}</p>
      ) : (
        <ol className="space-y-3">
          {events.map((event) => (
            <li key={event.id} className="flex gap-3">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 bg-brass-500" />
              <div className="min-w-0">
                <p className="text-base text-ink">
                  {event.fromState ? (
                    <>
                      <span className="text-ink-muted">{statusLabels[event.fromState][locale]}</span>
                      <span className="mx-1.5 text-ink-faint" aria-hidden="true">
                        →
                      </span>
                    </>
                  ) : null}
                  <span className="font-medium">{statusLabels[event.toState][locale]}</span>
                </p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {t('eventBy', {
                    name:
                      (locale === 'ar' ? event.actor.nameAr : event.actor.name) ?? event.actor.name,
                    role: roleLabel(event.actorRole)[locale],
                  })}
                  <span className="mx-1.5" aria-hidden="true">
                    ·
                  </span>
                  <Stamp value={event.occurredAt} withTime />
                </p>
                {event.reason ? (
                  <p className="mt-1 max-w-reading text-sm text-ink-muted">{event.reason}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
