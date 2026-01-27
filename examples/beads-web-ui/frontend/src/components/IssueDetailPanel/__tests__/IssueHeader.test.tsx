/**
 * @vitest-environment jsdom
 */

/**
 * Unit tests for IssueHeader component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import { IssueHeader } from '../IssueHeader';
import type { Issue } from '@/types';

const mockIssue: Issue = {
  id: 'test-123',
  title: 'Test Issue Title',
  status: 'in_progress',
  priority: 2,
  created_at: '2026-01-23T00:00:00Z',
  updated_at: '2026-01-23T00:00:00Z',
};

describe('IssueHeader', () => {
  it('renders issue ID', () => {
    render(<IssueHeader issue={mockIssue} onClose={() => {}} />);
    expect(screen.getByTestId('issue-id')).toHaveTextContent('test-123');
  });

  it('renders issue title', () => {
    render(<IssueHeader issue={mockIssue} onClose={() => {}} />);
    expect(screen.getByTestId('issue-title')).toHaveTextContent('Test Issue Title');
  });

  it('renders status badge with formatted text', () => {
    render(<IssueHeader issue={mockIssue} onClose={() => {}} />);
    const badge = screen.getByTestId('issue-status-badge');
    expect(badge).toHaveTextContent('In Progress');
    expect(badge).toHaveAttribute('data-status', 'in_progress');
  });

  it('renders status badge with role="status"', () => {
    render(<IssueHeader issue={mockIssue} onClose={() => {}} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('defaults to "Open" when status is undefined', () => {
    const issueNoStatus = { ...mockIssue, status: undefined };
    render(<IssueHeader issue={issueNoStatus} onClose={() => {}} />);
    expect(screen.getByTestId('issue-status-badge')).toHaveTextContent('Open');
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<IssueHeader issue={mockIssue} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('header-close-button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('close button has accessible label', () => {
    render(<IssueHeader issue={mockIssue} onClose={() => {}} />);
    expect(screen.getByLabelText('Close panel')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<IssueHeader issue={mockIssue} onClose={() => {}} className="custom" />);
    expect(screen.getByTestId('issue-header')).toHaveClass('custom');
  });

  it('renders open status with correct data attribute', () => {
    const openIssue = { ...mockIssue, status: 'open' };
    render(<IssueHeader issue={openIssue} onClose={() => {}} />);
    const badge = screen.getByTestId('issue-status-badge');
    expect(badge).toHaveTextContent('Open');
    expect(badge).toHaveAttribute('data-status', 'open');
  });

  it('renders closed status with correct data attribute', () => {
    const closedIssue = { ...mockIssue, status: 'closed' };
    render(<IssueHeader issue={closedIssue} onClose={() => {}} />);
    const badge = screen.getByTestId('issue-status-badge');
    expect(badge).toHaveTextContent('Closed');
    expect(badge).toHaveAttribute('data-status', 'closed');
  });

  it('renders blocked status with correct data attribute', () => {
    const blockedIssue = { ...mockIssue, status: 'blocked' };
    render(<IssueHeader issue={blockedIssue} onClose={() => {}} />);
    const badge = screen.getByTestId('issue-status-badge');
    expect(badge).toHaveTextContent('Blocked');
    expect(badge).toHaveAttribute('data-status', 'blocked');
  });
});
