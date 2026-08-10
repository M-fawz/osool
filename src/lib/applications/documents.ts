import type { PartyType } from '@prisma/client'
import { db } from '@/lib/db'
import { recordAuditEvent } from '@/lib/audit'
import { roleLabel } from '@/lib/auth/roles'
import { putDocument, sha256, storageKeyFor } from '@/lib/storage'
import { resolveDocumentChecklist } from '@/lib/rules/documents'
import type { RuleViolation } from '@/lib/rules/violation'
import { precondition } from './refusals'
import type { ActorContext } from './transition'

/**
 * Receiving a document.
 *
 * 02-SYSTEM-ARCHITECTURE §7: "Documents are immutable. On upload: content
 * hashed (SHA-256), size and MIME recorded, stored under a content-addressed
 * key. A 'replacement' creates a new version and supersedes the old one; it
 * never overwrites."
 *
 * So there is no update path here and no overwrite. Re-uploading the same
 * checklist item produces a *new row* pointing at the old one, and the old one
 * stays exactly where it was. A broker who photographs their commercial
 * register three times before the picture is legible leaves three rows, and the
 * examiner sees the third — but the Authority can still prove what the first
 * two were.
 *
 * What is accepted — types and size — comes from the DOC_CHECKLIST rule set for
 * the item being answered, never from a constant here. A decree that starts
 * accepting a new format is a configuration change.
 */

export interface ReceivedDocument {
  id: string
  sha256: string
  sizeBytes: number
  mimeType: string
  version: number
  supersedes: string | null
}

export type ReceiveResult =
  | { ok: true; document: ReceivedDocument }
  | { ok: false; violation: RuleViolation }

/**
 * The accepted types, restated as a human phrase.
 *
 * `image/jpeg, image/png, application/pdf` is a correct answer to the wrong
 * question. A broker holding a phone needs to be told "a photo or a PDF".
 */
function describeAccepted(mimeTypes: string[], locale: 'ar' | 'en'): string {
  const hasImage = mimeTypes.some((m) => m.startsWith('image/'))
  const hasPdf = mimeTypes.includes('application/pdf')

  if (hasImage && hasPdf) return locale === 'ar' ? 'صورة أو ملف PDF' : 'a photo or a PDF file'
  if (hasImage) return locale === 'ar' ? 'صورة' : 'a photo'
  return locale === 'ar' ? 'ملف PDF' : 'a PDF file'
}

