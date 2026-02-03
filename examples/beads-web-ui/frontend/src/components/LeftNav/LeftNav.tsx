/**
 * LeftNav component - vertical navigation rail for switching views.
 * Provides icon-only buttons with tooltips for Kanban, Monitor, etc.
 */

import type { ViewMode } from '../ViewSwitcher';
import styles from './LeftNav.module.css';

/**
 * Props for the LeftNav component.
 */
export interface LeftNavProps {
  /** Currently active view */
  activeView: ViewMode;
  /** Callback when view is changed */
  onChange: (view: ViewMode) => void;
}

/**
 * Kanban icon (grid/board view).
 */
function KanbanIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="5" height="16" rx="1" fill="currentColor" />
      <rect x="8" y="2" width="5" height="10" rx="1" fill="currentColor" />
      <rect x="14" y="2" width="4" height="13" rx="1" fill="currentColor" />
    </svg>
  );
}

/**
 * Monitor icon (dashboard/grid view).
 */
function MonitorIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="7" height="7" rx="1" fill="currentColor" />
      <rect x="11" y="2" width="7" height="7" rx="1" fill="currentColor" />
      <rect x="2" y="11" width="7" height="7" rx="1" fill="currentColor" />
      <rect x="11" y="11" width="7" height="7" rx="1" fill="currentColor" />
    </svg>
  );
}

/**
 * LeftNav provides a vertical rail with icon buttons for view switching.
 */
export function LeftNav({ activeView, onChange }: LeftNavProps): JSX.Element {
  return (
    <aside className={styles.leftNav} role="navigation" aria-label="View navigation">
      <button
        type="button"
        className={`${styles.navIcon} ${activeView === 'kanban' ? styles.active : ''}`}
        onClick={() => onChange('kanban')}
        aria-label="Kanban view"
        aria-pressed={activeView === 'kanban'}
      >
        <KanbanIcon />
        <span className={styles.tooltip}>Kanban</span>
      </button>
      <button
        type="button"
        className={`${styles.navIcon} ${activeView === 'monitor' ? styles.active : ''}`}
        onClick={() => onChange('monitor')}
        aria-label="Monitor view"
        aria-pressed={activeView === 'monitor'}
      >
        <MonitorIcon />
        <span className={styles.tooltip}>Monitor</span>
      </button>
    </aside>
  );
}
