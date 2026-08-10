import type { Role } from '@prisma/client'

/**
 * Role labels and the capability map. 02-SYSTEM-ARCHITECTURE §4.
 *
 * The Arabic label is the one printed on the GOEIC forms — these are the names
 * the officials use for themselves, and the back office should call them what
 * they are called.
 */

export const roleLabels: Record<Role, { ar: string; en: string }> = {
  SYSTEM_ADMIN: { ar: 'مسؤول النظام', en: 'System administrator' },
  REGISTRY_CLERK: { ar: 'كاتب القيد', en: 'Registry clerk' },
  EXAMINER: { ar: 'الفاحص', en: 'Examiner' },
  REVIEWER: { ar: 'المراجع', en: 'Reviewer' },
  CARD_ISSUER: { ar: 'كاتب التسليم', en: 'Card issuer' },
  DATA_MANAGER: { ar: 'مدير إدارة البيانات', en: 'Data manager' },
  FILES_HEAD: { ar: 'رئيس قسم الملفات', en: 'Head of files' },
  AML_SUPERVISOR: { ar: 'مسؤول الرقابة', en: 'AML supervisor' },
  INSPECTOR: { ar: 'مفتش', en: 'Inspector' },
  ANALYST: { ar: 'محلل', en: 'Analyst' },
  AUDITOR: { ar: 'مراجع داخلي', en: 'Internal auditor' },
  BROKER_OWNER: { ar: 'صاحب المنشأة', en: 'Broker owner' },
  BROKER_STAFF: { ar: 'موظف بالمنشأة', en: 'Broker staff' },
  BROKER_AGENT: { ar: 'وكيل', en: 'Authorised agent' },
}

export function roleLabel(role: Role): { ar: string; en: string } {
  return roleLabels[role]
}

/**
 * A person's name, in the reader's language first.
 *
 * The register holds both forms for every official, and the obvious shortcut —
 * `nameAr ?? name` — quietly means the Arabic name leads on the English
 * screens too, so an English-reading supervisor sees a script they may not be
 * able to read where the identifying line should be. 03-DESIGN-DIRECTION §5:
 * English is a full mirror, not a courtesy.
 *
 * Falls through to whichever form exists, because `nameAr` is optional and a
 * missing name must never render as an empty line.
 */
export function personName(
  person: { name: string; nameAr?: string | null },
  locale: 'ar' | 'en',
): { primary: string; secondary: string | null } {
  const primary = locale === 'ar' ? (person.nameAr ?? person.name) : person.name
  const other = locale === 'ar' ? person.name : person.nameAr

  return {
    primary,
    secondary: other && other !== primary ? other : null,
  }
}

/** Roles held by government staff. */
export const GOVERNMENT_ROLES: Role[] = [
  'SYSTEM_ADMIN',
  'REGISTRY_CLERK',
  'EXAMINER',
  'REVIEWER',
  'CARD_ISSUER',
  'DATA_MANAGER',
  'FILES_HEAD',
  'AML_SUPERVISOR',
  'INSPECTOR',
  'ANALYST',
  'AUDITOR',
]

/** Roles held by the supervised population. */
export const BROKER_ROLES: Role[] = ['BROKER_OWNER', 'BROKER_STAFF', 'BROKER_AGENT']

export function isGovernmentRole(role: Role): boolean {
  return GOVERNMENT_ROLES.includes(role)
}

export function isBrokerRole(role: Role): boolean {
  return BROKER_ROLES.includes(role)
}

/**
 * Roles with no access to case data, whatever else they can do.
 *
 * §4: "SYSTEM_ADMIN — Create, suspend, and reactivate accounts; assign roles.
 * Explicitly cannot: see any application, registration, or supervisory case.
 * Administration is not access."
 *
 * This is a list rather than a check on SYSTEM_ADMIN specifically, so that the
 * separation survives someone adding a second administrative role later.
 */
export const ROLES_WITHOUT_CASE_ACCESS: Role[] = ['SYSTEM_ADMIN']

export function canSeeCaseData(role: Role): boolean {
  return !ROLES_WITHOUT_CASE_ACCESS.includes(role)
}

/**
 * Roles permitted to provision accounts. Exactly one, and deliberately so:
 * §4 — "Government accounts are created only by SYSTEM_ADMIN. No
 * self-registration."
 */
export const ROLES_THAT_PROVISION: Role[] = ['SYSTEM_ADMIN']

export function canProvisionAccounts(role: Role): boolean {
  return ROLES_THAT_PROVISION.includes(role)
}
