import { getTranslations } from 'next-intl/server'
import { LoadingAnnouncement, Skeleton, SkeletonTable } from '@/components/ui/primitives'
import { ShellSkeleton, ShellSkeletonHeader } from '@/components/layout/shell-skeleton'

export default async function UsersLoading() {
  const t = await getTranslations('common')

  return (
    <ShellSkeleton>
      <LoadingAnnouncement label={t('loading')} />
      <ShellSkeletonHeader />
      <Skeleton className="mb-6 h-12 w-full" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div className="border border-rule bg-paper">
          <div className="border-b border-rule px-4 py-3">
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="space-y-5 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-11 w-full" />
              </div>
            ))}
            <Skeleton className="h-11 w-full" />
          </div>
        </div>

        <div className="border border-rule bg-paper">
          <div className="border-b border-rule px-4 py-3">
            <Skeleton className="h-4 w-40" />
          </div>
          <SkeletonTable rows={8} columns={5} />
        </div>
      </div>
    </ShellSkeleton>
  )
}
