/**
 * AppLayout component - top-level layout wrapper.
 * Provides a consistent structure with fixed header and main content area.
 */

import styles from './AppLayout.module.css';

/**
 * Props for the AppLayout component.
 */
export interface AppLayoutProps {
  /** Main content to render in the content area */
  children: React.ReactNode;
  /** Optional element to render in the header navigation area (center) */
  navigation?: React.ReactNode;
  /** Optional element to render in the header actions area (right) */
  actions?: React.ReactNode;
  /** Application title displayed in header (defaults to "Beads") */
  title?: string;
  /** Additional CSS class name */
  className?: string;
}

/**
 * AppLayout provides the top-level structure for the application.
 * Includes a sticky header with slots for navigation and actions,
 * and a scrollable main content area.
 */
export function AppLayout({
  children,
  navigation,
  actions,
  title = 'Beads',
  className,
}: AppLayoutProps): JSX.Element {
  const rootClassName = className
    ? `${styles.appLayout} ${className}`
    : styles.appLayout;

  return (
    <div className={rootClassName}>
      <header className={styles.header} role="banner">
        <div className={styles.headerContent}>
          <div className={styles.brand}>
            <h1 className={styles.title}>{title}</h1>
          </div>
          {navigation && (
            <nav className={styles.navigation} aria-label="Main navigation">
              {navigation}
            </nav>
          )}
          {actions && (
            <div className={styles.actions}>
              {actions}
            </div>
          )}
        </div>
      </header>
      <main className={styles.main} role="main" id="main-content">
        {children}
      </main>
    </div>
  );
}
