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

// Type for raw task data from Supabase query with nested relationships
type TaskWithNested = {
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
  thread_company_link: { company_id: string } | { company_id: string }[] | null;
  threads: ThreadNested | ThreadNested[] | null;
  customers: CustomerNested | CustomerNested[] | null;
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
    let query = supabase
      .from('next_steps')
      .select(`
        step_id,
        description,
        priority,
        status,
        due_date,
        owner,
        created_at,
        thread_id,
        meeting_id,
        requested_by_contact_id,
        thread_company_link!left (
          company_id
        ),
        threads (
          thread_company_link (
            company_id,
            companies (
              company_id,
              company_name
            )
          )
        ),
        customers (
          company_id,
          companies (
            company_id,
            company_name
          )
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

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tasks/route.ts:86',message:'About to execute next_steps query with threads join',data:{userId:user.id,sortParam},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    const { data: tasks, error } = await query;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tasks/route.ts:91',message:'Next_steps query result',data:{error:error?.message,errorCode:error?.code,errorDetails:error?.details,hasData:!!tasks,dataLength:tasks?.length,firstTaskStructure:tasks?.[0] ? Object.keys(tasks[0]) : null},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    if (error) {
      console.error('Error fetching tasks:', error);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tasks/route.ts:96',message:'Next_steps query error',data:{errorMessage:error.message,errorCode:error.code,errorDetails:error.details,errorHint:error.hint},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    // Transform the nested data structure to flat structure
    const tasksArray = (tasks || []) as TaskWithNested[];
    
    // Map tasks and extract company_id from thread_company_link join
    const formattedTasks: TaskResponse[] = tasksArray.map((task: TaskWithNested) => {
      // Safely extract company_id from direct thread_company_link join
      let companyId: string | null = null;
      let companyName: string | null = null;
      
      // Priority 1: Extract from direct thread_company_link join
      if (task.thread_company_link) {
        const link = Array.isArray(task.thread_company_link) 
          ? task.thread_company_link[0] 
          : task.thread_company_link;
        
        if (link?.company_id) {
          companyId = link.company_id;
        }
      }
      
      // Priority 2: Extract from threads relationship (for company_name)
      if (!companyId || !companyName) {
        const threads = Array.isArray(task.threads) ? task.threads : (task.threads ? [task.threads] : []);
        
        if (threads.length > 0 && threads[0].thread_company_link) {
          const threadCompanyLinks = Array.isArray(threads[0].thread_company_link) 
            ? threads[0].thread_company_link 
            : [threads[0].thread_company_link];
          
          if (threadCompanyLinks.length > 0) {
            // Get company_id if not already set
            if (!companyId) {
              companyId = threadCompanyLinks[0].company_id || null;
            }
            
            // Get company_name
            if (threadCompanyLinks[0].companies) {
              const companies = Array.isArray(threadCompanyLinks[0].companies)
                ? threadCompanyLinks[0].companies
                : [threadCompanyLinks[0].companies];
              
              if (companies.length > 0) {
                companyName = companies[0]?.company_name || null;
              }
            }
          }
        }
      }
      
      // Priority 3: FALLBACK - Try from customer via requested_by_contact_id
      if (!companyId && task.customers) {
        const customers = Array.isArray(task.customers) ? task.customers : (task.customers ? [task.customers] : []);
        
        if (customers.length > 0 && customers[0].company_id) {
          companyId = customers[0].company_id;
          
          if (customers[0].companies) {
            const companies = Array.isArray(customers[0].companies) 
              ? customers[0].companies 
              : [customers[0].companies];
            
            if (companies.length > 0) {
              companyName = companies[0]?.company_name || null;
            }
          }
        }
      }
      
      return {
        step_id: task.step_id,
        description: task.description,
        owner: task.owner,
        due_date: task.due_date,
        priority: task.priority,
        status: task.status || 'pending',
        company_id: companyId,
        company_name: companyName,
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

