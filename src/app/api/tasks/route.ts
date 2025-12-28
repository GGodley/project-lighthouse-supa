import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';


// Type for nested company data from Supabase join
type CompanyNested = {
  company_id: string;
  company_name: string | null;
};

type ThreadCompanyLinkNested = {
  company_id: string;
  companies: CompanyNested | CompanyNested[] | null;
};

type ThreadNested = {
  thread_company_link: ThreadCompanyLinkNested | ThreadCompanyLinkNested[] | null;
};

type CustomerNested = {
  company_id: string;
  companies: CompanyNested | CompanyNested[] | null;
};

// Type for transformed task data
type TaskResponse = {
  step_id: string;
  description: string;
  owner: string | null;
  due_date: string | null;
  priority: 'high' | 'medium' | 'low';
  status: string;
  company_id: string | null;
  company_name: string | null;
  thread_id: string | null;
  meeting_id: string | null;
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
    // Use threads relationship to get company information via thread_company_link
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tasks/route.ts:55',message:'Fetching next_steps with threads relationship',data:{userId:user.id,sortParam},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    
    // Step 1: Fetch the tasks first (No complex joins that might break)
    const { data: tasks, error: tasksError } = await supabase
      .from('next_steps')
      .select('*')
      .eq('user_id', user.id)
      .neq('status', 'done')
      .order('created_at', { ascending: false });
    
    if (tasksError) {
      console.error('Error fetching tasks:', tasksError);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tasks/route.ts:96',message:'Next_steps query error',data:{errorMessage:tasksError.message,errorCode:tasksError.code,errorDetails:tasksError.details,errorHint:tasksError.hint},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
    
    // Step 2: Fetch the Company Links
    type NextStepRow = {
      step_id: string;
      description: string;
      owner: string | null;
      due_date: string | null;
      priority: 'high' | 'medium' | 'low';
      status: string;
      created_at: string;
      thread_id: string | null;
      meeting_id: string | null;
      requested_by_contact_id: string | null;
      user_id: string;
      [key: string]: unknown;
    };
    
    const threadIds = (tasks || []).map((t: NextStepRow) => t.thread_id).filter((id: string | null): id is string => !!id);
    const linksMap: Record<string, string> = {};
    
    if (threadIds.length > 0) {
      const { data: links } = await supabase
        .from('thread_company_link')
        .select('thread_id, company_id')
        .in('thread_id', threadIds);
      
      // Create a lookup: { [thread_id]: company_id }
      links?.forEach(link => {
        if (link.thread_id && link.company_id) {
          linksMap[link.thread_id] = link.company_id;
        }
      });
    }
    
    // Step 3: Merge the data - Map tasks and add company_id from linksMap
    const formattedTasks: TaskResponse[] = (tasks || []).map((task: NextStepRow) => {
      // Get company_id from the linksMap lookup
      const companyId = task.thread_id ? linksMap[task.thread_id] || null : null;
      
      return {
        step_id: task.step_id,
        description: task.description,
        owner: task.owner,
        due_date: task.due_date,
        priority: task.priority,
        status: task.status || 'pending',
        company_id: companyId,
        company_name: null, // We can fetch company_name separately if needed
        thread_id: task.thread_id || null,
        meeting_id: task.meeting_id || null,
        created_at: task.created_at,
      };
    });
    
    // Use formatted tasks (company_id already extracted from left join)
    const tasksWithCompanies: TaskResponse[] = formattedTasks;

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

