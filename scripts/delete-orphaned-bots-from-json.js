// scripts/delete-orphaned-bots-from-json.js
// This script deletes Recall.ai bots that are NOT in the provided JSON list
// Usage: node scripts/delete-orphaned-bots-from-json.js <path-to-json-file>
//   OR: node scripts/delete-orphaned-bots-from-json.js (will prompt for JSON)

const fs = require('fs')
const readline = require('readline')

const RECALLAI_API_KEY = '636b9c93ed6c14905dbbdd31f8ae5d3cebb718ae'
const BASE_URL = 'https://us-west-2.recall.ai/api/v1'

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

async function loadMeetingsFromJSON(jsonInput) {
  let meetingsData
  
  // Try to parse as JSON string first
  try {
    meetingsData = JSON.parse(jsonInput)
  } catch (e) {
    // If that fails, try to read as file path
    try {
      const fileContent = fs.readFileSync(jsonInput, 'utf8')
      meetingsData = JSON.parse(fileContent)
    } catch (fileErr) {
      throw new Error('Invalid JSON input. Provide either a JSON string or file path.')
    }
  }
  
  // Handle different JSON structures
  let meetings
  if (Array.isArray(meetingsData)) {
    // If it's an array, check if first element has result.meetings
    if (meetingsData.length > 0 && meetingsData[0].result && meetingsData[0].result.meetings) {
      meetings = meetingsData[0].result.meetings
    } else {
      meetings = meetingsData
    }
  } else if (meetingsData.result && meetingsData.result.meetings && Array.isArray(meetingsData.result.meetings)) {
    meetings = meetingsData.result.meetings
  } else if (meetingsData.meetings && Array.isArray(meetingsData.meetings)) {
    meetings = meetingsData.meetings
  } else if (meetingsData.data && Array.isArray(meetingsData.data)) {
    meetings = meetingsData.data
  } else {
    throw new Error('JSON structure not recognized. Expected array or object with "meetings" or "data" array.')
  }
  
  // Create Set of valid bot IDs
  const validBotIds = new Set()
  meetings.forEach(meeting => {
    if (meeting.recall_bot_id) {
      validBotIds.add(meeting.recall_bot_id)
    }
  })
  
  console.log(`✅ Loaded ${meetings.length} meetings from JSON`)
  console.log(`✅ Found ${validBotIds.size} unique recall_bot_id values\n`)
  
  return { meetings, validBotIds }
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

async function promptForJSON() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    console.log('📋 Please paste the JSON result from the SQL query:')
    console.log('   (Paste the JSON and press Enter, then Ctrl+D (Mac/Linux) or Ctrl+Z (Windows) to finish)\n')
    
    let input = ''
    rl.on('line', (line) => {
      input += line + '\n'
    })
    
    rl.on('close', () => {
      resolve(input.trim())
    })
  })
}

async function main() {
  try {
    let jsonInput
    
    // Check if JSON provided as command line argument
    if (process.argv[2]) {
      jsonInput = process.argv[2]
      console.log(`📁 Using JSON from: ${jsonInput}\n`)
    } else {
      // Prompt for JSON input
      jsonInput = await promptForJSON()
    }
    
    // Step 1: Load meetings from JSON
    const { meetings, validBotIds } = await loadMeetingsFromJSON(jsonInput)
    
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
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

main()

