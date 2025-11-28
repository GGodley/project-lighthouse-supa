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

   **For Production (Custom Domain):**
   ⚠️ **Important:** You must add BOTH www and non-www versions if your domain supports both:
   ```
   https://www.enjoylighthouse.com/auth/callback
   https://enjoylighthouse.com/auth/callback
   ```
   
   **For Production (Vercel Default):**
   ```
   https://your-production-domain.vercel.app/auth/callback
   ```

   **For Preview Deployments (Vercel):**
   ⚠️ **Important:** Supabase does NOT support wildcard URLs. You must add each preview URL individually.
   
   For your current preview deployment, add:
   ```
   https://project-lighthouse-supa-git-f-dcd2bf-gabriels-projects-87b76bd9.vercel.app/auth/callback
   ```
   
   **Note:** Each time Vercel creates a new preview deployment (for a new branch or new commit), you'll need to add that specific URL to Supabase. Alternatively, you can:
   - Use a custom domain for preview deployments
   - Or add preview URLs as needed when testing

   **For Local Development:**
   ```
   http://localhost:3000/auth/callback
   http://127.0.0.1:3000/auth/callback
   ```

4. **Set Site URL**
   - In the **"Site URL"** field, set your canonical production URL (use www version if you have both):
   ```
   https://www.enjoylighthouse.com
   ```
   Or for Vercel default domain:
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

### Dual-Domain Setup (www and non-www):

If your site is accessible via both `www.enjoylighthouse.com` and `enjoylighthouse.com`:

1. **Set `NEXT_PUBLIC_SITE_URL`** to your canonical domain (recommended: `https://www.enjoylighthouse.com`)
2. **Add both domains** to Supabase redirect URLs (as shown above)
3. **How it works:**
   - OAuth redirects will use the canonical domain from `NEXT_PUBLIC_SITE_URL`
   - The callback route automatically handles both domains via `requestUrl.origin`
   - Users visiting either domain will be able to authenticate successfully
   - After authentication, users will be redirected to the canonical domain (www version)

### Verify Your Configuration:

1. Check your production URL by looking at your Vercel deployment
2. Ensure `NEXT_PUBLIC_SITE_URL` environment variable is set in Vercel to your canonical domain (e.g., `https://www.enjoylighthouse.com`)
3. The redirect URL in your code uses `getURL()` which should return your production URL
4. **Important for dual-domain setup:** If you use both `www.enjoylighthouse.com` and `enjoylighthouse.com`, make sure BOTH are added to the redirect URLs list above

### Testing:

After updating the Supabase configuration:
1. Try signing in again
2. Check browser console for any redirect URL errors
3. Verify the redirect URL in the OAuth flow matches what's configured in Supabase

