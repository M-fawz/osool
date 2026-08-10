import { getTranslations } from 'next-intl/server'
import { LoadingAnnouncement, Skeleton, SkeletonTable } from '@/components/ui/primitives'
import { ShellSkeleton, ShellSkeletonHeader } from '@/components/layout/shell-skeleton'

/**
 * The audit trail, arriving.
 *
 * This screen verifies the whole hash chain on every load, so on a large
 * register it is genuinely slow — which is exactly why it needs a real loading
 * state rather than a blank frame. The skeleton is the shape of what is
 * coming, at the density it will have, so nothing jumps when it lands.
 */
export default async function AuditLoading() {
  const t = await getTranslations('common')

  return (
    <ShellSkeleton>
      <LoadingAnnouncement label={t('loading')} />
      <ShellSkeletonHeader />
      <Skeleton className="mb-6 h-[4.5rem] w-full" />
      <div className="border border-rule bg-paper">
        <div className="border-b border-rule px-4 py-2.5">
          <Skeleton className="h-3 w-48" />
        </div>
        <SkeletonTable rows={10} columns={8} />
      </div>
    </ShellSkeleton>
  )
}
