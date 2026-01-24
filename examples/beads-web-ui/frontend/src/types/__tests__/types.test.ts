/**
 * Unit tests for type guard functions and type constants.
 */

import { describe, it, expect } from 'vitest';

import {
  // Status exports
  isKnownStatus,
  isValidStatus,
  KNOWN_STATUSES,
  StatusOpen,
  StatusInProgress,
  StatusBlocked,
  StatusDeferred,
  StatusClosed,
  StatusTombstone,
  StatusPinned,
  StatusHooked,
  // Issue type exports
  isKnownIssueType,
  isValidIssueType,
  KNOWN_ISSUE_TYPES,
  TypeBug,
  TypeFeature,
  TypeTask,
  TypeEpic,
  TypeChore,
  // API exports
  isApiSuccess,
  isApiError,
} from '../index';

import type { ApiResult } from '../index';

describe('Status type guards', () => {
  describe('isKnownStatus', () => {
    it('returns true for all known statuses', () => {
      expect(isKnownStatus('open')).toBe(true);
      expect(isKnownStatus('in_progress')).toBe(true);
      expect(isKnownStatus('blocked')).toBe(true);
      expect(isKnownStatus('deferred')).toBe(true);
      expect(isKnownStatus('closed')).toBe(true);
      expect(isKnownStatus('tombstone')).toBe(true);
      expect(isKnownStatus('pinned')).toBe(true);
      expect(isKnownStatus('hooked')).toBe(true);
    });

    it('returns false for custom/unknown statuses', () => {
      expect(isKnownStatus('custom_status')).toBe(false);
      expect(isKnownStatus('pending')).toBe(false);
      expect(isKnownStatus('OPEN')).toBe(false); // case sensitive
      expect(isKnownStatus('')).toBe(false);
    });
  });

  describe('isValidStatus', () => {
    it('returns true for non-empty strings', () => {
      expect(isValidStatus('open')).toBe(true);
      expect(isValidStatus('custom_status')).toBe(true);
      expect(isValidStatus('any-string')).toBe(true);
    });

    it('returns false for empty string', () => {
      expect(isValidStatus('')).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(isValidStatus(null)).toBe(false);
      expect(isValidStatus(undefined)).toBe(false);
      expect(isValidStatus(123)).toBe(false);
      expect(isValidStatus({})).toBe(false);
      expect(isValidStatus([])).toBe(false);
      expect(isValidStatus(true)).toBe(false);
    });
  });
});

describe('Status constants', () => {
  it('KNOWN_STATUSES contains all expected statuses', () => {
    expect(KNOWN_STATUSES).toEqual([
      'open',
      'in_progress',
      'blocked',
      'deferred',
      'closed',
      'tombstone',
      'pinned',
      'hooked',
    ]);
  });

  it('KNOWN_STATUSES is readonly (has 8 items)', () => {
    expect(KNOWN_STATUSES.length).toBe(8);
  });

  it('status constants have correct values', () => {
    expect(StatusOpen).toBe('open');
    expect(StatusInProgress).toBe('in_progress');
    expect(StatusBlocked).toBe('blocked');
    expect(StatusDeferred).toBe('deferred');
    expect(StatusClosed).toBe('closed');
    expect(StatusTombstone).toBe('tombstone');
    expect(StatusPinned).toBe('pinned');
    expect(StatusHooked).toBe('hooked');
  });
});

