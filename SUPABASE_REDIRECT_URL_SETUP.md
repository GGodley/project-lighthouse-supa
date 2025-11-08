# Supabase Redirect URL Configuration

## Problem
After signing in, users are redirected back to the login page instead of the dashboard. This is typically caused by missing or incorrect redirect URL configuration in Supabase.

## Solution: Configure Redirect URLs in Supabase Dashboard

You need to add your production and preview URLs to Supabase's allowed redirect URLs list.

### Steps:

1. **Go to Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard
   - Select your project

2. **Navigate to Authentication Settings**
   - Go to: **Authentication** → **URL Configuration**

3. **Add Redirect URLs**
   Add the following URLs to the **"Redirect URLs"** list:

   **For Production:**
   ```
   https://your-production-domain.vercel.app/auth/callback
   ```

   **For Preview Deployments (Vercel):**
   Based on your preview URL pattern `https://project-lighthouse-supa-git-*-*.vercel.app`, add:
   ```
   https://*.vercel.app/auth/callback
   ```
   This wildcard pattern will match all Vercel preview deployments.

   **For Local Development:**
   ```
   http://localhost:3000/auth/callback
   http://127.0.0.1:3000/auth/callback
   ```

   **Example for your current preview branch:**
   ```
   https://project-lighthouse-supa-git-f-dcd2bf-gabriels-projects-87b76bd9.vercel.app/auth/callback
   ```
   (Note: You can use the wildcard pattern above instead of adding each preview URL individually)

4. **Set Site URL**
   - In the **"Site URL"** field, set your production URL:
   ```
   https://your-production-domain.vercel.app
   ```

5. **Save Changes**
   - Click **"Save"** to apply the changes

### Important Notes:

- The redirect URL must **exactly match** what's in your code (including the `/auth/callback` path)
- For Vercel preview deployments, you can use a wildcard pattern: `https://*.vercel.app/auth/callback`
- Make sure there are no trailing slashes in the URLs
- Changes take effect immediately (no deployment needed)

### Verify Your Configuration:

1. Check your production URL by looking at your Vercel deployment
2. Ensure `NEXT_PUBLIC_SITE_URL` environment variable is set in Vercel (if using custom domain)
3. The redirect URL in your code uses `getURL()` which should return your production URL

### Testing:

After updating the Supabase configuration:
1. Try signing in again
2. Check browser console for any redirect URL errors
3. Verify the redirect URL in the OAuth flow matches what's configured in Supabase

