/**
 * BlockedBadge component.
 * Shows a visual indicator for blocked issues with blocker count and tooltip.
 */

import { useState, useCallback } from 'react';
import styles from './BlockedBadge.module.css';

/**
 * Props for the BlockedBadge component.
 */
export interface BlockedBadgeProps {
  /** Number of issues blocking this one */
  blockedByCount: number;
  /** IDs of blocking issues (for tooltip) */
  blockedBy?: string[];
  /** Additional CSS class name */
  className?: string;
}

/**
 * Format blocker IDs for tooltip display.
 * Shows first 5, then "and N more..." if there are more.
 */
function formatBlockersList(blockedBy: string[]): string[] {
  const maxDisplay = 5;
  if (blockedBy.length <= maxDisplay) {
    return blockedBy;
  }
  const displayed = blockedBy.slice(0, maxDisplay);
  const remaining = blockedBy.length - maxDisplay;
  return [...displayed, `and ${remaining} more...`];
}

/**
 * BlockedBadge displays a blocked indicator badge.
 * Shows a red pill with block icon and count.
 * Tooltip shows the list of blocking issues on hover.
 */
export function BlockedBadge({
  blockedByCount,
  blockedBy = [],
  className,
}: BlockedBadgeProps): JSX.Element | null {
  const [showTooltip, setShowTooltip] = useState(false);

  const handleShow = useCallback(() => {
    setShowTooltip(true);
  }, []);

  const handleHide = useCallback(() => {
    setShowTooltip(false);
  }, []);

  // Don't render if count is 0
  if (blockedByCount === 0) {
    return null;
  }

  const rootClassName = className
    ? `${styles.blockedBadge} ${className}`
    : styles.blockedBadge;

  const blockerList = formatBlockersList(blockedBy);

  return (
    <span
      className={rootClassName}
      onMouseEnter={handleShow}
      onMouseLeave={handleHide}
      onFocus={handleShow}
      onBlur={handleHide}
      tabIndex={0}
      role="button"
      aria-label={`Blocked by ${blockedByCount} issue${blockedByCount === 1 ? '' : 's'}`}
    >
      <span className={styles.icon} aria-hidden="true">
        ⛔
      </span>
      <span className={styles.count}>{blockedByCount}</span>

      {showTooltip && blockerList.length > 0 && (
        <div className={styles.tooltip} role="tooltip">
          <div className={styles.tooltipHeader}>Blocked by:</div>
          <ul className={styles.tooltipList}>
            {blockerList.map((id, index) => (
              <li key={index} className={styles.tooltipItem}>
                {id}
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
