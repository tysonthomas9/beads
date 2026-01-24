/**
 * LoadingSkeleton component for displaying animated placeholder content.
 * Provides visual feedback during async operations with shimmer animation.
 * Supports base shapes (rect, text, circle) and preset variants for IssueCard and StatusColumn.
 */

import styles from './LoadingSkeleton.module.css';

/**
 * Shape variants for the base skeleton.
 */
export type SkeletonShape = 'rect' | 'text' | 'circle';

/**
 * Props for the LoadingSkeleton component.
 */
export interface LoadingSkeletonProps {
  /** Shape variant: 'rect' (default), 'text', or 'circle' */
  shape?: SkeletonShape;
  /** Width in pixels or CSS value (e.g., '100%') */
  width?: number | string;
  /** Height in pixels or CSS value */
  height?: number | string;
  /** Additional CSS class name */
  className?: string;
  /** Number of skeleton lines for 'text' shape */
  lines?: number;
}

/**
 * Props for preset skeleton variants.
 */
export interface LoadingSkeletonCardProps {
  /** Additional CSS class name */
  className?: string;
}

export interface LoadingSkeletonColumnProps {
  /** Additional CSS class name */
  className?: string;
  /** Number of card skeletons to show */
  cardCount?: number;
}

/**
 * Base LoadingSkeleton component.
 * Renders an animated placeholder in the specified shape.
 */
export function LoadingSkeleton({
  shape = 'rect',
  width,
  height,
  className,
  lines = 1,
}: LoadingSkeletonProps): JSX.Element {
  // Build class names
  const shapeClass = styles[shape] ?? styles.rect;
  const rootClassName = className
    ? `${styles.skeleton} ${shapeClass} ${className}`
    : `${styles.skeleton} ${shapeClass}`;

  // Build inline styles for custom dimensions
  const style: React.CSSProperties = {};
  if (width !== undefined) {
    style.width = typeof width === 'number' ? `${width}px` : width;
  }
  if (height !== undefined) {
    style.height = typeof height === 'number' ? `${height}px` : height;
  }

  // For text shape with multiple lines
  if (shape === 'text' && lines > 1) {
    return (
      <div className={styles.textContainer} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={rootClassName}
            style={{
              ...style,
              // Last line is shorter
              width: i === lines - 1 ? '60%' : style.width,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={rootClassName}
      style={Object.keys(style).length > 0 ? style : undefined}
      aria-hidden="true"
    />
  );
}

/**
 * Card skeleton matching IssueCard dimensions.
 * Use when loading cards in the Kanban board.
 */
function Card({ className }: LoadingSkeletonCardProps): JSX.Element {
  const rootClassName = className
    ? `${styles.card} ${className}`
    : styles.card;

  return (
    <div className={rootClassName} aria-hidden="true">
      <div className={styles.cardHeader}>
        <LoadingSkeleton shape="text" width={60} height={12} />
        <LoadingSkeleton shape="rect" width={28} height={20} />
      </div>
      <LoadingSkeleton shape="text" lines={2} height={14} />
    </div>
  );
}

/**
 * Column skeleton matching StatusColumn header.
 * Use when loading columns in the Kanban board.
 */
function Column({
  className,
  cardCount = 3,
}: LoadingSkeletonColumnProps): JSX.Element {
  const rootClassName = className
    ? `${styles.column} ${className}`
    : styles.column;

  return (
    <div className={rootClassName} aria-hidden="true">
      <div className={styles.columnHeader}>
        <LoadingSkeleton shape="text" width={80} height={16} />
        <LoadingSkeleton shape="circle" width={24} height={24} />
      </div>
      <div className={styles.columnContent}>
        {Array.from({ length: cardCount }, (_, i) => (
          <Card key={i} />
        ))}
      </div>
    </div>
  );
}

// Attach preset variants as static properties
LoadingSkeleton.Card = Card;
LoadingSkeleton.Column = Column;
