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

    // Fetch customer status data
    const { data: customers, error: customerError } = await supabase
      .from('customers')
      .select('status')
      .not('status', 'is', null);

    if (customerError) {
      console.error('Supabase fetch error:', customerError.message);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    // Count customers by status
    const statusCounts = {
      'Healthy': 0,
      'Needs Attention': 0,
      'At Risk': 0
    };

    customers?.forEach(customer => {
      const status = customer.status;
      if (status === 'Healthy') statusCounts['Healthy']++;
      else if (status === 'Needs Attention') statusCounts['Needs Attention']++;
      else if (status === 'At Risk') statusCounts['At Risk']++;
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
