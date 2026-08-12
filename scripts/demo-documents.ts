/**
 * Generate the demonstration documents a broker needs to complete an
 * application, without anyone having to hand over a real one.
 *
 *   npx tsx scripts/demo-documents.ts
 *
 * Writes one A4 PDF per DOC_CHECKLIST item into `docs/demo-documents/`.
 *
 * ── What these are, and what they are emphatically not ─────────────────────
 *
 * Every page carries a diagonal watermark and a banner, in Arabic and English,
 * saying it is demonstration data and not a real government document. The
 * content is invented: the names are fictional, the numbers follow the shape of
 * a real reference without being one, and no seal, emblem, signature or issuing
 * authority is depicted. Nothing here should be capable of being mistaken for
 * an official paper by anyone who looks at it, and that is the design goal —
 * these exist so the workflow can be exercised end to end, not so that a
 * document can be faked.
 *
 * They are rendered through the product's own Chromium pipeline rather than
 * written as text files, for the reason src/lib/pdf/render.ts explains at
 * length: it is the only way the Arabic comes out shaped and ordered correctly.
 * A demonstration whose documents show reversed isolated letters demonstrates
 * the wrong thing.
 *
 * The checklist is read from the DOC_CHECKLIST rule set, not from a list in
 * this file, so a checklist item added tomorrow gets a demo document without
 * anyone remembering to add one.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveDocumentChecklist } from '@/lib/rules/documents'
import { closePdfBrowser, renderPdf, renderPng } from '@/lib/pdf/render'

const OUT = join(process.cwd(), 'docs', 'demo-documents')
const PROOF = join(process.cwd(), '.proof', 'demo-documents')

/**
 * The invented content, per checklist key.
 *
 * Deliberately consistent with `scripts/lib/demo-data.ts` and with
 * docs/TEST_DATA_GUIDE.md: a demonstration in which the tax number on the card
 * differs from the tax number typed into the form is a demonstration that
 * teaches the audience the system does not check anything.
 */
