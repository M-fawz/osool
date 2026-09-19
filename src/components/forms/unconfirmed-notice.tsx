'use client'

import { useTranslations } from 'next-intl'
import { BlockedAction } from '@/components/ui/notice'
import type { Unconfirmed } from '@/lib/actions/unconfirmed'

/**
 * The four-part notice for an action the register did not answer.
 *
 * Caution rather than blocking: nothing here is a finding against the person.
 * The red notice is what a rule looks like when it refuses, and a dropped
 * connection drawn the same way would read as the register saying no.
 *
 * The reference is the server's digest, shown selectable for the same reason
 * the route error boundary shows it — the person on this screen cannot read
 * the server log, and support cannot act on "it did not save".
 */
export function UnconfirmedNotice({
  outcome,
  className,
}: {
  outcome: Unconfirmed
  className?: string
}) {
  const t = useTranslations('errors')
  const tBlocked = useTranslations('blocked')
  const tCommon = useTranslations('common')

  const copy = {
    connection: { why: t('unconfirmedWhyConnection'), next: t('unconfirmedNextConnection') },
    outdated: { why: t('unconfirmedWhyOutdated'), next: t('unconfirmedNextOutdated') },
    fault: { why: t('unconfirmedWhyFault'), next: t('unconfirmedNextFault') },
  }[outcome.reason]

  return (
    <div className={className} data-unconfirmed={outcome.reason}>
      <BlockedAction
        tone="caution"
        what={t('unconfirmedTitle')}
        why={copy.why}
        nextStep={copy.next}
        whoToAsk={t('unexpectedWho')}
        headings={{
          what: tBlocked('whatHeading'),
          why: tBlocked('whyHeading'),
          next: tBlocked('nextHeading'),
          who: tBlocked('whoHeading'),
        }}
      />
      {outcome.reference ? (
        <p className="mt-2 text-xs text-ink-faint">
          {tCommon('errorReference')}:{' '}
          <code className="ltr-run select-all font-mono text-ink-muted">{outcome.reference}</code>
        </p>
      ) : null}
    </div>
  )
}
