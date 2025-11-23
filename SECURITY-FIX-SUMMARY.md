# Critical Security Bug Fix Summary

## Issues Fixed

### 1. Broken Customers Table RLS Policy (CRITICAL)
**File**: `supabase/migrations/20251123000000_fix_customers_rls_policy.sql`

**Problem**: The existing RLS policy allowed ALL authenticated users to see ALL customers from ALL users:
```sql
-- OLD (BROKEN):
create policy "Customers select for authenticated" on public.customers
for select using ( auth.role() = 'authenticated' );
```

**Fix**: Replaced with user-scoped policies that filter customers through company ownership:
```sql
-- NEW (SECURE):
CREATE POLICY "Users can view their own customers" ON public.customers
  FOR SELECT 
  USING (
    company_id IN (
      SELECT company_id FROM public.companies WHERE user_id = auth.uid()
    )
  );
```

**Impact**: 
- ✅ Users can now only see customers from their own companies
- ✅ Database-level protection for all queries (including frontend)
- ✅ Prevents cross-user data leakage at the database level

### 2. Meeting Customer Lookup Without User Filter (CRITICAL)
**File**: `supabase/functions/process-events/index.ts`

**Problem**: Customer lookup searched globally across all users:
```typescript
// OLD (BROKEN):
const { data: customer } = await supabase
  .from('customers')
  .select('customer_id, company_id')
  .in('email', externalEmails)
  .limit(1)
  .maybeSingle();
```

**Fix**: Now filters by user's companies only:
```typescript
// NEW (SECURE):
// Get user's companies first
const { data: userCompanies } = await supabase
  .from('companies')
  .select('company_id')
  .eq('user_id', userId);

// Then search customers only in user's companies
const { data: customer } = await supabase
  .from('customers')
  .select('customer_id, company_id')
  .in('email', externalEmails)
  .in('company_id', companyIds)  // CRITICAL: Only user's companies
  .limit(1)
  .maybeSingle();
```

**Impact**:
- ✅ Meetings can only be linked to customers from the meeting owner's companies
- ✅ Prevents meetings from appearing in wrong user's company profile
- ✅ Defense in depth - even if RLS is bypassed, code enforces isolation

### 3. Added Validation Before Linking
**File**: `supabase/functions/process-events/index.ts`

**Added**: Validation to ensure company belongs to user before linking meeting:
```typescript
// Validate that customer_id belongs to user's company before linking
if (customerId && companyId) {
  const { data: companyCheck } = await supabase
    .from('companies')
    .select('company_id')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .single();

  if (!companyCheck) {
    // Clear invalid link
    customerId = null;
    companyId = null;
  }
}
```

**Impact**:
- ✅ Extra validation layer
- ✅ Prevents invalid links even if query logic has bugs
- ✅ Logs warnings for security issues

## How It Works Now

### Data Flow
1. **User creates meeting** → Meeting has `user_id`
2. **System finds external attendees** → Gets their email addresses
3. **System gets user's companies** → `SELECT company_id FROM companies WHERE user_id = userId`
4. **System searches customers** → Only in user's companies: `WHERE company_id IN (user's companies) AND email IN (attendee emails)`
5. **System validates** → Ensures company belongs to user before linking
6. **Meeting is created** → With correct `customer_id` and `company_id`

### Protection Layers
1. **Database Level (RLS)**: Customers table RLS policy filters by company ownership
2. **Application Level (Code)**: Edge functions filter by user's companies
3. **Validation Layer**: Double-checks company ownership before linking

## Testing Checklist

- [ ] User A's meetings only link to User A's customers
- [ ] User A's meetings do NOT appear in User B's company profile
- [ ] RLS policy prevents User A from seeing User B's customers
- [ ] Edge function correctly filters customers by user's companies
- [ ] Validation prevents invalid company links
- [ ] Meetings with no matching customer still work (customer_id = null)

## Files Modified

1. `supabase/migrations/20251123000000_fix_customers_rls_policy.sql` - Fixed RLS policy
2. `supabase/functions/process-events/index.ts` - Added user filtering and validation

## Next Steps

1. **Apply migration**: Run `20251123000000_fix_customers_rls_policy.sql` in Supabase SQL Editor
2. **Deploy edge function**: Push updated `process-events` function
3. **Test**: Verify meetings are correctly isolated per user
4. **Data cleanup** (optional): Identify and fix any incorrectly linked meetings

## Notes

- The RLS policy uses company ownership because customers are linked to companies, not directly to users
- Edge functions use service role which bypasses RLS, so code-level filtering is essential
- The validation layer provides defense in depth
- Other edge functions (sync-threads, sync-emails) already filter by company_id, so they're safer

