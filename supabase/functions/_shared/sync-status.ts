/**
 * Shared Sync Status Enum for Edge Functions
 * 
 * This mirrors src/lib/types/sync.ts for use in Supabase Edge Functions (Deno)
 * Keep these in sync!
 * 
 * Single source of truth for sync job statuses in edge functions
 */

export const SyncStatus = {
  IDLE: "idle",
  PENDING: "pending",
  CREATING_JOB: "creating_job",
  SYNCING: "syncing",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type SyncStatusValue = typeof SyncStatus[keyof typeof SyncStatus];

/**
 * Allowed status transitions
 * 
 * Format: { fromStatus: [allowedToStatuses] }
 */
const ALLOWED_TRANSITIONS: Record<SyncStatusValue, SyncStatusValue[]> = {
  [SyncStatus.IDLE]: [SyncStatus.PENDING],
  [SyncStatus.PENDING]: [SyncStatus.CREATING_JOB, SyncStatus.FAILED],
  [SyncStatus.CREATING_JOB]: [SyncStatus.SYNCING, SyncStatus.FAILED],
  [SyncStatus.SYNCING]: [SyncStatus.RUNNING, SyncStatus.COMPLETED, SyncStatus.FAILED],
  [SyncStatus.RUNNING]: [SyncStatus.COMPLETED, SyncStatus.FAILED],
  [SyncStatus.COMPLETED]: [SyncStatus.PENDING, SyncStatus.FAILED],
  [SyncStatus.FAILED]: [SyncStatus.PENDING, SyncStatus.FAILED],
};

/**
 * Validates if a status transition is allowed
 */
export function isValidStatusTransition(
  fromStatus: SyncStatusValue,
  toStatus: SyncStatusValue
): boolean {
  if (fromStatus === toStatus) {
    return true;
  }

  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed) {
    return false;
  }

  return allowed.includes(toStatus);
}

/**
 * Validates and throws if transition is invalid
 */
export function validateStatusTransition(
  fromStatus: SyncStatusValue,
  toStatus: SyncStatusValue
): void {
  if (!isValidStatusTransition(fromStatus, toStatus)) {
    throw new Error(
      `Invalid status transition: ${fromStatus} -> ${toStatus}. ` +
      `Allowed transitions from ${fromStatus}: ${ALLOWED_TRANSITIONS[fromStatus]?.join(', ') || 'none'}`
    );
  }
}

