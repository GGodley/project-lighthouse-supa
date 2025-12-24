# Sync Status Transition Tests

This directory contains unit tests for sync status transitions.

## Running Tests

### Option 1: Using Node.js directly

```bash
# Install test dependencies (if not already installed)
npm install --save-dev @types/node

# Run tests with ts-node or tsx
npx tsx src/lib/types/__tests__/sync.test.ts
```

### Option 2: Using Jest (if configured)

```bash
npm test -- src/lib/types/__tests__/sync.test.ts
```

### Option 3: Using Vitest (if configured)

```bash
npm run test -- src/lib/types/__tests__/sync.test.ts
```

## Test Coverage

The tests verify:
- ✅ Valid status transitions are allowed
- ✅ Invalid status transitions are rejected
- ✅ Same-status updates are allowed (idempotent)
- ✅ Error messages are helpful
- ✅ Allowed transitions are correctly returned

## Expected Behavior

### Valid Transitions
- `idle` → `pending`
- `pending` → `creating_job` or `failed`
- `creating_job` → `syncing` or `failed`
- `syncing` → `running`, `completed`, or `failed`
- `running` → `completed` or `failed`
- `completed` → `pending` (re-sync) or `failed`
- `failed` → `pending` (retry) or `failed`

### Invalid Transitions (should be rejected)
- `completed` → `syncing` (must go through `pending` first)
- `idle` → `completed` (must follow full flow)
- `running` → `syncing` (can't go backwards)

