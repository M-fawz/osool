import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * No form that carries a credential may fall back to a GET.
 *
 * ── What this is guarding against ────────────────────────────────────────
 *
 * A `<form onSubmit={…}>` with no `method` is a GET form until React hydrates.
 * The handler that would have called `preventDefault` does not exist yet, so a
 * click or an Enter keypress in that window performs the HTML default: a
 * navigation to the current URL with every field appended as a query
 * parameter. On the sign-in screen that produced exactly this — in the address
 * bar, in `history`, and in the server's access log:
 *
 *     /en/login?email=clerk%40osool.test&password=%3Credacted%3E
 *
 * All three credential screens — sign in, activate, forgot password — had it,
 * and the sign-in one was also being reported as "login does not work",
 * because the visible effect is the sign-in page reloading unchanged.
 *
 * A password in a URL is not recoverable after the fact. It is in logs that get
 * shipped and retained, and under CLAUDE.md rule 2 nothing in this system is
 * ever deleted — so the guard has to be that it never gets written.
 *
 * ── Why this reads source rather than rendering ──────────────────────────
 *
 * The property is about the markup served *before* any JavaScript runs.
 * Rendering the component in jsdom proves the opposite of what matters: it
 * proves the hydrated form is fine, which it always was. The served attribute
 * is the thing, so the served attribute is what is asserted.
 *
 * It scans by field rather than by a list of paths, so a fourth credential
 * screen added later is covered on the day it is written.
 */

const APP = join(process.cwd(), 'src', 'app')

/** Fields whose value must never reach a URL. */
const SENSITIVE = /<Input[^>]*\bname="(password|confirm|newPassword|currentPassword|email)"/s

function tsxFilesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...tsxFilesUnder(full))
    else if (entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

interface CredentialForm {
  name: string
  source: string
}

/** Every client form that collects a credential and handles its own submit. */
function credentialForms(): CredentialForm[] {
  return tsxFilesUnder(APP)
    .map((path) => ({ name: relative(process.cwd(), path), source: readFileSync(path, 'utf8') }))
    .filter(({ source }) => source.includes('<form') && SENSITIVE.test(source))
    // `<form action={…}>` is a Server Action form. React posts those, and they
    // work without JavaScript by design, so they are not at risk here.
    .filter(({ source }) => /<form\b[^>]*\bonSubmit=/s.test(source))
}

const FORMS = credentialForms()

describe('forms that collect a credential', () => {
  it('finds the credential screens to check', () => {
    // If this drops to zero the rest of the file is vacuously green, which is
    // how a guard quietly stops guarding.
    expect(FORMS.length).toBeGreaterThanOrEqual(3)
  })

  it.each(FORMS)(
    'submits $name over POST, so a pre-hydration submit cannot put the field in a URL',
    ({ source }) => {
      const tags = source.match(/<form\b[^>]*>/gs) ?? []
      expect(tags.length).toBeGreaterThan(0)
      for (const tag of tags) {
        if (!/\bonSubmit=/.test(tag)) continue
        expect(tag).toMatch(/\bmethod="post"/)
      }
    },
  )

  it.each(FORMS)('gates the submit control of $name on hydration', ({ source }) => {
    // The POST keeps the credential out of the log; this keeps the user out of
    // the 405 that a real pre-hydration POST to a page route would give.
    expect(source).toContain('useHydrated')
    expect(source).toMatch(/disabled=\{[^}]*!ready/)
  })
})
