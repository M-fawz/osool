'use client'

/**
 * The last resort.
 *
 * This boundary replaces the entire document, including the `<html>` element,
 * which means it renders outside the locale layout and outside next-intl's
 * provider — there is no `useTranslations` available here, and no `dir` chosen
 * for us. Reaching this screen means the locale layout itself failed.
 *
 * So the copy is written into the file in both languages rather than looked
 * up, and Arabic leads as it does everywhere else. That is the honest way to
 * handle it: a translation lookup at this point would be the second thing to
 * crash.
 *
 * No design system either — importing the component set would risk the same
 * failure that got us here. Styles are inline and minimal, and the palette
 * values are the literal tokens from globals.css.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          background: '#f4f5f7',
          color: '#16181d',
          fontFamily: "'Plex Arabic', 'Plex Latin', 'Segoe UI', Tahoma, system-ui, sans-serif",
          fontSize: '15px',
          lineHeight: 1.75,
        }}
      >
        <main style={{ margin: '0 auto', maxWidth: '38rem', padding: '3rem 1.25rem' }}>
          <div style={{ border: '1px solid rgba(163,38,38,0.3)', background: '#fff' }}>
            <div
              style={{
                background: '#fbeaea',
                borderBottom: '1px solid rgba(163,38,38,0.3)',
                padding: '0.75rem 1rem',
                fontWeight: 600,
              }}
            >
              تعذّر تشغيل النظام
            </div>
            <div style={{ padding: '1rem', display: 'grid', gap: '0.75rem' }}>
              <p style={{ margin: 0 }}>
                حدث عطل جسيم منع تحميل الصفحة بالكامل. لم يُحفظ أي تغيير، ولم يُفقد أي سجل.
              </p>
              <p style={{ margin: 0 }}>
                أعد المحاولة. إذا تكرر العطل، أبلغ الدعم الفني بالهيئة العامة للرقابة على الصادرات
                والواردات مرفقاً برمز العطل أدناه.
              </p>
              {error.digest ? (
                <p style={{ margin: 0, fontSize: '0.6875rem', color: '#6b7383' }}>
                  رمز العطل:{' '}
                  <code style={{ direction: 'ltr', unicodeBidi: 'isolate', userSelect: 'all' }}>
                    {error.digest}
                  </code>
                </p>
              ) : null}
            </div>
          </div>

          <div lang="en" dir="ltr" style={{ marginTop: '1.5rem', color: '#4a5261' }}>
            <p style={{ margin: 0, fontWeight: 600, color: '#0c2444' }}>
              The system could not start
            </p>
            <p style={{ margin: '0.25rem 0 0' }}>
              A fault prevented the page from loading. Nothing was saved and no record was lost.
              Try again, and report the fault reference above if it persists.
            </p>
          </div>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              minHeight: '44px',
              padding: '0 1.25rem',
              border: '1px solid #0f2d53',
              background: '#0f2d53',
              color: '#fff',
              fontSize: '1.125rem',
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            إعادة المحاولة · Try again
          </button>
        </main>
      </body>
    </html>
  )
}
