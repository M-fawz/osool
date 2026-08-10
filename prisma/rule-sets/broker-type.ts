import type { RuleSetDefinition } from './types'

/**
 * BROKER_TYPE — Decree 578/2025, Article 1. REQ-REG-010.
 *
 * Four types. Registration in more than one is permitted, so a Registration
 * holds a set. A brokerage contract records the capacity acted in, and that
 * capacity must be one the broker actually holds — a contract recorded under a
 * type the broker is not registered for is blocked.
 */

export const brokerType: RuleSetDefinition = {
  code: 'BROKER_TYPE',
  version: 1,
  description: 'The four broker types and their definitions.',
  legalSource: 'Ministerial Decree 578 of 2025, Article 1',
  requirementIds: ['REQ-REG-010'],
  effectiveFrom: new Date('2026-01-18T00:00:00.000Z'),
  effectiveTo: null,

  items: [
    {
      key: 'SELL',
      position: 1,
      payload: {
        labelAr: 'سمسار بيع',
        labelEn: 'Sale broker',
        definitionEn:
          'Brokerage, solicitation, or mediation to conclude contracts for the sale of built property or vacant land, for the seller’s benefit.',
        benefitOf: 'SELLER',
      },
    },
    {
      key: 'BUY',
      position: 2,
      payload: {
        labelAr: 'سمسار شراء',
        labelEn: 'Purchase broker',
        definitionEn:
          'The same, for the purchase of built property or vacant land, for the buyer’s benefit.',
        benefitOf: 'BUYER',
      },
    },
    {
      key: 'DUAL',
      position: 3,
      payload: {
        labelAr: 'سمسار مزدوج',
        labelEn: 'Dual broker',
        definitionEn:
          'Sale and purchase, for the benefit of both seller and buyer, under a dual brokerage contract.',
        benefitOf: 'BOTH',
      },
    },
    {
      key: 'RENTAL',
      position: 4,
      payload: {
        labelAr: 'سمسار إيجار',
        labelEn: 'Rental broker',
        definitionEn:
          'Contracts for the lease of built property or vacant land, for the lessor’s or lessee’s benefit.',
        benefitOf: 'LESSOR_OR_LESSEE',
      },
    },
  ],
}
