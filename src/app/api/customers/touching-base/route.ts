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

    // Calculate the cutoff date based on the days parameter
    // cutoffDate = today - selectedDays
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    // Set to start of day for consistent comparison
    cutoffDate.setHours(0, 0, 0, 0);

    // Fetch customers with their company information
    // Filter: last_interaction_at IS NOT NULL AND last_interaction_at <= cutoffDate
    // Use left join to include customers even if they don't have a company
    const { data: allCustomers, error: allError } = await supabase
      .from('customers')
      .select(`
        customer_id,
        full_name,
        email,
        company_id,
        health_score,
        overall_sentiment,
        last_interaction_at,
        created_at,
        companies(
          company_id,
          company_name
        )
      `)
      .eq('user_id', user.id)
      .not('last_interaction_at', 'is', null)
      .lte('last_interaction_at', cutoffDate.toISOString())
      .order('last_interaction_at', { ascending: true });

    if (allError) {
      console.error('Supabase fetch error:', allError.message);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    // Transform the data to flatten company information
    const customersWithCompanies = (allCustomers || []).map((customer: any) => ({
      customer_id: customer.customer_id,
      full_name: customer.full_name,
      email: customer.email,
      company_id: customer.company_id,
      company_name: customer.companies?.company_name || null,
      health_score: customer.health_score,
      overall_sentiment: customer.overall_sentiment,
      last_interaction_at: customer.last_interaction_at,
      created_at: customer.created_at,
    }));

    // Limit to 30 results for performance
    const limitedResults = customersWithCompanies.slice(0, 30);

    return NextResponse.json({ 
      customers: limitedResults ?? [],
      totalCount: customersWithCompanies.length
    }, { status: 200 });
  } catch (e) {
    console.error('Unexpected API error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

