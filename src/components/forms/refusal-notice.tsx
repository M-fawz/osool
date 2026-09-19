'use client'

import { useLocale, useTranslations } from 'next-intl'
import { BlockedAction } from '@/components/ui/notice'
import type { RuleViolation } from '@/lib/rules/violation'

/**
 * A rule refusal, in the reader's language, as the four-part notice.
 *
 * The one rendering of a `RuleViolation` every action caller shares, so that a
 * control that is not an `ActionForm` — a counter button, a declaration that
 * posts on its own — cannot drop a refusal on the floor or show it as a bare
 * red line.
 */
export function RefusalNotice({
  violation,
  className,
}: {
  violation: RuleViolation
  className?: string
}) {
  const locale = useLocale() as 'ar' | 'en'
  const tBlocked = useTranslations('blocked')
  const copy = violation[locale]

  return (
    <BlockedAction
      className={className}
      what={copy.blocked}
      why={copy.why}
      nextStep={copy.nextStep}
      whoToAsk={copy.whoToAsk}
      legalSource={violation.legalSource}
      headings={{
        what: tBlocked('whatHeading'),
        why: tBlocked('whyHeading'),
        next: tBlocked('nextHeading'),
        who: tBlocked('whoHeading'),
      }}
    />
  )
}
