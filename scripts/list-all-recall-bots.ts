// scripts/list-all-recall-bots.ts
// Run with: deno run --allow-net --allow-env scripts/list-all-recall-bots.ts

const RECALLAI_API_KEY = '636b9c93ed6c14905dbbdd31f8ae5d3cebb718ae'
const BASE_URL = 'https://us-west-2.recall.ai/api/v1'

interface Bot {
  id: string
  status?: string
  join_at?: string
  meeting_url?: string
  created_at?: string
  [key: string]: any
}

async function listAllBots() {
  try {
    console.log('🔍 Fetching bots from Recall.ai...\n')
    
    // Try the list endpoint - may need to check Recall.ai docs for exact endpoint
    const response = await fetch(`${BASE_URL}/bot/`, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${RECALLAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Failed to fetch bots:', response.status, response.statusText)
      console.error('Response:', errorText)
      console.log('\n💡 Note: The endpoint might be different. Check Recall.ai API docs.')
      console.log('   Or try: GET https://us-west-2.recall.ai/api/v1/bot')
      Deno.exit(1)
    }

    const data = await response.json()
    
    // Handle different response formats
    const bots: Bot[] = Array.isArray(data) 
      ? data 
      : (data.results || data.data || data.bots || [])
    
    console.log(`📊 Found ${bots.length} total bots\n`)
    
    if (bots.length === 0) {
      console.log('✅ No bots found. Either none exist or the endpoint format is different.')
      return
    }
    
    const now = new Date()
    const scheduled: Bot[] = []
    const active: Bot[] = []
    const completed: Bot[] = []
    const failed: Bot[] = []
    const unknown: Bot[] = []
    
    bots.forEach((bot: Bot) => {
      const joinAt = bot.join_at ? new Date(bot.join_at) : null
      const status = (bot.status || 'unknown').toLowerCase()
      
      if (joinAt && joinAt > now) {
        scheduled.push(bot)
      } else if (status.includes('joined') || status.includes('recording') || status.includes('active')) {
        active.push(bot)
      } else if (status.includes('done') || status.includes('completed') || status.includes('finished')) {
        completed.push(bot)
      } else if (status.includes('error') || status.includes('failed') || status.includes('canceled')) {
        failed.push(bot)
      } else {
        unknown.push(bot)
      }
    })
    
    console.log('🔮 SCHEDULED BOTS (Future meetings):')
    console.log('═'.repeat(60))
    if (scheduled.length === 0) {
      console.log('   ✅ No scheduled bots found')
    } else {
      scheduled.forEach((bot, idx) => {
        console.log(`\n${idx + 1}. Bot ID: ${bot.id}`)
        console.log(`   Status: ${bot.status || 'N/A'}`)
        console.log(`   Join At: ${bot.join_at || 'N/A'}`)
        console.log(`   Meeting: ${bot.meeting_url || 'N/A'}`)
        console.log(`   Created: ${bot.created_at || 'N/A'}`)
      })
      console.log(`\n💡 To delete these bots, run:`)
      console.log(`   deno run --allow-net --allow-env scripts/delete-recall-bots.ts ${scheduled.map(b => b.id).join(' ')}`)
    }
    
    console.log(`\n📈 Summary:`)
    console.log(`   Scheduled: ${scheduled.length}`)
    console.log(`   Active: ${active.length}`)
    console.log(`   Completed: ${completed.length}`)
    console.log(`   Failed: ${failed.length}`)
    console.log(`   Unknown: ${unknown.length}`)
    
    // Show sample of other bots for debugging
    if (active.length > 0 || unknown.length > 0) {
      console.log(`\n📋 Sample of other bots (first 3):`)
      const sample = [...active, ...unknown].slice(0, 3)
      sample.forEach(bot => {
        console.log(`   - ${bot.id}: ${bot.status || 'no status'} (join: ${bot.join_at || 'N/A'})`)
      })
    }
    
    // Show full bot list for debugging
    console.log(`\n📋 Full bot list (for debugging):`)
    console.log(JSON.stringify(bots, null, 2))
    
  } catch (error) {
    console.error('❌ Error:', error)
    Deno.exit(1)
  }
}

listAllBots()

