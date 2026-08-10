/**
 * The component set, as one import.
 *
 * The set grew past what one file should hold, so it now lives in siblings
 * beside this one — button, form, status, notice, panel, table, skeleton,
 * icon. This barrel stays because it is the public surface every page already
 * imports from, and because a call site should not have to know which file a
 * primitive happens to sit in.
 *
 * Everything re-exported here obeys the same constraints:
 *
 *   · logical properties only (`ps-`, `pe-`, `ms-`, `border-s-`), never left
 *     and right, so one stylesheet serves RTL and LTR;
 *   · radius at 2–4px, never more — this is a register;
 *   · no shadow except on things that genuinely float, and on the sticky
 *     table header, where it reports that rows are hidden underneath;
 *   · every status carries a drawn icon *and* a text label, never colour
 *     alone (03-DESIGN-DIRECTION §7).
 */

export { Button, Spinner, buttonVariants, type ButtonProps } from './button'
export { Field, FieldGroup, Input, Select, Textarea } from './form'
export { Count, Status, type StatusTone } from './status'
export { BlockedAction, Notice, type NoticeTone } from './notice'
export {
  EmptyState,
  KeyValue,
  KeyValueItem,
  PageHeader,
  Panel,
  Toolbar,
} from './panel'
export { Table, TableCount, TableEmptyRow, Td, Th } from './table'
export {
  LoadingAnnouncement,
  Skeleton,
  SkeletonPageHeader,
  SkeletonTable,
  SkeletonText,
} from './skeleton'
export { Icon, forwardArrow, forwardChevron, type IconSize, type LucideIcon } from './icon'
