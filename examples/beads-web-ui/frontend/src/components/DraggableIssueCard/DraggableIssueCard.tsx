/**
 * DraggableIssueCard component for Kanban board.
 * Wraps IssueCard with @dnd-kit useDraggable hook to enable drag-and-drop.
 * Supports both normal rendering and overlay mode (for DragOverlay).
 */

import { useDraggable } from '@dnd-kit/core';
import { IssueCard, type IssueCardProps } from '../IssueCard';
import styles from './DraggableIssueCard.module.css';

/**
 * Props for the DraggableIssueCard component.
 */
export interface DraggableIssueCardProps extends IssueCardProps {
  /** Whether this card is being rendered in a DragOverlay (no drag listeners) */
  isOverlay?: boolean;
}

/**
 * DraggableIssueCard wraps IssueCard with drag-and-drop functionality.
 * Uses @dnd-kit useDraggable hook to enable dragging issues between columns.
 *
 * When rendered normally, it applies drag listeners and visual feedback.
 * When rendered in overlay mode (isOverlay=true), it renders without drag
 * functionality for use in DragOverlay.
 */
export function DraggableIssueCard({
  issue,
  onClick,
  className,
  isOverlay = false,
}: DraggableIssueCardProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: issue.id,
      data: { issue, type: 'issue' },
      disabled: isOverlay,
    });

  // Build IssueCard props, only including onClick if defined
  // (required for exactOptionalPropertyTypes compatibility)
  const cardProps = {
    issue,
    ...(onClick !== undefined && { onClick }),
    ...(className !== undefined && { className }),
  };

  // In overlay mode, render without drag functionality
  if (isOverlay) {
    return (
      <div className={styles.overlay}>
        <IssueCard {...cardProps} />
      </div>
    );
  }

  // Apply transform using CSS translate3d for hardware acceleration
  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={styles.draggable}
      data-dragging={isDragging ? 'true' : undefined}
      {...listeners}
      {...attributes}
    >
      <IssueCard {...cardProps} />
    </div>
  );
}
