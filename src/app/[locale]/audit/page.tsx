import { getTranslations, setRequestLocale } from 'next-intl/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/auth/guard'
import { AccessRefused } from '@/components/layout/access-refused'
import { recordAuditEvent, verifyChain } from '@/lib/audit'
import { roleLabels } from '@/lib/auth/roles'
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
import { ScrollText } from '@/components/ui/icon'
import { RefNumber, Stamp, TruncatedName } from '@/components/ui/bidi'

/** How many rows this screen shows. Stated in the copy, not implied. */
const PAGE_SIZE = 100

/**
 * The audit trail.
 *
 * Two things are worth noticing about this page.
 *
 * First, it verifies the hash chain on every load and shows the result at the
 * top. A chain nobody checks is a chain that has not been checked. The result
 * is the most consequential fact on the screen, so it is a stated finding with
 * its own heading rather than a pill tucked beside the title — an auditor
 * should be able to answer "is the trail sound?" without reading a row.
 *
 * Second, viewing the audit trail is itself audited — REQ-DPA-002 — so the
 * trail contains a record of who read it. That is not circular: it is the
 * point. Who examined the evidence is evidence.
 */
export default async function AuditPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const gate = await guard(['AUDITOR', 'ANALYST', 'AML_SUPERVISOR', 'REVIEWER'], { caseData: true })
  if (!gate.ok) return <AccessRefused result={gate} locale={locale as Locale} />

  const session = gate.session
  const t = await getTranslations('audit')
  const loc = locale as Locale

  const [chain, events, total] = await Promise.all([
    verifyChain(),
    db.auditEvent.findMany({ orderBy: { seq: 'desc' }, take: PAGE_SIZE }),
    db.auditEvent.count(),
  ])

  await recordAuditEvent({
    accessType: 'READ',
    action: 'AUDIT_TRAIL_VIEWED',
    entityType: 'AuditEvent',
    actorUserId: session.userId,
    actorRole: session.role,
    actorLabel: session.name,
    reason: 'Audit trail listing opened.',
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
  })

  return (
    <Shell locale={loc} session={session}>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        meta={
          <Status tone={chain.ok ? 'confirmed' : 'blocking'}>
            {chain.ok ? t('chainIntact') : t('chainBroken')}
          </Status>
        }
      />

      {/* The finding, stated. A broken chain means the register's evidence
          cannot be relied on, which is not something to communicate with a
          colour change on a badge. */}
      <Notice
        tone={chain.ok ? 'confirmed' : 'blocking'}
        title={t('chainHeading')}
        className="mb-6"
      >
        {chain.ok
          ? t('chainIntactLead', { count: chain.eventsChecked })
          : t('chainBrokenLead')}
      </Notice>

      <Panel flush>
        <Toolbar>
          <p className="text-xs text-ink-muted">
            {t('countLabel', { shown: Math.min(events.length, PAGE_SIZE), total })}
          </p>
        </Toolbar>

        <Table caption={t('title')} layout="fixed" minWidth="60rem">
          <thead>
            {/*
              Column widths are declared rather than left to the browser. Left
              alone, one long machine identifier decides how wide the action
              column is and squeezes the reason — the only column an auditor
              actually reads in prose — down to nothing.
            */}
            <tr>
              <Th className="w-12" numeric>
                {t('colSeq')}
              </Th>
              <Th className="w-28">{t('colWhen')}</Th>
              <Th className="w-36">{t('colActor')}</Th>
              <Th className="w-64">{t('colAction')}</Th>
              <Th className="w-24">{t('colEntity')}</Th>
              <Th className="w-28">{t('colTransition')}</Th>
              <Th className="w-auto">{t('colReason')}</Th>
              <Th className="w-20">{t('colHash')}</Th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <TableEmptyRow colSpan={8}>
                <EmptyState
                  icon={ScrollText}
                  title={t('emptyTitle')}
                  description={t('emptyLead')}
                  size="sm"
                />
              </TableEmptyRow>
            ) : (
              events.map((e) => (
                <tr key={e.id}>
                  <Td numeric className="text-ink-muted">
                    {e.seq.toString()}
                  </Td>
                  <Td>
                    <Stamp value={e.occurredAt} withTime className="text-xs text-ink-muted" />
                  </Td>
                  <Td>
                    <TruncatedName className="font-medium" title={e.actorLabel ?? undefined}>
                      {e.actorLabel ?? '—'}
                    </TruncatedName>
                    {e.actorRole ? (
                      <span className="mt-0.5 block truncate text-2xs text-ink-faint">
                        {loc === 'ar' ? roleLabels[e.actorRole].ar : roleLabels[e.actorRole].en}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    {/* The action code is machine vocabulary, so it is
                        direction-isolated but allowed to wrap — pinned to one
                        line it sets the column width for every other row. The
                        read/write mark sits inline before it, where it reads as
                        a qualifier on the action rather than as a second fact. */}
                    <span className="flex items-baseline gap-2">
                      <Status
                        tone={e.accessType === 'READ' ? 'neutral' : 'informational'}
                        size="sm"
                      >
                        {e.accessType === 'READ' ? t('read') : t('write')}
                      </Status>
                      {/* Kept on one line. Broken across three, an action code
                          stops being a name and becomes three fragments an
                          auditor has to reassemble. If one is ever longer than
                          the column, it ellipsises and keeps its full value in
                          the title rather than widening the whole table. */}
                      <span className="ltr-run min-w-0 truncate font-medium" title={e.action}>
                        {e.action}
                      </span>
                    </span>
                  </Td>
                  <Td>
                    <span className="ltr-run block truncate text-xs">{e.entityType}</span>
                  </Td>
                  <Td>
                    {e.fromState || e.toState ? (
                      // The arrow is part of the transition, not the page, so
                      // it points the way the states are written — left to
                      // right — in both locales, and the isolation stops the
                      // surrounding Arabic from reversing the pair.
                      <span className="ltr-run-wrap text-xs">
                        {e.fromState ?? '—'} → {e.toState ?? '—'}
                      </span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </Td>
                  {/* Clamped to two lines. One four-line reason otherwise sets
                      the height of its whole row and pushes three other events
                      off the screen. */}
                  <Td clamp={2} className="text-ink-muted">
                    <bdi>{e.reason ?? '—'}</bdi>
                  </Td>
                  <Td>
                    <RefNumber className="text-2xs text-ink-faint">
                      {e.hash.slice(0, 8)}…
                    </RefNumber>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Panel>
    </Shell>
  )
}
