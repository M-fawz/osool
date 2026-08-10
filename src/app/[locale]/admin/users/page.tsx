import { getTranslations, setRequestLocale } from 'next-intl/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/auth/guard'
import { AccessRefused } from '@/components/layout/access-refused'
import { GOVERNMENT_ROLES, personName, roleLabels } from '@/lib/auth/roles'
import type { Locale } from '@/i18n/routing'
import { Shell } from '@/components/layout/shell'
import {
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  Status,
  Table,
  TableEmptyRow,
  Td,
  Th,
  Toolbar,
} from '@/components/ui/primitives'
import { Users } from '@/components/ui/icon'
import { DualName, Stamp } from '@/components/ui/bidi'
import { CreateAccountForm } from './create-account-form'

const PAGE_SIZE = 200

/**
 * Account provisioning — SYSTEM_ADMIN only.
 *
 * Note what this page queries: users, and nothing else. 02-SYSTEM-ARCHITECTURE
 * §4 — "SYSTEM_ADMIN: Explicitly cannot see any application, registration, or
 * supervisory case. Administration is not access." The separation is a
 * property of what this page is able to read, not a filter applied to a wider
 * query.
 */
export default async function UsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const gate = await guard(['SYSTEM_ADMIN'])
  if (!gate.ok) return <AccessRefused result={gate} locale={locale as Locale} />

  const session = gate.session
  const [t, tStatus, tBlocked] = await Promise.all([
    getTranslations('accounts'),
    getTranslations('status'),
    getTranslations('blocked'),
  ])
  const loc = locale as Locale

  const [users, total] = await Promise.all([
    db.user.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, nameAr: true, email: true, role: true,
        status: true, createdAt: true,
      },
      take: PAGE_SIZE,
    }),
    db.user.count({ where: { archivedAt: null } }),
  ])

  const toneFor = (status: string) =>
    status === 'ACTIVE' ? 'confirmed' : status === 'SUSPENDED' ? 'blocking' : 'caution'

  return (
    <Shell locale={loc} session={session}>
      <PageHeader title={t('title')} lead={t('lead')} />

      {/* Not a warning — a standing fact about this screen, and one an
          administrator should be reminded of, since it is the constraint that
          makes their unusually powerful account safe to hold. */}
      <Notice tone="informational" className="mb-6">
        {t('noCaseAccess')}
      </Notice>

      {/*
        The form sits beside the table only when there is genuinely room for
        both. Below 2xl it stacks, because a four-field form given a fixed
        24rem was leaving the register itself about 580px for five columns —
        and a name column 60px wide renders every official in the Authority as
        "Dev Susp…", which is not a list of people, it is a list of prefixes.
        The table is the point of this screen; it gets the width.
      */}
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Panel title={t('createHeading')} className="w-full max-w-xl 2xl:max-w-none">
          <CreateAccountForm
            roles={GOVERNMENT_ROLES.map((r) => ({
              value: r,
              label: loc === 'ar' ? roleLabels[r].ar : roleLabels[r].en,
            }))}
            labels={{
              name: t('name'), nameAr: t('nameAr'), email: t('email'), role: t('role'),
              create: t('create'), creating: t('creating'),
              createdTitle: t('createdTitle'), createdNext: t('createdNext'),
              failedTitle: t('failedTitle'), failedNext: t('failedNext'),
              failedWho: t('failedWho'),
            }}
            createdLeadTemplate={t('createdLead', { email: '{email}' })}
            headings={{
              what: tBlocked('whatHeading'), why: tBlocked('whyHeading'),
              next: tBlocked('nextHeading'), who: tBlocked('whoHeading'),
            }}
          />
        </Panel>

        <Panel title={t('listHeading')} flush>
          <Toolbar>
            <p className="text-xs text-ink-muted">
              {t('countLabel', { shown: Math.min(users.length, PAGE_SIZE), total })}
            </p>
          </Toolbar>

          <Table caption={t('listHeading')} layout="fixed" minWidth="46rem">
            <thead>
              <tr>
                {/* The name column takes the remainder, because it is the one
                    holding two lines of dual-script content and the one an
                    administrator scans down. */}
                <Th>{t('colName')}</Th>
                <Th className="w-52">{t('colEmail')}</Th>
                <Th className="w-36">{t('colRole')}</Th>
                {/* Wide enough for the longest status label plus its icon.
                    "Pending activation" is 18 characters, and a status pill
                    that overlaps the next column is a status nobody trusts. */}
                <Th className="w-40">{t('colStatus')}</Th>
                <Th className="w-24">{t('colCreated')}</Th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <TableEmptyRow colSpan={5}>
                  <EmptyState
                    icon={Users}
                    title={t('emptyTitle')}
                    description={t('emptyLead')}
                    size="sm"
                  />
                </TableEmptyRow>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <Td>
                      {/* The reader's own language leads, in both directions. */}
                      {(() => {
                        const who = personName(u, loc)
                        return <DualName primary={who.primary} secondary={who.secondary} compact />
                      })()}
                    </Td>
                    <Td>
                      <span className="ltr-run block truncate text-xs" title={u.email}>
                        {u.email}
                      </span>
                    </Td>
                    <Td className="text-xs">
                      {loc === 'ar' ? roleLabels[u.role].ar : roleLabels[u.role].en}
                    </Td>
                    <Td>
                      <Status tone={toneFor(u.status)} size="sm">
                        {tStatus(u.status)}
                      </Status>
                    </Td>
                    <Td>
                      <Stamp value={u.createdAt} className="text-xs text-ink-muted" />
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Panel>
      </div>
    </Shell>
  )
}