describe('IssueType type guards', () => {
  describe('isKnownIssueType', () => {
    it('returns true for all known issue types', () => {
      expect(isKnownIssueType('bug')).toBe(true);
      expect(isKnownIssueType('feature')).toBe(true);
      expect(isKnownIssueType('task')).toBe(true);
      expect(isKnownIssueType('epic')).toBe(true);
      expect(isKnownIssueType('chore')).toBe(true);
    });

    it('returns false for custom/unknown issue types', () => {
      expect(isKnownIssueType('story')).toBe(false);
      expect(isKnownIssueType('subtask')).toBe(false);
      expect(isKnownIssueType('BUG')).toBe(false); // case sensitive
      expect(isKnownIssueType('')).toBe(false);
    });
  });

  describe('isValidIssueType', () => {
    it('returns true for non-empty strings', () => {
      expect(isValidIssueType('bug')).toBe(true);
      expect(isValidIssueType('custom_type')).toBe(true);
      expect(isValidIssueType('any-string')).toBe(true);
    });

    it('returns false for empty string', () => {
      expect(isValidIssueType('')).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(isValidIssueType(null)).toBe(false);
      expect(isValidIssueType(undefined)).toBe(false);
      expect(isValidIssueType(123)).toBe(false);
      expect(isValidIssueType({})).toBe(false);
      expect(isValidIssueType([])).toBe(false);
      expect(isValidIssueType(true)).toBe(false);
    });
  });
});

describe('IssueType constants', () => {
  it('KNOWN_ISSUE_TYPES contains all expected types', () => {
    expect(KNOWN_ISSUE_TYPES).toEqual([
      'bug',
      'feature',
      'task',
      'epic',
      'chore',
    ]);
  });

  it('KNOWN_ISSUE_TYPES is readonly (has 5 items)', () => {
    expect(KNOWN_ISSUE_TYPES.length).toBe(5);
  });

  it('issue type constants have correct values', () => {
    expect(TypeBug).toBe('bug');
    expect(TypeFeature).toBe('feature');
    expect(TypeTask).toBe('task');
    expect(TypeEpic).toBe('epic');
    expect(TypeChore).toBe('chore');
  });
});

describe('API type guards', () => {
  describe('isApiSuccess', () => {
    it('returns true for success responses', () => {
      const successResult: ApiResult<string> = {
        success: true,
        data: 'test data',
      };
      expect(isApiSuccess(successResult)).toBe(true);
    });

    it('returns false for error responses', () => {
      const errorResult: ApiResult<string> = {
        success: false,
        error: 'Something went wrong',
      };
      expect(isApiSuccess(errorResult)).toBe(false);
    });

    it('correctly narrows type to access data', () => {
      const result: ApiResult<{ id: number }> = {
        success: true,
        data: { id: 42 },
      };

      if (isApiSuccess(result)) {
        // TypeScript should allow accessing data here
        expect(result.data.id).toBe(42);
      }
    });
  });

  describe('isApiError', () => {
    it('returns true for error responses', () => {
      const errorResult: ApiResult<string> = {
        success: false,
        error: 'Something went wrong',
      };
      expect(isApiError(errorResult)).toBe(true);
    });

    it('returns false for success responses', () => {
      const successResult: ApiResult<string> = {
        success: true,
        data: 'test data',
      };
      expect(isApiError(successResult)).toBe(false);
    });

    it('correctly narrows type to access error properties', () => {
      const result: ApiResult<string> = {
        success: false,
        error: 'Not found',
        code: 'NOT_FOUND',
        details: { resource: 'user' },
      };

      if (isApiError(result)) {
        // TypeScript should allow accessing error properties here
        expect(result.error).toBe('Not found');
        expect(result.code).toBe('NOT_FOUND');
        expect(result.details).toEqual({ resource: 'user' });
      }
    });
  });

  describe('isApiSuccess and isApiError are mutually exclusive', () => {
    it('success response: isApiSuccess=true, isApiError=false', () => {
      const result: ApiResult<number> = { success: true, data: 123 };
      expect(isApiSuccess(result)).toBe(true);
      expect(isApiError(result)).toBe(false);
    });

    it('error response: isApiSuccess=false, isApiError=true', () => {
      const result: ApiResult<number> = { success: false, error: 'Error' };
      expect(isApiSuccess(result)).toBe(false);
      expect(isApiError(result)).toBe(true);
    });
  });
});
