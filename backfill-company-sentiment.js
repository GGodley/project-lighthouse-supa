// Backfill script to update company sentiment for all companies
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://fdaqphksmlmupyrsatcz.supabase.co'
const supabaseKey = process.env.SUPABASE_ANON_KEY

if (!supabaseKey) {
  console.error('Please set SUPABASE_ANON_KEY environment variable')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function backfillCompanySentiment() {
  console.log('🔄 Starting company sentiment backfill...\n')

  try {
    // Get all companies
    console.log('1. Fetching all companies...')
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('company_id, company_name')
      .order('created_at', { ascending: true })

    if (companiesError) {
      console.error('❌ Error fetching companies:', companiesError.message)
      return
    }

    console.log(`✅ Found ${companies.length} companies to process`)

    // Process companies in batches of 10
    const batchSize = 10
    let processed = 0
    let errors = 0

    for (let i = 0; i < companies.length; i += batchSize) {
      const batch = companies.slice(i, i + batchSize)
      console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} companies)...`)

      // Process each company in the batch
      const promises = batch.map(async (company) => {
        try {
          console.log(`  🔄 Processing ${company.company_name} (${company.company_id})...`)
          
          const { data, error } = await supabase.functions.invoke('update-company-sentiment', {
            body: { company_id: company.company_id }
          })

          if (error) {
            console.error(`    ❌ Error for ${company.company_name}:`, error.message)
            return { success: false, company: company.company_name, error: error.message }
          } else {
            console.log(`    ✅ Updated ${company.company_name}: ${data.sentiment_status} (${data.health_score})`)
            return { success: true, company: company.company_name, data }
          }
        } catch (err) {
          console.error(`    ❌ Unexpected error for ${company.company_name}:`, err.message)
          return { success: false, company: company.company_name, error: err.message }
        }
      })

      // Wait for all promises in this batch to complete
      const results = await Promise.all(promises)
      
      // Count results
      const batchSuccesses = results.filter(r => r.success).length
      const batchErrors = results.filter(r => !r.success).length
      
      processed += batchSuccesses
      errors += batchErrors
      
      console.log(`  📊 Batch complete: ${batchSuccesses} successful, ${batchErrors} errors`)

      // Add a small delay between batches to avoid rate limiting
      if (i + batchSize < companies.length) {
        console.log('  ⏳ Waiting 2 seconds before next batch...')
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    console.log(`\n🎉 Backfill complete!`)
    console.log(`✅ Successfully processed: ${processed} companies`)
    console.log(`❌ Errors: ${errors} companies`)
    console.log(`📊 Total: ${companies.length} companies`)

  } catch (error) {
    console.error('❌ Unexpected error during backfill:', error.message)
  }
}

backfillCompanySentiment()
