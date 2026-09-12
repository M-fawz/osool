import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The password reveal control.
 *
 * ── Why this is asserted against source ──────────────────────────────────
 *
 * There is no DOM test environment in this project and adding one to prove a
 * toggle would be a poor trade. What a rendering test would establish — that
 * clicking the control unmasks the field — is instead driven for real in
 * `scripts/qa/browser.mjs` §8, in both writing directions and on a phone,
 * which is a better proof than jsdom could give.
 *
 * What is left for here is the set of properties that are invisible when the
 * thing works and expensive when they are wrong: the ones a future edit could
 * remove without any screen looking different.
 */

const UI = join(process.cwd(), 'src', 'components', 'ui', 'form.tsx')
const APP = join(process.cwd(), 'src', 'app')
const FORM_SOURCE = readFileSync(UI, 'utf8')

/** The `PasswordInput` declaration, from its opening to the file's next export. */
function passwordInputSource(): string {
  const from = FORM_SOURCE.indexOf('export const PasswordInput')
  expect(from).toBeGreaterThan(-1)
  const next = FORM_SOURCE.indexOf('export const', from + 1)
  return FORM_SOURCE.slice(from, next === -1 ? undefined : next)
}

function tsxFilesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...tsxFilesUnder(full))
    else if (entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('PasswordInput', () => {
  const source = passwordInputSource()

  it('is masked unless it has been revealed', () => {
    // The ternary, not a stored default: `shown` starts false, and the type is
    // derived from it rather than set once and mutated.
    expect(source).toMatch(/useState\(false\)/)
    expect(source).toMatch(/type=\{shown \? 'text' : 'password'\}/)
  })

  it('does not submit the form when the control is clicked', () => {
    // A <button> inside a <form> is type="submit" by default. Without this,
    // revealing the password signs you in — or, on the activate screen, spends
    // the one-time token.
    expect(source).toMatch(/type="button"/)
  })

  it('announces its state as well as its action', () => {
    expect(source).toMatch(/aria-pressed=\{shown\}/)
    // The name must come from the caller, so that an Arabic screen does not
    // announce an English label to the one person who cannot see the icon.
    expect(source).toMatch(/aria-label=\{shown \? hideLabel : showLabel\}/)
    expect(source).not.toMatch(/aria-label="[A-Za-z]/)
  })

  it('is placed with a logical property, so it mirrors in Arabic', () => {
    expect(source).toMatch(/\bend-0\b/)
    for (const physical of ['right-0', 'left-0']) {
      expect(source).not.toContain(physical)
    }
  })

  it('reserves its own width on the field, so nothing moves when it appears', () => {
    // The reservation and the button's width are one measurement in two
    // places: the text stops exactly where the control starts, whether or not
    // the control has rendered yet.
    expect(source).toMatch(/pr-11/)
    expect(source).toMatch(/pl-11/)
    expect(source).toMatch(/\bw-11\b/)
  })

  it('reserves that space on the side the control is actually on', () => {
    /*
     * The bug this exists for, which shipped and was caught in a screenshot.
     *
     * The field is `dir="ltr"`, because a password beginning with `!` renders
     * with the symbol at the wrong end inside Arabic otherwise — it is a Latin
     * island in the sense of the `Ltr` component. But a logical property
     * resolves against the element's *own* direction, so `pe-11` written on the
     * input padded its right on an Arabic screen while the button sat at the
     * page's end, on the left. The two were on opposite sides, and a revealed
     * password ran straight under the icon. Nothing in English showed it,
     * because there the two sides agree.
     *
     * So the reservation is declared where the page's direction applies — the
     * wrapper — and what reaches the input is physical.
     */
    expect(source).toMatch(/ltr:\[&>input\]:pr-11 rtl:\[&>input\]:pl-11/)
    // And never again as a logical property on the input itself.
    const input = source.slice(source.indexOf('<input'), source.indexOf('/>'))
    expect(input).not.toMatch(/\bpe-\d/)
    expect(input).not.toMatch(/\bps-\d/)
  })

  it('meets the 44px touch minimum in both axes', () => {
    // w-11 is 44px wide; inset-y-0 takes the full height of a control whose
    // own minimum is min-h-11.
    expect(source).toMatch(/\binset-y-0\b/)
    expect(FORM_SOURCE).toMatch(/const controlSize = '[^']*\bmin-h-11\b/)
  })

  it('renders the control only once its handler exists', () => {
    expect(source).toMatch(/useHydrated\(\)/)
    expect(source).toMatch(/\{hydrated \? \(/)
  })
})

describe('every password field in the product', () => {
  /*
   * The durable half of this guard.
   *
   * A screen that goes back to a bare `<Input type="password">` loses the
   * reveal silently — the field still works, still masks, still submits, and
   * nobody notices it has become the one password box in the product you
   * cannot check your typing in. Scanning by attribute catches that on the day
   * it is written, including on a credential screen that does not exist yet.
   */
  const offenders = tsxFilesUnder(APP)
    .map((path) => ({ name: relative(process.cwd(), path), source: readFileSync(path, 'utf8') }))
    .filter(({ source }) => /<Input\b[^>]*\btype="password"/s.test(source))
    .map(({ name }) => name)

  it('uses PasswordInput rather than a raw masked Input', () => {
    expect(offenders).toEqual([])
  })

  it('is on a screen this scan can actually see', () => {
    // Guarding the guard: if no screen uses PasswordInput either, the check
    // above is vacuously green.
    const users = tsxFilesUnder(APP).filter((p) =>
      readFileSync(p, 'utf8').includes('<PasswordInput'),
    )
    expect(users.length).toBeGreaterThanOrEqual(3)
  })
})
