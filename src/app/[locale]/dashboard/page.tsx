import { getTranslations, setRequestLocale } from 'next-intl/server'
import { guard } from '@/lib/auth/guard'
import { AccessRefused } from '@/components/layout/access-refused'
import {
  BROKER_ROLES,
  GOVERNMENT_ROLES,
  canProvisionAccounts,
  canSeeCaseData,
  isBrokerRole,
  personName,
  roleLabel,
} from '@/lib/auth/roles'
import { QUEUE_ROUTES } from '@/lib/applications/queues'
import type { Locale } from '@/i18n/routing'
import { Link, redirect } from '@/i18n/navigation'
import { Shell } from '@/components/layout/shell'
import { EmptyState, Icon, PageHeader, Panel, forwardChevron } from '@/components/ui/primitives'
import { ClipboardList, ScrollText, Users } from '@/components/ui/icon'
import type { LucideIcon } from '@/components/ui/icon'

/**
 * The dashboard.
 *
 * What this screen is *for* is telling an official what they can act on right
 * now. At Phase 0 the honest answer for most roles is "nothing yet", and the
 * screen says so plainly rather than filling the space with three equal cards
 * of invented metrics — the tell named in 03-DESIGN-DIRECTION §3.
 *
 * The actions listed are the ones the signed-in role can genuinely reach.
 * They are derived from the same capability predicates the guards use, so the
 * list cannot drift away from what the server will actually allow.
 */
export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const gate = await guard([...GOVERNMENT_ROLES, ...BROKER_ROLES])
  if (!gate.ok) return <AccessRefused result={gate} locale={locale as Locale} />

  const session = gate.session

  // A broker's dashboard is their applications. There is no second view of
  // their own file worth building, and landing them on a screen whose only
  // content is a link to the screen they wanted is a wasted tap on a phone.
  if (isBrokerRole(session.role)) {
    redirect({ href: '/application', locale: locale as Locale })
  }

  const [t, tAudit, tAccounts, tGov] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('audit'),
    getTranslations('accounts'),
    getTranslations('gov'),
  ])
  const loc = locale as Locale
  const labels = roleLabel(session.role)

  const actions: Array<{ href: string; label: string; description: string; icon: LucideIcon }> = []

  const queueRoute = QUEUE_ROUTES[session.role]
  if (queueRoute) {
    actions.push({
      href: queueRoute,
      label: t('openQueue'),
      description: tGov('queueEmptyLead'),
      icon: ClipboardList,
    })
  }

  if (canSeeCaseData(session.role)) {
    actions.push({
      href: '/audit',
      label: t('openAudit'),
      description: tAudit('lead'),
      icon: ScrollText,
    })
  }

  if (canProvisionAccounts(session.role)) {
    actions.push({
      href: '/admin/users',
      label: t('openAccounts'),
      description: tAccounts('lead'),
      icon: Users,
    })
  }

  return (
    <Shell locale={loc} session={session}>
      <PageHeader
        title={t('title')}
        lead={t('signedInAs', {
          name: personName(session, loc).primary,
          role: loc === 'ar' ? labels.ar : labels.en,
        })}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Panel title={t('quickHeading')} icon={ClipboardList} flush>
          {actions.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={t('noActions')}
              description={t('noActionsLead')}
              size="sm"
            />
          ) : (
            <ul>
              {actions.map((action) => (
                <li key={action.href} className="border-b border-rule last:border-b-0">
                  <Link
                    href={action.href}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-navy-50"
                  >
                    <Icon as={action.icon} size="md" className="text-brass-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-medium text-navy-700">
                        {action.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        {action.description}
                      </span>
                    </span>
                    <Icon
                      as={forwardChevron(loc)}
                      size="sm"
                      className="shrink-0 text-ink-faint"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t('phaseHeading')} description={t('phaseLead')}>
          <p className="text-sm leading-relaxed text-ink-muted">{t('phaseNote')}</p>
        </Panel>
      </div>
    </Shell>
  )
}
