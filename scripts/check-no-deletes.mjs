#!/usr/bin/env node
/**
 * Confirm by search that no destructive delete exists in the codebase.
 *
 *   npm run audit:no-deletes
 *
 * CLAUDE.md rule 2 and 02-SYSTEM-ARCHITECTURE §7. The database already refuses
 * DELETE and TRUNCATE on every table of record, so this is the second of two
 * independent controls: the database stops it at runtime, and this stops it
 * from being written in the first place — with a message at review time rather
 * than an exception in production.
 *
 * Exits non-zero on a finding, so it can gate a pull request.
 *
 * Two allowances, both narrow and both justified in the schema:
 *   · Session and Verification hold ephemeral credentials, not records. A
 *     revoked session must not be resurrectable.
 *   · Prisma's own generated client and migration SQL are not application code.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const ROOT = process.cwd()
const SEARCH_DIRS = ['src', 'scripts', 'prisma']
const EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx'])

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'generated', '.proof', '.postgres'])

/**
 * Patterns that would destroy a record.
 *
 * `deleteMany` and `delete` are Prisma's; `DROP TABLE`/`TRUNCATE` catch raw SQL
 * written through $executeRaw.
 */
/*
 * The patterns require statement-like syntax rather than the bare keyword,
 * because prose contains these words legitimately — a log line reading
 * "makes DELETE and TRUNCATE impossible" is documentation, not a violation.
 * String literals are deliberately still searched, since that is exactly where
 * a real raw-SQL delete would be written.
 */
const PATTERNS = [
  { re: /\.\s*delete\s*\(/g, what: 'Prisma .delete(' },
  { re: /\.\s*deleteMany\s*\(/g, what: 'Prisma .deleteMany(' },
  // DELETE must be followed by FROM and a table reference.
  { re: /\bDELETE\s+FROM\s+["'`\w[]/gi, what: 'raw DELETE FROM' },
  // TRUNCATE must be followed by TABLE, a quoted identifier, or ONLY.
  { re: /\bTRUNCATE\s+(TABLE\s+|ONLY\s+)?["'`[]/gi, what: 'raw TRUNCATE' },
  { re: /\bDROP\s+TABLE\s+(IF\s+EXISTS\s+)?["'`\w[]/gi, what: 'raw DROP TABLE' },
  { re: /onDelete:\s*['"]?Cascade/g, what: 'onDelete: Cascade' },
]

/** Models whose rows are ephemeral credentials rather than records. */
const ALLOWED_MODELS = /\b(session|verification)\b/i

/** A line may declare itself intentional; the reason then has to be written down. */
const ALLOW_MARKER = /no-delete-allowed:/

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
    const info = statSync(full)
    if (info.isDirectory()) walk(full, out)
    else if (EXTENSIONS.has(extname(entry))) out.push(full)
  }
  return out
}

const findings = []

for (const dir of SEARCH_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file).replace(/\\/g, '/')

    // The checker itself necessarily contains the patterns it looks for.
    if (rel.endsWith('scripts/check-no-deletes.mjs')) continue

    const lines = readFileSync(file, 'utf8').split('\n')

    lines.forEach((line, index) => {
      // A comment describing the rule is not a violation of it.
      const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
      if (!code.trim()) return

      for (const { re, what } of PATTERNS) {
        re.lastIndex = 0
        if (!re.test(code)) continue

        // The marker may sit on the line itself or on either of the two lines
        // above it, which is where a written justification naturally goes.
        const justified =
          ALLOW_MARKER.test(line) ||
          ALLOW_MARKER.test(lines[index - 1] ?? '') ||
          ALLOW_MARKER.test(lines[index - 2] ?? '')
        if (justified) continue
        if (ALLOWED_MODELS.test(code)) continue

        findings.push({ file: rel, line: index + 1, what, text: line.trim().slice(0, 110) })
      }
    })
  }
}

console.log('Destructive-delete check')
console.log('─'.repeat(72))
console.log(`Searched: ${SEARCH_DIRS.join(', ')}`)

if (findings.length === 0) {
  console.log('\nNo destructive delete found in application code.')
  console.log('Session and Verification remain deletable by design — ephemeral credentials,')
  console.log('not records, and their lifecycle is written to the audit trail beforehand.')
  console.log('\nThe database enforces the same rule independently: see the guardrails in')
  console.log('prisma/migrations/*_init and *_truncate_guard.')
} else {
  console.log(`\n${findings.length} finding(s):\n`)
  for (const f of findings) {
    console.log(`  ${f.file}:${f.line}`)
    console.log(`    ${f.what}`)
    console.log(`    ${f.text}\n`)
  }
  console.log('Nothing is ever deleted in this product. Archive, retention-lock, or place a')
  console.log('legal hold instead — see docs/02-SYSTEM-ARCHITECTURE.md §7.')
  process.exitCode = 1
}
