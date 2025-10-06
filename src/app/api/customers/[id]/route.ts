import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: customerId } = await context.params;
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Call the single PostgreSQL function to get all data at once.
    console.log('[customers/[id]] Calling RPC get_customer_profile_details with:', { customerId, userId: user.id });
    const { data: customerProfile, error } = await supabase
      .rpc('get_customer_profile_details', {
        customer_id: customerId,
        requesting_user_id: user.id,
      })
      .single();

    if (error || !customerProfile) {
      console.error("Error fetching customer profile:", error);
      const status = error ? 400 : 404;
      return NextResponse.json({ error: error?.message ?? 'Customer not found' }, { status });
    }

    return NextResponse.json(customerProfile, { status: 200 });

  } catch (e) {
    console.error('Unexpected API error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
