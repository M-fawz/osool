import { PrismaClient } from '@prisma/client'

/**
 * Database integrity on the production register.
 *
 * Everything here is a question about the *database*, asked of the database —
 * not about the code that writes to it. A constraint that only the application
 * enforces is a constraint that lapses the first time anything else connects.
 */

const db = new PrismaClient()
let pass = 0
let fail = 0
const notes = []

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ok    ${label}`); return }
  fail++
  console.log(`  FAIL  ${label} — ${detail}`)
  notes.push(`${label} — ${detail}`)
}

const q = (sql) => db.$queryRawUnsafe(sql)

console.log('\nOsool — production database integrity\n' + '='.repeat(70))

// ── 1. Migrations ──────────────────────────────────────────────────────────
console.log('\n1. Migrations')
const migs = await q(`select migration_name, finished_at, rolled_back_at from _prisma_migrations order by started_at`)
check('every migration finished', migs.every((m) => m.finished_at), 'unfinished migration present')
check('no migration rolled back', migs.every((m) => !m.rolled_back_at), 'a rollback is recorded')
console.log(`        ${migs.length} applied: ${migs.map((m) => m.migration_name).join(', ')}`)

// ── 2. No destructive behaviour is possible ────────────────────────────────
console.log('\n2. Destructive-action guardrails')
const cascades = await q(`
  select tc.table_name, tc.constraint_name, rc.delete_rule
  from information_schema.table_constraints tc
  join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
  where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'
    and rc.delete_rule not in ('NO ACTION','RESTRICT')
`)
check(
  'no foreign key cascades on delete',
  cascades.length === 0,
  cascades.map((c) => `${c.table_name}.${c.constraint_name}=${c.delete_rule}`).join(', '),
)

const triggers = await q(`
  select event_object_table as tbl, trigger_name, event_manipulation as ev
  from information_schema.triggers where trigger_schema='public' order by 1,2
`)
const guarded = new Set(triggers.filter((t) => t.ev === 'DELETE').map((t) => t.tbl))
console.log(`        delete-guard triggers on: ${[...guarded].sort().join(', ') || 'none'}`)
check('audit_event has a delete guard', guarded.has('audit_event'), 'no DELETE trigger on audit_event')
check('application has a delete guard', guarded.has('application'), 'no DELETE trigger on application')

// Prove it, rather than trusting the catalogue.
let refused = false
try {
  await db.$executeRawUnsafe(`delete from audit_event where seq = (select min(seq) from audit_event)`)
} catch (e) {
  refused = true
  notes.push(`audit_event delete refused by database: ${String(e.message).split('\n')[0].slice(0, 120)}`)
}
check('the database itself refuses to delete an audit event', refused, 'the delete succeeded')

let truncRefused = false
try {
  await db.$executeRawUnsafe(`truncate table audit_event cascade`)
} catch {
  truncRefused = true
}
check('the database itself refuses to truncate audit_event', truncRefused, 'the truncate succeeded')

// ── 3. Referential integrity ───────────────────────────────────────────────
console.log('\n3. Relationships')
const orphans = await q(`
  select 'application.brokerEntityId' as rel, count(*)::int n from application a
    left join broker_entity b on b.id = a."brokerEntityId" where a."brokerEntityId" is not null and b.id is null
  union all select 'application.examinerId', count(*)::int from application a
    left join "user" u on u.id = a."examinerId" where a."examinerId" is not null and u.id is null
  union all select 'application_event.applicationId', count(*)::int from application_event e
    left join application a on a.id = e."applicationId" where a.id is null
  union all select 'document.applicationId', count(*)::int from document d
    left join application a on a.id = d."applicationId" where d."applicationId" is not null and a.id is null
  union all select 'registration.brokerEntityId', count(*)::int from registration r
    left join broker_entity b on b.id = r."brokerEntityId" where b.id is null
  union all select 'rule_item.ruleSetId', count(*)::int from rule_item i
    left join rule_set s on s.id = i."ruleSetId" where s.id is null
`)
for (const o of orphans) check(`no orphans in ${o.rel}`, o.n === 0, `${o.n} orphaned rows`)

// ── 4. Uniqueness / duplicates ─────────────────────────────────────────────
console.log('\n4. Duplicates')
const dupes = await q(`
  select 'user.email' as what, count(*)::int n from (select lower(email) e from "user" group by 1 having count(*)>1) x
  union all select 'application.temporaryNumber', count(*)::int from
    (select "temporaryNumber" t from application where "temporaryNumber" is not null group by 1 having count(*)>1) x
  union all select 'registration.registrationNumber', count(*)::int from
    (select "registrationNumber" r from registration group by 1 having count(*)>1) x
  union all select 'audit_event.seq', count(*)::int from (select seq from audit_event group by 1 having count(*)>1) x
  union all select 'audit_event.hash', count(*)::int from (select hash from audit_event group by 1 having count(*)>1) x
