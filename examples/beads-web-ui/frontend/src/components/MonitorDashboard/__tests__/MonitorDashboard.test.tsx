/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MonitorDashboard } from '../MonitorDashboard';

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

  it('shows placeholder content for each panel', () => {
    render(<MonitorDashboard />);

    expect(screen.getByText(/agentactivitypanel placeholder/i)).toBeInTheDocument();
    expect(screen.getByText(/workpipelinepanel placeholder/i)).toBeInTheDocument();
    expect(screen.getByText(/projecthealthpanel placeholder/i)).toBeInTheDocument();
    expect(screen.getByText(/minidependencygraph placeholder/i)).toBeInTheDocument();
  });

  it('has refresh indicator in agent activity panel', () => {
    render(<MonitorDashboard />);

    expect(screen.getByText('↻ 5s')).toBeInTheDocument();
  });
});
