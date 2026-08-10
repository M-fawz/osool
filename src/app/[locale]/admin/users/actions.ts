'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { GOVERNMENT_ROLES } from '@/lib/auth/roles'
import { requireRole } from '@/lib/auth/session'
import { ProvisioningError, provisionGovernmentAccount, reactivateAccount, suspendAccount } from '@/lib/auth/provisioning'

/**
 * Account provisioning, as Server Actions.
 *
 * 02-SYSTEM-ARCHITECTURE §2: "Authorisation, validation, and every regulatory
 * rule execute on the server. Without exception." Both happen here, in this
 * order, before anything is written — and again inside the provisioning module,
 * because a control enforced at exactly one call site is a control that lapses
 * the first time a second call site appears.
 */

const ProvisionSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().max(120).optional().or(z.literal('')),
  role: z.enum(GOVERNMENT_ROLES as [string, ...string[]]),
})

export type ActionResult =
  | { ok: true; email: string }
  | { ok: false; code: string; message: string; field?: string }

export async function createGovernmentAccountAction(formData: FormData): Promise<ActionResult> {
  const session = await requireRole(['SYSTEM_ADMIN'])

  const parsed = ProvisionSchema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    nameAr: formData.get('nameAr'),
    role: formData.get('role'),
  })

  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      code: 'VALIDATION',
      message: first?.message ?? 'The details provided are not valid.',
      field: first?.path.join('.'),
    }
  }

  try {
    const result = await provisionGovernmentAccount(
      {
        email: parsed.data.email,
        name: parsed.data.name,
        nameAr: parsed.data.nameAr || null,
        role: parsed.data.role as (typeof GOVERNMENT_ROLES)[number],
      },
      {
        userId: session.userId,
        role: session.role,
        name: session.name,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      },
    )

    revalidatePath('/admin/users')
    return { ok: true, email: result.email }
  } catch (error) {
    if (error instanceof ProvisioningError) {
      return { ok: false, code: error.code, message: error.message }
    }
    throw error
  }
}

export async function suspendAccountAction(formData: FormData): Promise<ActionResult> {
  const session = await requireRole(['SYSTEM_ADMIN'])
  const userId = String(formData.get('userId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()

  try {
    await suspendAccount({ userId, reason }, {
      userId: session.userId, role: session.role, name: session.name,
      ipAddress: session.ipAddress, userAgent: session.userAgent,
    })
    revalidatePath('/admin/users')
    return { ok: true, email: '' }
  } catch (error) {
    if (error instanceof ProvisioningError) return { ok: false, code: error.code, message: error.message }
    throw error
  }
}

export async function reactivateAccountAction(formData: FormData): Promise<ActionResult> {
  const session = await requireRole(['SYSTEM_ADMIN'])
  const userId = String(formData.get('userId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()

  try {
    await reactivateAccount({ userId, reason }, {
      userId: session.userId, role: session.role, name: session.name,
      ipAddress: session.ipAddress, userAgent: session.userAgent,
    })
    revalidatePath('/admin/users')
    return { ok: true, email: '' }
  } catch (error) {
    if (error instanceof ProvisioningError) return { ok: false, code: error.code, message: error.message }
    throw error
  }
}
