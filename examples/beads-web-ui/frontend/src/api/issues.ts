/**
 * Type-safe API functions for issue operations.
 * Acts as the primary interface between React components and the Go backend.
 */

import { get, post, patch, ApiError } from './client'
import type {
  Issue,
  IssueDetails,
  BlockedIssue,
  Statistics,
  WorkFilter,
  Priority,
  IssueType,
  Status,
  DependencyType,
} from '@/types'

// ============= Response Types =============

/**
 * API success response wrapper.
 * Matches backend pattern for /api/ready, /api/stats, /api/issues endpoints.
 */
interface ApiSuccess<T> {
  success: true
  data: T
}

/**
 * API error response wrapper.
 * Matches backend pattern when success is false.
 */
interface ApiFailure {
  success: false
  error: string
  code?: string
}

/**
 * Union type for wrapped API responses.
 */
type ApiResult<T> = ApiSuccess<T> | ApiFailure

// ============= Helper Functions =============

/**
 * Build query string from filter object.
 * Omits undefined/null values.
 */
function buildQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      // Arrays become comma-separated: labels=a,b,c
      if (value.length > 0) {
        searchParams.set(key, value.join(','))
      }
    } else if (typeof value === 'boolean') {
      searchParams.set(key, value ? 'true' : 'false')
    } else {
      searchParams.set(key, String(value))
    }
  }
  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ''
}

/**
 * Unwrap API response, throwing ApiError on failure.
 * Used for endpoints that return wrapped responses.
 */
function unwrap<T>(response: ApiResult<T>): T {
  if (!response.success) {
    throw new ApiError(0, response.error)
  }
  return response.data
}

/**
 * Map WorkFilter to backend query parameter names.
 * WorkFilter uses 'sort_policy' but backend expects 'sort'.
 */
function mapWorkFilterToQueryParams(filter: WorkFilter): Record<string, unknown> {
  const { sort_policy, ...rest } = filter
  const params: Record<string, unknown> = { ...rest }
  if (sort_policy !== undefined) {
    params.sort = sort_policy
  }
  return params
}

// ============= READ OPERATIONS =============

/**
 * Get a single issue by ID with full details.
 * Note: This endpoint returns IssueDetails directly without wrapper.
 */
export async function getIssue(id: string): Promise<IssueDetails> {
  return get<IssueDetails>(`/api/issues/${encodeURIComponent(id)}`)
}

/**
 * Get issues ready for work (no blocking dependencies).
 */
export async function getReadyIssues(options?: WorkFilter): Promise<Issue[]> {
  const query = buildQueryString(mapWorkFilterToQueryParams(options ?? {}))
  const response = await get<ApiResult<Issue[]>>(`/api/ready${query}`)
  return unwrap(response)
}

/**
 * Get project statistics.
 */
export async function getStats(): Promise<Statistics> {
  const response = await get<ApiResult<Statistics>>('/api/stats')
  return unwrap(response)
}

/**
 * Filter options for blocked issues.
 */
export interface BlockedFilter {
  /** Filter to descendants of this parent issue/epic */
  parent_id?: string
}

/**
 * Get issues that have blocking dependencies (waiting on other issues).
 */
export async function getBlockedIssues(options?: BlockedFilter): Promise<BlockedIssue[]> {
  const params: Record<string, unknown> = {}
  if (options?.parent_id) {
    params.parent_id = options.parent_id
  }
  const query = buildQueryString(params)
  const response = await get<ApiResult<BlockedIssue[]>>(`/api/blocked${query}`)
  return unwrap(response)
}

// ============= GRAPH OPERATIONS =============

/**
 * Filter options for graph issues.
 */
export interface GraphFilter {
  /** Status filter: 'all', 'open', or 'closed' (default: 'all') */
  status?: 'all' | 'open' | 'closed'
  /** Include closed issues when status is 'all' (default: true) */
  includeClosed?: boolean
}

