'use client'

import * as React from 'react'
import { cn } from '@/lib/cn'
import { Check, Icon } from '@/components/ui/icon'

/**
 * A choice a broker makes with a thumb.
 *
 * The obvious control is a `<select>`, and on a phone it is the wrong one for
 * this screen: it hides every option but one behind a tap, which means the
 * applicant compares five legal capacities they cannot see at the same time.
 * Laid out as rows, each with its explanation, the comparison happens on the
 * screen instead of in their head.
 *
 * A real `<input type="radio">` underneath, visually hidden rather than
 * replaced. Keyboard behaviour, arrow-key groups, form serialisation, and
 * screen-reader semantics all come free, and none of them survive a `<div>`
 * with an onClick.
 *
 * Every row is at least 56px tall — comfortably past the 44px minimum in
 * 03-DESIGN-DIRECTION §7 — because these are read and tapped one-handed.
 */

export function ChoiceGroup({
  legend,
  description,
  children,
  error,
  className,
}: {
  legend: string
  description?: string
  children: React.ReactNode
  error?: string
  className?: string
}) {
  return (
    <fieldset className={cn('min-w-0 border-0 p-0', className)}>
      <legend className="mb-1 text-md font-semibold text-navy-700">{legend}</legend>
      {description ? <p className="mb-3 max-w-reading text-sm text-ink-muted">{description}</p> : null}
      <div
        className={cn(
          'divide-y divide-rule border border-rule-strong bg-paper',
          error && 'border-2 border-blocking',
        )}
      >
        {children}
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-blocking">
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}

export function ChoiceOption({
  name,
  value,
  label,
  help,
  meta,
  defaultChecked,
  checked,
  onChange,
  disabled,
  type = 'radio',
}: {
  name: string
  value: string
  label: string
  help?: string
  /** A short qualifier on the end of the row: a capital floor, a ceiling. */
  meta?: React.ReactNode
  defaultChecked?: boolean
  checked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  type?: 'radio' | 'checkbox'
}) {
  const id = `${name}-${value}`

  return (
    <label
      htmlFor={id}
      className={cn(
        'group flex min-h-14 cursor-pointer items-start gap-3 px-4 py-3.5',
        'has-[:checked]:bg-navy-50',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-navy-600',
        disabled && 'cursor-not-allowed bg-paper-sunk',
      )}
    >
      <input
        id={id}
        type={type}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        checked={checked}
        disabled={disabled}
        onChange={onChange ? (event) => onChange(event.currentTarget.checked) : undefined}
        className="sr-only"
      />

      {/* The mark. Square for a checkbox and for a radio alike — this system's
          radius stops at 4px, and a lone circle would be the only round thing
          in the product. The tick is drawn, never a Unicode character. */}
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border bg-paper',
          type === 'radio' ? 'rounded-xs' : 'rounded-xs',
          'border-rule-strong',
          'group-has-[:checked]:border-navy-600 group-has-[:checked]:bg-navy-600',
          disabled && 'border-rule bg-paper-sunk',
        )}
      >
        <Icon
          as={Check}
          size="xs"
          className="hidden text-white group-has-[:checked]:block"
        />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-md font-medium',
            disabled ? 'text-ink-faint' : 'text-ink',
          )}
        >
          {label}
        </span>
        {help ? (
          <span className="mt-0.5 block text-sm leading-relaxed text-ink-muted">{help}</span>
        ) : null}
        {meta ? <span className="mt-1.5 block text-xs text-ink-faint">{meta}</span> : null}
      </span>
    </label>
  )
}
