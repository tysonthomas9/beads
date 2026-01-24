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
    it('renders children content', () => {
      render(
        <AppLayout>
          <div data-testid="child-content">Hello World</div>
        </AppLayout>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('renders with minimum required props (just children)', () => {
      const { container } = render(
        <AppLayout>
          <span>Content</span>
        </AppLayout>
      );

      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders empty main area when no children provided', () => {
      render(<AppLayout>{null}</AppLayout>);

      const main = screen.getByRole('main');
      expect(main).toBeInTheDocument();
    });
  });

  describe('title', () => {
    it('displays default title "Beads" when no title prop', () => {
      render(
        <AppLayout>
          <div>Content</div>
        </AppLayout>
      );

      expect(screen.getByRole('heading', { name: 'Beads' })).toBeInTheDocument();
    });

    it('displays custom title when title prop provided', () => {
      render(
        <AppLayout title="Custom App">
          <div>Content</div>
        </AppLayout>
      );

      expect(screen.getByRole('heading', { name: 'Custom App' })).toBeInTheDocument();
    });

    it('title is an h1 element', () => {
      render(
        <AppLayout>
          <div>Content</div>
        </AppLayout>
      );

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
      expect(heading.tagName).toBe('H1');
    });
  });

  describe('navigation slot', () => {
    it('renders navigation slot content when provided', () => {
      render(
        <AppLayout navigation={<button>Nav Button</button>}>
          <div>Content</div>
        </AppLayout>
      );

      expect(screen.getByRole('button', { name: 'Nav Button' })).toBeInTheDocument();
    });

    it('renders navigation inside nav element', () => {
      render(
        <AppLayout navigation={<span data-testid="nav-content">Navigation</span>}>
          <div>Content</div>
        </AppLayout>
      );

      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
      expect(nav).toContainElement(screen.getByTestId('nav-content'));
    });

    it('does not render nav element when navigation prop is undefined', () => {
      render(
        <AppLayout>
          <div>Content</div>
        </AppLayout>
      );

      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });
  });

  describe('actions slot', () => {
    it('renders actions slot content when provided', () => {
      render(
        <AppLayout actions={<button>Action Button</button>}>
          <div>Content</div>
        </AppLayout>
      );

      expect(screen.getByRole('button', { name: 'Action Button' })).toBeInTheDocument();
    });

    it('does not render actions element when actions prop is undefined', () => {
      const { container } = render(
        <AppLayout>
          <div>Content</div>
        </AppLayout>
      );

      // Check that only brand exists in header (no actions div)
      const header = container.querySelector('header');
      const actionsDiv = header?.querySelector('[class*="actions"]');
      expect(actionsDiv).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('header has role="banner"', () => {
      render(
        <AppLayout>
          <div>Content</div>
        </AppLayout>
      );

      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('main has role="main"', () => {
      render(
        <AppLayout>
          <div>Content</div>
        </AppLayout>
      );

      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('main has id="main-content" for skip links', () => {
      render(
        <AppLayout>
          <div>Content</div>
        </AppLayout>
      );

      const main = screen.getByRole('main');
      expect(main).toHaveAttribute('id', 'main-content');
    });

    it('navigation has aria-label="Main navigation"', () => {
      render(
        <AppLayout navigation={<span>Nav</span>}>
          <div>Content</div>
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
          <div>Content</div>
        </AppLayout>
      );

      const root = container.firstChild as HTMLElement;
      const children = Array.from(root.children);
      const headerIndex = children.findIndex((el) => el.tagName === 'HEADER');
      const mainIndex = children.findIndex((el) => el.tagName === 'MAIN');

      expect(headerIndex).toBeLessThan(mainIndex);
    });

    it('has correct element hierarchy (div > header + main)', () => {
      const { container } = render(
        <AppLayout>
          <div>Content</div>
        </AppLayout>
      );

      const root = container.firstChild as HTMLElement;
      expect(root.tagName).toBe('DIV');
      expect(root.querySelector('header')).toBeInTheDocument();
      expect(root.querySelector('main')).toBeInTheDocument();
    });
  });

  describe('props', () => {
    it('applies className prop to root element', () => {
      const { container } = render(
        <AppLayout className="custom-class">
          <div>Content</div>
        </AppLayout>
      );

      const root = container.firstChild as HTMLElement;
      expect(root).toHaveClass('custom-class');
    });

    it('preserves existing classes when adding custom className', () => {
      const { container } = render(
        <AppLayout className="custom-class">
          <div>Content</div>
        </AppLayout>
      );

      const root = container.firstChild as HTMLElement;
      // Should have both the module CSS class and custom class
      expect(root.classList.length).toBeGreaterThanOrEqual(2);
      expect(root).toHaveClass('custom-class');
    });
  });

  describe('edge cases', () => {
    it('handles empty title', () => {
      render(
        <AppLayout title="">
          <div>Content</div>
        </AppLayout>
      );

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
      expect(heading.textContent).toBe('');
    });

    it('handles complex nested children', () => {
      render(
        <AppLayout>
          <div>
            <section>
              <article>
                <p data-testid="nested-content">Deeply nested</p>
              </article>
            </section>
          </div>
        </AppLayout>
      );

      expect(screen.getByTestId('nested-content')).toBeInTheDocument();
    });

    it('handles multiple children', () => {
      render(
        <AppLayout>
          <div data-testid="child-1">First</div>
          <div data-testid="child-2">Second</div>
          <div data-testid="child-3">Third</div>
        </AppLayout>
      );

      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
      expect(screen.getByTestId('child-3')).toBeInTheDocument();
    });

    it('renders both navigation and actions when provided', () => {
      render(
        <AppLayout
          navigation={<button>Nav</button>}
          actions={<button>Action</button>}
        >
          <div>Content</div>
        </AppLayout>
      );

      expect(screen.getByRole('button', { name: 'Nav' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
    });
  });
});
