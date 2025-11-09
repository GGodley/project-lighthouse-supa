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

    // Fetch active companies (not archived)
    // Use a simpler query that explicitly handles NULL and excludes archived
    const { data: activeCompanies, error: activeError } = await supabase
      .from('companies')
      .select('company_id, company_name, domain_name, health_score, overall_sentiment, status, mrr, renewal_date, last_interaction_at, created_at')
      .eq('user_id', user.id)
      .or('status.eq.active,status.is.null,status.eq.inactive,status.eq.at_risk,status.eq.churned') // Include all non-archived statuses (including NULL)
      .order('company_name', { ascending: true });

    // Fetch archived companies
    const { data: archivedCompanies, error: archivedError } = await supabase
      .from('companies')
      .select('company_id, company_name, domain_name, health_score, overall_sentiment, status, mrr, renewal_date, last_interaction_at, created_at')
      .eq('user_id', user.id)
      .eq('status', 'archived')
      .order('company_name', { ascending: true });

    if (activeError || archivedError) {
      console.error('Supabase fetch error:', activeError?.message || archivedError?.message);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    return NextResponse.json({ 
      companies: activeCompanies ?? [], 
      archivedCompanies: archivedCompanies ?? [] 
    }, { status: 200 });
  } catch (e) {
    console.error('Unexpected API error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}


