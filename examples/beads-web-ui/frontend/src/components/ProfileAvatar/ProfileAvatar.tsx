import { useState, useRef, useEffect } from 'react';
import styles from './ProfileAvatar.module.css';

export interface ProfileAvatarProps {
  className?: string;
}

export function ProfileAvatar({ className }: ProfileAvatarProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div className={`${styles.container} ${className ?? ''}`} ref={dropdownRef}>
      <button
        type="button"
        className={styles.avatar}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Profile menu"
        aria-expanded={isOpen}
      >
        <svg className={styles.icon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </button>
      {isOpen && (
        <div className={styles.dropdown}>
          <button className={styles.dropdownItem} onClick={() => { alert('Settings'); setIsOpen(false); }}>
            Settings
          </button>
          <button className={styles.dropdownItem} onClick={() => { alert('Logout'); setIsOpen(false); }}>
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
