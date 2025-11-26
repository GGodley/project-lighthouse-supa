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

    // Fetch companies with overall_sentiment
    // Get all companies first, then filter out archived in JavaScript to handle NULL properly
    const { data: allCompanies, error: companyError } = await supabase
      .from('companies')
      .select('overall_sentiment, status')
      .eq('user_id', user.id);

    if (companyError) {
      console.error('Supabase fetch error:', companyError.message);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    // Filter out archived companies (keep NULL and all other statuses)
    const activeCompanies = (allCompanies || []).filter(
      company => company.status !== 'archived'
    );

    // Count companies by overall_sentiment classification
    // Use overall_sentiment directly: 'Healthy', 'Neutral', 'At Risk'
    // Map 'At Risk' → 'Negative' for chart display
    const statusCounts = {
      'Healthy': 0,
      'Neutral': 0,
      'Negative': 0
    };

    activeCompanies.forEach(company => {
      const sentiment = company.overall_sentiment;
      // Handle null/undefined overall_sentiment as Neutral
      if (sentiment === null || sentiment === undefined) {
        statusCounts['Neutral']++;
      } else if (sentiment === 'Healthy') {
        statusCounts['Healthy']++;
      } else if (sentiment === 'At Risk') {
        statusCounts['Negative']++;
      } else if (sentiment === 'Neutral') {
        statusCounts['Neutral']++;
      } else {
        // Unknown sentiment value, default to Neutral
        statusCounts['Neutral']++;
      }
    });

    return NextResponse.json({ 
      healthData: statusCounts,
      totalCustomers: activeCompanies.length
    }, { status: 200 });

  } catch (e) {
    console.error('Unexpected API error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
