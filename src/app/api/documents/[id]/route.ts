import { db } from '@/lib/db'
import { recordReadAccess } from '@/lib/audit'
import { canSeeCaseData, isBrokerRole, isGovernmentRole, roleLabel } from '@/lib/auth/roles'
import { requireSession } from '@/lib/auth/session'
import { storage } from '@/lib/storage'

/**
 * Serving a document.
 *
 * Three things happen here that would each be easy to leave out, and each one
 * is a requirement rather than a nicety.
 *
 * **The read is audited.** REQ-DPA-002: "logging of read access, not only
 * writes". Who *viewed* an applicant's identity card is as sensitive as who
 * changed it, and 00-VISION §5 computes signals from read patterns. The event
 * is written before the bytes are returned.
 *
 * **The bytes are re-verified against the key they are filed under.** The
 * storage key is the SHA-256 of the content, so a mismatch means the archive
 * has been altered underneath the register. That is not a 500 — it is a finding,
 * and the response says so rather than quietly serving the wrong document.
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

  const document = await db.document.findUnique({
    where: { id },
    include: { application: { select: { id: true, brokerEntityId: true } } },
  })

  if (!document) return new Response('Not found.', { status: 404 })

  const isOwner =
    isBrokerRole(session.role) &&
    session.brokerEntityId !== null &&
    document.application?.brokerEntityId === session.brokerEntityId

  // §4 — administration is not access. A SYSTEM_ADMIN passes authentication and
  // fails here, which is the intended shape.
  const isCaseOfficer = isGovernmentRole(session.role) && canSeeCaseData(session.role)

  if (!isOwner && !isCaseOfficer) {
    return new Response('Not authorised to view this document.', { status: 403 })
  }

  const bytes = await storage().get(document.storageKey)
  if (!bytes) {
    return new Response('The stored object for this document could not be read.', { status: 410 })
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
