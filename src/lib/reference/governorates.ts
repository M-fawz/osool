import type { Governorate } from '@prisma/client'

/**
 * The 27 governorates, in both scripts.
 *
 * Held here rather than in `messages/`, for the same reason `roleLabels` is:
 * these are the names of real administrative divisions, they are needed on the
 * server as well as in the interface — the registration card is rendered
 * server-side and prints one — and a name that must be identical in a PDF, a
 * queue row, and a refusal sentence should have exactly one home.
 *
 * Ordered as the Egyptian statistical yearbook orders them: the four urban
 * governorates, then Lower Egypt, the canal, Upper Egypt, and the frontier.
 * Alphabetical order in Arabic and alphabetical order in English disagree, and
 * a list that reorders itself when the reader switches language is a list
 * nobody can navigate twice.
 */

export const governorateLabels: Record<Governorate, { ar: string; en: string }> = {
  CAIRO: { ar: 'القاهرة', en: 'Cairo' },
  GIZA: { ar: 'الجيزة', en: 'Giza' },
  ALEXANDRIA: { ar: 'الإسكندرية', en: 'Alexandria' },
  QALYUBIA: { ar: 'القليوبية', en: 'Qalyubia' },
  DAKAHLIA: { ar: 'الدقهلية', en: 'Dakahlia' },
  SHARQIA: { ar: 'الشرقية', en: 'Sharqia' },
  GHARBIA: { ar: 'الغربية', en: 'Gharbia' },
  MONUFIA: { ar: 'المنوفية', en: 'Monufia' },
  BEHEIRA: { ar: 'البحيرة', en: 'Beheira' },
  KAFR_EL_SHEIKH: { ar: 'كفر الشيخ', en: 'Kafr El Sheikh' },
  DAMIETTA: { ar: 'دمياط', en: 'Damietta' },
  PORT_SAID: { ar: 'بورسعيد', en: 'Port Said' },
  ISMAILIA: { ar: 'الإسماعيلية', en: 'Ismailia' },
  SUEZ: { ar: 'السويس', en: 'Suez' },
  BENI_SUEF: { ar: 'بني سويف', en: 'Beni Suef' },
  FAYOUM: { ar: 'الفيوم', en: 'Fayoum' },
  MINYA: { ar: 'المنيا', en: 'Minya' },
  ASYUT: { ar: 'أسيوط', en: 'Asyut' },
  SOHAG: { ar: 'سوهاج', en: 'Sohag' },
  QENA: { ar: 'قنا', en: 'Qena' },
  LUXOR: { ar: 'الأقصر', en: 'Luxor' },
  ASWAN: { ar: 'أسوان', en: 'Aswan' },
  RED_SEA: { ar: 'البحر الأحمر', en: 'Red Sea' },
  NEW_VALLEY: { ar: 'الوادي الجديد', en: 'New Valley' },
  MATROUH: { ar: 'مطروح', en: 'Matrouh' },
  NORTH_SINAI: { ar: 'شمال سيناء', en: 'North Sinai' },
  SOUTH_SINAI: { ar: 'جنوب سيناء', en: 'South Sinai' },
}

/** The order the list is offered in, which is neither script's alphabet. */
export const GOVERNORATE_ORDER: Governorate[] = Object.keys(governorateLabels) as Governorate[]

export function governorateLabel(value: Governorate, locale: 'ar' | 'en'): string {
  return governorateLabels[value][locale]
}
