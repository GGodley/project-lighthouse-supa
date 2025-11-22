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

    // Fast lookup: Get current active customer count from profiles table (O(1) operation)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('active_customer_count')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Supabase fetch error:', profileError.message);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    const currentCount = profile?.active_customer_count ?? 0;

    // Get previous month's count from monthly_customer_counts table
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12

    // Calculate previous month
    let previousYear = currentYear;
    let previousMonth = currentMonth - 1;
    if (previousMonth < 1) {
      previousMonth = 12;
      previousYear = currentYear - 1;
    }

    const { data: previousMonthData, error: monthlyError } = await supabase
      .from('monthly_customer_counts')
      .select('customer_count')
      .eq('user_id', user.id)
      .eq('year', previousYear)
      .eq('month', previousMonth)
      .single();

    if (monthlyError && monthlyError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching monthly count:', monthlyError.message);
      // Don't fail the request, just use null for previous count
    }

    const previousMonthCount = previousMonthData?.customer_count ?? null;

    // On-demand recording: If current month hasn't been recorded yet, record it now (fallback)
    // This ensures data is captured even if cron job fails
    const { data: currentMonthData } = await supabase
      .from('monthly_customer_counts')
      .select('id')
      .eq('user_id', user.id)
      .eq('year', currentYear)
      .eq('month', currentMonth)
      .single();

    if (!currentMonthData) {
      // Current month not recorded yet - record it now (idempotent)
      try {
        await supabase.rpc('record_monthly_customer_count', {
          p_user_id: user.id,
          p_record_previous_month: false // Record current month
        });
      } catch (error) {
        // Don't fail the request if recording fails, just log it
        console.error('Error recording current month count:', error);
      }
    }

    // Calculate percentage change
    let percentageChange: number | null = null;
    let trend: 'up' | 'down' | 'neutral' = 'neutral';

    if (previousMonthCount !== null && previousMonthCount > 0) {
      percentageChange = ((currentCount - previousMonthCount) / previousMonthCount) * 100;
      
      if (percentageChange > 0) {
        trend = 'up';
      } else if (percentageChange < 0) {
        trend = 'down';
      } else {
        trend = 'neutral';
      }
    } else if (previousMonthCount === 0 && currentCount > 0) {
      // Special case: went from 0 to some number (infinite growth)
      percentageChange = 100;
      trend = 'up';
    } else if (previousMonthCount === null) {
      // No previous data - can't calculate change
      trend = 'neutral';
    }

    return NextResponse.json({
      currentCount,
      previousMonthCount,
      percentageChange: percentageChange !== null ? Math.round(percentageChange * 100) / 100 : null, // Round to 2 decimal places
      trend
    }, { status: 200 });

  } catch (e) {
    console.error('Unexpected API error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

