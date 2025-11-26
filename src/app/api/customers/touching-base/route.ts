// Note: Install the required dependency with: npm install @supabase/ssr
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const cookieStore = await cookies();

  // Get days parameter from query string, default to 30 days (1 month)
  const { searchParams } = new URL(request.url);
  const daysParam = searchParams.get('days');
  const days = daysParam ? parseInt(daysParam, 10) : 30;

  // Validate days parameter
  if (isNaN(days) || days < 1) {
    return NextResponse.json({ error: 'Invalid days parameter' }, { status: 400 });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Calculate the date based on the days parameter
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Fetch companies where:
    // 1. last_interaction_at IS NOT NULL (exclude companies that have never had an interaction)
    // 2. last_interaction_at < (NOW() - specified days)
    // 3. status != 'archived' (active companies only)
    // We'll fetch all companies and filter in JavaScript to handle NULL properly
    const { data: allCompanies, error: allError } = await supabase
      .from('companies')
      .select('company_id, company_name, domain_name, health_score, overall_sentiment, status, mrr, renewal_date, last_interaction_at, created_at')
      .eq('user_id', user.id)
      .order('last_interaction_at', { ascending: true, nullsFirst: true });

    if (allError) {
      console.error('Supabase fetch error:', allError.message);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    // Filter to only active companies (not archived)
    const activeCompanies = (allCompanies || []).filter(
      company => company.status !== 'archived'
    );

    // Filter companies that need touching base:
    // - last_interaction_at is NOT NULL (exclude companies that have never had an interaction)
    // - last_interaction_at is more than the specified days ago
    const touchingBaseCompanies = activeCompanies.filter(company => {
      // Exclude companies with NULL last_interaction_at
      if (company.last_interaction_at === null) {
        return false; // Skip companies that have never had an interaction
      }
      const lastInteractionDate = new Date(company.last_interaction_at);
      return lastInteractionDate < cutoffDate;
    });

    // Limit to 30 results for performance
    const limitedResults = touchingBaseCompanies.slice(0, 30);

    return NextResponse.json({ 
      companies: limitedResults ?? [],
      totalCount: touchingBaseCompanies.length
    }, { status: 200 });
  } catch (e) {
    console.error('Unexpected API error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

