/**
 * @vitest-environment jsdom
 */

/**
 * Unit tests for StatusColumn component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { StatusColumn } from '../StatusColumn';
import { formatStatusLabel, getStatusColor } from '../utils';

describe('StatusColumn', () => {
  describe('rendering', () => {
    it('renders with status and count', () => {
      render(<StatusColumn status="open" count={5} />);

      expect(screen.getByRole('heading', { name: 'Open' })).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('renders status label correctly formatted', () => {
      render(<StatusColumn status="in_progress" count={3} />);

      expect(
        screen.getByRole('heading', { name: 'In Progress' })
      ).toBeInTheDocument();
    });

    it('renders count badge with correct number', () => {
      render(<StatusColumn status="closed" count={42} />);

      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('renders children when provided', () => {
      render(
        <StatusColumn status="open" count={1}>
          <div data-testid="child-card">Issue Card</div>
        </StatusColumn>
      );

      expect(screen.getByTestId('child-card')).toBeInTheDocument();
    });

    it('renders empty content area when no children', () => {
      render(<StatusColumn status="open" count={0} />);

      const list = screen.getByRole('list');
      expect(list).toBeInTheDocument();
      expect(list).toBeEmptyDOMElement();
    });
  });

  describe('status formatting', () => {
    it('formats single word status correctly', () => {
      render(<StatusColumn status="open" count={1} />);
      expect(screen.getByRole('heading', { name: 'Open' })).toBeInTheDocument();
    });

    it('formats snake_case status to title case', () => {
      render(<StatusColumn status="in_progress" count={1} />);
      expect(
        screen.getByRole('heading', { name: 'In Progress' })
      ).toBeInTheDocument();
    });

    it('formats blocked status', () => {
      render(<StatusColumn status="blocked" count={1} />);
      expect(
        screen.getByRole('heading', { name: 'Blocked' })
      ).toBeInTheDocument();
    });

    it('formats custom status correctly', () => {
      render(<StatusColumn status="custom_status_name" count={1} />);
      expect(
        screen.getByRole('heading', { name: 'Custom Status Name' })
      ).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has section with appropriate aria-label', () => {
      render(<StatusColumn status="open" count={5} />);

      const section = screen.getByRole('region', { name: 'Open issues' });
      expect(section).toBeInTheDocument();
    });

    it('has h2 heading element', () => {
      render(<StatusColumn status="open" count={1} />);

      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toBeInTheDocument();
    });

    it('content area has role="list"', () => {
      render(<StatusColumn status="open" count={1} />);

      expect(screen.getByRole('list')).toBeInTheDocument();
    });

    it('count has aria-label with issue count', () => {
      render(<StatusColumn status="open" count={5} />);

      expect(screen.getByLabelText('5 issues')).toBeInTheDocument();
    });

    it('count uses singular form for 1 issue', () => {
      render(<StatusColumn status="open" count={1} />);

      expect(screen.getByLabelText('1 issue')).toBeInTheDocument();
    });
  });

  describe('props', () => {
    it('custom statusLabel overrides formatted status', () => {
      render(
        <StatusColumn status="in_progress" statusLabel="WIP" count={3} />
      );

      expect(screen.getByRole('heading', { name: 'WIP' })).toBeInTheDocument();
      expect(screen.queryByText('In Progress')).not.toBeInTheDocument();
    });

    it('className prop is applied to root element', () => {
      const { container } = render(
        <StatusColumn status="open" count={1} className="custom-class" />
      );

      const section = container.querySelector('section');
      expect(section).toHaveClass('custom-class');
    });

    it('data-status attribute matches status prop', () => {
      const { container } = render(
        <StatusColumn status="in_progress" count={1} />
      );

      const section = container.querySelector('section');
      expect(section).toHaveAttribute('data-status', 'in_progress');
    });

    it('sets data-status for each known status', () => {
      const statuses = ['open', 'in_progress', 'closed', 'blocked', 'deferred'];

      statuses.forEach((status) => {
        const { container, unmount } = render(
          <StatusColumn status={status} count={1} />
        );

        const section = container.querySelector('section');
        expect(section).toHaveAttribute('data-status', status);

        unmount();
      });
    });
  });

  describe('edge cases', () => {
    it('count of 0 renders correctly', () => {
      render(<StatusColumn status="open" count={0} />);

      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByLabelText('0 issues')).toBeInTheDocument();
    });

    it('large count renders correctly', () => {
      render(<StatusColumn status="open" count={9999} />);

      expect(screen.getByText('9999')).toBeInTheDocument();
    });

    it('renders with empty string status (edge case)', () => {
      render(<StatusColumn status="" count={1} />);

      // Empty string formatted is empty, but component should still render
      const section = document.querySelector('[data-status=""]');
      expect(section).toBeInTheDocument();
    });
  });
});

describe('formatStatusLabel', () => {
  it('formats open correctly', () => {
    expect(formatStatusLabel('open')).toBe('Open');
  });

  it('formats in_progress correctly', () => {
    expect(formatStatusLabel('in_progress')).toBe('In Progress');
  });

  it('formats closed correctly', () => {
    expect(formatStatusLabel('closed')).toBe('Closed');
  });

  it('formats blocked correctly', () => {
    expect(formatStatusLabel('blocked')).toBe('Blocked');
  });

  it('formats deferred correctly', () => {
    expect(formatStatusLabel('deferred')).toBe('Deferred');
  });

  it('formats custom snake_case status', () => {
    expect(formatStatusLabel('custom_status')).toBe('Custom Status');
  });

  it('formats multi-word snake_case status', () => {
    expect(formatStatusLabel('some_long_custom_status')).toBe(
      'Some Long Custom Status'
    );
  });

  it('handles single character', () => {
    expect(formatStatusLabel('a')).toBe('A');
  });

  it('handles uppercase input by converting to title case', () => {
    expect(formatStatusLabel('OPEN')).toBe('Open');
    expect(formatStatusLabel('IN_PROGRESS')).toBe('In Progress');
  });
});

describe('getStatusColor', () => {
  it('returns open status color', () => {
    expect(getStatusColor('open')).toBe('var(--color-status-open)');
  });

  it('returns in_progress status color', () => {
    expect(getStatusColor('in_progress')).toBe('var(--color-status-in-progress)');
  });

  it('returns closed status color', () => {
    expect(getStatusColor('closed')).toBe('var(--color-status-closed)');
  });

  it('returns default color for unknown status', () => {
    expect(getStatusColor('blocked')).toBe('var(--color-text-secondary)');
    expect(getStatusColor('custom')).toBe('var(--color-text-secondary)');
    expect(getStatusColor('deferred')).toBe('var(--color-text-secondary)');
  });
});
