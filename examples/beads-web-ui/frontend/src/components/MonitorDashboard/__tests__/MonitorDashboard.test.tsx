/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MonitorDashboard } from '../MonitorDashboard';

// Mock the hooks to prevent API calls in tests
vi.mock('@/hooks', () => ({
  useAgents: () => ({
    stats: { open: 10, closed: 5, total: 15, completion: 33.3 },
    agents: [],
    tasks: { needs_planning: 0, ready_to_implement: 0, in_progress: 0, need_review: 0, blocked: 0 },
    taskLists: { needsPlanning: [], readyToImplement: [], needsReview: [], inProgress: [], blocked: [] },
    agentTasks: {},
    sync: { db_synced: true, db_last_sync: '', git_needs_push: 0, git_needs_pull: 0 },
    isLoading: false,
    isConnected: true,
    error: null,
    lastUpdated: new Date(),
    refetch: vi.fn(),
  }),
  useBlockedIssues: () => ({
    data: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

describe('MonitorDashboard', () => {
  it('renders all four panels', () => {
    render(<MonitorDashboard />);

    expect(screen.getByRole('heading', { name: /agent activity/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /work pipeline/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /project health/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /blocking dependencies/i })).toBeInTheDocument();
  });

  it('renders with testid for e2e tests', () => {
    render(<MonitorDashboard />);

    expect(screen.getByTestId('monitor-dashboard')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<MonitorDashboard className="custom-class" />);

    const dashboard = screen.getByTestId('monitor-dashboard');
    expect(dashboard).toHaveClass('custom-class');
  });

  it('renders settings button for work pipeline', () => {
    render(<MonitorDashboard />);

    const settingsButton = screen.getByRole('button', { name: /pipeline settings/i });
    expect(settingsButton).toBeInTheDocument();
  });

  it('renders expand button for mini graph', () => {
    render(<MonitorDashboard />);

    const expandButton = screen.getByRole('button', { name: /expand graph/i });
    expect(expandButton).toBeInTheDocument();
  });

  it('shows placeholder content for panels not yet implemented', () => {
    render(<MonitorDashboard />);

    // These panels still have placeholders
    expect(screen.getByText(/workpipelinepanel placeholder/i)).toBeInTheDocument();
    expect(screen.getByText(/minidependencygraph placeholder/i)).toBeInTheDocument();
  });

  it('renders AgentActivityPanel', () => {
    render(<MonitorDashboard />);

    // AgentActivityPanel is now implemented
    expect(screen.getByTestId('agent-activity-panel')).toBeInTheDocument();
  });

  it('renders ProjectHealthPanel with stats', () => {
    render(<MonitorDashboard />);

    // ProjectHealthPanel is now implemented
    expect(screen.getByTestId('project-health-panel')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument(); // open count
    expect(screen.getByText('5')).toBeInTheDocument(); // closed count
    expect(screen.getByText('15')).toBeInTheDocument(); // total count
  });

  it('has refresh indicator in agent activity panel', () => {
    render(<MonitorDashboard />);

    expect(screen.getByText('↻ 5s')).toBeInTheDocument();
  });
});
