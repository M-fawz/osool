'use client'

import * as React from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useRouter } from '@/i18n/navigation'
import { signOut } from '@/lib/auth/client'
import { cn } from '@/lib/cn'
import { Icon, ChevronDown, LogOut, ShieldCheck } from '@/components/ui/icon'
import { Spinner } from '@/components/ui/button'

/**
 * Who you are signed in as — in the chrome, on every screen, in both products.
 *
 * The back office used to put this in the sidebar footer, below the fold on a
 * laptop and behind the hamburger on a phone; the broker portal showed nothing
 * at all beyond the firm's trade name, so a broker could not tell whether they
 * were signed in as themselves or as a colleague. Both are the same mistake in
 * a system where the *same screen* shows different data to different roles: an
 * examiner who has forgotten which of two accounts they are in will misread
 * what they are looking at, and a demonstration in which the reviewer and the
 * examiner look identical proves nothing to the person watching it.
 *
 * So the role is on the trigger, not only inside the panel. That is the piece
 * that has to be true at a glance without a click.
 *
 * No avatar: a circle with a letter in it would be the only round thing in a
 * system whose radius stops at 4px, and it carries nothing the name does not.
 */

export interface AccountIdentity {
  name: string
  /** The name in the other script, when the register holds both. */
  secondary: string | null
  email: string
  role: string
  /** The firm for a broker, the Authority for an official. */
  organisation: string | null
  organisationLabel: string
  government: boolean
}

export function AccountMenu({
  identity,
  labels,
}: {
  identity: AccountIdentity
  labels: {
    account: string
    signedInAs: string
    role: string
    email: string
    organisation: string
    signOut: string
  }
}) {
  const router = useRouter()
  const [signingOut, setSigningOut] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const busy = signingOut || pending

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          'on-chrome flex min-h-9 max-w-[13rem] items-center gap-2 rounded-xs border border-chrome-rule px-2.5 py-1',
          'text-start text-chrome-text hover:bg-chrome-hover',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chrome-active',
          'data-[state=open]:bg-chrome-hover',
        )}
        aria-label={labels.account}
      >
        <span className="flex min-w-0 flex-col leading-tight">
          {/* The name is the thing that identifies the human; the role is the
              thing that explains what the screen behind it is showing. Both,
              always, without opening anything. */}
          {/* The role survives at 390px; the name comes back as soon as there
              is room for it. Of the two, the role is the one that changes what
              the screen behind this control is allowed to show. */}
          <bdi dir="auto" className="hidden truncate text-xs font-medium sm:block">
            {identity.name}
          </bdi>
          <span className="truncate text-2xs text-chrome-muted">{identity.role}</span>
        </span>
        <Icon as={ChevronDown} size="xs" className="shrink-0 text-chrome-muted" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          // Styled from globals.css rather than with utility classes: the
          // entrance is a keyframe, and the reduced-motion block already knows
          // how to switch a keyframe off.
          data-menu-panel=""
          className="z-50 w-[min(20rem,calc(100vw-1.5rem))] rounded-xs border border-rule-strong bg-paper shadow-lg"
        >
          <div className="border-b border-rule px-4 py-3">
            <p className="text-2xs uppercase tracking-wider text-ink-faint">{labels.signedInAs}</p>
            <bdi dir="auto" className="mt-1 block text-md font-semibold text-navy-700">
              {identity.name}
            </bdi>
            {identity.secondary ? (
              <bdi dir="auto" className="block text-xs text-ink-muted">
                {identity.secondary}
              </bdi>
            ) : null}
          </div>

          <dl className="space-y-2.5 px-4 py-3 text-sm">
            <Row label={labels.role}>
              <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                {/* Government and supervised population are the two populations
                    this system exists to keep apart. The mark says which one
                    the reader is in without a second label. */}
                {identity.government ? (
                  <Icon as={ShieldCheck} size="xs" className="text-navy-600" />
                ) : null}
                {identity.role}
              </span>
            </Row>

            <Row label={labels.email}>
              <span className="ltr-run break-all text-ink-muted" dir="ltr">
                {identity.email}
              </span>
            </Row>

            {identity.organisation ? (
              <Row label={identity.organisationLabel || labels.organisation}>
                <bdi dir="auto" className="text-ink-muted">
                  {identity.organisation}
                </bdi>
              </Row>
            ) : null}
          </dl>

          <div className="border-t border-rule p-2">
            <DropdownMenu.Item
              disabled={busy}
              onSelect={(event) => {
                // The menu would close and unmount this item mid-request.
                event.preventDefault()
                if (busy) return
                setSigningOut(true)
                void signOut().then(() =>
                  startTransition(() => {
                    router.push('/')
                    router.refresh()
                  }),
                )
              }}
              className={cn(
                'flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xs px-3 text-sm font-medium',
                'text-blocking outline-none data-[highlighted]:bg-blocking-soft',
                'data-[disabled]:cursor-not-allowed data-[disabled]:text-ink-faint',
              )}
            >
              {busy ? <Spinner className="h-4 w-4" /> : <Icon as={LogOut} size="xs" />}
              {labels.signOut}
            </DropdownMenu.Item>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="w-24 shrink-0 text-xs text-ink-faint">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  )
}