/**
 * Response structure from /api/issues/graph endpoint.
 * Note: Uses simplified dependency format from backend.
 */
interface GraphApiResponse {
  success: boolean
  issues?: GraphApiIssue[]
  error?: string
}

/**
 * Issue as returned by the graph API (with simplified dependencies).
 */
interface GraphApiIssue extends Omit<Issue, 'dependencies'> {
  dependencies?: { depends_on_id: string; type: string }[]
}

/**
 * Get all issues with full dependency data for graph visualization.
 * Transforms backend GraphDependency format to frontend Dependency format.
 *
 * NOTE: Dependency created_at timestamps use the parent issue's created_at
 * as a fallback since the graph API doesn't include individual dependency
 * creation times. Do not rely on these timestamps for precise ordering.
 */
export async function fetchGraphIssues(options?: GraphFilter): Promise<Issue[]> {
  const params: Record<string, unknown> = {}
  if (options?.status) {
    params.status = options.status
  }
  if (options?.includeClosed !== undefined) {
    params.include_closed = options.includeClosed
  }
  const query = buildQueryString(params)
  const response = await get<GraphApiResponse>(`/api/issues/graph${query}`)

  if (!response.success) {
    throw new ApiError(0, response.error || 'Unknown error')
  }

  // Warn in development if backend returns success without issues field
  if (response.issues === undefined && process.env.NODE_ENV === 'development') {
    console.warn('[fetchGraphIssues] Backend returned success without issues field')
  }

  // Transform simplified dependencies to full Dependency format
  const issues = response.issues ?? []
  return issues.map((issue): Issue => {
    // Destructure to separate dependencies from other fields
    const { dependencies: graphDeps, ...rest } = issue
    const result: Issue = rest as Issue
    if (graphDeps) {
      result.dependencies = graphDeps.map(dep => ({
        issue_id: issue.id,
        depends_on_id: dep.depends_on_id,
        type: dep.type as DependencyType,
        created_at: issue.created_at, // Use issue created_at as fallback
      }))
    }
    return result
  })
}

// ============= WRITE OPERATIONS =============
// These endpoints depend on T013, T014, T015 being complete.

/**
 * Request body for creating an issue.
 */
export interface CreateIssueRequest {
  // Required
  title: string
  issue_type: IssueType
  priority: Priority

  // Optional
  id?: string
  parent?: string
  description?: string
  design?: string
  acceptance_criteria?: string
  notes?: string
  assignee?: string
  owner?: string
  created_by?: string
  external_ref?: string
  estimated_minutes?: number
  labels?: string[]
  dependencies?: string[]
  due_at?: string
  defer_until?: string
}

/**
 * Request body for updating an issue.
 */
export interface UpdateIssueRequest {
  title?: string
  description?: string
  design?: string
  notes?: string
  priority?: Priority
  status?: Status
  assignee?: string
  labels?: string[]
  issue_type?: IssueType
}

/**
 * Create a new issue.
 */
export async function createIssue(data: CreateIssueRequest): Promise<Issue> {
  const response = await post<ApiResult<Issue>>('/api/issues', data)
  return unwrap(response)
}

/**
 * Update an existing issue.
 */
export async function updateIssue(
  id: string,
  data: UpdateIssueRequest
): Promise<Issue> {
  const response = await patch<ApiResult<Issue>>(
    `/api/issues/${encodeURIComponent(id)}`,
    data
  )
  return unwrap(response)
}

/**
 * Close an issue with optional reason.
 */
export async function closeIssue(id: string, reason?: string): Promise<void> {
  const response = await post<ApiResult<null>>(
    `/api/issues/${encodeURIComponent(id)}/close`,
    reason ? { reason } : {}
  )
  unwrap(response)
}

// ============= EXPORTS FOR TESTING =============

/**
 * Exported for unit testing.
 * @internal
 */
export { buildQueryString, unwrap, mapWorkFilterToQueryParams }
