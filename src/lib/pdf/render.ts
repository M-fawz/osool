import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * PDF rendering.
 *
 * 02-SYSTEM-ARCHITECTURE §1 and §10 decision 6: statutory letters and
 * registration cards must render Arabic correctly, and "this has broken
 * projects before; do not defer it."
 *
 * Chromium, not a JavaScript PDF library. The choice is about one thing —
 * Arabic text shaping. Arabic is cursive: every letter has up to four forms
 * depending on what sits beside it, and the correct form is selected by
 * applying the font's GSUB tables, then the run is reordered by the Unicode
 * bidirectional algorithm. Get either step wrong and you produce
 * "ل و ص أ" — the letters of أصول, isolated and backwards. It looks like
 * text. It is unreadable, and a registration card that renders a broker's name
 * that way is not a document the Authority can issue.
 *
 * Chromium does this with HarfBuzz, the same engine behind the browser, so what
 * the officer proofreads on screen is what the printer produces. The
 * alternative libraries implement shaping themselves to varying depths, and
 * verifying a reimplementation of Arabic shaping is not work this project
 * should be doing.
 *
 * The cost is a Chromium binary in the deployment image. That is a known,
 * containerisable cost, and it buys the design tokens too: letters are authored
 * in the same HTML and CSS as the rest of the system rather than in a separate
 * layout dialect.
 */

/**
 * Where the Chromium binary comes from, which differs by host.
 *
 * A container built from this repository runs `playwright install chromium`
 * and gets the browser Playwright expects, in Playwright's own cache. A
 * serverless function has neither: its filesystem is read-only apart from
 * `/tmp`, nothing ran an install step inside it, and the ~300 MB browser
 * Playwright downloads would not fit in a function anyway.
 *
 * `@sparticuz/chromium` exists for exactly that case — a Chromium built for
 * AWS Lambda, shipped brotli-compressed inside the deployment and unpacked to
 * `/tmp` on first use. `playwright-core` then drives it: same API, same
 * HarfBuzz shaping, no bundled browser of its own.
 *
 * Detection is by platform rather than by configuration, because getting it
 * wrong is silent until the first card is issued. `PDF_RENDERER` overrides it
 * for the case the detection cannot see — a container that happens to run on
 * Lambda, or a local reproduction of the serverless path.
 */
type Renderer = 'bundled-chromium' | 'serverless-chromium'

function selectedRenderer(): Renderer {
  const override = process.env.PDF_RENDERER
  if (override === 'bundled-chromium' || override === 'serverless-chromium') return override
  const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
  return serverless ? 'serverless-chromium' : 'bundled-chromium'
}

let browserPromise: Promise<import('playwright-core').Browser> | null = null

async function launch(): Promise<import('playwright-core').Browser> {
  // Shared by both paths. --no-sandbox because neither a hardened container
  // nor a Lambda gives the browser the user namespaces its sandbox needs, and
  // the only content it ever loads is HTML this application generated.
  const baseArgs = ['--no-sandbox', '--font-render-hinting=none']

  if (selectedRenderer() === 'serverless-chromium') {
    const [{ default: chromiumPack }, { chromium }] = await Promise.all([
      import('@sparticuz/chromium'),
      import('playwright-core'),
    ])

    // No WebGL. A registration card is shaped text on a white page, and leaving
    // the graphics stack on costs an extra archive to unpack into /tmp on every
    // cold start for something nothing here draws.
    chromiumPack.setGraphicsMode = false

    const executablePath = await chromiumPack.executablePath()
    if (!executablePath) {
      throw new Error(
        'The serverless Chromium build did not unpack, so no PDF can be rendered. ' +
          'Check the function has writable /tmp space and at least 1024 MB of memory.',
      )
    }

    return chromium.launch({
      executablePath,
      args: [...chromiumPack.args, ...baseArgs],
      headless: true,
    })
  }

  // The container and laptop path. `playwright`, not `playwright-core`: it is
  // the package whose install step put the browser on disk.
  const { chromium } = await import('playwright')
  return chromium.launch({ args: baseArgs })
}

async function browser() {
  if (!browserPromise) {
    // Cleared on failure, so a cold start that could not reach Chromium does
    // not poison every later request on the same warm instance with a rejected
    // promise nobody can retry.
    browserPromise = launch().catch((error) => {
      browserPromise = null
      throw error
    })
  }
  return browserPromise
}

export async function closePdfBrowser() {
  if (browserPromise) {
    const b = await browserPromise
    await b.close()
    browserPromise = null
  }
}

/** The self-hosted Arabic and Latin faces, inlined so rendering needs no network. */
async function fontCss(): Promise<string> {
  const fonts = [
    { file: 'plex-arabic-400-arabic.woff2', family: 'Plex Arabic', weight: 400 },
    { file: 'plex-arabic-500-arabic.woff2', family: 'Plex Arabic', weight: 500 },
    { file: 'plex-arabic-600-arabic.woff2', family: 'Plex Arabic', weight: 600 },
    { file: 'plex-arabic-700-arabic.woff2', family: 'Plex Arabic', weight: 700 },
    { file: 'plex-latin-400-latin.woff2', family: 'Plex Latin', weight: 400 },
    { file: 'plex-latin-600-latin.woff2', family: 'Plex Latin', weight: 600 },
    { file: 'plex-latin-700-latin.woff2', family: 'Plex Latin', weight: 700 },
  ]

  const faces = await Promise.all(
    fonts.map(async (f) => {
      const bytes = await readFile(join(process.cwd(), 'public', 'fonts', f.file))
      return `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:normal;font-display:block;src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');}`
    }),
  )

  return faces.join('\n')
}

export interface PdfOptions {
  /** Page size. Egyptian government correspondence is A4. */
  format?: 'A4' | 'A5'
  landscape?: boolean
  margin?: { top: string; bottom: string; left: string; right: string }
}

/**
 * Render a complete HTML document to PDF bytes.
 *
 * The document is given the font CSS and is expected to set its own `dir`.
 * `waitUntil: 'load'` plus an explicit `document.fonts.ready` is not optional:
 * printing before the embedded faces have loaded falls back to a system font,
 * which on a Linux container is frequently a font with no Arabic coverage at
 * all, and the output is a page of empty boxes.
 */
export async function renderPdf(html: string, options: PdfOptions = {}): Promise<Buffer> {
  const b = await browser()
  const page = await b.newPage()

  try {
    const css = await fontCss()
    const markup = html.replace('<!--FONTS-->', `<style>${css}</style>`)

    await page.setContent(markup, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)

    return await page.pdf({
      format: options.format ?? 'A4',
      landscape: options.landscape ?? false,
      printBackground: true,
      margin: options.margin ?? { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' },
    })
  } finally {
    await page.close()
  }
}

/**
 * Render the same document to PNG.
 *
 * Not decoration: this is how the PDF pipeline gets *verified*. A PDF whose
 * Arabic is broken still opens, still contains the right characters, and still
 * passes a text extraction — the damage is only visible when the glyphs are
 * looked at. So the proof script renders both and inspects the image.
 */
export async function renderPng(html: string, width = 900): Promise<Buffer> {
  const b = await browser()
  const page = await b.newPage({ viewport: { width, height: 1200 }, deviceScaleFactor: 2 })

  try {
    const css = await fontCss()
    const markup = html.replace('<!--FONTS-->', `<style>${css}</style>`)
    await page.setContent(markup, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    return await page.screenshot({ fullPage: true })
  } finally {
    await page.close()
  }
}
