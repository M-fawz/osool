import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { canOpenDocument, loadDocumentForAccess } from '@/lib/documents/access'
import { putDocument, sha256, storageKeyFor } from '@/lib/storage'
import { PLACEHOLDER_SCAN, makeApplication, makeBroker, makeUser } from '../support/fixtures'
import type { Application, User } from '@prisma/client'

/**
 * Phase 11 — object-level authorisation on documents.
 *
 * The rule being tested is not "government roles can see documents". It is §4's
 * table: which *post* holds which *file*, at which stage. Before this, one role
 * check stood in for all of it, and a clerk with no connection to a case could
 * open the applicant's identity card.
 *
 * Every case below is a row of that table.
 */

async function documentOn(application: Application, uploader: User) {
  const hash = sha256(PLACEHOLDER_SCAN)
  await putDocument({
    bytes: PLACEHOLDER_SCAN,
    mimeType: 'image/png',
    originalFilename: 'id.png',
  })
  return db.document.create({
    data: {
      kind: 'APPLICANT_UPLOAD',
      checklistItemKey: 'NATIONAL_ID',
      applicationId: application.id,
      sha256: hash,
      storageKey: storageKeyFor(hash),
      sizeBytes: PLACEHOLDER_SCAN.byteLength,
      mimeType: 'image/png',
      originalFilename: 'id.png',
      uploadedByUserId: uploader.id,
    },
  })
}

function sessionFor(user: User) {
  return { userId: user.id, role: user.role, brokerEntityId: user.brokerEntityId }
}

describe('the supervised population', () => {
  it('opens its own firm’s documents and nobody else’s', async () => {
    const mine = await makeBroker()
    const theirs = await makeBroker()

    const application = await makeApplication({
      brokerEntityId: mine.entity.id,
      status: 'UNDER_EXAMINATION',
    })
    const document = await documentOn(application, mine.user)
    const loaded = await loadDocumentForAccess(document.id)

    expect(await canOpenDocument(sessionFor(mine.user), loaded!)).toMatchObject({
      allowed: true,
      basis: 'OWN_FIRM',
    })
    expect((await canOpenDocument(sessionFor(theirs.user), loaded!)).allowed).toBe(false)
  })
})

describe('the roles §4 answers directly', () => {
  it('refuses SYSTEM_ADMIN — administration is not access', async () => {
    const broker = await makeBroker()
    const application = await makeApplication({ brokerEntityId: broker.entity.id, status: 'SUBMITTED' })
    const document = await documentOn(application, broker.user)
    const loaded = await loadDocumentForAccess(document.id)

    const admin = await makeUser({ role: 'SYSTEM_ADMIN' })
    const decision = await canOpenDocument(sessionFor(admin), loaded!)

    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reason).toContain('Administration is not access')
      expect(decision.reasonAr).toBeTruthy()
    }
  })

  it('refuses ANALYST — the role explicitly cannot see document contents', async () => {
    const broker = await makeBroker()
    const application = await makeApplication({ brokerEntityId: broker.entity.id, status: 'ACTIVE' })
    const document = await documentOn(application, broker.user)
    const loaded = await loadDocumentForAccess(document.id)

    const analyst = await makeUser({ role: 'ANALYST' })
    expect((await canOpenDocument(sessionFor(analyst), loaded!)).allowed).toBe(false)
  })

  it('allows AUDITOR everywhere — oversight that can be excluded is not oversight', async () => {
    const broker = await makeBroker()
    const application = await makeApplication({ brokerEntityId: broker.entity.id, status: 'DRAFT' })
    const document = await documentOn(application, broker.user)
    const loaded = await loadDocumentForAccess(document.id)

    const auditor = await makeUser({ role: 'AUDITOR' })
    expect(await canOpenDocument(sessionFor(auditor), loaded!)).toMatchObject({
      allowed: true,
      basis: 'AUDIT_OVERSIGHT',
    })
  })
})

describe('an examiner', () => {
  it('opens the file assigned to them and not a colleague’s', async () => {
    const broker = await makeBroker()
    const assigned = await makeUser({ role: 'EXAMINER' })
    const stranger = await makeUser({ role: 'EXAMINER' })

    const application = await makeApplication({
      brokerEntityId: broker.entity.id,
      status: 'UNDER_EXAMINATION',
      examinerId: assigned.id,
    })
    const document = await documentOn(application, broker.user)
    const loaded = await loadDocumentForAccess(document.id)

    expect(await canOpenDocument(sessionFor(assigned), loaded!)).toMatchObject({
      allowed: true,
      basis: 'ASSIGNED_EXAMINER',
    })

    // The case that used to succeed. This is the finding.
    const refused = await canOpenDocument(sessionFor(stranger), loaded!)
    expect(refused.allowed).toBe(false)
    if (!refused.allowed) expect(refused.reason).toContain('not assigned to you')
  })
})

