import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Type for company data from Supabase join
type CompanyData = {
  company_id: string;
  company_name: string | null;
};

// Type for raw task data from Supabase query (without join)
type TaskRaw = {
  step_id: string;
  description: string;
  owner: string | null;
  due_date: string | null;
  priority: 'high' | 'medium' | 'low';
  company_id: string;
  created_at: string;
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
    // Fetch next_steps without join to avoid PostgREST relationship issues
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tasks/route.ts:55',message:'Fetching next_steps without join',data:{userId:user.id,sortParam},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    let query = supabase
      .from('next_steps')
      .select('step_id, description, owner, due_date, priority, company_id, created_at')
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
    const selectString = 'step_id, description, owner, due_date, priority, company_id, created_at';
    fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tasks/route.ts:86',message:'About to execute next_steps query',data:{userId:user.id,sortParam,selectString},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    const { data: tasks, error } = await query;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tasks/route.ts:91',message:'Next_steps query result',data:{error:error?.message,errorCode:error?.code,errorDetails:error?.details,hasData:!!tasks,dataLength:tasks?.length,firstTask:tasks?.[0]},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    if (error) {
      console.error('Error fetching tasks:', error);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tasks/route.ts:96',message:'Next_steps query error',data:{errorMessage:error.message,errorCode:error.code,errorDetails:error.details,errorHint:error.hint},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    // Fetch companies separately to avoid PostgREST join issues
    const companyIds = [...new Set((tasks || []).map((task: { company_id: string }) => task.company_id).filter(Boolean))];
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tasks/route.ts:104',message:'Fetching companies separately',data:{companyIdsCount:companyIds.length,companyIds:companyIds.slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    let companyMap = new Map<string, string | null>();
    if (companyIds.length > 0) {
      const { data: companies, error: companiesError } = await supabase
        .from('companies')
        .select('company_id, company_name')
        .in('company_id', companyIds)
        .eq('user_id', user.id);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tasks/route.ts:116',message:'Companies query result',data:{error:companiesError?.message,companiesCount:companies?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      if (companiesError) {
        console.error('Error fetching companies:', companiesError);
      } else if (companies) {
        companies.forEach(company => {
          companyMap.set(company.company_id, company.company_name);
        });
      }
    }

    // Transform the data to include company information
    const tasksWithCompanies: TaskResponse[] = (tasks || []).map((task: { step_id: string; description: string; owner: string | null; due_date: string | null; priority: 'high' | 'medium' | 'low'; company_id: string; created_at: string }) => {
      return {
        step_id: task.step_id,
        description: task.description,
        owner: task.owner,
        due_date: task.due_date,
        priority: task.priority,
        company_id: task.company_id,
        company_name: companyMap.get(task.company_id) || null,
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

