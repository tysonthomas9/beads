/**
 * MonitorDashboard container component for multi-agent monitoring.
 *
 * Renders a responsive 2x2 grid layout containing:
 * - Agent Activity Panel (top-left)
 * - Work Pipeline Panel (top-right)
 * - Project Health Panel (bottom-left)
 * - Mini Dependency Graph (bottom-right)
 */

import styles from './MonitorDashboard.module.css';

/**
 * Props for the MonitorDashboard component.
 */
export interface MonitorDashboardProps {
  /** Additional CSS class name */
  className?: string;
}

/**
 * MonitorDashboard renders the 2x2 grid layout for multi-agent monitoring.
 * Each panel is a placeholder that will be replaced by dedicated components.
 */
export function MonitorDashboard({
  className,
}: MonitorDashboardProps): JSX.Element {
  const rootClassName = className
    ? `${styles.dashboard} ${className}`
    : styles.dashboard;

  return (
    <div className={rootClassName} data-testid="monitor-dashboard">
      {/* Top-left: Agent Activity */}
      <section
        className={`${styles.panel} ${styles.agentActivity}`}
        aria-labelledby="agent-activity-heading"
      >
        <header className={styles.panelHeader}>
          <h2 id="agent-activity-heading" className={styles.panelTitle}>
            Agent Activity
          </h2>
          <span className={styles.refreshIndicator}>↻ 5s</span>
        </header>
        <div className={styles.panelContent}>
          <div className={styles.placeholder}>
            AgentActivityPanel placeholder
          </div>
        </div>
      </section>

      {/* Top-right: Work Pipeline */}
      <section
        className={`${styles.panel} ${styles.workPipeline}`}
        aria-labelledby="work-pipeline-heading"
      >
        <header className={styles.panelHeader}>
          <h2 id="work-pipeline-heading" className={styles.panelTitle}>
            Work Pipeline
          </h2>
          <button className={styles.settingsButton} aria-label="Pipeline settings">
            ⚙️
          </button>
        </header>
        <div className={styles.panelContent}>
          <div className={styles.placeholder}>
            WorkPipelinePanel placeholder
          </div>
        </div>
      </section>

      {/* Bottom-left: Project Health */}
      <section
        className={`${styles.panel} ${styles.projectHealth}`}
        aria-labelledby="project-health-heading"
      >
        <header className={styles.panelHeader}>
          <h2 id="project-health-heading" className={styles.panelTitle}>
            Project Health
          </h2>
        </header>
        <div className={styles.panelContent}>
          <div className={styles.placeholder}>
            ProjectHealthPanel placeholder
          </div>
        </div>
      </section>

      {/* Bottom-right: Mini Dependency Graph */}
      <section
        className={`${styles.panel} ${styles.miniGraph}`}
        aria-labelledby="mini-graph-heading"
      >
        <header className={styles.panelHeader}>
          <h2 id="mini-graph-heading" className={styles.panelTitle}>
            Blocking Dependencies
          </h2>
          <button className={styles.expandButton} aria-label="Expand graph">
            ↗
          </button>
        </header>
        <div className={styles.panelContent}>
          <div className={styles.placeholder}>
            MiniDependencyGraph placeholder
          </div>
        </div>
      </section>
    </div>
  );
}
