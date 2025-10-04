// Test script for the summarization cron endpoint
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://fdaqphksmlmupyrsatcz.supabase.co'
const supabaseKey = process.env.SUPABASE_ANON_KEY

if (!supabaseKey) {
  console.error('Please set SUPABASE_ANON_KEY environment variable')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testSummarizationSystem() {
  console.log('🧪 Testing Summarization System...\n')

  try {
    // Test 1: Check if we can access the functions
    console.log('1. Testing process-summarization-queue function...')
    const { data: processResult, error: processError } = await supabase.functions.invoke('process-summarization-queue', {
      body: {}
    })

    if (processError) {
      console.error('❌ Error calling process-summarization-queue:', processError.message)
    } else {
      console.log('✅ process-summarization-queue function working')
      console.log('Response:', processResult)
    }

    // Test 2: Test adding emails to queue
    console.log('\n2. Testing add-to-summarization-queue function...')
    const { data: addResult, error: addError } = await supabase.functions.invoke('add-to-summarization-queue', {
      body: { emailIds: ['test-email-1', 'test-email-2'] }
    })

    if (addError) {
      console.error('❌ Error calling add-to-summarization-queue:', addError.message)
    } else {
      console.log('✅ add-to-summarization-queue function working')
      console.log('Response:', addResult)
    }

    // Test 3: Check database tables
    console.log('\n3. Checking database tables...')
    
    // Check summarization_jobs table
    const { data: jobs, error: jobsError } = await supabase
      .from('summarization_jobs')
      .select('*')
      .limit(5)

    if (jobsError) {
      console.error('❌ Error accessing summarization_jobs table:', jobsError.message)
    } else {
      console.log('✅ summarization_jobs table accessible')
      console.log(`Found ${jobs.length} jobs`)
    }

    // Check emails table with summary column
    const { data: emails, error: emailsError } = await supabase
      .from('emails')
      .select('id, subject, summary')
      .limit(5)

    if (emailsError) {
      console.error('❌ Error accessing emails table:', emailsError.message)
    } else {
      console.log('✅ emails table with summary column accessible')
      console.log(`Found ${emails.length} emails`)
    }

    console.log('\n🎉 All tests completed!')
    console.log('\n📋 Next Steps:')
    console.log('1. Set OPENAI_API_KEY in Supabase Dashboard → Settings → Edge Functions')
    console.log('2. Choose a cron scheduling method from CRON-SETUP-GUIDE.md')
    console.log('3. Monitor the queue using the SQL queries in the guide')

  } catch (error) {
    console.error('❌ Unexpected error:', error.message)
  }
}

testSummarizationSystem()
