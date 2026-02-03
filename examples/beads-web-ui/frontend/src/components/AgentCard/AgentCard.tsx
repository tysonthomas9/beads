/**
 * AgentCard component displays a single agent's status.
 * Compact single-row layout with circular avatar, status dot, and commit count.
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
  /** Optional role to display (e.g., "Developer", "QA", "Architecture") */
  role?: string | undefined;
  /** Additional CSS class name */
  className?: string;
  /** Click handler */
  onClick?: () => void;
}

/**
 * Named agent color palette for deterministic avatar colors.
 */
const AGENT_COLOR_PALETTE: Record<string, { bg: string; text: string }> = {
  cobalt: { bg: '#9DC08B', text: '#1E3014' },  // sage green
  nova: { bg: '#9DC08B', text: '#1E3014' },    // sage green
  dev1: { bg: '#F59E87', text: '#3D1409' },    // peach
  ember: { bg: '#B6B2DF', text: '#211C4D' },   // lavender
  zephyr: { bg: '#B6B2DF', text: '#211C4D' },  // lavender
  falcon: { bg: '#95CBE9', text: '#0C3449' },  // sky blue
};

/**
 * Fallback color palette for unknown agent names.
 */
const FALLBACK_COLORS = [
  { bg: '#9DC08B', text: '#1E3014' }, // sage green
  { bg: '#F59E87', text: '#3D1409' }, // peach
  { bg: '#B6B2DF', text: '#211C4D' }, // lavender
  { bg: '#95CBE9', text: '#0C3449' }, // sky blue
  { bg: '#F5C28E', text: '#3D2409' }, // apricot
  { bg: '#E8A5B3', text: '#3D1420' }, // rose
  { bg: '#A5D4C8', text: '#143D30' }, // mint
  { bg: '#D4A5D8', text: '#3D1440' }, // orchid
];

/**
 * Get avatar colors (background and text) for an agent.
 */
export function getAgentColors(name: string): { bg: string; text: string } {
  const lowerName = name.toLowerCase();
  const paletteColor = AGENT_COLOR_PALETTE[lowerName];
  if (paletteColor) {
    return paletteColor;
  }
  // Fallback: hash the name for unknown agents
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const fallbackColor = FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
  return fallbackColor ?? { bg: '#9DC08B', text: '#1E3014' };
}

/**
 * Get a deterministic avatar background color from agent name.
 * @deprecated Use getAgentColors instead for both bg and text colors.
 */
export function getAvatarColor(name: string): string {
  return getAgentColors(name).bg;
}

/**
 * Get status dot color based on parsed status type.
 */
export function getStatusDotColor(type: ParsedLoomStatus['type']): string {
  switch (type) {
    case 'working':
    case 'planning':
    case 'dirty':
    case 'changes':
      return 'var(--color-status-working, #facc15)';
    case 'error':
      return 'var(--color-status-error, #ef4444)';
    case 'done':
      return 'var(--color-status-done, #22c55e)';
    case 'review':
      return 'var(--color-status-review, #3b82f6)';
    case 'idle':
    case 'ready':
    default:
      return 'var(--color-status-idle, #9ca3af)';
  }
}

/**
 * Build the status line text (e.g., "2 changes - webui/cobalt" or "Error - webui/ember").
 */
export function getStatusLine(parsed: ParsedLoomStatus, branch: string): string {
  let label: string;
  switch (parsed.type) {
    case 'working':
      label = parsed.taskId ? `Working: ${parsed.taskId}` : 'Working...';
      break;
    case 'planning':
      label = parsed.taskId ? `Planning: ${parsed.taskId}` : 'Planning...';
      break;
    case 'done':
      label = parsed.taskId ? `Done: ${parsed.taskId}` : 'Done';
      break;
    case 'review':
      label = parsed.taskId ? `Review: ${parsed.taskId}` : 'Awaiting review';
      break;
    case 'idle':
      label = 'Idle';
      break;
    case 'error':
      label = parsed.taskId ? `Error: ${parsed.taskId}` : 'Error';
      break;
    case 'dirty':
      label = 'Uncommitted changes';
      break;
    case 'changes':
      label = `${parsed.changeCount ?? 0} change${parsed.changeCount === 1 ? '' : 's'}`;
      break;
    case 'ready':
    default:
      label = 'Ready';
  }

  return `${label} \u2022 ${branch}`;
}

/**
 * AgentCard displays a single agent's status in a compact row with circular avatar.
 */
export function AgentCard({ agent, taskTitle, role, className, onClick }: AgentCardProps): JSX.Element {
  const parsed = parseLoomStatus(agent.status);
  const agentColors = getAgentColors(agent.name);
  const dotColor = getStatusDotColor(parsed.type);
  const statusLine = getStatusLine(parsed, agent.branch);
  const isError = parsed.type === 'error';
  const initial = agent.name.charAt(0) || '?';

  const rootClassName = [styles.card, className].filter(Boolean).join(' ');

  return (
    <div
      className={rootClassName}
      data-status={parsed.type}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `Agent: ${agent.name}` : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className={styles.avatarContainer}>
        <div
          className={styles.avatar}
          style={{ backgroundColor: agentColors.bg, color: agentColors.text }}
          aria-label={`${agent.name} avatar`}
        >
          {initial}
        </div>
        <span
          className={styles.statusDot}
          style={{ backgroundColor: dotColor }}
          aria-hidden="true"
        />
      </div>

      <div className={styles.info}>
        <div className={styles.infoMain}>
          <span className={styles.name}>{agent.name}</span>
          {role && <span className={styles.role}>{role}</span>}
        </div>
        <span
          className={styles.statusLine}
          data-error={isError || undefined}
          title={taskTitle || statusLine}
        >
          {statusLine}
        </span>
      </div>

      {agent.ahead > 0 && (
        <div className={styles.commitInfo}>
          <span className={styles.commitCount}>+{agent.ahead}</span>
          <span className={styles.changesText}>{agent.ahead === 1 ? 'change' : 'changes'}</span>
        </div>
      )}
    </div>
  );
}
