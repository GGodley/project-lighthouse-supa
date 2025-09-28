# CRM Dashboard - Deployment Guide

## Vercel Deployment

### Prerequisites
1. Vercel account
2. GitHub repository connected to Vercel
3. Environment variables configured

### Environment Variables Required

Add these environment variables in your Vercel dashboard:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
OPENAI_API_KEY=your_openai_api_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=your_google_redirect_uri
NEXTAUTH_URL=https://your-domain.vercel.app
NEXTAUTH_SECRET=your_nextauth_secret
```

### Deployment Steps

1. **Connect Repository to Vercel**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import your GitHub repository

2. **Configure Environment Variables**
   - In Vercel dashboard, go to Project Settings → Environment Variables
   - Add all the required environment variables listed above

3. **Deploy**
   - Vercel will automatically deploy on every push to main branch
   - Or click "Deploy" button for manual deployment

4. **Configure Supabase Edge Functions**
   - Deploy your Supabase Edge Functions separately
   - Update the function URLs in your environment variables if needed

### Post-Deployment Setup

1. **Update Google OAuth Settings**
   - Add your Vercel domain to Google OAuth authorized redirect URIs
   - Update `GOOGLE_REDIRECT_URI` to your production domain

2. **Configure Supabase RLS Policies**
   - Ensure all Row Level Security policies are properly configured
   - Test authentication flow

3. **Test the Application**
   - Verify Google OAuth login works
   - Test email syncing functionality
   - Check all dashboard features

### Troubleshooting

- **Build Errors**: Check that all environment variables are set
- **Authentication Issues**: Verify Google OAuth configuration
- **Database Errors**: Check Supabase connection and RLS policies
- **Email Sync Issues**: Verify Gmail API permissions and tokens

### Production Checklist

- [ ] All environment variables configured
- [ ] Google OAuth redirect URIs updated
- [ ] Supabase Edge Functions deployed
- [ ] Database migrations applied
- [ ] RLS policies configured
- [ ] Domain configured (if using custom domain)
- [ ] SSL certificate active
- [ ] Performance monitoring enabled
