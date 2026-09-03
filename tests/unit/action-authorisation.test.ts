import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  accountIsSuspended,
  noLongerPermitted,
  sessionNoLongerValid,
} from '@/lib/applications/refusals'

/**
 * Authorisation failures inside a Server Action.
 *
 * Pages call `guard()` and render a refusal. Server Actions called
 * `requireRole()`, which throws — and nothing caught it, so the throw escaped
 * into Next's error boundary and the officer got a generic client error.
 *
 * The path is ordinary, not exotic: the page rendered because the officer held
 * the role at the time, and the action runs later. An administrator changing a
 * role, a suspension, or a session expiring in between is a normal Tuesday.
 * 03-DESIGN-DIRECTION §6 admits no exceptions — each of the three is a refusal
 * and states what is blocked, why, the next step, and who to ask.
 */

const VIOLATIONS = {
  'role changed': noLongerPermitted({ role: 'EXAMINER' }),
  'session expired': sessionNoLongerValid(),
  'account suspended': accountIsSuspended('Under investigation.'),
  'account suspended, no reason given': accountIsSuspended(null),
}

describe('the refusal an officer sees when authorisation fails mid-session', () => {
  for (const [label, violation] of Object.entries(VIOLATIONS)) {
    describe(label, () => {
      it('has all four parts, in both languages', () => {
        for (const [locale, copy] of [
          ['ar', violation.ar],
          ['en', violation.en],
        ] as const) {
          for (const part of ['blocked', 'why', 'nextStep', 'whoToAsk'] as const) {
            expect(copy[part], `${locale}.${part}`).toBeTruthy()
            expect(copy[part].trim().length, `${locale}.${part} is not a placeholder`)
              .toBeGreaterThan(10)
          }
        }
      })

      it('blocks rather than merely warning', () => {
        expect(violation.severity).toBe('BLOCKING')
      })

      it('tells the officer their work was not silently half-done', () => {
        // The one thing they cannot see for themselves, and the first thing
        // they need to know before deciding whether to retry.
        expect(violation.en.nextStep.toLowerCase()).toContain('nothing on the file was changed')
      })

      it('cites a requirement and names a source', () => {
        expect(violation.requirementIds.length).toBeGreaterThan(0)
        expect(violation.legalSource).toBeTruthy()
      })
    })
  }

  it('names the role the officer actually holds, so the message is not generic', () => {
    const violation = noLongerPermitted({ role: 'AML_SUPERVISOR' })
    expect(violation.en.why).toContain('AML')
    expect(violation.evidence).toMatchObject({ role: 'AML_SUPERVISOR' })
  })

  it('repeats a stated suspension reason rather than hiding it', () => {
    expect(accountIsSuspended('Under investigation.').en.why).toContain('Under investigation.')
  })
})

/**
 * The structural guard.
 *
 * The fix above is only durable if the next action written does not reach for
 * `requireRole` again — it is the obvious thing to reach for, it compiles, and
 * the failure only shows up for an officer whose role changed at the wrong
 * moment. Same reasoning as the one-writer rule for `archivedAt`.
 */
describe('Server Actions', () => {
  const actionFiles: string[] = []

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry === 'actions.ts') actionFiles.push(full)
    }
  }
  walk(join(process.cwd(), 'src', 'app'))

  it('are actually being checked by this test', () => {
    // A guard that silently matched no files would pass forever.
    expect(actionFiles.length).toBeGreaterThan(3)
  })

  for (const file of actionFiles) {
    const relative = file.split(/[\\/]/).slice(-3).join('/')

    it(`${relative} authorises without throwing`, () => {
      const source = readFileSync(file, 'utf8')

      /*
       * `admin/users/actions.ts` is the deliberate exception and is asserted as
       * such rather than skipped: its result shape carries a code and a message
       * rather than a RuleViolation, and its screens render that. It is listed
       * here so that adding a second exception is a decision somebody makes on
       * purpose.
       */
      if (relative.includes('admin/users')) return

      expect(source, `${relative} should use authoriseAction, not requireRole`).not.toMatch(
        /await requireRole\(/,
      )
    })
  }
})
