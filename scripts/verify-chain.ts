/**
 * Verify the audit hash chain.
 *
 *   npm run audit:verify
 *
 * Exits non-zero if the chain is broken, so it can gate a deployment or run
 * from cron. 02-SYSTEM-ARCHITECTURE §7.
 */

import { verifyChain } from '@/lib/audit'
import { db } from '@/lib/db'

async function main() {
  const started = Date.now()
  const result = await verifyChain()
  const elapsed = Date.now() - started

  console.log('Audit chain verification')
  console.log('────────────────────────────────────────────────────────')
  console.log(`Events checked : ${result.eventsChecked}`)
  console.log(`Sequence range : ${result.firstSeq ?? '—'} … ${result.lastSeq ?? '—'}`)
  console.log(`Head hash      : ${result.lastHash ?? '—'}`)
  console.log(`Elapsed        : ${elapsed} ms`)
  console.log('────────────────────────────────────────────────────────')

  if (result.ok) {
    console.log('INTACT — every event hashes to its recorded value and links to its predecessor.')
  } else {
    console.log(`BROKEN — ${result.breaks.length} problem(s) found:`)
    for (const b of result.breaks) {
      switch (b.kind) {
        case 'HASH_MISMATCH':
          console.log(`  · seq ${b.seq} (${b.id}): contents were altered after the event was written.`)
          console.log(`      recorded hash   ${b.found}`)
          console.log(`      recomputed hash ${b.expected}`)
          break
        case 'BROKEN_LINK':
          console.log(`  · seq ${b.seq} (${b.id}): does not link to its predecessor.`)
          console.log(`      expected prevHash ${b.expectedPrevHash}`)
          console.log(`      found prevHash    ${b.foundPrevHash}`)
          break
        case 'SEQUENCE_GAP':
          console.log(`  · gap: expected seq ${b.expectedSeq}, found ${b.foundSeq} (${b.id}). An event was removed.`)
          break
        case 'DUPLICATE_SEQ':
          console.log(`  · seq ${b.seq} appears more than once: ${b.ids.join(', ')}`)
          break
        case 'BAD_CHAIN_START':
          console.log(
            `  · the chain starts at seq ${b.foundSeq} (${b.id}), not 1. Events were removed from the front.`,
          )
          break
      }
    }
    process.exitCode = 1
  }

  await db.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await db.$disconnect()
  process.exit(1)
})