describe('a reviewer', () => {
  it('opens a file at review, and still opens one they examined — reading is not the restricted act', async () => {
    const broker = await makeBroker()
    const reviewer = await makeUser({ role: 'REVIEWER' })
    const examinerWhoAlsoReviews = await makeUser({ role: 'REVIEWER' })

    const clean = await makeApplication({
      brokerEntityId: broker.entity.id,
      status: 'UNDER_REVIEW',
      examinerId: (await makeUser({ role: 'EXAMINER' })).id,
    })
    const conflicted = await makeApplication({
      brokerEntityId: broker.entity.id,
      status: 'UNDER_REVIEW',
      examinerId: examinerWhoAlsoReviews.id,
    })

    const cleanDoc = await loadDocumentForAccess((await documentOn(clean, broker.user)).id)
    const conflictedDoc = await loadDocumentForAccess((await documentOn(conflicted, broker.user)).id)

    expect((await canOpenDocument(sessionFor(reviewer), cleanDoc!)).allowed).toBe(true)

    // REQ-REG-052 restricts the *decision*, not the reading. The officer who
    // examined this file wrote the examination from these very documents, and
    // denying them sight of it would break the step rather than control it.
    // `transition()` is where their decision on this file is refused, under a
    // row lock, and the assignment suite proves that.
    expect(await canOpenDocument(sessionFor(examinerWhoAlsoReviews), conflictedDoc!)).toMatchObject({
      allowed: true,
      basis: 'ASSIGNED_EXAMINER',
    })
  })
})

describe('a registry clerk', () => {
  it('opens files at intake and not files that have moved past them', async () => {
    const broker = await makeBroker()
    const clerk = await makeUser({ role: 'REGISTRY_CLERK' })

    const atIntake = await makeApplication({ brokerEntityId: broker.entity.id, status: 'SUBMITTED' })
    const movedOn = await makeApplication({
      brokerEntityId: broker.entity.id,
      status: 'UNDER_EXAMINATION',
      examinerId: (await makeUser({ role: 'EXAMINER' })).id,
    })

    const atIntakeDoc = await loadDocumentForAccess((await documentOn(atIntake, broker.user)).id)
    const movedOnDoc = await loadDocumentForAccess((await documentOn(movedOn, broker.user)).id)

    expect((await canOpenDocument(sessionFor(clerk), atIntakeDoc!)).allowed).toBe(true)
    expect((await canOpenDocument(sessionFor(clerk), movedOnDoc!)).allowed).toBe(false)
  })

  it('keeps access to a file it took in, after the file has moved on', async () => {
    const broker = await makeBroker()
    const clerk = await makeUser({ role: 'REGISTRY_CLERK' })

    const application = await makeApplication({
      brokerEntityId: broker.entity.id,
      status: 'UNDER_EXAMINATION',
      examinerId: (await makeUser({ role: 'EXAMINER' })).id,
    })
    await db.application.update({
      where: { id: application.id },
      data: { intakeClerkId: clerk.id },
    })

    const loaded = await loadDocumentForAccess((await documentOn(application, broker.user)).id)
    expect(await canOpenDocument(sessionFor(clerk), loaded!)).toMatchObject({
      allowed: true,
      basis: 'INTAKE_CLERK',
    })
  })
})

describe('supervision', () => {
  it('reaches registered brokers and not applications that never produced a registration', async () => {
    const supervisor = await makeUser({ role: 'AML_SUPERVISOR' })

    const unregistered = await makeBroker()
    const unregisteredApp = await makeApplication({
      brokerEntityId: unregistered.entity.id,
      status: 'UNDER_EXAMINATION',
      examinerId: (await makeUser({ role: 'EXAMINER' })).id,
    })
    const unregisteredDoc = await loadDocumentForAccess(
      (await documentOn(unregisteredApp, unregistered.user)).id,
    )
    expect((await canOpenDocument(sessionFor(supervisor), unregisteredDoc!)).allowed).toBe(false)

    const registered = await makeBroker()
    await db.registration.create({
      data: {
        brokerEntityId: registered.entity.id,
        registrationNumber: `TEST/${Date.now()}`,
        category: 'C',
        types: ['SELL'],
        paidUpCapital: 90_000,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2031-01-01'),
      },
    })
    const registeredApp = await makeApplication({
      brokerEntityId: registered.entity.id,
      status: 'UNDER_EXAMINATION',
      examinerId: (await makeUser({ role: 'EXAMINER' })).id,
    })
    const registeredDoc = await loadDocumentForAccess(
      (await documentOn(registeredApp, registered.user)).id,
    )
    expect(await canOpenDocument(sessionFor(supervisor), registeredDoc!)).toMatchObject({
      allowed: true,
      basis: 'SUPERVISED_ENTITY',
    })
  })
})
