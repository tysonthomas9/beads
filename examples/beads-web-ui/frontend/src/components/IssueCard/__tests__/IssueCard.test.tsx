/**
 * @vitest-environment jsdom
 */

/**
 * Unit tests for IssueCard component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import { IssueCard } from '../IssueCard';
import type { Issue } from '@/types';

/**
 * Create a minimal test issue with required fields.
 */
function createTestIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'test-issue-abc123',
    title: 'Test Issue Title',
    priority: 2,
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-01-15T10:30:00Z',
    ...overrides,
  };
}

describe('IssueCard', () => {
  describe('rendering', () => {
    it('renders issue title', () => {
      const issue = createTestIssue({ title: 'My Issue Title' });
      render(<IssueCard issue={issue} />);

      expect(screen.getByRole('heading', { name: 'My Issue Title' })).toBeInTheDocument();
    });

    it('renders issue ID (shortened)', () => {
      const issue = createTestIssue({ id: 'beads-abc123def456' });
      render(<IssueCard issue={issue} />);

      // Should show last 7 characters
      expect(screen.getByText('3def456')).toBeInTheDocument();
    });

    it('renders short ID as-is', () => {
      const issue = createTestIssue({ id: 'bd-xyz' });
      render(<IssueCard issue={issue} />);

      expect(screen.getByText('bd-xyz')).toBeInTheDocument();
    });

    it('renders priority badge with correct text', () => {
      const issue = createTestIssue({ priority: 1 });
      render(<IssueCard issue={issue} />);

      expect(screen.getByText('P1')).toBeInTheDocument();
    });

    it('renders with article element', () => {
      const issue = createTestIssue();
      const { container } = render(<IssueCard issue={issue} />);

      expect(container.querySelector('article')).toBeInTheDocument();
    });
  });

  describe('priority display', () => {
    it.each([0, 1, 2, 3, 4] as const)('renders P%i correctly', (priority) => {
      const issue = createTestIssue({ priority });
      const { container } = render(<IssueCard issue={issue} />);

      expect(screen.getByText(`P${priority}`)).toBeInTheDocument();
      expect(container.querySelector('[data-priority]')).toHaveAttribute(
        'data-priority',
        String(priority)
      );
    });

    it('defaults to P4 when priority is undefined', () => {
      const issue = createTestIssue();
      // @ts-expect-error Testing undefined priority
      delete issue.priority;
      render(<IssueCard issue={issue} />);

      expect(screen.getByText('P4')).toBeInTheDocument();
    });

    it('defaults to P4 for out of range priority (negative)', () => {
      // @ts-expect-error Testing invalid priority
      const issue = createTestIssue({ priority: -1 });
      render(<IssueCard issue={issue} />);

      expect(screen.getByText('P4')).toBeInTheDocument();
    });

    it('defaults to P4 for out of range priority (> 4)', () => {
      // @ts-expect-error Testing invalid priority
      const issue = createTestIssue({ priority: 5 });
      render(<IssueCard issue={issue} />);

      expect(screen.getByText('P4')).toBeInTheDocument();
    });
  });

  describe('onClick interaction', () => {
    it('calls onClick when card is clicked', () => {
      const issue = createTestIssue();
      const handleClick = vi.fn();
      render(<IssueCard issue={issue} onClick={handleClick} />);

      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledWith(issue);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not crash when onClick is not provided', () => {
      const issue = createTestIssue();
      render(<IssueCard issue={issue} />);

      // Should not throw when clicked
      const article = document.querySelector('article');
      expect(() => fireEvent.click(article!)).not.toThrow();
    });

    it('calls onClick on Enter key', () => {
      const issue = createTestIssue();
      const handleClick = vi.fn();
      render(<IssueCard issue={issue} onClick={handleClick} />);

      fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
      expect(handleClick).toHaveBeenCalledWith(issue);
    });

    it('calls onClick on Space key', () => {
      const issue = createTestIssue();
      const handleClick = vi.fn();
      render(<IssueCard issue={issue} onClick={handleClick} />);

      fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
      expect(handleClick).toHaveBeenCalledWith(issue);
    });

    it('does not call onClick on other keys', () => {
      const issue = createTestIssue();
      const handleClick = vi.fn();
      render(<IssueCard issue={issue} onClick={handleClick} />);

      fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' });
      fireEvent.keyDown(screen.getByRole('button'), { key: 'Escape' });
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('has aria-label with issue title', () => {
      const issue = createTestIssue({ title: 'Test Accessibility' });
      render(<IssueCard issue={issue} />);

      expect(screen.getByLabelText('Issue: Test Accessibility')).toBeInTheDocument();
    });

    it('has button role when onClick is provided', () => {
      const issue = createTestIssue();
      render(<IssueCard issue={issue} onClick={() => {}} />);

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('does not have button role when onClick is not provided', () => {
      const issue = createTestIssue();
      render(<IssueCard issue={issue} />);

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('is keyboard focusable when onClick is provided', () => {
      const issue = createTestIssue();
      const { container } = render(<IssueCard issue={issue} onClick={() => {}} />);

      const article = container.querySelector('article');
      expect(article).toHaveAttribute('tabIndex', '0');
    });

    it('is not keyboard focusable when onClick is not provided', () => {
      const issue = createTestIssue();
      const { container } = render(<IssueCard issue={issue} />);

      const article = container.querySelector('article');
      expect(article).not.toHaveAttribute('tabIndex');
    });

    it('priority badge has aria-label', () => {
      const issue = createTestIssue({ priority: 0 });
      render(<IssueCard issue={issue} />);

      expect(screen.getByLabelText('Priority 0')).toBeInTheDocument();
    });
  });

  describe('props', () => {
    it('applies className prop to root element', () => {
      const issue = createTestIssue();
      const { container } = render(
        <IssueCard issue={issue} className="custom-class" />
      );

      const article = container.querySelector('article');
      expect(article).toHaveClass('custom-class');
    });

    it('data-priority attribute matches issue priority', () => {
      const issue = createTestIssue({ priority: 3 });
      const { container } = render(<IssueCard issue={issue} />);

      const article = container.querySelector('article');
      expect(article).toHaveAttribute('data-priority', '3');
    });
  });

  describe('edge cases', () => {
    it('renders "Untitled" for missing title', () => {
      const issue = createTestIssue({ title: '' });
      render(<IssueCard issue={issue} />);

      expect(screen.getByRole('heading', { name: 'Untitled' })).toBeInTheDocument();
    });

    it('renders "unknown" for missing ID', () => {
      const issue = createTestIssue({ id: '' });
      render(<IssueCard issue={issue} />);

      expect(screen.getByText('unknown')).toBeInTheDocument();
    });

    it('handles very long title', () => {
      const longTitle = 'A'.repeat(200);
      const issue = createTestIssue({ title: longTitle });
      render(<IssueCard issue={issue} />);

      // Should still render, truncation is handled by CSS
      expect(screen.getByRole('heading', { name: longTitle })).toBeInTheDocument();
    });

    it('renders with minimal issue props', () => {
      // Only required fields
      const issue: Issue = {
        id: 'min-id',
        title: 'Minimal',
        priority: 2,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      render(<IssueCard issue={issue} />);

      expect(screen.getByRole('heading', { name: 'Minimal' })).toBeInTheDocument();
      expect(screen.getByText('min-id')).toBeInTheDocument();
      expect(screen.getByText('P2')).toBeInTheDocument();
    });

    it('renders with full issue props', () => {
      const issue = createTestIssue({
        id: 'full-issue-id',
        title: 'Full Issue',
        priority: 0,
        status: 'open',
        description: 'A description',
        assignee: 'user',
        labels: ['bug', 'urgent'],
      });
      render(<IssueCard issue={issue} />);

      expect(screen.getByRole('heading', { name: 'Full Issue' })).toBeInTheDocument();
      expect(screen.getByText('P0')).toBeInTheDocument();
    });
  });
});
