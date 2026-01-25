/**
 * Hook barrel exports for the beads-web-ui frontend.
 */

export { useWebSocket } from './useWebSocket'
export type { UseWebSocketOptions, UseWebSocketReturn } from './useWebSocket'

export { useDebounce } from './useDebounce'

export { useSort } from './useSort'
export type { UseSortOptions, UseSortReturn, SortState, SortDirection } from './useSort'

export { useIssueFilter } from './useIssueFilter'
export type { UseIssueFilterOptions, UseIssueFilterReturn } from './useIssueFilter'

export { useBlockedIssues } from './useBlockedIssues'
export type { UseBlockedIssuesOptions, UseBlockedIssuesResult } from './useBlockedIssues'

export { useMutationHandler } from './useMutationHandler'
export type { UseMutationHandlerOptions, UseMutationHandlerReturn } from './useMutationHandler'

export { useFilterState, toQueryString, parseFromUrl, isEmptyFilter } from './useFilterState'
export type {
  FilterState,
  FilterActions,
  UseFilterStateOptions,
  UseFilterStateReturn,
} from './useFilterState'

export { useSelection } from './useSelection'
export type { UseSelectionOptions, UseSelectionReturn } from './useSelection'

export { useFilteredSelection } from './useFilteredSelection'
export type { UseFilteredSelectionOptions, UseFilteredSelectionReturn } from './useFilteredSelection'

export { useBulkClose } from './useBulkClose'
export type { UseBulkCloseOptions, UseBulkCloseReturn } from './useBulkClose'

export { useIssues } from './useIssues'
export type { UseIssuesOptions, UseIssuesReturn } from './useIssues'

export { useOptimisticStatusUpdate } from './useOptimisticStatusUpdate'
export type {
  UseOptimisticStatusUpdateOptions,
  UseOptimisticStatusUpdateReturn,
} from './useOptimisticStatusUpdate'

export { useFallbackPolling } from './useFallbackPolling'
export type {
  UseFallbackPollingOptions,
  UseFallbackPollingReturn,
} from './useFallbackPolling'

export { useBulkPriority, PRIORITY_OPTIONS } from './useBulkPriority'
export type {
  UseBulkPriorityOptions,
  UseBulkPriorityReturn,
  PriorityOption,
} from './useBulkPriority'

export { useGraphData } from './useGraphData'
export type { UseGraphDataOptions, UseGraphDataReturn } from './useGraphData'

export { useAutoLayout } from './useAutoLayout'
export type {
  UseAutoLayoutOptions,
  UseAutoLayoutReturn,
  LayoutDirection,
  RankAlignment,
} from './useAutoLayout'

export { useViewState } from './useViewState'
export type { UseViewStateOptions, UseViewStateReturn } from './useViewState'
