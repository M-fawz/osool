import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { BROKER_ROLES } from '@/lib/auth/roles'
import { requireRole } from '@/lib/auth/session'
import { receiveApplicationDocument } from '@/lib/applications/documents'
import { notYourApplication, precondition } from '@/lib/applications/refusals'
import type { RuleViolation } from '@/lib/rules/violation'

/**
 * Document upload.
 *
 * A Route Handler rather than a Server Action, for one reason: Server Actions
 * carry a 1 MB request body by default, and a photograph of a commercial
 * register taken on a mid-range Android phone is routinely six. Raising the
 * limit globally would raise it for every action in the product; a route that
 * streams multipart form data is the narrower answer, and it is what
 * 02-SYSTEM-ARCHITECTURE §2 reserves Route Handlers for — "things that are
 * genuinely HTTP: file upload streaming".
 *
 * Authorisation is the same as everywhere else and is not weakened by being
 * here: broker role, own firm's application, application still editable.
 */

const EDITABLE_STATES = new Set(['DRAFT', 'AWAITING_COMPLETION'])

function refusalResponse(violation: RuleViolation, status: number) {
  return NextResponse.json({ ok: false, violation }, { status })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: applicationId } = await params

  let session
  try {
    session = await requireRole(BROKER_ROLES)
  } catch {
    return NextResponse.json({ ok: false, code: 'UNAUTHENTICATED' }, { status: 401 })
  }

  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: { entityData: { select: { establishmentType: true } } },
  })

  if (
    !application ||
    !session.brokerEntityId ||
    application.brokerEntityId !== session.brokerEntityId
  ) {
    return refusalResponse(notYourApplication(), 403)
  }

  if (!EDITABLE_STATES.has(application.status)) {
    return refusalResponse(
      precondition({
        code: 'APPLICATION_NOT_EDITABLE',
        requirementIds: ['REQ-REG-050'],
        legalSource: 'GOEIC workflow, REQ-REG-050',
        evidence: { status: application.status },
        ar: {
          blocked: 'لم يُقبل رفع المستند.',
          why: 'الطلب قيد النظر لدى الهيئة، ولا تُقبل مستندات جديدة أثناء الفحص.',
          nextStep: 'انتظر نتيجة الفحص، أو ارفع المستند عند طلب الهيئة استيفاءً.',
        },
        en: {
          blocked: 'The document was not accepted.',
          why: 'The application is with the Authority, and new documents are not accepted during examination.',
          nextStep: 'Wait for the outcome, or upload it when the Authority requests a completion.',
        },
      }),
      409,
    )
  }

  const form = await request.formData()
  const file = form.get('file')
  const checklistItemKey = String(form.get('checklistItemKey') ?? '')

  if (!(file instanceof File) || !checklistItemKey) {
    return NextResponse.json({ ok: false, code: 'MALFORMED_UPLOAD' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  const result = await receiveApplicationDocument({
    applicationId: application.id,
    checklistItemKey,
    bytes,
    // The browser's type, but the checklist decides whether it is acceptable —
    // and the stored key is the hash of the bytes, so a mislabelled file is
    // still filed under what it actually is.
    mimeType: file.type || 'application/octet-stream',
    originalFilename: file.name || null,
    establishmentType: application.entityData?.establishmentType ?? 'NATURAL_PERSON',
    capacity: application.applicantCapacity,
    actor: {
      userId: session.userId,
      role: session.role,
      name: session.name,
      brokerEntityId: session.brokerEntityId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
    },
  })

  if (!result.ok) return refusalResponse(result.violation, 422)

  return NextResponse.json({ ok: true, document: result.document })
}
