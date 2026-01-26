/**
 * @vitest-environment jsdom
 */

/**
 * Unit tests for BlockedBadge component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import { BlockedBadge } from '../BlockedBadge';

describe('BlockedBadge', () => {
  describe('rendering', () => {
    it('renders with blockedByCount of 1', () => {
      render(<BlockedBadge blockedByCount={1} />);

      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('renders with blockedByCount greater than 1', () => {
      render(<BlockedBadge blockedByCount={5} />);

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('renders the block icon', () => {
      render(<BlockedBadge blockedByCount={1} />);

      // The icon is rendered with aria-hidden
      const icon = screen.getByText('⛔');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('returns null when blockedByCount is 0', () => {
      const { container } = render(<BlockedBadge blockedByCount={0} />);

      expect(container.firstChild).toBeNull();
    });

    it('applies custom className', () => {
      render(<BlockedBadge blockedByCount={1} className="custom-badge-class" />);

      const badge = screen.getByLabelText('Blocked by 1 issue');
      expect(badge).toHaveClass('custom-badge-class');
    });

    it('renders as a span element', () => {
      render(<BlockedBadge blockedByCount={1} />);

      const badge = screen.getByLabelText('Blocked by 1 issue');
      expect(badge.tagName).toBe('SPAN');
    });
  });

  describe('accessibility', () => {
    it('has correct aria-label for single blocker', () => {
      render(<BlockedBadge blockedByCount={1} />);

      expect(screen.getByLabelText('Blocked by 1 issue')).toBeInTheDocument();
    });

    it('has correct aria-label for multiple blockers', () => {
      render(<BlockedBadge blockedByCount={3} />);

      expect(screen.getByLabelText('Blocked by 3 issues')).toBeInTheDocument();
    });

    it('has correct aria-label for many blockers', () => {
      render(<BlockedBadge blockedByCount={10} />);

      expect(screen.getByLabelText('Blocked by 10 issues')).toBeInTheDocument();
    });
  });

  describe('tooltip behavior', () => {
    it('shows tooltip on mouse enter', () => {
      render(
        <BlockedBadge
          blockedByCount={2}
          blockedBy={['issue-1', 'issue-2']}
        />
      );

      const badge = screen.getByLabelText('Blocked by 2 issues');
      fireEvent.mouseEnter(badge);

      expect(screen.getByRole('tooltip')).toBeInTheDocument();
      expect(screen.getByText('Blocked by:')).toBeInTheDocument();
      expect(screen.getByText('issue-1')).toBeInTheDocument();
      expect(screen.getByText('issue-2')).toBeInTheDocument();
    });

    it('hides tooltip on mouse leave', () => {
      render(
        <BlockedBadge
          blockedByCount={2}
          blockedBy={['issue-1', 'issue-2']}
        />
      );

      const badge = screen.getByLabelText('Blocked by 2 issues');
      fireEvent.mouseEnter(badge);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();

      fireEvent.mouseLeave(badge);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('does not show tooltip when blockedBy is empty', () => {
      render(<BlockedBadge blockedByCount={1} blockedBy={[]} />);

      const badge = screen.getByLabelText('Blocked by 1 issue');
      fireEvent.mouseEnter(badge);

      // Tooltip should not appear when blockedBy array is empty
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('does not show tooltip when blockedBy is not provided', () => {
      render(<BlockedBadge blockedByCount={1} />);

      const badge = screen.getByLabelText('Blocked by 1 issue');
      fireEvent.mouseEnter(badge);

      // Tooltip should not appear when blockedBy is undefined
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('tooltip has correct header', () => {
      render(
        <BlockedBadge
          blockedByCount={1}
          blockedBy={['blocker-id']}
        />
      );

      const badge = screen.getByLabelText('Blocked by 1 issue');
      fireEvent.mouseEnter(badge);

      expect(screen.getByText('Blocked by:')).toBeInTheDocument();
    });

    it('tooltip displays blockers as list items', () => {
      render(
        <BlockedBadge
          blockedByCount={3}
          blockedBy={['blocker-1', 'blocker-2', 'blocker-3']}
        />
      );

      const badge = screen.getByLabelText('Blocked by 3 issues');
      fireEvent.mouseEnter(badge);

      const listItems = screen.getAllByRole('listitem');
      expect(listItems).toHaveLength(3);
      expect(listItems[0]).toHaveTextContent('blocker-1');
      expect(listItems[1]).toHaveTextContent('blocker-2');
      expect(listItems[2]).toHaveTextContent('blocker-3');
    });
  });

  describe('formatBlockersList function', () => {
    it('shows all blockers when 5 or fewer', () => {
      const blockers = ['id-1', 'id-2', 'id-3', 'id-4', 'id-5'];
      render(<BlockedBadge blockedByCount={5} blockedBy={blockers} />);

      const badge = screen.getByLabelText('Blocked by 5 issues');
      fireEvent.mouseEnter(badge);

      blockers.forEach((id) => {
        expect(screen.getByText(id)).toBeInTheDocument();
      });
      expect(screen.queryByText(/and \d+ more/)).not.toBeInTheDocument();
    });

    it('truncates list and shows "and N more..." when more than 5 blockers', () => {
      const blockers = ['id-1', 'id-2', 'id-3', 'id-4', 'id-5', 'id-6', 'id-7'];
      render(<BlockedBadge blockedByCount={7} blockedBy={blockers} />);

      const badge = screen.getByLabelText('Blocked by 7 issues');
      fireEvent.mouseEnter(badge);

      // First 5 should be shown
      expect(screen.getByText('id-1')).toBeInTheDocument();
      expect(screen.getByText('id-2')).toBeInTheDocument();
      expect(screen.getByText('id-3')).toBeInTheDocument();
      expect(screen.getByText('id-4')).toBeInTheDocument();
      expect(screen.getByText('id-5')).toBeInTheDocument();

      // Last items should not be shown individually
      expect(screen.queryByText('id-6')).not.toBeInTheDocument();
      expect(screen.queryByText('id-7')).not.toBeInTheDocument();

      // "and N more..." should be shown
      expect(screen.getByText('and 2 more...')).toBeInTheDocument();
    });

    it('shows "and 1 more..." when exactly 6 blockers', () => {
      const blockers = ['id-1', 'id-2', 'id-3', 'id-4', 'id-5', 'id-6'];
      render(<BlockedBadge blockedByCount={6} blockedBy={blockers} />);

      const badge = screen.getByLabelText('Blocked by 6 issues');
      fireEvent.mouseEnter(badge);

      expect(screen.getByText('and 1 more...')).toBeInTheDocument();
    });

    it('shows "and 10 more..." when 15 blockers', () => {
      const blockers = Array.from({ length: 15 }, (_, i) => `blocker-${i + 1}`);
      render(<BlockedBadge blockedByCount={15} blockedBy={blockers} />);

      const badge = screen.getByLabelText('Blocked by 15 issues');
      fireEvent.mouseEnter(badge);

      expect(screen.getByText('and 10 more...')).toBeInTheDocument();
    });

    it('handles exactly 5 blockers (boundary case)', () => {
      const blockers = ['a', 'b', 'c', 'd', 'e'];
      render(<BlockedBadge blockedByCount={5} blockedBy={blockers} />);

      const badge = screen.getByLabelText('Blocked by 5 issues');
      fireEvent.mouseEnter(badge);

      // All 5 should be shown
      blockers.forEach((id) => {
        expect(screen.getByText(id)).toBeInTheDocument();
      });
      // No "more" message
      expect(screen.queryByText(/more/)).not.toBeInTheDocument();
    });

    it('handles single blocker', () => {
      render(<BlockedBadge blockedByCount={1} blockedBy={['single-blocker']} />);

      const badge = screen.getByLabelText('Blocked by 1 issue');
      fireEvent.mouseEnter(badge);

      expect(screen.getByText('single-blocker')).toBeInTheDocument();
      expect(screen.queryByText(/more/)).not.toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles blockedByCount mismatch with blockedBy array length', () => {
      // blockedByCount says 10 but only 3 blockers provided
      render(
        <BlockedBadge
          blockedByCount={10}
          blockedBy={['blocker-1', 'blocker-2', 'blocker-3']}
        />
      );

      // Count should reflect prop value
      expect(screen.getByText('10')).toBeInTheDocument();

      // Tooltip should show provided blockers
      const badge = screen.getByLabelText('Blocked by 10 issues');
      fireEvent.mouseEnter(badge);

      expect(screen.getByText('blocker-1')).toBeInTheDocument();
      expect(screen.getByText('blocker-2')).toBeInTheDocument();
      expect(screen.getByText('blocker-3')).toBeInTheDocument();
    });

    it('handles very large blockedByCount', () => {
      render(<BlockedBadge blockedByCount={999} />);

      expect(screen.getByText('999')).toBeInTheDocument();
      expect(screen.getByLabelText('Blocked by 999 issues')).toBeInTheDocument();
    });

    it('handles long blocker IDs in tooltip', () => {
      const longId = 'very-long-blocker-id-that-might-cause-display-issues-12345678';
      render(<BlockedBadge blockedByCount={1} blockedBy={[longId]} />);

      const badge = screen.getByLabelText('Blocked by 1 issue');
      fireEvent.mouseEnter(badge);

      expect(screen.getByText(longId)).toBeInTheDocument();
    });

    it('handles special characters in blocker IDs', () => {
      const specialId = 'blocker-<script>alert("xss")</script>';
      render(<BlockedBadge blockedByCount={1} blockedBy={[specialId]} />);

      const badge = screen.getByLabelText('Blocked by 1 issue');
      fireEvent.mouseEnter(badge);

      // React should escape the content
      expect(screen.getByText(specialId)).toBeInTheDocument();
    });

    it('handles empty string blocker ID', () => {
      render(<BlockedBadge blockedByCount={1} blockedBy={['']} />);

      const badge = screen.getByLabelText('Blocked by 1 issue');
      fireEvent.mouseEnter(badge);

      // Empty string should still render as a list item
      const listItems = screen.getAllByRole('listitem');
      expect(listItems).toHaveLength(1);
    });
  });

  describe('CSS classes', () => {
    it('applies blockedBadge base class', () => {
      render(<BlockedBadge blockedByCount={1} />);

      const badge = screen.getByLabelText('Blocked by 1 issue');
      expect(badge.className).toContain('blockedBadge');
    });

    it('combines base class with custom className', () => {
      render(<BlockedBadge blockedByCount={1} className="my-custom-class" />);

      const badge = screen.getByLabelText('Blocked by 1 issue');
      expect(badge.className).toContain('blockedBadge');
      expect(badge).toHaveClass('my-custom-class');
    });
  });
});
