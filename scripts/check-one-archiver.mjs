#!/usr/bin/env node
/**
 * Confirm by search that `archivedAt` is written in exactly one place.
 *
 *   npm run audit:one-archiver
 *
 * CLAUDE.md rule 2 and 02-SYSTEM-ARCHITECTURE §7. Archiving is one of the three
 * retention operations, and the other two — retention lock and legal hold —
 * are only real if they cannot be walked around. `src/lib/retention/archive()`
 * checks both before it writes; a direct `archivedAt: new Date()` elsewhere
 * checks neither, and would look entirely unremarkable in review.
 *
 * This is the same shape of control as the one-writer rule for
 * `application.status`, and it exists for the same reason F-03/F-04 did: a
 * check that lives at the call sites is a check that will be forgotten at one
 * of them.
 *
 * Exits non-zero on a finding, so it can gate a pull request.
 *
 * Reads are not writes. `archivedAt: null` is a *filter* — "only the live rows"
 * — and appears in dozens of queries; `archivedAt: true` is a Prisma `select`.
 * Neither archives anything, so neither is reported.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const ROOT = process.cwd()
/*
 * Application code only.
 *
 * `scripts/` holds proof and seed tooling that runs against development
 * databases by hand, never in a request path — `proof-rules.ts` archives a rule
 * set version precisely to demonstrate that versioning works. Holding it to the
 * one-writer rule would mean threading an ActorContext through demonstrations
 * that have no actor, for no gain in the control this check exists to protect.
 */
const SEARCH_DIRS = ['src']
const EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx'])
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'generated', '.proof', '.postgres'])

/** The one module permitted to write it. */
const ARCHIVER = 'src/lib/retention/index.ts'

/**
 * A write is `archivedAt:` followed by anything that is not `null` (a filter),
 * `true`/`false` (a select), or a type position (`archivedAt: Date | null`).
 */
/*
 * `[\s]` leads the negative lookahead deliberately. Without it, `\s*` is free to
 * match zero characters and leave the lookahead inspecting the space rather than
 * the value after it — so every `archivedAt: null` filter in the codebase reads
 * as a write. The first version of this check reported 55 findings, 54 of them
 * read filters, which is exactly the kind of noisy control people switch off.
 */
const WRITE = /\barchivedAt\s*:\s*(?![\s]|null\b|true\b|false\b|Date\b|string\b)/

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (EXTENSIONS.has(extname(full))) out.push(full)
  }
  return out
}

const findings = []

for (const dir of SEARCH_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file).split('\\').join('/')
    if (rel === ARCHIVER) continue

    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    lines.forEach((line, i) => {
      if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) return
      if (WRITE.test(line)) findings.push({ rel, line: i + 1, text: line.trim() })
    })
  }
}

const rule = '─'.repeat(72)
console.log('\nOne-archiver check')
console.log(rule)
console.log(`Searched: ${SEARCH_DIRS.join(', ')}`)
console.log(`Permitted writer: ${ARCHIVER}\n`)

if (findings.length === 0) {
  console.log('`archivedAt` is written in exactly one place.')
  console.log('Retention lock and legal hold cannot be bypassed by archiving directly.\n')
  process.exit(0)
}

console.error(`${findings.length} direct write(s) to archivedAt outside the archiver:\n`)
for (const f of findings) console.error(`  ${f.rel}:${f.line}\n    ${f.text}`)
console.error(
  '\nArchive through `archive()` in src/lib/retention instead. It checks the legal' +
    '\nhold and the retention period first, and writes the audit event.\n',
)
process.exit(1)
