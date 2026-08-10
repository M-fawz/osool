import { Skeleton } from '@/components/ui/primitives'

/**
 * The shell, while the page inside it is still arriving.
 *
 * `Shell` is rendered by each page rather than by the layout, because it needs
 * the session and the session is resolved per page. The consequence only
 * became visible once loading states existed: a route change suspended the
 * page *and* the chrome, so the navy header and sidebar vanished for a second
 * and came back — the whole product appearing to blink.
 *
 * This draws the chrome's silhouette at the same dimensions, with no user data
 * in it, so the frame holds still and only the content inside it changes. It
 * is deliberately not interactive: the real navigation is a moment away, and
 * links that look real but do nothing are worse than links that are visibly
 * not ready yet.
 */
export function ShellSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper-sunk">
      <div
        aria-hidden="true"
        className="sticky top-0 z-40 h-14 border-b border-chrome-rule bg-chrome"
      />

      <div className="flex">
        <div
          aria-hidden="true"
          className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 border-e border-chrome-rule bg-chrome-deep lg:block"
        />

        <div className="min-w-0 flex-1 px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-shell">{children}</div>
        </div>
      </div>
    </div>
  )
}

/** The page-header silhouette, used by every back-office loading state. */
export function ShellSkeletonHeader() {
  return (
    <div className="brass-rule mb-6 pb-4">
      <Skeleton className="h-6 w-56" />
      <Skeleton className="mt-2.5 h-4 w-full max-w-reading" />
    </div>
  )
}