const CONTENT: Record<string, { titleAr: string; titleEn: string; rows: Array<[string, string]> }> = {
  IDENTITY_DOC_APPLICANT: {
    titleAr: 'بطاقة الرقم القومي — نموذج تجريبي',
    titleEn: 'National identity card — demonstration specimen',
    rows: [
      ['الاسم', 'محمود عبد الرحمن حسن'],
      ['الرقم القومي', '28001011201234'],
      ['تاريخ الميلاد', '01/01/1980'],
      ['محل الميلاد', 'القاهرة'],
      ['الجنسية', 'مصري'],
      ['تاريخ انتهاء الصلاحية', '31/12/2030'],
    ],
  },
  OWNER_IDENTITY_DOC: {
    titleAr: 'بطاقة هوية صاحب المنشأة الفردية — نموذج تجريبي',
    titleEn: 'Sole establishment owner identity — demonstration specimen',
    rows: [
      ['الاسم', 'محمود عبد الرحمن حسن'],
      ['الرقم القومي', '28001011201234'],
      ['الصفة', 'صاحب المنشأة الفردية'],
      ['الجنسية', 'مصري'],
    ],
  },
  COMMERCIAL_REGISTER_EXTRACT: {
    titleAr: 'مستخرج السجل التجاري — نموذج تجريبي',
    titleEn: 'Commercial Register extract — demonstration specimen',
    rows: [
      ['الاسم التجاري', 'مؤسسة أصول التجريبية للوساطة العقارية'],
      ['رقم السجل التجاري', '123456'],
      ['مكتب السجل التجاري', 'القاهرة'],
      ['تاريخ القيد', '15/03/2022'],
      ['تاريخ آخر تجديد', '15/03/2027'],
      ['الشكل القانوني', 'منشأة فردية'],
      ['النشاط', 'الوساطة في بيع وشراء وتأجير العقارات'],
      ['العنوان', '١٢ شارع التجربة، المعادي، القاهرة'],
    ],
  },
  TAX_REGISTRATION_CARD: {
    titleAr: 'البطاقة الضريبية — نموذج تجريبي',
    titleEn: 'Tax registration card — demonstration specimen',
    rows: [
      ['اسم الممول', 'مؤسسة أصول التجريبية للوساطة العقارية'],
      ['الرقم الضريبي', '555-123-456'],
      ['المأمورية المختصة', 'مأمورية ضرائب المعادي'],
      ['تاريخ التسجيل', '20/03/2022'],
      ['النشاط', 'وساطة عقارية'],
    ],
  },
  PROOF_OF_PAID_UP_CAPITAL: {
    titleAr: 'شهادة رأس المال المدفوع — نموذج تجريبي',
    titleEn: 'Paid-up capital certificate — demonstration specimen',
    rows: [
      ['اسم المنشأة', 'مؤسسة أصول التجريبية للوساطة العقارية'],
      ['رأس المال المدفوع', '250,000 ج.م'],
      ['بالحروف', 'مائتان وخمسون ألف جنيه مصري لا غير'],
      ['تاريخ الإيداع', '01/02/2026'],
      ['ملاحظة', 'هذا المبلغ يجب أن يطابق ما أُدخل في خطوة «النوع والفئة»'],
    ],
  },
  PREMISES_PROOF: {
    titleAr: 'عقد إيجار مقر مزاولة النشاط — نموذج تجريبي',
    titleEn: 'Lease of business premises — demonstration specimen',
    rows: [
      ['المستأجر', 'مؤسسة أصول التجريبية للوساطة العقارية'],
      ['العنوان', '١٢ شارع التجربة، المعادي، القاهرة'],
      ['المساحة', '٩٠ م٢'],
      ['مدة العقد', 'من 01/01/2026 إلى 31/12/2028'],
      ['القيمة الإيجارية السنوية', '120,000 ج.م'],
      ['الغرض', 'مزاولة نشاط الوساطة العقارية'],
    ],
  },
  CRIMINAL_RECORD_EXTRACT: {
    titleAr: 'صحيفة الحالة الجنائية — نموذج تجريبي',
    titleEn: 'Criminal record extract — demonstration specimen',
    rows: [
      ['الاسم', 'محمود عبد الرحمن حسن'],
      ['الرقم القومي', '28001011201234'],
      ['البيان', 'خالٍ من السوابق — بيان تجريبي لا يصدر عن أي جهة'],
      ['تاريخ الإصدار', '01/08/2026'],
      ['الإقرار المرتبط', 'DECL-03'],
    ],
  },
  ARTICLES_OF_ASSOCIATION: {
    titleAr: 'عقد التأسيس والنظام الأساسي — نموذج تجريبي',
    titleEn: 'Memorandum and articles of association — demonstration specimen',
    rows: [
      ['اسم الشركة', 'شركة أصول التجريبية للوساطة العقارية ش.م.م'],
      ['الشكل القانوني', 'شركة ذات مسؤولية محدودة'],
      ['رأس المال', '250,000 ج.م'],
      ['الغرض', 'الوساطة في بيع وشراء وتأجير العقارات'],
      ['تاريخ التأسيس', '15/03/2022'],
      ['المدة', 'خمسة وعشرون عاماً'],
    ],
  },
  REPRESENTATION_AUTHORISATION: {
    titleAr: 'قرار تفويض من يمثل الشركة — نموذج تجريبي',
    titleEn: 'Authorisation to represent the company — demonstration specimen',
    rows: [
      ['الشركة', 'شركة أصول التجريبية للوساطة العقارية ش.م.م'],
      ['المفوَّض', 'محمود عبد الرحمن حسن'],
      ['الصفة', 'المدير المسؤول'],
      ['نطاق التفويض', 'التقدم بطلب القيد أمام الهيئة والتوقيع على مستنداته'],
      ['تاريخ القرار', '10/01/2026'],
    ],
  },
  BENEFICIAL_OWNER_IDENTITY_DOCS: {
    titleAr: 'وثائق هوية المستفيدين الحقيقيين — نموذج تجريبي',
    titleEn: 'Beneficial owner identity documents — demonstration specimen',
    rows: [
      ['المستفيد الأول', 'محمود عبد الرحمن حسن — الرقم القومي 28001011201234 — حصة ٦٠٪'],
      ['المستفيد الثاني', 'سلمى فؤاد إبراهيم — الرقم القومي 29505052203456 — حصة ٤٠٪'],
      ['أساس التحديد', 'ملكية حصص سيطرة تبلغ ٢٥٪ فأكثر'],
    ],
  },
  SIGNATURE_SPECIMENS: {
    titleAr: 'نماذج التوقيعات المعتمدة — نموذج تجريبي',
    titleEn: 'Authorised signature specimens — demonstration specimen',
    rows: [
      ['الشركة', 'شركة أصول التجريبية للوساطة العقارية ش.م.م'],
      ['المخوَّل الأول', 'محمود عبد الرحمن حسن — منفرداً'],
      ['المخوَّل الثاني', 'سلمى فؤاد إبراهيم — مجتمعة مع الأول'],
      ['ملاحظة', 'لا يحمل هذا النموذج توقيعات فعلية'],
    ],
  },
  PRELIMINARY_CONTRACT_UNDER_FORMATION: {
    titleAr: 'العقد الابتدائي لشركة تحت التأسيس — نموذج تجريبي',
    titleEn: 'Preliminary contract, company under formation — demonstration specimen',
    rows: [
      ['الشركة تحت التأسيس', 'شركة أصول التجريبية للوساطة العقارية ش.م.م'],
      ['المؤسس الأول', 'محمود عبد الرحمن حسن — حصة ٦٠٪'],
      ['المؤسس الثاني', 'سلمى فؤاد إبراهيم — حصة ٤٠٪'],
      ['وكيل المؤسسين', 'محمود عبد الرحمن حسن — توكيل رقم 4321 لسنة 2026'],
      ['تاريخ العقد', '05/01/2026'],
    ],
  },
  POWER_OF_ATTORNEY: {
    titleAr: 'توكيل رسمي عام — نموذج تجريبي',
    titleEn: 'Official general power of attorney — demonstration specimen',
    rows: [
      ['الموكِّل', 'سلمى فؤاد إبراهيم'],
      ['الوكيل', 'محمود عبد الرحمن حسن'],
      ['رقم التوكيل', '4321'],
      ['سنة التوكيل', '2026'],
      ['مكتب التوثيق', 'مكتب توثيق المعادي'],
      ['تاريخ التوثيق', '10/01/2026'],
      ['نطاق التوكيل', 'التقدم بطلبات القيد أمام الهيئة والتوقيع على مستنداتها'],
    ],
  },
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Latin runs isolated, or `2026/1183` prints as `1183/2026` inside Arabic. */
const LATIN_RUN = /([A-Za-z0-9][A-Za-z0-9\s.,/%-]*)/g
const isolateLatin = (s: string) =>
  esc(s).replace(LATIN_RUN, '<span style="unicode-bidi:isolate;direction:ltr">$1</span>')

function documentHtml(input: {
  titleAr: string
  titleEn: string
  rows: Array<[string, string]>
  keyLabel: string
}): string {
  const rows = input.rows
    .map(
      ([label, value]) => `
      <tr>
        <th>${esc(label)}</th>
        <td>${isolateLatin(value)}</td>
      </tr>`,
    )
    .join('')

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<!--FONTS-->
<style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'Plex Arabic', 'Plex Latin', sans-serif;
    color: #1b2028;
    position: relative;
  }
  .banner {
    border: 2px solid #b3261e;
    background: #fdeceb;
    color: #b3261e;
    padding: 10px 14px;
    font-weight: 700;
    font-size: 12pt;
    line-height: 1.5;
    text-align: center;
  }
  .banner .en { display: block; font-size: 10pt; direction: ltr; unicode-bidi: isolate; }
  h1 { font-size: 17pt; margin: 22px 0 2px; }
  h2 { font-size: 11pt; font-weight: 500; color: #5a6270; margin: 0 0 18px;
       direction: ltr; unicode-bidi: isolate; text-align: right; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d6dae1; padding: 9px 12px; font-size: 11pt; vertical-align: top; }
  th { width: 34%; background: #f4f6f8; font-weight: 600; text-align: start; color: #3a4150; }
  .foot { margin-top: 26px; border-top: 1px solid #d6dae1; padding-top: 12px;
          font-size: 9pt; color: #6b7280; line-height: 1.7; }
  .foot .en { display: block; direction: ltr; unicode-bidi: isolate; text-align: left; }
  /* The watermark. Fixed so it repeats on every printed page, and behind the
     content so the page stays readable while being unmistakably marked. */
  .mark {
    position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
    transform: rotate(-32deg); pointer-events: none; z-index: -1;
  }
  .mark span {
    font-size: 44pt; font-weight: 700; color: #b3261e; opacity: 0.13;
    white-space: nowrap; letter-spacing: 2px; direction: ltr;
  }
</style>
</head>
<body>
  <div class="mark"><span>DEMO — NOT A REAL DOCUMENT</span></div>

  <div class="banner">
    بيانات تجريبية — هذا ليس مستنداً حكومياً حقيقياً
    <span class="en">DEMO / TEST DATA — NOT A REAL GOVERNMENT DOCUMENT</span>
  </div>

  <h1>${esc(input.titleAr)}</h1>
  <h2>${esc(input.titleEn)}</h2>

  <table>${rows}</table>

  <div class="foot">
    <p>
      أُنشئ هذا الملف آلياً لاختبار منصة أصول. البيانات الواردة به متخيَّلة بالكامل،
      ولا يحمل شعاراً ولا خاتماً ولا توقيعاً، ولا يصدر عن أي جهة حكومية، ولا يصلح
      للاستعمال في أي غرض رسمي.
    </p>
    <span class="en">
      Generated automatically to exercise the Osool platform. All content is fictional. It carries
      no emblem, seal or signature, is issued by no authority, and is not valid for any official
      purpose. Checklist item: ${esc(input.keyLabel)}.
    </span>
  </div>
</body>
</html>`
}

async function main() {
  await mkdir(OUT, { recursive: true })

  // Both applicant kinds and the agent capacity, so every item in the rule set
  // is covered whichever route the demonstration takes.
  const [natural, legal] = await Promise.all([
    resolveDocumentChecklist(
      { establishmentType: 'NATURAL_PERSON', capacity: 'AGENT_UNDER_POA' },
      { asOf: new Date() },
    ),
    resolveDocumentChecklist(
      { establishmentType: 'LEGAL_PERSON', capacity: 'AGENT_UNDER_POA' },
      { asOf: new Date() },
    ),
  ])

  const items = new Map<string, { labelAr: string; labelEn: string }>()
  for (const item of [...natural.items, ...legal.items]) {
    items.set(item.key, { labelAr: item.payload.labelAr, labelEn: item.payload.labelEn })
  }

  console.log(`\nDemonstration documents — ${items.size} checklist items\n${'─'.repeat(64)}`)

  let written = 0
  const missing: string[] = []

  for (const [key, labels] of items) {
    const content = CONTENT[key]
    if (!content) {
      missing.push(key)
      continue
    }

    const html = documentHtml({ ...content, keyLabel: key })

    const pdf = await renderPdf(html, { format: 'A4' })
    const file = join(OUT, `DEMO-${key}.pdf`)
    await writeFile(file, pdf)
    written++

    /*
     * `--png` also writes an image, into the gitignored .proof/ directory.
     *
     * Not decoration, and the same reasoning as scripts/proof-arabic-pdf.ts: a
     * PDF whose Arabic shaping failed still opens, still contains the right
     * code points, and still passes any text-based assertion — the damage is
     * only visible when the glyphs are looked at. An image is the only way to
     * check the demonstration documents are readable before handing them to
     * somebody to demonstrate with.
     */
    if (process.argv.includes('--png')) {
      await mkdir(PROOF, { recursive: true })
      await writeFile(join(PROOF, `DEMO-${key}.png`), await renderPng(html, 900))
    }
    console.log(`  ${String(Math.round(pdf.length / 1024)).padStart(4)} KB  DEMO-${key}.pdf  — ${labels.labelEn}`)
  }

  await closePdfBrowser()

  console.log(`${'─'.repeat(64)}\n  ${written} written to docs/demo-documents/`)
  if (missing.length > 0) {
    console.log(`\n  No content defined for: ${missing.join(', ')}`)
    console.log('  Add an entry to CONTENT in this file.')
    process.exitCode = 1
  }
}

main().catch(async (error) => {
  console.error(error)
  await closePdfBrowser()
  process.exit(1)
})
