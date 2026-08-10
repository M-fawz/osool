import type { ReactNode } from 'react'

/**
 * Next requires a root layout, but the real one — the element carrying `lang`
 * and `dir` — lives at src/app/[locale]/layout.tsx, because direction is a
 * function of locale and cannot be decided above the locale segment.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children
}