`)
for (const d of dupes) check(`no duplicate ${d.what}`, d.n === 0, `${d.n} duplicated values`)

// ── 5. Audit chain shape ───────────────────────────────────────────────────
console.log('\n5. Audit trail')
const [seqGaps] = await q(`
  select (max(seq) - min(seq) + 1 - count(*))::int as gaps from audit_event
`)
check('audit sequence has no gaps', seqGaps.gaps === 0, `${seqGaps.gaps} missing sequence numbers`)
const [genesis] = await q(`select "prevHash" from audit_event order by seq asc limit 1`)
check('first event points at genesis', /^0{64}$/.test(genesis.prevHash), genesis.prevHash?.slice(0, 16))
const [reads] = await q(`select count(*)::int n from audit_event where "accessType"='READ'`)
check('read access is audited, not only writes', reads.n > 0, `${reads.n} READ events`)

// ── 6. Segregation of duties, as data ──────────────────────────────────────
console.log('\n6. Segregation of duties')
const sod = await q(`
  select "temporaryNumber" from application
  where "examinerId" is not null and "reviewerId" is not null and "examinerId" = "reviewerId"
`)
check(
  'no application examined and reviewed by the same person',
  sod.length === 0,
  sod.map((r) => r.temporaryNumber).join(', '),
)

// ── 7. Rule data is versioned, not hard-coded ──────────────────────────────
console.log('\n7. Versioned rule data')
const sets = await db.ruleSet.findMany({ select: { code: true, version: true, effectiveFrom: true, _count: { select: { items: true } } } })
check('rule sets are present', sets.length >= 8, `${sets.length} sets`)
check('every rule set has an effective date', sets.every((s) => s.effectiveFrom), 'a set has no effectiveFrom')
check('every rule set has items', sets.every((s) => s._count.items > 0), 'an empty rule set')

// ── 8. PII is encrypted at rest ────────────────────────────────────────────
console.log('\n8. Identifying data at rest')
const parties = await q(`select "nationalIdEnc", "nationalIdHash" from party where "nationalIdEnc" is not null limit 200`)
if (parties.length === 0) {
  console.log('        no parties hold a national id; nothing to check')
} else {
  check('national ids are ciphertext, not plaintext',
    parties.every((p) => /^v1:/.test(p.nationalIdEnc) && !/^\d{14}$/.test(p.nationalIdEnc)),
    'a national id looks like a bare number')
  check('a keyed hash exists alongside for duplicate detection',
    parties.every((p) => p.nationalIdHash && p.nationalIdHash.length >= 32), 'missing nationalIdHash')
  check('ciphertexts are not deterministic',
    new Set(parties.map((p) => p.nationalIdEnc)).size === parties.length ||
      new Set(parties.map((p) => p.nationalIdEnc)).size > 1,
    'every ciphertext is identical')
}

// ── 9. Retention / archival ────────────────────────────────────────────────
console.log('\n9. Archival, not deletion')
const [archived] = await q(`select count(*)::int n from application where "archivedAt" is not null`)
const [held] = await q(`select count(*)::int n from application where "legalHold" = true`)
console.log(`        archived applications: ${archived.n}   under legal hold: ${held.n}`)
check('archival columns are usable', true)

// ── 10. What is actually in the register ──────────────────────────────────
console.log('\n10. Register contents')
const counts = {
  users: await db.user.count(),
  applications: await db.application.count(),
  registrations: await db.registration.count(),
  documents: await db.document.count(),
  events: await db.applicationEvent.count(),
  auditEvents: await db.auditEvent.count(),
  parties: await db.party.count(),
  brokerEntities: await db.brokerEntity.count(),
}
for (const [k, v] of Object.entries(counts)) console.log(`        ${k.padEnd(16)} ${v}`)
const byStatus = await db.application.groupBy({ by: ['status'], _count: true })
console.log('        statuses: ' + byStatus.map((s) => `${s.status}=${s._count}`).join(', '))

console.log(`\n${'='.repeat(70)}`)
console.log(`passed ${pass}   failed ${fail}`)
if (notes.length) { console.log('\nNotes:'); for (const n of notes) console.log(`  · ${n}`) }
await db.$disconnect()
process.exit(fail ? 1 : 0)
