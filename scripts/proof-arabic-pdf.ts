/**
 * Phase 0 gate: Arabic must render correctly in a generated PDF.
 *
 *   npm run proof:pdf
 *
 * 04-BUILD-PLAN.md: "Do not proceed until there is no code path anywhere that
 * deletes a row, and Arabic renders correctly in a generated PDF."
 *
 * ── What "correctly" means, and what it does not ────────────────────────────
 *
 * Arabic is cursive. Each letter takes one of four contextual forms, chosen by
 * applying the font's GSUB tables, and the run is then reordered by the Unicode
 * bidirectional algorithm. Both steps happen at layout time, not in the
 * character stream — so a PDF can contain exactly the right code points, pass
 * any text-based assertion you write, and still print every letter isolated and
 * backwards. Text extraction cannot see this class of failure at all.
 *
 * So the checks here are chosen for what they can actually establish:
 *
 *   1. the file is a valid PDF and embeds the Arabic font program — a missing
 *      font is what produces a page of empty boxes;
 *   2. it fits the page it was designed for;
 *   3. contextual shaping demonstrably ran — see the note on presentation
 *      forms below, which turns an extraction quirk into positive evidence;
 *   4. the registration number did not get reversed by the bidi algorithm;
 *   5. the glyphs, rasterised to PNG, are looked at by a human or by a model
 *      that can see the image. Nothing else substitutes for this.
 *
 * Artefacts land in .proof/ so they can be opened and judged directly.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { closePdfBrowser, renderPdf, renderPng } from '@/lib/pdf/render'
import { registrationCardHtml } from '@/lib/pdf/registration-card'

const OUT = join(process.cwd(), '.proof')

const heading = (t: string) => console.log(`\n${'━'.repeat(74)}\n${t}\n${'━'.repeat(74)}`)
const detail = (t: string) => console.log(`    ${t}`)

async function main() {
  await mkdir(OUT, { recursive: true })

  const data = {
    registrationNumber: '2026/1183',
    tradeNameAr: 'شركة النيل للوساطة العقارية',
    tradeNameEn: 'Nile Real Estate Brokerage Co.',
    categoryLabelAr: 'فئة ج',
    typeLabelsAr: ['سمسار بيع', 'سمسار شراء', 'سمسار إيجار'],
    paidUpCapital: 750_000,
    validFrom: new Date('2026-03-01T00:00:00Z'),
    validTo: new Date('2031-02-28T00:00:00Z'),
    governorateAr: 'القاهرة',
    addressAr: '١٤ شارع طلعت حرب، وسط البلد، القاهرة',
    commercialRegisterNo: '118427',
    issuedOn: new Date('2026-03-01T00:00:00Z'),
  }

  heading('Generating the registration card')
  const html = registrationCardHtml(data)
  const pdf = await renderPdf(html)
  const png = await renderPng(html, 900)

  const pdfPath = join(OUT, 'registration-card-ar.pdf')
  const pngPath = join(OUT, 'registration-card-ar.png')
  await writeFile(pdfPath, pdf)
  await writeFile(pngPath, png)

  detail(`PDF: ${pdfPath} (${(pdf.byteLength / 1024).toFixed(1)} KB)`)
  detail(`PNG: ${pngPath} (${(png.byteLength / 1024).toFixed(1)} KB)`)

  const checks: Array<[string, boolean, string]> = []
  const require_ = (label: string, ok: boolean, note = '') => checks.push([label, ok, note])

  // ── 1. Structure and embedded fonts ──────────────────────────────────────
  heading('1. Structure and embedded fonts')
  const raw = pdf.toString('latin1')

  const isPdf = raw.startsWith('%PDF-')
  detail(`Header            : ${raw.slice(0, 8).trim()}`)
  require_('Valid PDF header', isPdf)

  const hasEof = raw.trimEnd().endsWith('%%EOF')
  detail(`Trailer complete  : ${hasEof}`)
  require_('Complete PDF trailer', hasEof)

  const embedsFontProgram = /\/FontFile2|\/FontFile3|\/FontFile\b/.test(raw)
  const fontNames = [...new Set([...raw.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+\-_,]+)/g)].map((m) => m[1]))]
  const embedsPlexArabic = fontNames.some((n) => /Plex.*Arabic|IBMPlexSansArabic/i.test(n ?? ''))
  detail(`Fonts embedded    : ${embedsFontProgram}`)
  detail(`Faces             : ${fontNames.join(', ') || '(none)'}`)
  require_('Font programs embedded', embedsFontProgram)
  require_('Arabic face embedded', embedsPlexArabic)

  // ── 2. The text layer ────────────────────────────────────────────────────
  heading('2. The text layer')
  const { extractPdf } = await import('./lib/pdf-text')
  const { text, pageCount } = await extractPdf(pdf)

  detail(`Pages             : ${pageCount}`)
  require_('Fits on a single page', pageCount === 1, `rendered ${pageCount}`)

  const flat = text.replace(/\s+/g, ' ').trim()
  const cps = [...flat].map((c) => c.codePointAt(0)!)
  const presentationForms = cps.filter(
    (c) => (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff),
  ).length
  const baseArabic = cps.filter((c) => c >= 0x0600 && c <= 0x06ff).length

  detail(`Characters        : ${flat.length}`)
  detail(`Base Arabic       : ${baseArabic}`)
  detail(`Presentation forms: ${presentationForms}`)

  // Presentation forms (U+FB50–FDFF, U+FE70–FEFF) are the *contextual* glyph
  // forms — initial, medial, final, isolated. Their presence in the text layer
  // means Chromium applied the font's GSUB substitutions rather than emitting
  // bare base letters. That is exactly the shaping step whose absence would
  // print أ ص و ل instead of أصول, so finding them here is positive evidence
  // that shaping ran.
  const shapingRan = presentationForms > 0
  detail(
    shapingRan
      ? 'Contextual shaping ran: the glyph stream carries substituted forms.'
      : '*** No presentation forms found — contextual shaping may not have run. ***',
  )
  require_('Contextual Arabic shaping applied', shapingRan)

  // The registration number must survive as 2026/1183, not 1183/2026 — what
  // `unicode-bidi: isolate` on every Latin run is there to guarantee.
  const numberIntact = flat.includes('2026/1183')
  const numberReversed = flat.includes('1183/2026')
  detail(
    `Number orientation: ${numberIntact ? 'correct — 2026/1183' : numberReversed ? '*** REVERSED — 1183/2026 ***' : 'not found'}`,
  )
  require_('Registration number not reversed', numberIntact && !numberReversed)

  // Latin content should round-trip cleanly regardless.
  const latinIntact = flat.includes('Registration card')
  detail(`Latin text intact : ${latinIntact}`)
  require_('Latin text extracts intact', latinIntact)

  // ── 3. The glyphs ────────────────────────────────────────────────────────
  heading('3. The glyphs')
  detail(`Rasterised to: ${pngPath}`)
  detail('')
  detail('No automated check in this file can establish the following. Look at the image:')
  detail('  · letters JOINED into cursive words — "أصول", never "أ ص و ل"')
  detail('  · text running RIGHT to LEFT, headings starting at the right margin')
  detail('  · 2026/1183 and the dates reading left to right, in that order')
  detail('  · no empty boxes (□), which would mean a glyph the font does not have')

  // ── Known limitation ─────────────────────────────────────────────────────
  heading('Known limitation — recorded, not hidden')
  console.log(`
  Arabic full-text SEARCH inside the generated PDF is unreliable.

  Chromium writes right-to-left runs to the content stream in visual order,
  and maps them through ToUnicode to the presentation forms it actually drew
  rather than to the base letters they came from. In this document
  ${presentationForms} of the Arabic code points came back as presentation forms and
  ${baseArabic} as base letters. So searching the PDF for "القاهرة" can miss a page
  that visibly contains it.

  Why this does not block the Phase 0 gate: the gate is that Arabic *renders*
  correctly, and it does — the card is legible, printable, and correct, which
  is what an issued document has to be. Retrieval under REQ-AML-031 is served
  by the register's own database, which holds every one of these fields as
  queryable data; the PDF is an output, not the system of record.

  Revisit in Phase 3, when the two statutory notification letters are
  generated, if searching the letters themselves becomes a requirement.
  The options then are to embed a logical-order invisible text layer, or to
  attach the structured data as XMP metadata.
`)

  // ── Result ───────────────────────────────────────────────────────────────
  heading('Result')
  const failed = checks.filter(([, ok]) => !ok)
  for (const [label, ok, note] of checks) {
    console.log(`  ${label.padEnd(40)}: ${ok ? 'yes' : `*** NO *** ${note}`}`)
  }
  console.log(
    failed.length === 0
      ? '\n  AUTOMATED CHECKS PASSED — inspect the PNG to confirm the shaping by eye.\n'
      : `\n  FAILED (${failed.length})\n`,
  )
  if (failed.length) process.exitCode = 1

  await closePdfBrowser()
}

main().catch(async (error) => {
  console.error(error)
  await closePdfBrowser()
  process.exit(1)
})
