# How to View Server-Side Logs

The dashboard page uses server-side logging that won't appear in your browser console. Here's where to find them:

## Development (Local)

1. Open your terminal where you ran `npm run dev`
2. Look for logs that start with `[Dashboard]`
3. You should see logs like:
   - `[Dashboard] ========== FEATURE REQUESTS QUERY START ==========`
   - `[Dashboard] Step 1: Fetching all companies for user...`
   - `[Dashboard] Step 3: Querying feature_requests...`
   - etc.

## Production (Vercel)

1. Go to your Vercel dashboard
2. Select your project
3. Click on the "Functions" tab
4. Find the function logs for your dashboard page
5. Or go to "Deployments" → Click on the latest deployment → "Functions" tab → View logs

## What to Look For

The logs will show:
- Step 1: All companies for the user
- Step 1.5: Whether the target company exists
- Step 2: Active companies after filtering
- Step 3: Feature requests query execution
- Step 4: Query results
- Step 4.5: Whether the target feature request was found

If you see "Step 4: No feature requests found", check:
- Step 1.5: Is the target company found and active?
- Step 2.5: Is the target company in the active list?
- Step 4.5: Does the debug query find feature requests for the target company?

