import { describe, expect, it } from 'vitest'
import { registrationCardHtml, type RegistrationCardData } from '@/lib/pdf/registration-card'

/**
 * The printed card, and the periods on it.
 *
 * The card states two statutory periods: how long before expiry a renewal must
 * be applied for, and how long the holder has to notify a change. Both used to
 * be constants in this file — `90` inside an arithmetic expression, and both
 * periods again spelled out as Arabic words. Amending either by decree would
 * have required a code change and a deployment to correct a document the
 * register hands to the public.
 *
 * CLAUDE.md rule 4: thresholds are versioned data, never constants. These tests
 * hold the card to it by rendering with periods that are *not* the current ones
 * and asserting the output follows.
 */

const specimen: RegistrationCardData = {
  registrationNumber: '2026/0042',
  tradeNameAr: 'شركة النيل للوساطة العقارية',
  tradeNameEn: 'Nile Real Estate Brokerage',
  categoryLabelAr: 'الفئة ب',
  typeLabelsAr: ['بيع', 'إيجار'],
  paidUpCapital: 250_000,
  validFrom: new Date('2026-03-01T00:00:00Z'),
  validTo: new Date('2031-03-01T00:00:00Z'),
  governorateAr: 'القاهرة',
  addressAr: '١٤ شارع طلعت حرب، وسط البلد، القاهرة',
  commercialRegisterNo: '118427',
  issuedOn: new Date('2026-03-01T00:00:00Z'),
  renewalWindowDays: 90,
  changeNotificationDays: 30,
}

describe('the periods printed on the card', () => {
  it('states the renewal window it was given, not one of its own', () => {
    const html = registrationCardHtml({ ...specimen, renewalWindowDays: 45 })

    expect(html).toContain('45')
    // The old implementation had 90 as a literal in two places — the arithmetic
    // and the Arabic wording. Either surviving would fail here.
    expect(html).not.toContain('تسعين')
  })

  it('computes the renewal date from that window', () => {
    // 45 days before 1 March 2031 is 15 January 2031.
    const html = registrationCardHtml({ ...specimen, renewalWindowDays: 45 })
    expect(html).toContain('15/01/2031')

    // …and the current 90-day window gives a different date, from the same code
    // path rather than from a second one.
    const ninety = registrationCardHtml(specimen)
    expect(ninety).toContain('01/12/2030')
  })

  it('states the change-notification period it was given', () => {
    const html = registrationCardHtml({ ...specimen, changeNotificationDays: 60 })

    expect(html).toContain('60')
    expect(html).not.toContain('ثلاثين')
  })

  it('keeps both periods LTR-isolated inside the Arabic obligation text', () => {
    // CLAUDE.md rule 7 — numerals stay LTR inside RTL text, or "90 days" reads
    // as "09" to an Arabic speaker on some renderers.
    const html = registrationCardHtml(specimen)

    expect(html).toContain('<span class="ltr">90</span>')
    expect(html).toContain('<span class="ltr">30</span>')
  })
})

describe('the card as a whole', () => {
  it('carries the registration number LTR-isolated', () => {
    const html = registrationCardHtml(specimen)
    expect(html).toContain('<span class="ltr">2026/0042</span>')
  })

  it('renders the Arabic trade name', () => {
    expect(registrationCardHtml(specimen)).toContain('شركة النيل للوساطة العقارية')
  })
})
