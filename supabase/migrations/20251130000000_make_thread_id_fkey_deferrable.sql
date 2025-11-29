-- Make feature_requests_thread_id_fkey foreign key constraint deferrable
-- This allows the constraint to be checked at the end of the transaction
-- rather than immediately, which is necessary when threads are saved after feature requests

-- Step 1: Drop the existing constraint
ALTER TABLE public.feature_requests 
DROP CONSTRAINT IF EXISTS feature_requests_thread_id_fkey;

-- Step 2: Add the constraint back as DEFERRABLE INITIALLY DEFERRED
-- This means the constraint check is deferred until the end of the transaction
ALTER TABLE public.feature_requests
ADD CONSTRAINT feature_requests_thread_id_fkey
FOREIGN KEY (thread_id) 
REFERENCES public.threads(thread_id) 
ON DELETE CASCADE
DEFERRABLE INITIALLY DEFERRED;

-- Add comment explaining why this is deferrable
COMMENT ON CONSTRAINT feature_requests_thread_id_fkey ON public.feature_requests IS 
'Foreign key constraint for thread_id. Made deferrable to allow feature requests to be saved before threads are saved in the same transaction.';

