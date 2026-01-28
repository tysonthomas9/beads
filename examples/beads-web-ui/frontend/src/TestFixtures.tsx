/**
 * Test fixtures for e2e testing.
 * Provides routes to render components that aren't yet integrated into the main app flow.
 * Only included in development builds.
 */

import type { IssueDetails, Priority } from '@/types';
import type { Status } from '@/types/status';
import { IssueDetailPanel } from '@/components/IssueDetailPanel';

/**
 * Valid priority values.
 */
const VALID_PRIORITIES = [0, 1, 2, 3, 4] as const;

/**
 * Check if a number is a valid Priority.
 */
function isValidPriority(value: number): value is Priority {
  return VALID_PRIORITIES.includes(value as Priority);
}

/**
 * Parse issue params from URL search string.
 */
function parseIssueParams(search: string): IssueDetails | null {
  const params = new URLSearchParams(search);
  const id = params.get('id');
  const title = params.get('title');
  const status = params.get('status') as Status | null;
  const priorityStr = params.get('priority');

  if (!id || !title || !status || !priorityStr) {
    return null;
  }

  const parsedPriority = parseInt(priorityStr, 10);
  if (isNaN(parsedPriority) || !isValidPriority(parsedPriority)) {
    return null;
  }

  // Build issue details with proper types
  const issue: IssueDetails = {
    id,
    title,
    status,
    priority: parsedPriority,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    dependencies: [],
    dependents: [],
  };

  // Add optional fields only if they exist
  const issueType = params.get('issue_type');
  if (issueType) {
    issue.issue_type = issueType;
  }

  const description = params.get('description');
  if (description) {
    issue.description = description;
  }

  return issue;
}

/**
 * Test fixture for ErrorBoundary e2e tests.
 * Throws an error during render when URL has throw=true parameter.
 *
 * URL: /test/error-boundary?throw=true&errorMessage=...
 */
export function ErrorTriggerFixture(): JSX.Element {
  const params = new URLSearchParams(window.location.search);
  const shouldThrow = params.get('throw') === 'true';
  const errorMessage = params.get('errorMessage') || 'Test error from ErrorTriggerFixture';

  if (shouldThrow) {
    throw new Error(errorMessage);
  }

  return (
    <div data-testid="error-boundary-content" style={{ padding: '2rem', background: 'var(--bg-primary, #1a1a1a)', color: 'var(--text-primary, #fff)', minHeight: '100vh' }}>
      <h1>Error Boundary Test Fixture</h1>
      <p>This content renders when no error is thrown.</p>
    </div>
  );
}

/**
 * Test fixture for IssueDetailPanel with StatusDropdown.
 * Renders an open panel with the issue specified in URL params.
 *
 * URL: /test/issue-detail-panel?id=xxx&title=xxx&status=xxx&priority=xxx
 */
export function IssueDetailPanelFixture(): JSX.Element {
  const issue = parseIssueParams(window.location.search);

  if (!issue) {
    return (
      <div style={{ padding: '2rem' }}>
        <h1>IssueDetailPanel Test Fixture</h1>
        <p>Missing or invalid URL parameters.</p>
        <p>
          Required: <code>id</code>, <code>title</code>, <code>status</code>,{' '}
          <code>priority</code> (0-4)
        </p>
        <p>
          Example:{' '}
          <code>
            /test/issue-detail-panel?id=test-1&title=Test%20Issue&status=open&priority=2
          </code>
        </p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #1a1a1a)' }}>
      <IssueDetailPanel
        isOpen={true}
        issue={issue}
        onClose={() => window.history.back()}
      />
    </div>
  );
}
