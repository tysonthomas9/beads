/**
 * IssueDetailPanel component.
 * Slide-out side panel that displays detailed information about a selected issue.
 */

import { useEffect, useRef } from 'react';
import type { Issue } from '@/types';
import styles from './IssueDetailPanel.module.css';

/**
 * Props for the IssueDetailPanel component.
 */
export interface IssueDetailPanelProps {
  /** Whether the panel is open */
  isOpen: boolean;
  /** The issue to display (null when closed or loading) */
  issue: Issue | null;
  /** Callback when panel should close */
  onClose: () => void;
  /** Additional CSS class name */
  className?: string;
  /** Children to render in the panel content area */
  children?: React.ReactNode;
}

/**
 * IssueDetailPanel displays issue details in a slide-out panel from the right edge.
 * Features:
 * - Smooth slide-in/out animation with CSS transforms
 * - Backdrop overlay that dims the background
 * - Closes on backdrop click or Escape key
 * - Locks body scroll when open
 * - Accessible with proper ARIA attributes
 */
export function IssueDetailPanel({
  isOpen,
  issue,
  onClose,
  className,
  children,
}: IssueDetailPanelProps): JSX.Element {
  const panelRef = useRef<HTMLElement>(null);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open, restoring previous value on close
  useEffect(() => {
    if (isOpen) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [isOpen]);

  // Focus management: focus the panel when opened, restore focus on close
  useEffect(() => {
    if (isOpen && panelRef.current) {
      const previouslyFocused = document.activeElement as HTMLElement | null;
      panelRef.current.focus();
      return () => {
        if (previouslyFocused?.focus) {
          previouslyFocused.focus();
        }
      };
    }
  }, [isOpen]);

  // Build root class name
  const rootClassName = [styles.overlay, isOpen && styles.open, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={rootClassName}
      onClick={onClose}
      data-testid="issue-detail-overlay"
      aria-hidden={!isOpen}
    >
      <aside
        ref={panelRef}
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={issue ? `Details for ${issue.title}` : 'Issue details'}
        tabIndex={-1}
        data-testid="issue-detail-panel"
      >
        <div className={styles.content}>{children}</div>
      </aside>
    </div>
  );
}
