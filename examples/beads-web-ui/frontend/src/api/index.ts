export { ApiError, get, post, patch, del } from './client'
export type { RequestOptions } from './client'

export { BeadsWebSocketClient, getWebSocketUrl } from './websocket'
export type {
  ConnectionState,
  MutationType,
  MutationPayload,
  WebSocketClientOptions,
} from './websocket'

// Issue API functions
export {
  getIssue,
  getReadyIssues,
  getStats,
  createIssue,
  updateIssue,
  closeIssue,
  fetchGraphIssues,
  addDependency,
  removeDependency,
} from './issues'
export type { CreateIssueRequest, UpdateIssueRequest, GraphFilter } from './issues'
