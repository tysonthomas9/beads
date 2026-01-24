/**
 * @vitest-environment jsdom
 */

/**
 * Unit tests for AppLayout component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { AppLayout } from '../AppLayout';

describe('AppLayout', () => {
  describe('rendering', () => {
    it('renders children inside main element', () => {
      render(
        <AppLayout>
          <div data-testid="child-content">Child Content</div>
        </AppLayout>
      );

      const main = screen.getByRole('main');
      expect(main).toContainElement(screen.getByTestId('child-content'));
    });

    it('renders with minimum required props (just children)', () => {
      render(
        <AppLayout>
          <p>Minimal content</p>
        </AppLayout>
      );

      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByText('Minimal content')).toBeInTheDocument();
    });

    it('applies custom className to root element', () => {
      const { container } = render(
        <AppLayout className="custom-class">
          <p>Content</p>
        </AppLayout>
      );

      const rootDiv = container.firstChild;
      expect(rootDiv).toHaveClass('custom-class');
    });
  });

  describe('title', () => {
    it('displays default title "Beads" when no title prop', () => {
      render(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );

      expect(screen.getByRole('heading', { name: 'Beads' })).toBeInTheDocument();
    });

    it('displays custom title when title prop provided', () => {
      render(
        <AppLayout title="Custom Title">
          <p>Content</p>
        </AppLayout>
      );

      expect(screen.getByRole('heading', { name: 'Custom Title' })).toBeInTheDocument();
    });

    it('title is an h1 element', () => {
      render(
        <AppLayout title="Test Title">
          <p>Content</p>
        </AppLayout>
      );

      const heading = screen.getByRole('heading', { name: 'Test Title' });
      expect(heading.tagName).toBe('H1');
    });
  });

  describe('slots', () => {
    it('renders navigation slot content when provided', () => {
      render(
        <AppLayout navigation={<button>Nav Button</button>}>
          <p>Content</p>
        </AppLayout>
      );

      expect(screen.getByRole('button', { name: 'Nav Button' })).toBeInTheDocument();
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('renders actions slot content when provided', () => {
      render(
        <AppLayout actions={<button>Action Button</button>}>
          <p>Content</p>
        </AppLayout>
      );

      expect(screen.getByRole('button', { name: 'Action Button' })).toBeInTheDocument();
    });

    it('does not render navigation element when prop is undefined', () => {
      render(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );

      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('does not render actions element when prop is undefined', () => {
      const { container } = render(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );

      // Actions is a div, not a semantic element, so we check by class pattern
      const actionsDiv = container.querySelector('[class*="actions"]');
      expect(actionsDiv).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('header has role="banner"', () => {
      render(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );

      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('main has role="main"', () => {
      render(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );

      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('main has id="main-content" for skip links', () => {
      render(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );

      const main = screen.getByRole('main');
      expect(main).toHaveAttribute('id', 'main-content');
    });

    it('navigation has aria-label="Main navigation"', () => {
      render(
        <AppLayout navigation={<button>Nav</button>}>
          <p>Content</p>
        </AppLayout>
      );

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveAttribute('aria-label', 'Main navigation');
    });
  });

  describe('structure', () => {
    it('header is rendered before main in DOM order', () => {
      const { container } = render(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );

      const rootDiv = container.firstChild as HTMLElement;
      const children = Array.from(rootDiv.children);
      const headerIndex = children.findIndex(el => el.tagName === 'HEADER');
      const mainIndex = children.findIndex(el => el.tagName === 'MAIN');

      expect(headerIndex).toBeLessThan(mainIndex);
    });

    it('has correct element hierarchy (div > header + main)', () => {
      const { container } = render(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );

      const rootDiv = container.firstChild as HTMLElement;
      expect(rootDiv.tagName).toBe('DIV');

      const header = rootDiv.querySelector('header');
      const main = rootDiv.querySelector('main');

      expect(header).toBeInTheDocument();
      expect(main).toBeInTheDocument();
      expect(header?.parentElement).toBe(rootDiv);
      expect(main?.parentElement).toBe(rootDiv);
    });
  });
});
