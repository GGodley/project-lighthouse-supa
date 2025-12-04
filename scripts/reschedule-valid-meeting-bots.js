// scripts/reschedule-valid-meeting-bots.js
// This script reschedules Recall.ai bots for valid meetings that had their bots deleted
// Run with: node scripts/reschedule-valid-meeting-bots.js

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

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
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function loadValidMeetings() {
  console.log('📋 Loading valid meetings from JSON...\n')
  
  const jsonContent = fs.readFileSync('scripts/meetings-result.json', 'utf8')
  const meetingsData = JSON.parse(jsonContent)
  
  // Handle nested structure: [{result: {meetings: [...]}}]
  let meetings
  if (Array.isArray(meetingsData)) {
    if (meetingsData.length > 0 && meetingsData[0].result && meetingsData[0].result.meetings) {
      meetings = meetingsData[0].result.meetings
    } else {
      meetings = meetingsData
    }
  } else if (meetingsData.result && meetingsData.result.meetings) {
    meetings = meetingsData.result.meetings
  } else if (meetingsData.meetings) {
    meetings = meetingsData.meetings
  } else {
    throw new Error('Could not find meetings array in JSON')
  }
  
  console.log(`✅ Found ${meetings.length} valid meetings to reschedule\n`)
  return meetings
}

async function getMeetingDetails(googleEventId) {
  const { data: meeting, error } = await supabase
    .from('meetings')
    .select('user_id, customer_id, meeting_url, hangout_link, meeting_type, start_time, title')
    .eq('google_event_id', googleEventId)
    .eq('status', 'recording_scheduled')
    .maybeSingle()
  
  if (error) {
    console.error(`   ❌ Error fetching meeting ${googleEventId}:`, error)
    return null
  }
  
  if (!meeting) {
    console.error(`   ❌ Meeting not found: ${googleEventId}`)
    return null
  }
  
  return meeting
}

async function createRecallBot(meeting, meetingUrl) {
  // Join 1 minute before the scheduled start_time
  const joinAt = new Date(new Date(meeting.start_time).getTime() - 60000).toISOString()
  
  const recallPayload = {
    meeting_url: meetingUrl,
    join_at: joinAt,
    recording_config: {
      transcript: {
        provider: { 'gladia_v2_streaming': {} },
        webhook_url: `${SUPABASE_URL}/functions/v1/process-transcript`
      }
    }
  }
  
  console.log(`   📞 Creating bot for meeting: ${meeting.title || meetingUrl}`)
  console.log(`   ⏰ Join at: ${joinAt}`)
  
  const response = await fetch(`${BASE_URL}/bot`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${RECALLAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(recallPayload),
  })
  
  if (!response.ok) {
    const errorBody = await response.text()
    console.error(`   ❌ Failed to create bot: ${response.status} ${response.statusText}`)
    console.error(`   Response: ${errorBody}`)
    return null
  }
  
  const recallData = await response.json()
  return recallData.id
}

async function updateMeetingWithBotId(googleEventId, recallBotId) {
  const { error } = await supabase
    .from('meetings')
    .update({ recall_bot_id: recallBotId })
    .eq('google_event_id', googleEventId)
  
  if (error) {
    console.error(`   ❌ Failed to update meeting with bot ID:`, error)
    return false
  }
  
  return true
}

async function rescheduleBots() {
  try {
    // Step 1: Load valid meetings
    const meetings = await loadValidMeetings()
    
    console.log('🔄 Starting to reschedule bots...\n')
    
    let successCount = 0
    let failCount = 0
    const failedMeetings = []
    
    for (let i = 0; i < meetings.length; i++) {
      const meeting = meetings[i]
      console.log(`\n[${i + 1}/${meetings.length}] Processing: ${meeting.title || meeting.google_event_id}`)
      console.log(`   Google Event ID: ${meeting.google_event_id}`)
      
      // Step 2: Get full meeting details from database
      const meetingDetails = await getMeetingDetails(meeting.google_event_id)
      if (!meetingDetails) {
        failCount++
        failedMeetings.push(meeting)
        continue
      }
      
      // Step 3: Determine meeting URL
      const meetingUrl = meetingDetails.meeting_url || meetingDetails.hangout_link
      if (!meetingUrl) {
        console.error(`   ❌ No meeting URL found for ${meeting.google_event_id}`)
        failCount++
        failedMeetings.push(meeting)
        continue
      }
      
      // Step 4: Create new Recall.ai bot
      const recallBotId = await createRecallBot(meetingDetails, meetingUrl)
      if (!recallBotId) {
        failCount++
        failedMeetings.push(meeting)
        continue
      }
      
      console.log(`   ✅ Created bot: ${recallBotId}`)
      
      // Step 5: Update meeting with new bot ID
      const updated = await updateMeetingWithBotId(meeting.google_event_id, recallBotId)
      if (!updated) {
        failCount++
        failedMeetings.push(meeting)
        continue
      }
      
      console.log(`   ✅ Updated meeting with new bot ID`)
      successCount++
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    console.log(`\n📊 Rescheduling Results:`)
    console.log(`   ✅ Successfully rescheduled: ${successCount}`)
    console.log(`   ❌ Failed: ${failCount}`)
    console.log(`   📊 Total: ${meetings.length}`)
    
    if (failedMeetings.length > 0) {
      console.log(`\n❌ Failed meetings:`)
      failedMeetings.forEach(m => {
        console.log(`   - ${m.google_event_id}: ${m.title || 'N/A'}`)
      })
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

rescheduleBots()

