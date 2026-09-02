import { recordReadAccess } from '@/lib/audit'
import { roleLabel } from '@/lib/auth/roles'
import { requireSession } from '@/lib/auth/session'
import { canOpenDocument, loadDocumentForAccess } from '@/lib/documents/access'
import { sha256, storage } from '@/lib/storage'

/**
 * Serving a document.
 *
 * Four things happen here that would each be easy to leave out, and each one is
 * a requirement rather than a nicety.
 *
 * **Authorisation is per document, not per role.** `canOpenDocument` decides,
 * and src/lib/documents/access.ts explains why that is a separate module: this
 * route previously asked only "does this role see case data at all?", which
 * meant any officer could open any file in the register. §4's table says which
 * *post* holds which *file*, and that is now what is enforced.
 *
 * **The read is audited.** REQ-DPA-002: "logging of read access, not only
 * writes." Who viewed an applicant's identity card is as sensitive as who
 * changed it, and 00-VISION §5 computes signals from read patterns. The event
 * records the basis the access was granted on, not merely that it was.
 *
 * **The bytes are re-verified against the key they are filed under.** The
 * storage key is the SHA-256 of the content, so a mismatch means the archive
 * has been altered underneath the register. This comment used to say so while
 * the code did not do it — the check is now here, and there is a test that
 * corrupts an object and watches this route refuse it.
 *
 * **The file is served inline, not downloaded.** The examiner's screen shows
 * documents beside the data they are checking; a browser that saves the file to
 * disk instead has broken the comparison the screen exists for.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let session
  try {
    session = await requireSession()
  } catch {
    return new Response('Not authenticated.', { status: 401 })
  }

  const document = await loadDocumentForAccess(id)
  if (!document) return new Response('Not found.', { status: 404 })

  const decision = await canOpenDocument(session, document)

  if (!decision.allowed) {
    // The refusal is audited too. An officer trying files that are not theirs
    // is exactly the pattern 00-VISION §5 wants visible, and a refusal that
    // leaves no trace is a refusal nobody can count.
    await recordReadAccess({
      action: 'DOCUMENT_ACCESS_REFUSED',
      entityType: 'Document',
      entityId: document.id,
      actorUserId: session.userId,
      actorRole: session.role,
      actorLabel: `${session.name} (${roleLabel(session.role).en})`,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      payload: { applicationId: document.applicationId, reason: decision.reason },
    })

    return new Response(`${decision.reason}\n${decision.reasonAr}`, {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const bytes = await storage().get(document.storageKey)
  if (!bytes) {
    return new Response('The stored object for this document could not be read.', { status: 410 })
  }

  // The integrity check the comment above has always promised. Content
  // addressing makes it a re-hash and a comparison, and the failure is a
  // finding rather than a fault: the register is saying the archive no longer
  // matches what it recorded, which somebody has to look at.
  const actualHash = sha256(bytes)
  if (actualHash !== document.sha256) {
    await recordReadAccess({
      action: 'DOCUMENT_INTEGRITY_FAILED',
      entityType: 'Document',
      entityId: document.id,
      actorUserId: session.userId,
      actorRole: session.role,
      actorLabel: `${session.name} (${roleLabel(session.role).en})`,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      payload: {
        applicationId: document.applicationId,
        recordedSha256: document.sha256,
        actualSha256: actualHash,
        storageKey: document.storageKey,
      },
    })

    return new Response(
      [
        'This document cannot be served.',
        'The stored bytes no longer hash to the value recorded when it was received, which means the archived object has changed since. It has not been shown to you, and nothing has been altered.',
        'Report this to the Central Administration for Commercial Registrations at GOEIC, quoting the document reference.',
        '',
        'تعذّر عرض هذا المستند.',
        'البصمة الرقمية للملف المخزَّن لا تطابق البصمة المسجَّلة عند استلامه، ما يعني أن الملف المؤرشف قد تغيّر. لم يُعرض عليك ولم يُعدَّل شيء.',
        'أبلغ الإدارة المركزية للسجلات التجارية بالهيئة، مع ذكر مرجع المستند.',
      ].join('\n'),
      { status: 409, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    )
  }

  await recordReadAccess({
    action: 'DOCUMENT_VIEWED',
    entityType: 'Document',
    entityId: document.id,
    actorUserId: session.userId,
    actorRole: session.role,
    actorLabel: `${session.name} (${roleLabel(session.role).en})`,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    payload: {
      applicationId: document.applicationId,
      checklistItemKey: document.checklistItemKey,
      sha256: document.sha256,
      // On what authority. See src/lib/documents/access.ts.
      accessBasis: decision.basis,
    },
  })

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': document.mimeType,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `inline; filename="${encodeURIComponent(document.originalFilename ?? `${document.sha256.slice(0, 12)}`)}"`,
      // A register's documents are never cached by an intermediary. The
      // authorisation above is per-request for a reason.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
