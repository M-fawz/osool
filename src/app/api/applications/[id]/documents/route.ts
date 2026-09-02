import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { BROKER_ROLES } from '@/lib/auth/roles'
import { requireRole } from '@/lib/auth/session'
import { receiveApplicationDocument } from '@/lib/applications/documents'
import { notYourApplication, precondition } from '@/lib/applications/refusals'
import { uploadRequestCeilingMb } from '@/lib/env'
import { callerAddress, consume, tooManyRequests } from '@/lib/security/rate-limit'
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

  /*
   * Counted per signed-in user, not per address.
   *
   * The opposite of the sign-in route's choice, and for the opposite reason:
   * here the caller has already proved who they are, so counting the account is
   * both more accurate and immune to being shared with a whole office behind
   * one NAT address. The budget is wide — a complete application is a dozen
   * scans and a resubmission is a few more — and what it stops is a loop
   * filling object storage.
   */
  const limit = await consume('document-upload', session.userId)
  if (!limit.allowed) return tooManyRequests(limit, 'document-upload')
  void callerAddress

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

  /*
   * Refuse an oversized upload before reading it into memory.
   *
   * `receiveApplicationDocument` checks the size too, against the per-document
   * limit in the DOC_CHECKLIST rule set — which is the regulatory limit and the
   * one that produces a proper four-part refusal. But it can only check a
   * buffer, and getting one means `arrayBuffer()` has already pulled the entire
   * file into the function's memory. A caller posting a 500 MB body would be
   * refused *after* the process had allocated 500 MB for it.
   *
   * `File.size` is known from the multipart headers without reading the body,
   * so this is the cheap outer guard: the platform's own ceiling, refused
   * before allocation. The regulatory limit stays where it belongs.
   */
  const ceilingBytes = Math.ceil(uploadRequestCeilingMb * 1024 * 1024)
  if (file.size > ceilingBytes) {
    return refusalResponse(
      precondition({
        code: 'UPLOAD_EXCEEDS_REQUEST_CEILING',
        requirementIds: ['REQ-REG-030'],
        legalSource: 'Platform limit, not a regulatory one — see docs/DEPLOYMENT.md',
        evidence: { sizeBytes: file.size, ceilingMb: uploadRequestCeilingMb },
        ar: {
          blocked: 'لم يُقبل رفع هذا الملف.',
          why: `حجم الملف ${(file.size / 1024 / 1024).toFixed(1)} ميجابايت، وهو أكبر مما يقبله النظام في الطلب الواحد (${uploadRequestCeilingMb} ميجابايت). هذا حدّ تقني وليس شرطاً قانونياً.`,
          nextStep:
            'صوّر المستند بدقة أقل، أو احفظه بصيغة PDF مضغوطة، أو ارفع كل صفحة على حدة، ثم أعد المحاولة.',
        },
        en: {
          blocked: 'This file was not accepted.',
          why: `It is ${(file.size / 1024 / 1024).toFixed(1)} MB, which is larger than this deployment accepts in one request (${uploadRequestCeilingMb} MB). This is a technical limit, not a regulatory one.`,
          nextStep:
            'Scan or photograph the document at a lower resolution, save it as a compressed PDF, or upload one page at a time, then try again.',
        },
      }),
      413,
    )
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
