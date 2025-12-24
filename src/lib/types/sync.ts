/**
 * Shared Sync Status Enum
 * 
 * Single source of truth for sync job statuses across:
 * - Server code (Next.js API routes, Server Actions)
 * - Trigger.dev jobs
 * - UI components
 * 
 * Status flow:
 * idle -> pending -> creating_job -> syncing -> running -> completed
 * Any status -> failed (on error)
 * failed -> pending (retry)
 * completed -> pending (manual re-sync)
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
  [SyncStatus.COMPLETED]: [SyncStatus.PENDING, SyncStatus.FAILED], // Allow re-sync or error
  [SyncStatus.FAILED]: [SyncStatus.PENDING, SyncStatus.FAILED], // Allow retry or re-fail
};

/**
 * Validates if a status transition is allowed
 * 
 * @param fromStatus - Current status
 * @param toStatus - Target status
 * @returns true if transition is allowed, false otherwise
 */
export function isValidStatusTransition(
  fromStatus: SyncStatusValue,
  toStatus: SyncStatusValue
): boolean {
  // Same status is always allowed (idempotent updates)
  if (fromStatus === toStatus) {
    return true;
  }

  // Check if transition is in allowed list
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed) {
    return false;
  }

  return allowed.includes(toStatus);
}

/**
 * Validates and throws if transition is invalid
 * 
 * @param fromStatus - Current status
 * @param toStatus - Target status
 * @throws Error if transition is invalid
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

/**
 * Gets all allowed transitions from a given status
 * 
 * @param fromStatus - Current status
 * @returns Array of allowed target statuses
 */
export function getAllowedTransitions(fromStatus: SyncStatusValue): SyncStatusValue[] {
  return ALLOWED_TRANSITIONS[fromStatus] || [];
}

/**
 * Represents a row in the public.sync_jobs table
 */
export type SyncJob = {
  id: number; // Job ID (BIGINT in DB)
  status: SyncStatusValue;
  details: string | null;
  user_id: string;
  created_at: string; // ISO string
  updated_at: string; // ISO string
  // Optional fields that may be added
  next_page_token?: string | null;
  processed_count?: number | null;
  error?: string | null;
  total_pages?: number | null;
  pages_completed?: number | null;
};

