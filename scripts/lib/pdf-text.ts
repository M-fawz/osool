/**
 * Extract the text layer from a PDF, for verification only.
 *
 * pdf.js is an independent implementation from the one that wrote the file, so
 * a successful extraction says something real: the character stream and the
 * font's ToUnicode mapping agree well enough that a *different* engine recovers
 * the original Arabic. Reading the text back with the same library that wrote
 * it would mostly prove that the library is self-consistent.
 */

export interface ExtractedPdf {
  text: string
  pageCount: number
}

export async function extractPdf(pdf: Buffer): Promise<ExtractedPdf> {
  // The legacy build avoids needing a DOM or a canvas in Node.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdf),
    // Verification runs offline; no external font or cmap fetching.
    useSystemFonts: false,
  })

  const doc = await loadingTask.promise
  const pageCount = doc.numPages

  const parts: string[] = []
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    for (const item of content.items) {
      if ('str' in item) parts.push(item.str)
    }
    parts.push('\n')
  }

  // In pdf.js 6 the loading task owns teardown, not the document.
  await loadingTask.destroy()

  return { text: parts.join(' '), pageCount }
}

export async function extractText(pdf: Buffer): Promise<string> {
  return (await extractPdf(pdf)).text
}
