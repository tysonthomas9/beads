/**
 * @vitest-environment jsdom
 */

/**
 * Unit tests for DependencyEdge component.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReactFlowProvider } from '@xyflow/react';
import { Position } from '@xyflow/react';

import { DependencyEdge } from '../DependencyEdge';
import type { DependencyEdgeData, DependencyType } from '@/types';

/**
 * Create test props for DependencyEdge component.
 */
function createTestProps(overrides: Partial<DependencyEdgeData> = {}) {
  return {
    id: 'edge-1',
    source: 'node-1',
    target: 'node-2',
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 100,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      dependencyType: 'blocks' as DependencyType,
      isBlocking: true,
      sourceIssueId: 'beads-123',
      targetIssueId: 'beads-456',
      ...overrides,
    },
  };
}

/**
 * Wrapper with ReactFlowProvider for testing.
 */
function renderWithProvider(ui: React.ReactElement) {
  return render(
    <ReactFlowProvider>
      <svg>{ui}</svg>
    </ReactFlowProvider>
  );
}

describe('DependencyEdge', () => {
  describe('rendering', () => {
    it('renders edge path', () => {
      const props = createTestProps();
      const { container } = renderWithProvider(<DependencyEdge {...props} />);

      expect(container.querySelector('path')).toBeInTheDocument();
    });

    it('renders edge with correct id', () => {
      const props = createTestProps();
      const { container } = renderWithProvider(<DependencyEdge {...props} />);

      const path = container.querySelector('path[id="edge-1"]');
      expect(path).toBeInTheDocument();
    });
  });

  describe('blocking vs non-blocking styles', () => {
    it('applies blocking class when isBlocking is true', () => {
      const props = createTestProps({ isBlocking: true });
      const { container } = renderWithProvider(<DependencyEdge {...props} />);

      const path = container.querySelector('path.react-flow__edge-path');
      // SVG elements use getAttribute('class') instead of className
      const classAttr = path?.getAttribute('class') ?? '';
      expect(classAttr).toContain('blockingEdge');
    });

    it('applies normal class when isBlocking is false', () => {
      const props = createTestProps({ isBlocking: false });
      const { container } = renderWithProvider(<DependencyEdge {...props} />);

      const path = container.querySelector('path.react-flow__edge-path');
      const classAttr = path?.getAttribute('class') ?? '';
      expect(classAttr).toContain('normalEdge');
    });

    it('blocking edge has thicker stroke', () => {
      const props = createTestProps({ isBlocking: true });
      const { container } = renderWithProvider(<DependencyEdge {...props} />);

      const path = container.querySelector('path.react-flow__edge-path');
      expect(path).toHaveStyle({ strokeWidth: '2' });
    });

    it('non-blocking edge has thinner stroke', () => {
      const props = createTestProps({ isBlocking: false });
      const { container } = renderWithProvider(<DependencyEdge {...props} />);

      const path = container.querySelector('path.react-flow__edge-path');
      expect(path).toHaveStyle({ strokeWidth: '1.5' });
    });
  });

  describe('edge cases', () => {
    it('handles undefined data gracefully', () => {
      const props = createTestProps();
      // @ts-expect-error Testing undefined data
      delete props.data;

      // Should not throw
      expect(() =>
        renderWithProvider(<DependencyEdge {...props} />)
      ).not.toThrow();
    });

    it('defaults isBlocking to false when undefined', () => {
      const props = createTestProps();
      // @ts-expect-error Testing undefined isBlocking
      props.data = { ...props.data, isBlocking: undefined };

      const { container } = renderWithProvider(<DependencyEdge {...props} />);
      const path = container.querySelector('path.react-flow__edge-path');
      const classAttr = path?.getAttribute('class') ?? '';
      expect(classAttr).toContain('normalEdge');
    });

    it('handles various coordinate positions', () => {
      const positions = [
        { sourceX: 0, sourceY: 0, targetX: 100, targetY: 100 },
        { sourceX: 100, sourceY: 0, targetX: 0, targetY: 100 },
        { sourceX: 50, sourceY: 50, targetX: 50, targetY: 150 },
        { sourceX: 0, sourceY: 100, targetX: 200, targetY: 0 },
      ];

      positions.forEach((coords) => {
        const props = { ...createTestProps(), ...coords };
        expect(() =>
          renderWithProvider(<DependencyEdge {...props} />)
        ).not.toThrow();
      });
    });
  });

  describe('marker', () => {
    it('renders with arrow marker end', () => {
      const props = createTestProps();
      const { container } = renderWithProvider(<DependencyEdge {...props} />);

      const path = container.querySelector('path.react-flow__edge-path');
      expect(path).toHaveAttribute('marker-end', 'url(#arrow)');
    });
  });

  describe('path generation', () => {
    it('generates valid SVG path', () => {
      const props = createTestProps();
      const { container } = renderWithProvider(<DependencyEdge {...props} />);

      const path = container.querySelector('path.react-flow__edge-path');
      expect(path).toHaveAttribute('d');
      // SVG paths start with M (moveto)
      expect(path?.getAttribute('d')).toMatch(/^M/);
    });

    it('includes interaction path for click handling', () => {
      const props = createTestProps();
      const { container } = renderWithProvider(<DependencyEdge {...props} />);

      // React Flow adds an interaction path for easier clicking
      const interactionPath = container.querySelector(
        'path.react-flow__edge-interaction'
      );
      expect(interactionPath).toBeInTheDocument();
    });
  });
});