export async function receiveApplicationDocument(input: {
  applicationId: string
  checklistItemKey: string
  bytes: Buffer
  mimeType: string
  originalFilename: string | null
  establishmentType: PartyType
  capacity: string | null
  actor: ActorContext
}): Promise<ReceiveResult> {
  const now = new Date()

  const checklist = await resolveDocumentChecklist(
    {
      establishmentType: input.establishmentType,
      capacity: (input.capacity ?? null) as never,
    },
    { asOf: now },
  )

  const item = checklist.items.find((i) => i.key === input.checklistItemKey)

  if (!item) {
    return {
      ok: false,
      violation: precondition({
        code: 'CHECKLIST_ITEM_NOT_APPLICABLE',
        requirementIds: ['REQ-REG-030'],
        legalSource: 'GOEIC form CR-CA-QR7--01; EMLCU CDD Procedures §§5.1–5.2',
        evidence: { checklistItemKey: input.checklistItemKey },
        ar: {
          blocked: 'لم يُقبل هذا الملف.',
          why: 'المستند المطلوب رفعه ليس ضمن المستندات المطلوبة لهذا النوع من الطلبات.',
          nextStep: 'ارجع إلى قائمة المستندات واختر أحد البنود المعروضة.',
        },
        en: {
          blocked: 'This file was not accepted.',
          why: 'The document you tried to upload is not one of those required for this kind of application.',
          nextStep: 'Return to the document list and choose one of the items shown.',
        },
      }),
    }
  }

  const accepted = item.payload.acceptedMimeTypes
  if (!accepted.includes(input.mimeType)) {
    return {
      ok: false,
      violation: precondition({
        code: 'DOCUMENT_TYPE_NOT_ACCEPTED',
        requirementIds: ['REQ-REG-030'],
        legalSource: item.payload.legalSource ?? 'DOC_CHECKLIST',
        evidence: { mimeType: input.mimeType, accepted },
        ar: {
          blocked: `لم يُقبل الملف المرفوع لبند «${item.payload.labelAr}».`,
          why: `النظام يقبل ${describeAccepted(accepted, 'ar')} لهذا البند فقط، والملف الذي اخترته من نوع آخر.`,
          nextStep: 'صوّر المستند بكاميرا الهاتف، أو ارفع ملف PDF إن كان متاحاً لديك.',
        },
        en: {
          blocked: `The file for "${item.payload.labelEn}" was not accepted.`,
          why: `This item accepts ${describeAccepted(accepted, 'en')} only, and the file you chose is a different type.`,
          nextStep: 'Photograph the document with your phone camera, or upload a PDF if you have one.',
        },
      }),
    }
  }

  const maxBytes = item.payload.maxSizeMb * 1024 * 1024
  if (input.bytes.byteLength > maxBytes) {
    const actualMb = (input.bytes.byteLength / (1024 * 1024)).toFixed(1)
    return {
      ok: false,
      violation: precondition({
        code: 'DOCUMENT_TOO_LARGE',
        requirementIds: ['REQ-REG-030'],
        legalSource: item.payload.legalSource ?? 'DOC_CHECKLIST',
        evidence: { sizeBytes: input.bytes.byteLength, maxSizeMb: item.payload.maxSizeMb },
        ar: {
          blocked: `لم يُقبل الملف المرفوع لبند «${item.payload.labelAr}».`,
          why: `حجم الملف ${actualMb} ميجابايت، والحد الأقصى لهذا البند ${item.payload.maxSizeMb} ميجابايت.`,
          nextStep:
            'أعد التصوير بجودة أقل من إعدادات الكاميرا، أو صوّر صفحة واحدة في كل مرة بدلاً من المستند كاملاً.',
        },
        en: {
          blocked: `The file for "${item.payload.labelEn}" was not accepted.`,
          why: `It is ${actualMb} MB, and the limit for this item is ${item.payload.maxSizeMb} MB.`,
          nextStep:
            'Retake the photo at a lower quality in your camera settings, or photograph one page at a time.',
        },
      }),
    }
  }

  if (input.bytes.byteLength === 0) {
    return {
      ok: false,
      violation: precondition({
        code: 'DOCUMENT_EMPTY',
        requirementIds: ['REQ-REG-030'],
        legalSource: item.payload.legalSource ?? 'DOC_CHECKLIST',
        ar: {
          blocked: `لم يُقبل الملف المرفوع لبند «${item.payload.labelAr}».`,
          why: 'الملف فارغ — لم تصل أي بيانات منه.',
          nextStep: 'أعد المحاولة. إذا كنت تصوّر بالكاميرا، تأكد من حفظ الصورة قبل الرفع.',
        },
        en: {
          blocked: `The file for "${item.payload.labelEn}" was not accepted.`,
          why: 'The file is empty — no data arrived.',
          nextStep: 'Try again. If you are using the camera, make sure the photo saved before uploading.',
        },
      }),
    }
  }

  const hash = sha256(input.bytes)
  const key = storageKeyFor(hash)

  // Content-addressed, so identical bytes are stored once however many
  // applications reference them. The write is idempotent by construction.
  await putDocument({
    bytes: input.bytes,
    mimeType: input.mimeType,
    originalFilename: input.originalFilename,
  })

  const document = await db.$transaction(async (tx) => {
    const previous = await tx.document.findFirst({
      where: {
        applicationId: input.applicationId,
        checklistItemKey: input.checklistItemKey,
        kind: 'APPLICANT_UPLOAD',
        archivedAt: null,
        supersededBy: { is: null },
      },
      orderBy: { version: 'desc' },
    })

    const created = await tx.document.create({
      data: {
        kind: 'APPLICANT_UPLOAD',
        checklistItemKey: input.checklistItemKey,
        applicationId: input.applicationId,
        sha256: hash,
        storageKey: key,
        sizeBytes: input.bytes.byteLength,
        mimeType: input.mimeType,
        originalFilename: input.originalFilename,
        uploadedByUserId: input.actor.userId,
        version: (previous?.version ?? 0) + 1,
        supersedesDocumentId: previous?.id ?? null,
      },
    })

    await recordAuditEvent(
      {
        action: previous ? 'DOCUMENT_SUPERSEDED' : 'DOCUMENT_UPLOADED',
        entityType: 'Document',
        entityId: created.id,
        actorUserId: input.actor.userId,
        actorRole: input.actor.role,
        actorLabel: `${input.actor.name} (${roleLabel(input.actor.role).en})`,
        ipAddress: input.actor.ipAddress,
        userAgent: input.actor.userAgent,
        reason: previous
          ? `Replaced version ${previous.version} of ${input.checklistItemKey}. The earlier version is retained.`
          : null,
        // The hash, not the content. The trail evidences which bytes were
        // received; it is not a second copy of the document.
        payload: {
          applicationId: input.applicationId,
          checklistItemKey: input.checklistItemKey,
          sha256: hash,
          sizeBytes: input.bytes.byteLength,
          mimeType: input.mimeType,
          version: created.version,
          supersedesDocumentId: previous?.id ?? null,
        },
      },
      tx,
    )

    return created
  })

  return {
    ok: true,
    document: {
      id: document.id,
      sha256: document.sha256,
      sizeBytes: document.sizeBytes,
      mimeType: document.mimeType,
      version: document.version,
      supersedes: document.supersedesDocumentId,
    },
  }
}
