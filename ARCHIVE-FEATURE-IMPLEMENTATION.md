# Archive Feature Implementation

## Overview
Implemented a comprehensive archive feature that allows companies to be archived (moved to a separate section) without deleting historical data. Archived companies are blocked from importing new emails but retain all their historical threads and interactions.

## Features Implemented

### 1. Database Changes

#### Migration: `20250130000002_add_archive_support.sql`
- **Added 'archived' status to companies table**: Updated the status constraint to include 'archived' as a valid status
- **Created/Updated domain_blocklist table**: 
  - Added `status` column with values 'archived' or 'deleted'
  - Ensures proper tracking of why domains are blocked
  - Both archived and deleted domains prevent new email imports

### 2. UI Changes

#### Collapsible Sections
- **Main Company Table**: Can be collapsed/expanded with a clickable header showing company count
- **Archives Section**: 
  - Only appears when there are archived companies
  - Collapsed by default
  - Shows count of archived companies
  - Can be expanded to view archived companies

#### Archive Functionality
- **Archive Button**: Moves selected companies to archives
  - Sets company status to 'archived'
  - Adds domain to blocklist with 'archived' status
  - Preserves all historical data (threads, messages, customers)
  - Prevents new email imports from archived domains

#### Restore Functionality
- **Restore Button**: Moves archived companies back to main table
  - Sets company status to 'active'
  - Removes domain from blocklist (only if status is 'archived')
  - Allows new email imports to resume

### 3. API Changes

#### Updated `/api/customers` Route
- Now returns two separate arrays:
  - `companies`: Active companies (all statuses except 'archived')
  - `archivedCompanies`: Companies with 'archived' status
- Allows frontend to display them in separate sections

### 4. Sync Threads Integration

#### Updated `sync-threads/index.ts`
- Fetches blocklist with status information
- Blocks both 'archived' and 'deleted' domains from sync
- Logs how many domains are blocked and their status breakdown
- Ensures no new emails are imported from archived or deleted companies

## How It Works

### Archiving a Company
1. User selects one or more companies
2. Clicks "Archive" button
3. System:
   - Adds domain(s) to `domain_blocklist` with status 'archived'
   - Updates company status to 'archived'
   - Company moves from main table to Archives section
   - Historical data remains intact
   - New emails from archived domains are blocked during sync

### Restoring a Company
1. User selects archived company(ies) from Archives section
2. Clicks "Restore" button
3. System:
   - Removes domain(s) from `domain_blocklist` (only if status is 'archived')
   - Updates company status to 'active'
   - Company moves back to main table
   - New emails from restored domains will be imported again

### Deleting vs Archiving

| Feature | Archive | Delete |
|---------|---------|--------|
| Historical Data | ✅ Preserved | ❌ Deleted (cascade) |
| New Email Imports | ❌ Blocked | ❌ Blocked |
| Blocklist Status | 'archived' | 'deleted' |
| Can Restore | ✅ Yes | ❌ No |
| Company Visible | ✅ In Archives | ❌ Removed |

## Database Schema

### Companies Table
```sql
status TEXT CHECK (status IN ('active', 'inactive', 'at_risk', 'churned', 'archived'))
```

### Domain Blocklist Table
```sql
CREATE TABLE domain_blocklist (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  status TEXT DEFAULT 'deleted' CHECK (status IN ('archived', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, domain)
);
```

## Files Modified

1. **supabase/migrations/20250130000002_add_archive_support.sql** (NEW)
   - Migration to add archive support

2. **src/app/api/customers/route.ts**
   - Updated to return active and archived companies separately

3. **src/app/dashboard/customer-threads/page.tsx**
   - Added collapsible sections
   - Added archive handler with blocklist integration
   - Added restore functionality
   - Added archived companies state and UI

4. **supabase/functions/sync-threads/index.ts**
   - Updated to fetch and log blocklist status
   - Blocks both archived and deleted domains

5. **src/lib/types/threads.ts**
   - Updated BlockedDomain type to include status field

## Testing Checklist

- [ ] Archive a company and verify it moves to Archives section
- [ ] Verify archived company's historical data is still accessible
- [ ] Verify archived company's domain is added to blocklist with 'archived' status
- [ ] Verify new emails from archived domain are not imported during sync
- [ ] Restore an archived company and verify it moves back to main table
- [ ] Verify restored company's domain is removed from blocklist
- [ ] Verify new emails from restored domain are imported again
- [ ] Test collapsible sections (main table and archives)
- [ ] Verify bulk archive/restore operations work correctly
- [ ] Verify deleted companies (status 'deleted') cannot be restored

## Migration Instructions

1. Run the migration:
   ```bash
   supabase migration up
   ```

2. The migration will:
   - Add 'archived' status to companies table
   - Create/update domain_blocklist table with status column
   - Set up proper constraints and indexes

## Notes

- Archived companies retain all their historical threads, messages, and customer data
- Both archived and deleted domains are blocked from importing new emails
- Only archived domains can be restored (deleted domains are permanently removed)
- The Archives section only appears when there are archived companies
- Both main table and Archives section are collapsible for better UX

