/**
 * MonitorDashboard container component for multi-agent monitoring.
 *
 * Renders a responsive 2x2 grid layout containing:
 * - Agent Activity Panel (top-left)
 * - Work Pipeline Panel (top-right)
 * - Project Health Panel (bottom-left)
 * - Mini Dependency Graph (bottom-right)
 */

import { useAgents, useBlockedIssues } from '@/hooks';
import type { Issue } from '@/types';
import { AgentActivityPanel } from './AgentActivityPanel';
import { ProjectHealthPanel } from './ProjectHealthPanel';
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
  // Fetch agent status and stats
  const { agents, agentTasks, sync, stats, isLoading, isConnected, lastUpdated } = useAgents({ pollInterval: 5000 });

  // Fetch blocked issues for bottleneck detection
  const { data: blockedIssues, loading: isLoadingBlocked } = useBlockedIssues({
    pollInterval: 30000,
  });

  // Handler for bottleneck clicks - placeholder for navigation
  const handleBottleneckClick = (issue: Pick<Issue, 'id' | 'title'>) => {
    // TODO: Integrate with IssueDetailPanel when available
    console.log('Bottleneck clicked:', issue.id);
  };

  // Handler for agent clicks - placeholder for agent details
  const handleAgentClick = (agentName: string) => {
    // TODO: Open agent detail drawer/modal when available
    console.log('Agent clicked:', agentName);
  };

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
          <AgentActivityPanel
            agents={agents}
            agentTasks={agentTasks}
            sync={sync}
            isLoading={isLoading}
            isConnected={isConnected}
            lastUpdated={lastUpdated}
            onAgentClick={handleAgentClick}
          />
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
          <ProjectHealthPanel
            stats={stats}
            blockedIssues={blockedIssues}
            isLoading={isLoadingBlocked}
            onBottleneckClick={handleBottleneckClick}
          />
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
