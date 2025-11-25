// Note: Install the required dependency with: npm install @supabase/ssr
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  const cookieStore = await cookies();

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

    // Calculate the date 14 days ago
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    // Fetch companies where:
    // 1. last_interaction_at IS NULL OR
    // 2. last_interaction_at < (NOW() - 14 days)
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
    // - last_interaction_at is NULL OR
    // - last_interaction_at is more than 14 days ago
    const touchingBaseCompanies = activeCompanies.filter(company => {
      if (company.last_interaction_at === null) {
        return true; // Never had an interaction
      }
      const lastInteractionDate = new Date(company.last_interaction_at);
      return lastInteractionDate < twoWeeksAgo;
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

