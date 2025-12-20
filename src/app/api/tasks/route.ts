import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Type for company data from Supabase join
type CompanyData = {
  company_id: string;
  company_name: string | null;
};

// Type for raw task data from Supabase query
type TaskWithCompany = {
  step_id: string;
  description: string;
  owner: string | null;
  due_date: string | null;
  priority: 'high' | 'medium' | 'low';
  company_id: string;
  created_at: string;
  companies: CompanyData | CompanyData[] | null;
};

// Type for transformed task data
type TaskResponse = {
  step_id: string;
  description: string;
  owner: string | null;
  due_date: string | null;
  priority: 'high' | 'medium' | 'low';
  company_id: string;
  company_name: string | null;
  created_at: string;
};

export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get sort parameter from query string, default to 'priority'
    const { searchParams } = new URL(request.url);
    const sortParam = searchParams.get('sort') || 'priority';

    // Validate sort parameter
    const validSorts = ['priority', 'due_date', 'alphabetical'];
    if (!validSorts.includes(sortParam)) {
      return NextResponse.json({ error: 'Invalid sort parameter' }, { status: 400 });
    }

    // Build query - fetch incomplete next steps (status != 'done')
    let query = supabase
      .from('next_steps')
      .select(`
        step_id,
        description,
        owner,
        due_date,
        priority,
        company_id,
        created_at,
        companies!inner(
          company_id,
          company_name
        )
      `)
      .eq('user_id', user.id)
      .neq('status', 'done')
      .order('created_at', { ascending: false });

    // Apply sorting based on sort parameter
    if (sortParam === 'priority') {
      // Sort by priority: high -> medium -> low, then by due_date, then by created_at
      // We'll need to do this in the application layer since PostgreSQL enum ordering
      // doesn't directly support custom ordering
      query = query.order('priority', { ascending: false }); // This will be approximate
      query = query.order('due_date', { ascending: true, nullsFirst: false });
      query = query.order('created_at', { ascending: false });
    } else if (sortParam === 'due_date') {
      // Sort by due_date ascending (nulls last), then by priority, then by created_at
      query = query.order('due_date', { ascending: true, nullsFirst: false });
      query = query.order('priority', { ascending: false });
      query = query.order('created_at', { ascending: false });
    } else if (sortParam === 'alphabetical') {
      // Sort alphabetically by description, then by priority, then by due_date
      query = query.order('description', { ascending: true });
      query = query.order('priority', { ascending: false });
      query = query.order('due_date', { ascending: true, nullsFirst: false });
    }

    const { data: tasks, error } = await query;

    if (error) {
      console.error('Error fetching tasks:', error);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    // Transform the data to flatten company information and apply proper priority sorting
    const tasksWithCompanies: TaskResponse[] = (tasks || []).map((task: TaskWithCompany) => {
      // Handle companies as array (Supabase join) or single object
      const company: CompanyData | null = Array.isArray(task.companies) 
        ? task.companies[0] || null
        : task.companies;
      
      return {
        step_id: task.step_id,
        description: task.description,
        owner: task.owner,
        due_date: task.due_date,
        priority: task.priority,
        company_id: task.company_id,
        company_name: company?.company_name || null,
        created_at: task.created_at,
      };
    });

    // Apply proper priority sorting if sort is 'priority'
    // PostgreSQL enum ordering doesn't match our desired order (high -> medium -> low)
    if (sortParam === 'priority') {
      const priorityOrder = { high: 1, medium: 2, low: 3 };
      tasksWithCompanies.sort((a, b) => {
        const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 2;
        const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 2;
        
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        
        // Same priority: sort by due_date (earliest first, nulls last)
        if (a.due_date && b.due_date) {
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        }
        if (a.due_date && !b.due_date) return -1;
        if (!a.due_date && b.due_date) return 1;
        
        // Both null or same due_date: sort by created_at (newest first)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }

    // Limit to reasonable number for performance
    const limitedResults = tasksWithCompanies.slice(0, 50);

    return NextResponse.json({ 
      tasks: limitedResults ?? [],
      totalCount: tasksWithCompanies.length
    }, { status: 200 });
  } catch (e) {
    console.error('Unexpected API error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

