# Entity Resolver Service

## Overview

The Entity Resolver Service (`resolver.py`) processes email threads to:
1. Extract email addresses from thread messages
2. Create or find customers for each email address
3. Link customers to threads via the `thread_participants` junction table
4. Update thread processing stages

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

Or install directly:
```bash
pip install supabase
```

### 2. Environment Variables

The resolver requires these environment variables:

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional (if NEXT_PUBLIC_SUPABASE_URL is not set)
SUPABASE_URL=https://your-project.supabase.co
```

**Getting the Service Role Key:**
1. Go to your Supabase Dashboard
2. Navigate to Settings → API
3. Copy the `service_role` key (secret) - this bypasses RLS

### 3. Set Environment Variables

**Option A: Export in your shell**
```bash
export NEXT_PUBLIC_SUPABASE_URL="https://fdaqphksmlmupyrsatcz.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key_here"
```

**Option B: Add to .env.local**
```bash
# Add to .env.local
NEXT_PUBLIC_SUPABASE_URL=https://fdaqphksmlmupyrsatcz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

## Usage

### Basic Usage

```python
from backend.services.resolver import resolve_thread_entities

result = resolve_thread_entities(
    user_id="user-uuid-here",
    thread_ids=["thread-id-1", "thread-id-2"]
)

print(result)
```

### Testing

Run the test script from the project root:

```bash
python3 test_resolver.py
```

The test script will:
- Check for required environment variables
- Test Supabase connection
- Find threads in your database
- Run the resolver on test threads
- Display results and verify the output

## Function Reference

### `resolve_thread_entities(user_id: str, thread_ids: list[str]) -> dict`

Resolves email addresses from thread messages and creates customer/participant relationships.

**Parameters:**
- `user_id` (str): UUID of the user (for multi-tenancy)
- `thread_ids` (list[str]): List of thread_id strings to process

**Returns:**
```python
{
    "success": bool,
    "processed_threads": int,
    "failed_threads": list,
    "customers_created": int,
    "customers_found": int,
    "participants_linked": int,
    "errors": list[str]
}
```

**Process:**
1. Updates `thread_processing_stages` to `'resolving_entities'`
2. Fetches thread messages and user email
3. Extracts unique email addresses from messages
4. Creates or finds customers for each email
5. Links customers to threads via `thread_participants`
6. Updates `thread_processing_stages` to `'analyzing'`

## Integration

The resolver can be integrated into your workflow in several ways:

1. **Scheduled Job**: Run periodically via cron
2. **API Endpoint**: Call from a Next.js API route
3. **Supabase Edge Function**: Trigger from a Deno function
4. **Manual Script**: Run as needed

Example API route integration:
```typescript
// app/api/resolve-threads/route.ts
import { resolve_thread_entities } from '@/backend/services/resolver'

export async function POST(req: Request) {
  const { user_id, thread_ids } = await req.json()
  const result = resolve_thread_entities(user_id, thread_ids)
  return Response.json(result)
}
```

## Error Handling

The resolver includes comprehensive error handling:
- Individual thread failures don't stop processing
- Errors are logged and returned in the result
- Failed threads are marked in `failed_threads` array
- All errors are included in the `errors` list

## Notes

- The resolver uses the **service role key** to bypass RLS policies
- All operations are scoped to the provided `user_id` for multi-tenancy
- Customer creation uses the email's local part (before @) as `full_name` initially
- Domain matching links customers to companies automatically
- The unique constraint on `(thread_id, customer_id)` prevents duplicate participants



