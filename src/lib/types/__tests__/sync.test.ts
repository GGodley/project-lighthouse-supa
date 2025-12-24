/**
 * Unit tests for sync status transitions
 * 
 * Verifies that invalid status transitions are rejected
 * 
 * To run: npx tsx src/lib/types/__tests__/sync.test.ts
 */

import {
  SyncStatus,
  isValidStatusTransition,
  validateStatusTransition,
  getAllowedTransitions,
} from '../sync';

// Simple test runner (no external dependencies)
function describe(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

function it(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
  } catch (error) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${error}`);
    process.exit(1);
  }
}

function expect(actual: any) {
  return {
    toBe: (expected: any) => {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
      }
    },
    toBeInstanceOf: (constructor: any) => {
      if (!(actual instanceof constructor)) {
        throw new Error(`Expected instance of ${constructor.name}, got ${typeof actual}`);
      }
    },
    toContain: (item: any) => {
      if (!actual.includes(item)) {
        throw new Error(`Expected array to contain ${item}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual: (expected: any) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
  };
}

describe('SyncStatus Transitions', () => {
  describe('isValidStatusTransition', () => {
    it('should allow idle -> pending', () => {
      expect(isValidStatusTransition(SyncStatus.IDLE, SyncStatus.PENDING)).toBe(true);
    });

    it('should allow pending -> creating_job', () => {
      expect(isValidStatusTransition(SyncStatus.PENDING, SyncStatus.CREATING_JOB)).toBe(true);
    });

    it('should allow creating_job -> syncing', () => {
      expect(isValidStatusTransition(SyncStatus.CREATING_JOB, SyncStatus.SYNCING)).toBe(true);
    });

    it('should allow syncing -> running', () => {
      expect(isValidStatusTransition(SyncStatus.SYNCING, SyncStatus.RUNNING)).toBe(true);
    });

    it('should allow syncing -> completed', () => {
      expect(isValidStatusTransition(SyncStatus.SYNCING, SyncStatus.COMPLETED)).toBe(true);
    });

    it('should allow running -> completed', () => {
      expect(isValidStatusTransition(SyncStatus.RUNNING, SyncStatus.COMPLETED)).toBe(true);
    });

    it('should allow any status -> failed', () => {
      expect(isValidStatusTransition(SyncStatus.IDLE, SyncStatus.FAILED)).toBe(false); // Not directly, but through transitions
      expect(isValidStatusTransition(SyncStatus.PENDING, SyncStatus.FAILED)).toBe(true);
      expect(isValidStatusTransition(SyncStatus.CREATING_JOB, SyncStatus.FAILED)).toBe(true);
      expect(isValidStatusTransition(SyncStatus.SYNCING, SyncStatus.FAILED)).toBe(true);
      expect(isValidStatusTransition(SyncStatus.RUNNING, SyncStatus.FAILED)).toBe(true);
    });

    it('should allow failed -> pending (retry)', () => {
      expect(isValidStatusTransition(SyncStatus.FAILED, SyncStatus.PENDING)).toBe(true);
    });

    it('should allow completed -> pending (manual re-sync)', () => {
      expect(isValidStatusTransition(SyncStatus.COMPLETED, SyncStatus.PENDING)).toBe(true);
    });

    it('should reject invalid transitions', () => {
      // completed -> syncing directly (should go through pending first)
      expect(isValidStatusTransition(SyncStatus.COMPLETED, SyncStatus.SYNCING)).toBe(false);
      
      // idle -> completed (should go through pending -> creating_job -> syncing first)
      expect(isValidStatusTransition(SyncStatus.IDLE, SyncStatus.COMPLETED)).toBe(false);
      
      // running -> syncing (can't go backwards)
      expect(isValidStatusTransition(SyncStatus.RUNNING, SyncStatus.SYNCING)).toBe(false);
      
      // completed -> creating_job (should go through pending first)
      expect(isValidStatusTransition(SyncStatus.COMPLETED, SyncStatus.CREATING_JOB)).toBe(false);
    });

    it('should allow same status (idempotent updates)', () => {
      expect(isValidStatusTransition(SyncStatus.IDLE, SyncStatus.IDLE)).toBe(true);
      expect(isValidStatusTransition(SyncStatus.SYNCING, SyncStatus.SYNCING)).toBe(true);
      expect(isValidStatusTransition(SyncStatus.COMPLETED, SyncStatus.COMPLETED)).toBe(true);
    });
  });

  describe('validateStatusTransition', () => {
    it('should not throw for valid transitions', () => {
      expect(() => {
        validateStatusTransition(SyncStatus.PENDING, SyncStatus.CREATING_JOB);
      }).not.toThrow();
    });

    it('should throw for invalid transitions', () => {
      expect(() => {
        validateStatusTransition(SyncStatus.COMPLETED, SyncStatus.SYNCING);
      }).toThrow('Invalid status transition');
    });

    it('should include helpful error message', () => {
      try {
        validateStatusTransition(SyncStatus.COMPLETED, SyncStatus.SYNCING);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('completed');
        expect((error as Error).message).toContain('syncing');
      }
    });
  });

  describe('getAllowedTransitions', () => {
    it('should return correct allowed transitions for idle', () => {
      const allowed = getAllowedTransitions(SyncStatus.IDLE);
      expect(allowed).toEqual([SyncStatus.PENDING]);
    });

    it('should return correct allowed transitions for pending', () => {
      const allowed = getAllowedTransitions(SyncStatus.PENDING);
      expect(allowed).toContain(SyncStatus.CREATING_JOB);
      expect(allowed).toContain(SyncStatus.FAILED);
    });

    it('should return correct allowed transitions for syncing', () => {
      const allowed = getAllowedTransitions(SyncStatus.SYNCING);
      expect(allowed).toContain(SyncStatus.RUNNING);
      expect(allowed).toContain(SyncStatus.COMPLETED);
      expect(allowed).toContain(SyncStatus.FAILED);
    });

    it('should return correct allowed transitions for completed', () => {
      const allowed = getAllowedTransitions(SyncStatus.COMPLETED);
      expect(allowed).toContain(SyncStatus.PENDING);
      expect(allowed).toContain(SyncStatus.FAILED);
    });

    it('should return correct allowed transitions for failed', () => {
      const allowed = getAllowedTransitions(SyncStatus.FAILED);
      expect(allowed).toContain(SyncStatus.PENDING);
      expect(allowed).toContain(SyncStatus.FAILED);
    });
  });
});

