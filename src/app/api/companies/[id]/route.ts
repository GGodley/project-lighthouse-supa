import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { Database } from '@/types/database';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await context.params;
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

    // Fetch company details
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .single();

    if (companyError || !company) {
      console.error("Error fetching company:", companyError);
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Fetch customers associated with this company
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('*')
      .eq('company_id', companyId)
      .eq('user_id', user.id);

    if (customersError) {
      console.error("Error fetching customers:", customersError);
    }

    // Fetch emails associated with customers of this company
    const customerIds = customers?.map(c => c.customer_id) || [];
    let emails: Database['public']['Tables']['emails']['Row'][] = [];
    
    if (customerIds.length > 0) {
      const { data: emailsData, error: emailsError } = await supabase
        .from('emails')
        .select('*')
        .in('customer_id', customerIds)
        .order('received_at', { ascending: false })
        .limit(50);

      if (emailsError) {
        console.error("Error fetching emails:", emailsError);
      } else {
        emails = emailsData || [];
      }
    }

    // Combine all data
    const companyProfile = {
      ...company,
      customers: customers || [],
      emails: emails,
      total_customers: customers?.length || 0,
      total_emails: emails.length,
      last_interaction_at: emails.length > 0 ? emails[0].received_at : company.last_interaction_at
    };

    return NextResponse.json(companyProfile, { status: 200 });

  } catch (e) {
    console.error('Unexpected API error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
