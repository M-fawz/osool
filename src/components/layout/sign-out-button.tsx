'use client'

import { useTransition } from 'react'
import { useRouter } from '@/i18n/navigation'
import { signOut } from '@/lib/auth/client'
import { Button } from '@/components/ui/primitives'
import { Icon, LogOut } from '@/components/ui/icon'

/**
 * Sign out.
 *
 * Uses next-intl's router, not Next's: pushing the bare path `/` from `/en`
 * dropped the official onto the Arabic landing page, because Arabic is the
 * unprefixed canonical locale. Signing out should not change your language.
 *
 * It also no longer draws itself. It used to carry its own navy border and
 * padding, which meant the one control in the header that mattered most drifted
 * out of step with every other button in the product the moment the button
 * styles changed.
 */
export function SignOutButton({
  label,
  /**
   * The broker portal is used one-handed on a phone, where PRODUCT.md sets a
   * 44px floor on every target. The back office is a desk, a mouse, and a
   * density budget — `sm` there is correct and `touch` would cost a row of the
   * queue. Same control, two products.
   */
  size = 'sm',
}: {
  label: string
  size?: 'sm' | 'touch'
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      variant="chrome"
      size={size}
      busy={pending}
      onClick={() =>
        signOut().then(() =>
          startTransition(() => {
            router.push('/')
            router.refresh()
          }),
        )
      }
    >
      {pending ? null : <Icon as={LogOut} size="xs" />}
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </Button>
  )
}
