/**
 * @vitest-environment jsdom
 */

/**
 * Unit tests for IssueDetailPanel component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import { IssueDetailPanel } from '../IssueDetailPanel';
import type { Issue } from '@/types';

/**
 * Create a minimal test issue with required fields.
 */
function createTestIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'test-123',
    title: 'Test Issue',
    priority: 2,
    created_at: '2026-01-23T00:00:00Z',
    updated_at: '2026-01-23T00:00:00Z',
    ...overrides,
  };
}

describe('IssueDetailPanel', () => {
  // Reset body overflow after each test
  afterEach(() => {
    document.body.style.overflow = '';
  });

  describe('rendering', () => {
    it('renders when open', () => {
      const mockIssue = createTestIssue();
      render(
        <IssueDetailPanel isOpen={true} issue={mockIssue} onClose={() => {}} />
      );
      expect(screen.getByTestId('issue-detail-panel')).toBeInTheDocument();
    });

    it('renders children in content area', () => {
      const mockIssue = createTestIssue();
      render(
        <IssueDetailPanel isOpen={true} issue={mockIssue} onClose={() => {}}>
          <div data-testid="child-content">Child Content</div>
        </IssueDetailPanel>
      );
      expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });

    it('applies open class when isOpen is true', () => {
      const mockIssue = createTestIssue();
      render(
        <IssueDetailPanel isOpen={true} issue={mockIssue} onClose={() => {}} />
      );
      const overlay = screen.getByTestId('issue-detail-overlay');
      // CSS modules mangle class names, so check for pattern containing 'open'
      expect(overlay.className).toMatch(/open/i);
    });

    it('does not apply open class when isOpen is false', () => {
      render(
        <IssueDetailPanel isOpen={false} issue={null} onClose={() => {}} />
      );
      const overlay = screen.getByTestId('issue-detail-overlay');
      // CSS modules mangle class names, so check that 'open' pattern is not present
      expect(overlay.className).not.toMatch(/_open_/);
    });

    it('renders even when closed (for animation)', () => {
      render(
        <IssueDetailPanel isOpen={false} issue={null} onClose={() => {}} />
      );
      expect(screen.getByTestId('issue-detail-panel')).toBeInTheDocument();
    });
  });

  describe('close interactions', () => {
    it('calls onClose when clicking overlay', () => {
      const mockIssue = createTestIssue();
      const onClose = vi.fn();
      render(
        <IssueDetailPanel isOpen={true} issue={mockIssue} onClose={onClose} />
      );
      fireEvent.click(screen.getByTestId('issue-detail-overlay'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when clicking panel', () => {
      const mockIssue = createTestIssue();
      const onClose = vi.fn();
      render(
        <IssueDetailPanel isOpen={true} issue={mockIssue} onClose={onClose} />
      );
      fireEvent.click(screen.getByTestId('issue-detail-panel'));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('calls onClose when pressing Escape', () => {
      const mockIssue = createTestIssue();
      const onClose = vi.fn();
      render(
        <IssueDetailPanel isOpen={true} issue={mockIssue} onClose={onClose} />
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose on Escape when closed', () => {
      const onClose = vi.fn();
      render(
        <IssueDetailPanel isOpen={false} issue={null} onClose={onClose} />
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('does not call onClose on other keys', () => {
      const mockIssue = createTestIssue();
      const onClose = vi.fn();
      render(
        <IssueDetailPanel isOpen={true} issue={mockIssue} onClose={onClose} />
      );
      fireEvent.keyDown(document, { key: 'Enter' });
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('has correct ARIA attributes when open with issue', () => {
      const mockIssue = createTestIssue({ title: 'Test Issue' });
      render(
        <IssueDetailPanel isOpen={true} issue={mockIssue} onClose={() => {}} />
      );
      const panel = screen.getByTestId('issue-detail-panel');
      expect(panel).toHaveAttribute('role', 'dialog');
      expect(panel).toHaveAttribute('aria-modal', 'true');
      expect(panel).toHaveAttribute('aria-label', 'Details for Test Issue');
    });

    it('has default aria-label when issue is null', () => {
      render(
        <IssueDetailPanel isOpen={true} issue={null} onClose={() => {}} />
      );
      const panel = screen.getByTestId('issue-detail-panel');
      expect(panel).toHaveAttribute('aria-label', 'Issue details');
    });

    it('sets aria-hidden on overlay when closed', () => {
      render(
        <IssueDetailPanel isOpen={false} issue={null} onClose={() => {}} />
      );
      const overlay = screen.getByTestId('issue-detail-overlay');
      expect(overlay).toHaveAttribute('aria-hidden', 'true');
    });

    it('clears aria-hidden on overlay when open', () => {
      const mockIssue = createTestIssue();
      render(
        <IssueDetailPanel isOpen={true} issue={mockIssue} onClose={() => {}} />
      );
      const overlay = screen.getByTestId('issue-detail-overlay');
      expect(overlay).toHaveAttribute('aria-hidden', 'false');
    });
  });

  describe('body scroll lock', () => {
    it('locks body scroll when open', () => {
      const mockIssue = createTestIssue();
      render(
        <IssueDetailPanel isOpen={true} issue={mockIssue} onClose={() => {}} />
      );
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('restores body scroll when closed', () => {
      const mockIssue = createTestIssue();
      const { rerender } = render(
        <IssueDetailPanel isOpen={true} issue={mockIssue} onClose={() => {}} />
      );
      expect(document.body.style.overflow).toBe('hidden');

      rerender(
        <IssueDetailPanel isOpen={false} issue={null} onClose={() => {}} />
      );
      expect(document.body.style.overflow).toBe('');
    });

    it('does not lock body scroll when initially closed', () => {
      render(
        <IssueDetailPanel isOpen={false} issue={null} onClose={() => {}} />
      );
      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('className prop', () => {
    it('applies custom className to overlay', () => {
      const mockIssue = createTestIssue();
      render(
        <IssueDetailPanel
          isOpen={true}
          issue={mockIssue}
          onClose={() => {}}
          className="custom-class"
        />
      );
      const overlay = screen.getByTestId('issue-detail-overlay');
      expect(overlay).toHaveClass('custom-class');
    });

    it('combines custom className with open class', () => {
      const mockIssue = createTestIssue();
      render(
        <IssueDetailPanel
          isOpen={true}
          issue={mockIssue}
          onClose={() => {}}
          className="custom-class"
        />
      );
      const overlay = screen.getByTestId('issue-detail-overlay');
      // CSS modules mangle class names, so check for pattern containing 'open'
      expect(overlay.className).toMatch(/open/i);
      expect(overlay).toHaveClass('custom-class');
    });
  });

  describe('cleanup', () => {
    it('removes keydown listener on unmount when open', () => {
      const onClose = vi.fn();
      const mockIssue = createTestIssue();
      const { unmount } = render(
        <IssueDetailPanel isOpen={true} issue={mockIssue} onClose={onClose} />
      );

      unmount();

      // Escape key should not trigger onClose after unmount
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('restores body scroll on unmount when open', () => {
      const mockIssue = createTestIssue();
      const { unmount } = render(
        <IssueDetailPanel isOpen={true} issue={mockIssue} onClose={() => {}} />
      );
      expect(document.body.style.overflow).toBe('hidden');

      unmount();
      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('edge cases', () => {
    it('handles null issue when open', () => {
      render(
        <IssueDetailPanel isOpen={true} issue={null} onClose={() => {}} />
      );
      expect(screen.getByTestId('issue-detail-panel')).toBeInTheDocument();
    });

    it('handles rapid open/close', () => {
      const mockIssue = createTestIssue();
      const { rerender } = render(
        <IssueDetailPanel isOpen={false} issue={null} onClose={() => {}} />
      );

      // Rapidly toggle
      rerender(
        <IssueDetailPanel isOpen={true} issue={mockIssue} onClose={() => {}} />
      );
      rerender(
        <IssueDetailPanel isOpen={false} issue={null} onClose={() => {}} />
      );
      rerender(
        <IssueDetailPanel isOpen={true} issue={mockIssue} onClose={() => {}} />
      );

      // CSS modules mangle class names, so check for pattern containing 'open'
      expect(screen.getByTestId('issue-detail-overlay').className).toMatch(/open/i);
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('stops propagation on panel click to prevent overlay close', () => {
      const mockIssue = createTestIssue();
      const onClose = vi.fn();
      render(
        <IssueDetailPanel isOpen={true} issue={mockIssue} onClose={onClose}>
          <button data-testid="inner-button">Click me</button>
        </IssueDetailPanel>
      );

      // Click on the inner button - should not close
      fireEvent.click(screen.getByTestId('inner-button'));
      expect(onClose).not.toHaveBeenCalled();

      // Click on the panel itself - should not close
      fireEvent.click(screen.getByTestId('issue-detail-panel'));
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
