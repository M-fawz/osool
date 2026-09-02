#!/usr/bin/env node
/**
 * Add or check message keys in both locales at once.
 *
 *   node scripts/i18n-keys.mjs check          → report drift, exit non-zero on any
 *   node scripts/i18n-keys.mjs add <file.json> → merge additions into ar and en
 *
 * CLAUDE.md rule 7: "English is a full mirror, not a courtesy." A mirror is
 * only a mirror if it has every key, and the way that stops being true is
 * always the same — someone adds a string to the screen they are building, in
 * the language they are thinking in, and the other file drifts one key behind.
 * By the time anyone notices there are forty.
 *
 * `check` is what CI runs. It reports keys present in one file and absent from
 * the other, in both directions, and says which.
 *
 * The additions file for `add` is shaped `{ "namespace.key": { ar, en } }`,
 * flat, so a new screen's strings are written once as pairs rather than twice
 * as trees — which is what makes forgetting one impossible rather than merely
 * unlikely.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MESSAGES = join(process.cwd(), 'messages')
const FILES = { ar: join(MESSAGES, 'ar.json'), en: join(MESSAGES, 'en.json') }

function load(locale) {
  return JSON.parse(readFileSync(FILES[locale], 'utf8'))
}

function flatten(value, prefix = '', out = new Map()) {
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) flatten(entry, path, out)
    else out.set(path, entry)
  }
  return out
}

function setDeep(target, path, value) {
  const parts = path.split('.')
  let node = target
  for (const part of parts.slice(0, -1)) {
    if (typeof node[part] !== 'object' || node[part] === null) node[part] = {}
    node = node[part]
  }
  node[parts[parts.length - 1]] = value
}

function check() {
  const ar = flatten(load('ar'))
  const en = flatten(load('en'))

  const missingInEn = [...ar.keys()].filter((k) => !en.has(k))
  const missingInAr = [...en.keys()].filter((k) => !ar.has(k))

  console.log(`ar: ${ar.size} keys`)
  console.log(`en: ${en.size} keys`)

  if (missingInEn.length === 0 && missingInAr.length === 0) {
    console.log('\nParity: every key exists in both locales.')
    return 0
  }

  if (missingInEn.length) {
    console.log(`\nPresent in ar, missing from en (${missingInEn.length}):`)
    for (const key of missingInEn) console.log(`  · ${key}`)
  }
  if (missingInAr.length) {
    console.log(`\nPresent in en, missing from ar (${missingInAr.length}):`)
    for (const key of missingInAr) console.log(`  · ${key}`)
  }
  return 1
}

function add(path) {
  const additions = JSON.parse(readFileSync(path, 'utf8'))
  const files = { ar: load('ar'), en: load('en') }
  let added = 0
  let skipped = 0

  for (const [key, pair] of Object.entries(additions)) {
    if (!pair || typeof pair.ar !== 'string' || typeof pair.en !== 'string') {
      throw new Error(`${key}: needs both an "ar" and an "en" string.`)
    }
    const existing = flatten(files.ar).get(key)
    if (existing !== undefined) {
      skipped += 1
      continue
    }
    setDeep(files.ar, key, pair.ar)
    setDeep(files.en, key, pair.en)
    added += 1
  }

  for (const locale of ['ar', 'en']) {
    writeFileSync(FILES[locale], `${JSON.stringify(files[locale], null, 2)}\n`, 'utf8')
  }

  console.log(`Added ${added} key(s) to both locales; ${skipped} already present.`)
  return check()
}

const [command, argument] = process.argv.slice(2)

if (command === 'add') {
  if (!argument) {
    console.error('Usage: node scripts/i18n-keys.mjs add <additions.json>')
    process.exit(2)
  }
  process.exit(add(argument))
} else {
  process.exit(check())
}
