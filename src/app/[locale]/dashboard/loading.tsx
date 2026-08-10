import { getTranslations } from 'next-intl/server'
import { LoadingAnnouncement, Skeleton } from '@/components/ui/primitives'
import { ShellSkeleton, ShellSkeletonHeader } from '@/components/layout/shell-skeleton'

export default async function DashboardLoading() {
  const t = await getTranslations('common')

  return (
    <ShellSkeleton>
      <LoadingAnnouncement label={t('loading')} />
      <ShellSkeletonHeader />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="border border-rule bg-paper">
          <div className="border-b border-rule px-4 py-3">
            <Skeleton className="h-4 w-44" />
          </div>
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="border-b border-rule px-4 py-3.5 last:border-b-0">
              <Skeleton className="h-4 w-52" />
              <Skeleton className="mt-2 h-3 w-full max-w-sm" />
            </div>
          ))}
        </div>

        <div className="border border-rule bg-paper">
          <div className="border-b border-rule px-4 py-3">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="space-y-2 p-4">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      </div>
    </ShellSkeleton>
  )
}
