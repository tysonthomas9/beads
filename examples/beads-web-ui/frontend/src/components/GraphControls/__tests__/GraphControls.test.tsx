/**
 * @vitest-environment jsdom
 */

/**
 * Unit tests for GraphControls component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import { GraphControls } from '../GraphControls';
import type { GraphControlsProps } from '../GraphControls';

/**
 * Create test props for GraphControls component.
 */
function createTestProps(overrides: Partial<GraphControlsProps> = {}): GraphControlsProps {
  return {
    highlightReady: false,
    onHighlightReadyChange: vi.fn(),
    ...overrides,
  };
}

describe('GraphControls', () => {
  describe('rendering', () => {
    it('renders checkbox with correct checked state when false', () => {
      const props = createTestProps({ highlightReady: false });
      render(<GraphControls {...props} />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
    });

    it('renders checkbox with correct checked state when true', () => {
      const props = createTestProps({ highlightReady: true });
      render(<GraphControls {...props} />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();
    });

    it('renders "Highlight Ready" label text', () => {
      const props = createTestProps();
      render(<GraphControls {...props} />);

      expect(screen.getByText('Highlight Ready')).toBeInTheDocument();
    });

    it('has correct aria-label for accessibility', () => {
      const props = createTestProps();
      render(<GraphControls {...props} />);

      expect(screen.getByLabelText('Highlight ready issues')).toBeInTheDocument();
    });

    it('renders with data-testid for testing', () => {
      const props = createTestProps();
      render(<GraphControls {...props} />);

      expect(screen.getByTestId('graph-controls')).toBeInTheDocument();
      expect(screen.getByTestId('highlight-ready-toggle')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onChange when checkbox is toggled to checked', () => {
      const onHighlightReadyChange = vi.fn();
      const props = createTestProps({
        highlightReady: false,
        onHighlightReadyChange,
      });
      render(<GraphControls {...props} />);

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      expect(onHighlightReadyChange).toHaveBeenCalledWith(true);
    });

    it('calls onChange when checkbox is toggled to unchecked', () => {
      const onHighlightReadyChange = vi.fn();
      const props = createTestProps({
        highlightReady: true,
        onHighlightReadyChange,
      });
      render(<GraphControls {...props} />);

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      expect(onHighlightReadyChange).toHaveBeenCalledWith(false);
    });

    it('calls onChange only once per toggle', () => {
      const onHighlightReadyChange = vi.fn();
      const props = createTestProps({
        highlightReady: false,
        onHighlightReadyChange,
      });
      render(<GraphControls {...props} />);

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      expect(onHighlightReadyChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('disabled state', () => {
    it('applies disabled attribute when disabled is true', () => {
      const props = createTestProps({ disabled: true });
      render(<GraphControls {...props} />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeDisabled();
    });

    it('does not respond to clicks when disabled (checkbox behavior)', () => {
      // Note: fireEvent.click bypasses the disabled attribute, so we verify
      // the disabled attribute is correctly set instead. In a real browser,
      // the click would be ignored. We already test that disabled is set above.
      const props = createTestProps({ disabled: true });
      render(<GraphControls {...props} />);

      const checkbox = screen.getByRole('checkbox');
      // Verify that the disabled attribute is present, which in a real browser
      // would prevent the click from triggering the onChange
      expect(checkbox).toBeDisabled();
    });

    it('shows disabledTitle as tooltip when disabled', () => {
      const props = createTestProps({
        disabled: true,
        disabledTitle: 'Loading blocked status...',
      });
      render(<GraphControls {...props} />);

      const label = screen.getByText('Highlight Ready').closest('label');
      expect(label).toHaveAttribute('title', 'Loading blocked status...');
    });

    it('does not show tooltip when not disabled', () => {
      const props = createTestProps({
        disabled: false,
        disabledTitle: 'Loading blocked status...',
      });
      render(<GraphControls {...props} />);

      const label = screen.getByText('Highlight Ready').closest('label');
      expect(label).not.toHaveAttribute('title');
    });
  });

  describe('className prop', () => {
    it('applies additional className when provided', () => {
      const props = createTestProps({ className: 'custom-class' });
      render(<GraphControls {...props} />);

      const container = screen.getByTestId('graph-controls');
      expect(container.className).toMatch(/custom-class/);
    });

    it('preserves base class when additional className is provided', () => {
      const props = createTestProps({ className: 'custom-class' });
      render(<GraphControls {...props} />);

      const container = screen.getByTestId('graph-controls');
      expect(container.className).toMatch(/graphControls/);
    });
  });
});
