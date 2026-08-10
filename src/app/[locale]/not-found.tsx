import { FaultPage } from '@/components/layout/fault-page'

/**
 * An address that is not a page.
 *
 * Same four-part shape as every other refusal — a 404 is a blocked action too,
 * and "page not found" on its own tells an official nothing about what to do
 * next.
 */
export default function LocaleNotFound() {
  return <FaultPage kind="notFound" />
}
