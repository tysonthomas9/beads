/**
 * BlockedBadge component displays a badge showing how many issues are blocked by a node.
 * Used in the Graph view to indicate blocking relationships at a glance.
 */

import { memo } from 'react';
import styles from './BlockedBadge.module.css';

/**
 * Props for the BlockedBadge component.
 */
export interface BlockedBadgeProps {
  /** Number of issues blocked by this issue */
  blockedCount: number;
  /** Optional list of blocked issue IDs for tooltip */
  blockedBy?: string[];
  /** Optional click handler */
  onClick?: () => void;
  /** Additional CSS class name */
  className?: string;
}

/**
 * Maximum number of blockers to show in tooltip before truncating.
 */
const MAX_TOOLTIP_ITEMS = 5;

/**
 * BlockedBadge renders a small badge showing the count of blocked issues.
 * Shows a tooltip on hover with the first few blocker IDs.
 *
 * @example
 * ```tsx
 * <BlockedBadge blockedCount={3} blockedBy={['bd-abc', 'bd-def', 'bd-ghi']} />
 * ```
 */
function BlockedBadgeComponent({
  blockedCount,
  blockedBy,
  onClick,
  className,
}: BlockedBadgeProps): JSX.Element | null {
  // Don't render if no blocked issues
  if (blockedCount <= 0) {
    return null;
  }

  // Build tooltip text
  let tooltipText = `Blocks ${blockedCount} issue${blockedCount === 1 ? '' : 's'}`;
  if (blockedBy && blockedBy.length > 0) {
    const displayIds = blockedBy.slice(0, MAX_TOOLTIP_ITEMS);
    const remaining = blockedBy.length - MAX_TOOLTIP_ITEMS;
    tooltipText = displayIds.join('\n');
    if (remaining > 0) {
      tooltipText += `\n...and ${remaining} more`;
    }
  }

  // Keyboard handler for accessibility
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (onClick && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onClick();
    }
  };

  const rootClassName = className
    ? `${styles.blockedBadge} ${className}`
    : styles.blockedBadge;

  return (
    <span
      className={rootClassName}
      title={tooltipText}
      onClick={onClick}
      onKeyDown={onClick ? handleKeyDown : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`Blocks ${blockedCount} issue${blockedCount === 1 ? '' : 's'}`}
      data-testid="blocked-badge"
    >
      {blockedCount}
    </span>
  );
}

/**
 * Memoized BlockedBadge component.
 */
export const BlockedBadge = memo(BlockedBadgeComponent);
