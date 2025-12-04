// scripts/delete-orphaned-recall-bots.js
// This script deletes Recall.ai bots that are scheduled but don't have a corresponding meeting in the database
// Run with: node scripts/delete-orphaned-recall-bots.js

const { createClient } = require('@supabase/supabase-js')

const RECALLAI_API_KEY = '636b9c93ed6c14905dbbdd31f8ae5d3cebb718ae'
const BASE_URL = 'https://us-west-2.recall.ai/api/v1'

// Get Supabase credentials from environment or use defaults
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fdaqphksmlmupyrsatcz.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variable:')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌')
  console.error('\nSet it with:')
  console.error('   export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"')
  console.error('\nYou can find it in:')
  console.error('   Supabase Dashboard → Settings → API → service_role key (secret)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function getScheduledMeetingsFromDB() {
  console.log('📊 Fetching meetings with status "recording_scheduled" from database...\n')
  
  const { data: meetings, error } = await supabase
    .from('meetings')
    .select('recall_bot_id, id, google_event_id, title, start_time')
    .eq('status', 'recording_scheduled')
    .not('recall_bot_id', 'is', null)
  
  if (error) {
    console.error('❌ Error fetching meetings:', error)
    throw error
  }
  
  console.log(`✅ Found ${meetings.length} meetings with status "recording_scheduled"`)
  
  // Create a Set of bot IDs for quick lookup
  const validBotIds = new Set()
  meetings.forEach(meeting => {
    if (meeting.recall_bot_id) {
      validBotIds.add(meeting.recall_bot_id)
    }
  })
  
  console.log(`✅ Found ${validBotIds.size} unique recall_bot_id values in database\n`)
  
  return { meetings, validBotIds }
}

async function getScheduledBotsFromRecall() {
  console.log('🔍 Fetching scheduled bots from Recall.ai...\n')
  
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
    throw new Error(`Failed to fetch bots: ${response.status}`)
  }

  const data = await response.json()
  const bots = Array.isArray(data) ? data : (data.results || data.data || data.bots || [])
  
  console.log(`✅ Found ${bots.length} total bots from Recall.ai`)
  
  // Filter for scheduled bots (join_at is in the future)
  const now = new Date()
  const scheduledBots = bots.filter(bot => {
    if (!bot.join_at) return false
    const joinAt = new Date(bot.join_at)
    return joinAt > now
  })
  
  console.log(`✅ Found ${scheduledBots.length} scheduled bots (future meetings)\n`)
  
  return scheduledBots
}

async function deleteBot(botId) {
  console.log(`   🗑️  Deleting bot ${botId}...`)
  
  try {
    const response = await fetch(`${BASE_URL}/bot/${botId}/`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Token ${RECALLAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    })

    if (response.ok || response.status === 204) {
      console.log(`   ✅ Successfully deleted bot ${botId}`)
      return true
    } else {
      const errorText = await response.text()
      console.error(`   ❌ Failed to delete bot ${botId}: ${response.status} ${response.statusText}`)
      console.error(`   Response: ${errorText}`)
      return false
    }
  } catch (error) {
    console.error(`   ❌ Error deleting bot ${botId}:`, error.message)
    return false
  }
}

async function main() {
  try {
    // Step 1: Get valid bot IDs from database
    const { meetings, validBotIds } = await getScheduledMeetingsFromDB()
    
    // Step 2: Get all scheduled bots from Recall.ai
    const scheduledBots = await getScheduledBotsFromRecall()
    
    // Step 3: Find orphaned bots (scheduled but not in database)
    const orphanedBots = scheduledBots.filter(bot => !validBotIds.has(bot.id))
    
    console.log('🔍 Analysis:')
    console.log(`   Total scheduled bots from Recall.ai: ${scheduledBots.length}`)
    console.log(`   Valid bots in database: ${validBotIds.size}`)
    console.log(`   Orphaned bots to delete: ${orphanedBots.length}\n`)
    
    if (orphanedBots.length === 0) {
      console.log('✅ No orphaned bots found! All scheduled bots have corresponding meetings in the database.')
      return
    }
    
    console.log('📋 Orphaned bots to delete:')
    orphanedBots.forEach((bot, idx) => {
      console.log(`   ${idx + 1}. Bot ID: ${bot.id}`)
      console.log(`      Join At: ${bot.join_at}`)
      console.log(`      Meeting URL: ${bot.meeting_url || 'N/A'}`)
    })
    
    console.log(`\n⚠️  About to delete ${orphanedBots.length} orphaned bot(s)...`)
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n')
    
    // Wait 5 seconds for user to cancel
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Step 4: Delete orphaned bots
    console.log('🗑️  Starting deletion...\n')
    let successCount = 0
    let failCount = 0
    
    for (const bot of orphanedBots) {
      const success = await deleteBot(bot.id)
      if (success) {
        successCount++
      } else {
        failCount++
      }
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    
    console.log(`\n📊 Deletion Results:`)
    console.log(`   ✅ Successfully deleted: ${successCount}`)
    console.log(`   ❌ Failed: ${failCount}`)
    console.log(`   📊 Total: ${orphanedBots.length}`)
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()

