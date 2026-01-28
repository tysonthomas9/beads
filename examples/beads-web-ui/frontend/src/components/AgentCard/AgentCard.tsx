/**
 * AgentCard component displays a single agent's status.
 * Shows name, branch, status, and sync information.
 */

import type { LoomAgentStatus, ParsedLoomStatus } from '@/types';
import { parseLoomStatus } from '@/types';
import styles from './AgentCard.module.css';

/**
 * Props for the AgentCard component.
 */
export interface AgentCardProps {
  /** Agent status data */
  agent: LoomAgentStatus;
  /** Optional task title to display (when working/planning) */
  taskTitle?: string | undefined;
  /** Additional CSS class name */
  className?: string;
  /** Click handler */
  onClick?: () => void;
}

/**
 * Get status indicator color based on parsed status type.
 */
function getStatusColor(type: ParsedLoomStatus['type']): string {
  switch (type) {
    case 'working':
    case 'planning':
      return 'var(--color-status-working)';
    case 'done':
      return 'var(--color-status-done)';
    case 'review':
      return 'var(--color-status-review)';
    case 'idle':
      return 'var(--color-status-idle)';
    case 'error':
      return 'var(--color-status-error)';
    case 'dirty':
    case 'changes':
      return 'var(--color-status-dirty)';
    case 'ready':
    default:
      return 'var(--color-status-ready)';
  }
}

/**
 * Get human-readable status text.
 */
function getStatusText(parsed: ParsedLoomStatus): string {
  switch (parsed.type) {
    case 'working':
      return parsed.taskId ? `Working: ${parsed.taskId}` : 'Working...';
    case 'planning':
      return parsed.taskId ? `Planning: ${parsed.taskId}` : 'Planning...';
    case 'done':
      return parsed.taskId ? `Done: ${parsed.taskId}` : 'Done';
    case 'review':
      return parsed.taskId ? `Review: ${parsed.taskId}` : 'Awaiting review';
    case 'idle':
      return 'Idle';
    case 'error':
      return parsed.taskId ? `Error: ${parsed.taskId}` : 'Error';
    case 'dirty':
      return 'Uncommitted changes';
    case 'changes':
      return `${parsed.changeCount} change${parsed.changeCount === 1 ? '' : 's'}`;
    case 'ready':
    default:
      return 'Ready';
  }
}

/**
 * AgentCard displays a single agent's status in a compact card format.
 */
export function AgentCard({
  agent,
  taskTitle,
  className,
  onClick,
}: AgentCardProps): JSX.Element {
  const parsed = parseLoomStatus(agent.status);
  const statusColor = getStatusColor(parsed.type);
  const statusText = getStatusText(parsed);

  // Show task title for active states (working, planning, review, done, error)
  const showTaskTitle = taskTitle && ['working', 'planning', 'review', 'done', 'error'].includes(parsed.type);

  const rootClassName = [styles.card, className].filter(Boolean).join(' ');

  return (
    <div
      className={rootClassName}
      data-status={parsed.type}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <div className={styles.header}>
        <span className={styles.name}>{agent.name}</span>
        <span
          className={styles.indicator}
          style={{ backgroundColor: statusColor }}
          aria-hidden="true"
        />
      </div>

      <div className={styles.status}>
        <span className={styles.statusText}>{statusText}</span>
        {parsed.duration && (
          <span className={styles.duration}>{parsed.duration}</span>
        )}
      </div>

      {showTaskTitle && (
        <div className={styles.taskTitle} title={taskTitle}>
          {taskTitle}
        </div>
      )}

      <div className={styles.footer}>
        <span className={styles.branch} title={agent.branch}>
          {agent.branch}
        </span>
        <div className={styles.sync}>
          {agent.ahead > 0 && (
            <span className={styles.ahead} title={`${agent.ahead} commits ahead`}>
              +{agent.ahead}
            </span>
          )}
          {agent.behind > 0 && (
            <span className={styles.behind} title={`${agent.behind} commits behind`}>
              -{agent.behind}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
