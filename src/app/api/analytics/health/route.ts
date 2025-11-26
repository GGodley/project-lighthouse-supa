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

    // Fetch customer health_score data
    // RLS policy ensures users can only see customers from their own companies
    const { data: customers, error: customerError } = await supabase
      .from('customers')
      .select('health_score');

    if (customerError) {
      console.error('Supabase fetch error:', customerError.message);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    // Count customers by health classification
    // health_score > 0 → Healthy
    // health_score === 0 → Neutral
    // health_score < 0 → Negative
    const statusCounts = {
      'Healthy': 0,
      'Neutral': 0,
      'Negative': 0
    };

    customers?.forEach(customer => {
      const healthScore = customer.health_score;
      // Handle null/undefined health_score as Neutral
      if (healthScore === null || healthScore === undefined) {
        statusCounts['Neutral']++;
      } else if (healthScore > 0) {
        statusCounts['Healthy']++;
      } else if (healthScore < 0) {
        statusCounts['Negative']++;
      } else {
        // healthScore === 0
        statusCounts['Neutral']++;
      }
    });

    return NextResponse.json({ 
      healthData: statusCounts,
      totalCustomers: customers?.length || 0
    }, { status: 200 });

  } catch (e) {
    console.error('Unexpected API error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
