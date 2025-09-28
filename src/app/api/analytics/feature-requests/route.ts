// Note: Install the required dependency with: npm install @supabase/ssr
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

type FeatureRequestData = {
  title: string;
  low_urgency_count: number;
  medium_urgency_count: number;
  high_urgency_count: number;
};

type PostgreSQLError = {
  message: string;
  code?: string;
  hint?: string;
  details?: string;
};

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

    // Call the PostgreSQL function with the user's ID
    console.log('Calling function get_user_feature_analytics with user ID:', user.id);
    const { data: featureRequests, error: functionError } = await supabase
      .rpc('get_user_feature_analytics', { requesting_user_id: user.id });

    console.log('Raw data received from RPC call:', JSON.stringify(featureRequests, null, 2));

    if (functionError) {
      const error = functionError as PostgreSQLError;
      console.error('PostgreSQL function error:', error.message);
      console.error('Function error details:', error);
      console.error('Function error code:', error.code);
      console.error('Function error hint:', error.hint);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    console.log('Function call successful. Data length:', featureRequests?.length);
    console.log('User ID being passed:', user.id);
    console.log('Raw function data:', JSON.stringify(featureRequests, null, 2));

    // Transform the data for the chart based on the expected format
    const labels = featureRequests?.map((item: FeatureRequestData) => item.title) || [];
    const chartData = {
      labels,
      datasets: [
        {
          label: 'High Urgency',
          data: featureRequests?.map((item: FeatureRequestData) => item.high_urgency_count || 0) || [],
          backgroundColor: 'hsl(4, 85%, 60%)', // Red
          borderRadius: 4
        },
        {
          label: 'Medium Urgency',
          data: featureRequests?.map((item: FeatureRequestData) => item.medium_urgency_count || 0) || [],
          backgroundColor: 'hsl(41, 95%, 55%)', // Amber
          borderRadius: 4
        },
        {
          label: 'Low Urgency',
          data: featureRequests?.map((item: FeatureRequestData) => item.low_urgency_count || 0) || [],
          backgroundColor: 'hsl(214, 31%, 70%)', // Muted
          borderRadius: 4
        }
      ]
    };

    // Debug: Log the final chart data
    console.log('Final chart data:', JSON.stringify(chartData, null, 2));

    return NextResponse.json({ 
      featureRequests: chartData,
      rawData: featureRequests || []
    }, { status: 200 });

  } catch (e) {
    console.error('Unexpected API error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
