import { cn } from '@/lib/cn'

/**
 * Mixed Arabic and Latin, solved once.
 *
 * 03-DESIGN-DIRECTION §5: "Mixed script is the norm here, not the exception —
 * an Arabic company name beside a Latin transliteration beside a numeric
 * registration ID, in the same table row. Solve this once in a component and
 * reuse it everywhere."
 *
 * The failure this prevents is specific and ugly. Put a registration number
 * like `2026/1183` inside an Arabic sentence and the Unicode bidirectional
 * algorithm treats the slash as neutral: the browser renders `1183/2026`, and
 * an official reads out the wrong number. Dates, phone numbers, and IP
 * addresses break the same way. `unicode-bidi: isolate` fences the run off in
 * both directions — the Arabic cannot reorder it, and it cannot reorder the
 * Arabic around it.
 */

/**
 * A Latin-script or numeric run inside text of any direction.
 *
 * Use for: registration numbers, temporary numbers, dates, times, currency
 * amounts, phone numbers, email addresses, national IDs, hashes, and
 * Latin-script names.
 */
export function Ltr({
  children,
  className,
  as: Tag = 'span',
}: {
  children: React.ReactNode
  className?: string
  as?: 'span' | 'div' | 'td' | 'code'
}) {
  return <Tag className={cn('ltr-run', className)}>{children}</Tag>
}

/**
 * A dual-script name: Arabic and its Latin counterpart, as one unit.
 *
 * The register holds both for every party, and a table row usually needs to
 * show both without the reader having to work out which is which. The Arabic
 * leads; the Latin sits under it, quieter, and is omitted entirely when absent
 * rather than leaving a dash that reads like missing data.
 */
export function DualName({
  primary,
  secondary,
  className,
  compact = false,
}: {
  /** The form in the reader's own language. See `personName` in lib/auth/roles. */
  primary: string
  /** The other form, or null when the record holds only one. */
  secondary?: string | null
  className?: string
  compact?: boolean
}) {
  return (
    // `flex` rather than `inline-flex`, and `min-w-0` on the children, so that
    // inside a fixed-layout table cell each line clips at its own end instead
    // of forcing the column wider than it was declared.
    //
    // No `lang` attribute is asserted on either line. Which script each form is
    // written in is a property of the data, not of the slot, and labelling the
    // second line `lang="en"` when it happens to hold the Arabic form tells a
    // screen reader to pronounce Arabic with English phonemes.
    //
    // Both lines align to the *page* direction rather than to their own. Left
    // to `dir="auto"` alignment, an English primary sat left and its Arabic
    // counterpart sat right, and a column of names became two ragged columns
    // that no longer read as pairs. `bdi` still isolates each run, so the
    // ordering inside each name is correct — only the alignment is shared.
    <span className={cn('flex min-w-0 flex-col', compact && 'leading-tight', className)}>
      <bdi className="block truncate text-start font-medium" title={primary}>
        {primary}
      </bdi>
      {secondary ? (
        <bdi className="block truncate text-start text-xs text-ink-faint" title={secondary}>
          {secondary}
        </bdi>
      ) : null}
    </span>
  )
}

/**
 * A name that may be Arabic or Latin, clipped to one line.
 *
 * The bug this fixes is easy to miss and impossible to unsee. Truncating a
 * Latin name inside an RTL cell puts the ellipsis at the cell's logical end —
 * the left — and clips the *beginning* of the name, so "Dev Internal Auditor"
 * renders as "…v Internal Auditor". The reader loses the first name, which is
 * the part that identifies the person.
 *
 * `dir="auto"` on the `bdi` resolves the direction from the first strong
 * character in the name itself, and the clipping is applied to that element
 * rather than to the cell, so the ellipsis always lands at the end of the name
 * whichever script it is written in.
 */
export function TruncatedName({
  children,
  className,
  title,
}: {
  children: React.ReactNode
  className?: string
  title?: string
}) {
  return (
    <bdi dir="auto" title={title} className={cn('block truncate', className)}>
      {children}
    </bdi>
  )
}

/**
 * A registration or reference number.
 *
 * Tabular numerals so a column of them aligns, and never wraps — a
 * registration number broken across two lines is a registration number
 * somebody mistypes.
 */
export function RefNumber({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('ltr-run font-mono text-[0.9em] tracking-tight', className)}>{children}</span>
  )
}

/**
 * A date, rendered LTR with Latin numerals in both locales.
 *
 * `suppressHydrationWarning` because the server and the client can sit in
 * different time zones; the value itself is formatted from an explicit
 * timeZone so it does not actually drift.
 */
export function Stamp({
  value,
  className,
  withTime = false,
  timeZone = 'Africa/Cairo',
}: {
  value: Date | string
  className?: string
  withTime?: boolean
  timeZone?: string
}) {
  const date = typeof value === 'string' ? new Date(value) : value
  const formatted = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    timeZone,
  }).format(date)

  return (
    <time dateTime={date.toISOString()} className={cn('ltr-run', className)} suppressHydrationWarning>
      {formatted}
    </time>
  )
}

/** An amount in Egyptian pounds. Latin numerals, grouped, currency named. */
export function Money({
  amount,
  locale,
  className,
}: {
  amount: number | string
  locale: 'ar' | 'en'
  className?: string
}) {
  const value = typeof amount === 'string' ? Number(amount) : amount
  const grouped = new Intl.NumberFormat('en-US').format(value)
  return (
    <span className={cn('ltr-run', className)}>
      {locale === 'ar' ? `${grouped} ج.م` : `EGP ${grouped}`}
    </span>
  )
}
