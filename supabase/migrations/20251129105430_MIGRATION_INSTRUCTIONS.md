# Migration Instructions: Add Unique Constraint on Features Title

This migration has been broken into smaller chunks for easier execution in the Supabase SQL editor.

## Execution Order

Run these SQL files in order:

### 1. Step 1: Add Columns
**File:** `20251129105430_step1_add_columns.sql`
- Adds `first_requested` and `last_requested` columns to `features` table
- Safe to run multiple times

### 2. Step 2: Backfill Dates
**File:** `20251129105430_step2_backfill_dates.sql`
- Populates `first_requested` and `last_requested` from existing `feature_requests`
- Uses `created_at` as fallback for features with no requests

### 3. Step 3: Identify Duplicates (Optional - for review)
**File:** `20251129105430_step3_identify_duplicate_features.sql`
- Shows which features have duplicate titles
- Review this output before proceeding

### 4. Step 4: Delete Conflicting Feature Requests
**File:** `20251129105430_step4_delete_duplicate_feature_requests.sql`
- Deletes `feature_requests` that would violate unique constraint when merging
- Keeps the oldest request per customer

### 5. Step 5: Merge Duplicate Features
**File:** `20251129105430_step5_merge_duplicate_features.sql`
- Updates `feature_requests` to point to canonical (oldest) feature
- Must run AFTER step 4

### 6. Step 6: Delete Duplicate Features
**File:** `20251129105430_step6_delete_duplicate_features.sql`
- Deletes duplicate features, keeping only the oldest one
- Must run AFTER step 5

### 7. Step 7: Add Unique Constraint
**File:** `20251129105430_step7_add_unique_constraint.sql`
- Adds unique constraint on `features.title`
- Must run AFTER all duplicates are merged

### 8. Step 8: Add Index
**File:** `20251129105430_step8_add_index.sql`
- Creates performance index on `title` column
- Safe to run multiple times

## Notes

- Steps 1, 2, and 8 are safe to run multiple times
- Steps 4, 5, 6, and 7 must be run in order
- Step 3 is optional and just for review
- If you encounter errors, check the output of step 3 to understand what duplicates exist

