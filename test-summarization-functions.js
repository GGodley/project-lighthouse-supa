// Test script for summarization functions
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://fdaqphksmlmupyrsatcz.supabase.co'
const supabaseKey = process.env.SUPABASE_ANON_KEY

if (!supabaseKey) {
  console.error('Please set SUPABASE_ANON_KEY environment variable')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testSummarizationFunctions() {
  console.log('🧪 Testing Summarization Functions...\n')

  try {
    // Test 1: Check if summarization_jobs table exists
    console.log('1. Checking summarization_jobs table...')
    const { data: jobs, error: jobsError } = await supabase
      .from('summarization_jobs')
      .select('*')
      .limit(1)

    if (jobsError) {
      console.error('❌ Error accessing summarization_jobs table:', jobsError.message)
      return
    }
    console.log('✅ summarization_jobs table accessible')

    // Test 2: Check if emails table has summary column
    console.log('\n2. Checking emails table summary column...')
    const { data: emails, error: emailsError } = await supabase
      .from('emails')
      .select('id, summary')
      .limit(1)

    if (emailsError) {
      console.error('❌ Error accessing emails table:', emailsError.message)
      return
    }
    console.log('✅ emails table with summary column accessible')

    // Test 3: Test add-to-summarization-queue function
    console.log('\n3. Testing add-to-summarization-queue function...')
    const { data: functionResult, error: functionError } = await supabase.functions.invoke('add-to-summarization-queue', {
      body: { emailIds: ['test-email-id-1', 'test-email-id-2'] }
    })

    if (functionError) {
      console.error('❌ Error calling add-to-summarization-queue:', functionError.message)
    } else {
      console.log('✅ add-to-summarization-queue function called successfully')
      console.log('Response:', functionResult)
    }

    // Test 4: Test process-summarization-queue function
    console.log('\n4. Testing process-summarization-queue function...')
    const { data: processResult, error: processError } = await supabase.functions.invoke('process-summarization-queue', {
      body: {}
    })

    if (processError) {
      console.error('❌ Error calling process-summarization-queue:', processError.message)
    } else {
      console.log('✅ process-summarization-queue function called successfully')
      console.log('Response:', processResult)
    }

    console.log('\n🎉 All tests completed!')

  } catch (error) {
    console.error('❌ Unexpected error:', error.message)
  }
}

testSummarizationFunctions()
