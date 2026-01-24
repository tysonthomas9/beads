/**
 * ConnectionStatus component displays the current WebSocket connection state.
 * Provides visual feedback about whether the application is connected to the beads daemon.
 */

import type { ConnectionState } from '@/api/websocket';
import styles from './ConnectionStatus.module.css';

/**
 * Props for the ConnectionStatus component.
 */
export interface ConnectionStatusProps {
  /** Current connection state from useWebSocket */
  state: ConnectionState;
  /** Additional CSS class name */
  className?: string;
  /** Display variant */
  variant?: 'badge' | 'inline';
  /** Show status text (default: true) */
  showText?: boolean;
}

/**
 * Map connection state to user-friendly display text.
 */
function getStatusText(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting...';
    case 'reconnecting':
      return 'Reconnecting...';
    case 'disconnected':
      return 'Disconnected';
    default:
      return 'Unknown';
  }
}

/**
 * ConnectionStatus displays the current WebSocket connection state.
 * Shows a status indicator dot and optional status text.
 */
export function ConnectionStatus({
  state,
  className,
  variant = 'inline',
  showText = true,
}: ConnectionStatusProps): JSX.Element {
  const statusText = getStatusText(state);

  const rootClassName = [
    styles.connectionStatus,
    styles[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={rootClassName}
      role="status"
      aria-live="polite"
      aria-label={`Connection status: ${statusText}`}
      data-state={state}
      data-variant={variant}
    >
      <span className={styles.indicator} aria-hidden="true" />
      {showText && <span className={styles.text}>{statusText}</span>}
    </div>
  );
}
