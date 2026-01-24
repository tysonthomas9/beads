/**
 * @vitest-environment jsdom
 */

/**
 * Unit tests for ConnectionStatus component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { ConnectionStatus } from '../ConnectionStatus';
import type { ConnectionState } from '@/api/websocket';

describe('ConnectionStatus', () => {
  describe('rendering', () => {
    it('renders without crashing', () => {
      render(<ConnectionStatus state="connected" />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('renders as div with role="status"', () => {
      render(<ConnectionStatus state="connected" />);
      const status = screen.getByRole('status');
      expect(status.tagName).toBe('DIV');
    });

    it('renders indicator element', () => {
      const { container } = render(<ConnectionStatus state="connected" />);
      const indicator = container.querySelector('[aria-hidden="true"]');
      expect(indicator).toBeInTheDocument();
    });
  });

  describe('state display', () => {
    it('shows correct text for "connected" state', () => {
      render(<ConnectionStatus state="connected" />);
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('shows correct text for "connecting" state', () => {
      render(<ConnectionStatus state="connecting" />);
      expect(screen.getByText('Connecting...')).toBeInTheDocument();
    });

    it('shows correct text for "reconnecting" state', () => {
      render(<ConnectionStatus state="reconnecting" />);
      expect(screen.getByText('Reconnecting...')).toBeInTheDocument();
    });

    it('shows correct text for "disconnected" state', () => {
      render(<ConnectionStatus state="disconnected" />);
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });
  });

  describe('data attributes', () => {
    it.each<ConnectionState>([
      'connected',
      'connecting',
      'reconnecting',
      'disconnected',
    ])('data-state attribute reflects "%s" state', (state) => {
      const { container } = render(<ConnectionStatus state={state} />);
      const root = container.firstChild as HTMLElement;
      expect(root).toHaveAttribute('data-state', state);
    });

    it('data-variant attribute reflects "inline" variant (default)', () => {
      const { container } = render(<ConnectionStatus state="connected" />);
      const root = container.firstChild as HTMLElement;
      expect(root).toHaveAttribute('data-variant', 'inline');
    });

    it('data-variant attribute reflects "badge" variant', () => {
      const { container } = render(
        <ConnectionStatus state="connected" variant="badge" />
      );
      const root = container.firstChild as HTMLElement;
      expect(root).toHaveAttribute('data-variant', 'badge');
    });
  });

  describe('props', () => {
    it('applies className prop to root element', () => {
      const { container } = render(
        <ConnectionStatus state="connected" className="custom-class" />
      );
      const root = container.firstChild as HTMLElement;
      expect(root).toHaveClass('custom-class');
    });

    it('variant="badge" applies badge styles', () => {
      const { container } = render(
        <ConnectionStatus state="connected" variant="badge" />
      );
      const root = container.firstChild as HTMLElement;
      expect(root.className).toContain('badge');
    });

    it('variant="inline" applies inline styles (default)', () => {
      const { container } = render(<ConnectionStatus state="connected" />);
      const root = container.firstChild as HTMLElement;
      expect(root.className).toContain('inline');
    });

    it('showText=true (default) shows text label', () => {
      render(<ConnectionStatus state="connected" />);
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('showText=false hides text label', () => {
      render(<ConnectionStatus state="connected" showText={false} />);
      expect(screen.queryByText('Connected')).not.toBeInTheDocument();
    });

    it('showText=false still renders indicator', () => {
      const { container } = render(
        <ConnectionStatus state="connected" showText={false} />
      );
      const indicator = container.querySelector('[aria-hidden="true"]');
      expect(indicator).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has role="status" for live updates', () => {
      render(<ConnectionStatus state="connected" />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('has aria-live="polite" for screen readers', () => {
      render(<ConnectionStatus state="connected" />);
      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
    });

    it('has aria-label with full status description', () => {
      render(<ConnectionStatus state="connected" />);
      expect(
        screen.getByLabelText('Connection status: Connected')
      ).toBeInTheDocument();
    });

    it('indicator has aria-hidden="true"', () => {
      const { container } = render(<ConnectionStatus state="connected" />);
      const indicator = container.querySelector('[aria-hidden="true"]');
      expect(indicator).toBeInTheDocument();
    });

    it.each<[ConnectionState, string]>([
      ['connected', 'Connection status: Connected'],
      ['connecting', 'Connection status: Connecting...'],
      ['reconnecting', 'Connection status: Reconnecting...'],
      ['disconnected', 'Connection status: Disconnected'],
    ])('aria-label is correct for "%s" state', (state, expectedLabel) => {
      render(<ConnectionStatus state={state} />);
      expect(screen.getByLabelText(expectedLabel)).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles rapid state changes', () => {
      const { rerender } = render(<ConnectionStatus state="connected" />);
      expect(screen.getByText('Connected')).toBeInTheDocument();

      rerender(<ConnectionStatus state="reconnecting" />);
      expect(screen.getByText('Reconnecting...')).toBeInTheDocument();

      rerender(<ConnectionStatus state="connected" />);
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('handles all variant/showText combinations', () => {
      const { rerender } = render(
        <ConnectionStatus state="connected" variant="inline" showText={true} />
      );
      expect(screen.getByText('Connected')).toBeInTheDocument();

      rerender(
        <ConnectionStatus state="connected" variant="inline" showText={false} />
      );
      expect(screen.queryByText('Connected')).not.toBeInTheDocument();

      rerender(
        <ConnectionStatus state="connected" variant="badge" showText={true} />
      );
      expect(screen.getByText('Connected')).toBeInTheDocument();

      rerender(
        <ConnectionStatus state="connected" variant="badge" showText={false} />
      );
      expect(screen.queryByText('Connected')).not.toBeInTheDocument();
    });
  });
});
