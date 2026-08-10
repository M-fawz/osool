/**
 * The registration card — البطاقة الدالة على القيد.
 *
 * REQ-REG-050 step 5: issued under a permanent registration number, with the
 * recipient acknowledging the renewal date and the obligation to print the
 * number on all output (REQ-REG-061).
 *
 * Every Latin run — the registration number, the dates, the capital figure — is
 * wrapped in a span with `unicode-bidi: isolate`, for the same reason the
 * on-screen `<Ltr>` component exists: without it the bidirectional algorithm
 * treats the slash in `2026/1183` as neutral and prints `1183/2026`. On a
 * screen that is a bug. On an issued card carrying a registration number it is
 * a document that identifies the wrong broker.
 */

export interface RegistrationCardData {
  registrationNumber: string
  tradeNameAr: string
  tradeNameEn?: string | null
  categoryLabelAr: string
  typeLabelsAr: string[]
  paidUpCapital: number
  validFrom: Date
  validTo: Date
  governorateAr: string
  addressAr: string
  commercialRegisterNo: string
  issuedOn: Date
}

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Africa/Cairo',
  }).format(d)

const fmtMoney = (n: number) => new Intl.NumberFormat('en-US').format(n)

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function registrationCardHtml(data: RegistrationCardData): string {
  const rows: Array<[string, string, boolean]> = [
    ['الاسم التجاري', esc(data.tradeNameAr), false],
    ...(data.tradeNameEn ? [['الاسم بالإنجليزية', esc(data.tradeNameEn), true] as [string, string, boolean]] : []),
    ['رقم السجل التجاري', esc(data.commercialRegisterNo), true],
    ['الفئة', esc(data.categoryLabelAr), false],
    ['أنواع القيد', data.typeLabelsAr.map(esc).join(' · '), false],
    ['رأس المال المدفوع', `${fmtMoney(data.paidUpCapital)} ج.م`, true],
    ['المحافظة', esc(data.governorateAr), false],
    ['عنوان مزاولة النشاط', esc(data.addressAr), false],
    ['سريان القيد من', fmtDate(data.validFrom), true],
    ['حتى', fmtDate(data.validTo), true],
  ]

  const tableRows = rows
    .map(
      ([label, value, isLtr]) => `
      <tr>
        <th>${label}</th>
        <td>${isLtr ? `<span class="ltr">${value}</span>` : value}</td>
      </tr>`,
    )
    .join('')

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<!--FONTS-->
<style>
  :root {
    --navy: #0F2D53;
    --brass: #A7844E;
    --ink: #16181D;
    --muted: #4A5261;
    --rule: #DDE1E8;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'Plex Arabic', 'Plex Latin', sans-serif;
    color: var(--ink);
    font-size: 10pt;
    line-height: 1.65;
  }
  /* The one rule that keeps Latin runs readable inside Arabic text. */
  .ltr {
    direction: ltr;
    unicode-bidi: isolate;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  header { border-bottom: 3px solid var(--brass); padding-bottom: 5mm; margin-bottom: 5mm; }
  .authority { font-size: 9pt; color: var(--muted); line-height: 1.5; }
  h1 { font-size: 15pt; color: var(--navy); margin: 3mm 0 1.5mm; font-weight: 600; }
  .subtitle { font-size: 9pt; color: var(--muted); }
  /* The emphasis is a rule across the top, not a stripe down the side.
     Everywhere else in this system — every page header, the landing title,
     the sign-in card — the brass abacus line runs horizontally, echoing the
     column capital in the logo. The printed card is the one artefact an
     official holds in their hand, and it should be recognisably the same
     object as the screen it was issued from. */
  .number-block {
    border: 1px solid var(--navy);
    border-block-start: 3px solid var(--brass);
    padding: 3.5mm 5mm;
    margin-bottom: 5mm;
    background: #F7F9FC;
  }
  .number-label { font-size: 9pt; color: var(--muted); margin-bottom: 1mm; }
  .number-value { font-size: 18pt; font-weight: 700; color: var(--navy); letter-spacing: 0.5pt; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: start; vertical-align: top; padding: 1.8mm 3mm; border-bottom: 1px solid var(--rule); }
  th { width: 40mm; font-weight: 500; color: var(--muted); font-size: 9pt; }
  td { font-weight: 500; }
  .obligation {
    margin-top: 5mm;
    border: 1px solid var(--rule);
    border-block-start: 2px solid var(--brass);
    padding: 3mm 4mm;
    font-size: 9pt;
    background: #FCFBF7;
  }
  .obligation p { margin: 0 0 1.4mm; }
  .obligation p:last-child { margin-bottom: 0; }
  footer {
    margin-top: 6mm; padding-top: 3mm; border-top: 1px solid var(--rule);
    display: flex; justify-content: space-between; font-size: 9pt; color: var(--muted);
  }
  .signature { margin-top: 8mm; display: flex; gap: 18mm; }
  .signature div { flex: 1; border-top: 1px solid var(--ink); padding-top: 2mm; font-size: 9pt; color: var(--muted); }
</style>
</head>
<body>
  <header>
    <div class="authority">
      جمهورية مصر العربية<br>
      وزارة الاستثمار والتجارة الخارجية<br>
      الهيئة العامة للرقابة على الصادرات والواردات — الإدارة المركزية للسجلات التجارية
    </div>
    <h1>البطاقة الدالة على القيد في سجل الوسطاء العقاريين</h1>
    <div class="subtitle">Registration card — Real Estate Brokers Register</div>
  </header>

  <div class="number-block">
    <div class="number-label">رقم القيد</div>
    <div class="number-value"><span class="ltr">${esc(data.registrationNumber)}</span></div>
  </div>

  <table>${tableRows}</table>

  <div class="obligation">
    <p><strong>التزامات المقيَّد:</strong></p>
    <p>١. إثبات رقم القيد على جميع الأوراق والمكاتبات والإعلانات الصادرة عنه أو بالنيابة عنه.</p>
    <p>٢. تقديم طلب التجديد قبل انتهاء مدة القيد بتسعين يوماً، أي بحلول <span class="ltr">${fmtDate(
      new Date(data.validTo.getTime() - 90 * 24 * 60 * 60 * 1000),
    )}</span>.</p>
    <p>٣. إخطار الهيئة بأي تغيير في بيانات المنشأة أو في أي عقد وساطة مقيد خلال ثلاثين يوماً.</p>
    <p>٤. عدم مزاولة أي عمل من أعمال الوساطة بعد زوال أي شرط من شروط القيد.</p>
  </div>

  <div class="signature">
    <div>توقيع المستلم</div>
    <div>الموظف المختص</div>
  </div>

  <footer>
    <span>تاريخ الإصدار: <span class="ltr">${fmtDate(data.issuedOn)}</span></span>
    <span class="ltr">${esc(data.registrationNumber)}</span>
  </footer>
</body>
</html>`
}
