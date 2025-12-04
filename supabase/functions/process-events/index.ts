import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getMeetingUrl, type GoogleCalendarEvent, type MeetingStatus, type ErrorDetails } from '../_shared/meeting-utils.ts'
import { deleteBotWithRetry, isValidBotId } from '../_shared/bot-utils.ts'
import { validateMeetingEvent, hasValidTimezone } from '../_shared/validation-utils.ts'
import { logStateTransition, logError, logBotOperation, logMeetingEvent, generateCorrelationId, createTimingContext } from '../_shared/logging-utils.ts'

type Attendee = {
  email: string
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted'
}

type TempMeetingRow = {
  id: number
  user_id: string
  processed: boolean
  google_event_data: GoogleCalendarEvent
}

type MeetingPayload = {
  user_id: string
  google_event_id: string
  title: string
  start_time: string
  end_time: string
  hangout_link: string | null
  meeting_url: string | null
  meeting_type: string | null
  attendees: string[]
  meeting_customer: string | null
  customer_id: string | null
  company_id: string | null
  status: MeetingStatus
  dispatch_status: string
  error_details?: ErrorDetails | null
  last_error_at?: string | null
  retry_count?: number
  last_reschedule_attempt?: string | null
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🚀 PROCESS-EVENTS: Starting batch processing of new meetings')

    // Admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Step 1: Select all temp meetings with external participants that don't exist in main meetings table
    const { data: tempMeetings, error: tempErr } = await supabase
      .from('temp_meetings')
      .select('*')
      .eq('processed', false)

    if (tempErr) {
      console.error('❌ Failed to fetch temp meetings:', tempErr)
      return new Response(JSON.stringify({ error: 'Failed to fetch temp meetings' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (!tempMeetings || tempMeetings.length === 0) {
      console.log('ℹ️ No unprocessed temp meetings found')
      return new Response(JSON.stringify({ message: 'No meetings to process' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    console.log(`📥 Found ${tempMeetings.length} unprocessed temp meetings`)

    // State Recovery: Check for stuck meetings and recover them
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    
    // Recover meetings stuck in 'scheduling_in_progress' for > 10 minutes
    const { data: stuckScheduling, error: stuckSchedulingErr } = await supabase
      .from('meetings')
      .select('id, google_event_id, status, updated_at')
      .eq('status', 'scheduling_in_progress')
      .lt('updated_at', tenMinutesAgo)
    
    if (!stuckSchedulingErr && stuckScheduling && stuckScheduling.length > 0) {
      logMeetingEvent('warn', 'recovering_stuck_scheduling', {
        count: stuckScheduling.length,
        operation: 'state_recovery'
      })
      
      for (const meeting of stuckScheduling) {
        // Reset to 'new' to allow retry
        await supabase
          .from('meetings')
          .update({
            status: 'new',
            error_details: {
              type: 'StateRecovery',
              message: 'Recovered from stuck scheduling_in_progress state',
              context: { previousStatus: 'scheduling_in_progress', stuckSince: meeting.updated_at },
              timestamp: new Date().toISOString(),
              operation: 'state_recovery'
            } as ErrorDetails,
            last_error_at: new Date().toISOString()
          })
          .eq('id', meeting.id)
        
        logStateTransition(
          meeting.id.toString(),
          'scheduling_in_progress',
          'new',
          { googleEventId: meeting.google_event_id, operation: 'state_recovery' }
        )
      }
    }
    
    // Recover meetings stuck in 'rescheduling' for > 5 minutes
    const { data: stuckRescheduling, error: stuckReschedulingErr } = await supabase
      .from('meetings')
      .select('id, google_event_id, status, updated_at, recall_bot_id')
      .eq('status', 'rescheduling')
      .lt('updated_at', fiveMinutesAgo)
    
    if (!stuckReschedulingErr && stuckRescheduling && stuckRescheduling.length > 0) {
      logMeetingEvent('warn', 'recovering_stuck_rescheduling', {
        count: stuckRescheduling.length,
        operation: 'state_recovery'
      })
      
      for (const meeting of stuckRescheduling) {
        // Determine appropriate status based on meeting time
        const { data: meetingData } = await supabase
          .from('meetings')
          .select('end_time, meeting_url')
          .eq('id', meeting.id)
          .single()
        
        let newStatus: MeetingStatus = 'new'
        if (meetingData) {
          const isPast = new Date(meetingData.end_time).getTime() < Date.now()
          if (!meetingData.meeting_url) {
            newStatus = 'missing_url'
          } else if (isPast) {
            newStatus = 'passed_event'
          }
        }
        
        await supabase
          .from('meetings')
          .update({
            status: newStatus,
            recall_bot_id: null, // Clear bot ID since reschedule failed
            dispatch_status: 'pending',
            error_details: {
              type: 'StateRecovery',
              message: 'Recovered from stuck rescheduling state',
              context: { previousStatus: 'rescheduling', stuckSince: meeting.updated_at, oldBotId: meeting.recall_bot_id },
              timestamp: new Date().toISOString(),
              operation: 'state_recovery',
              oldBotId: meeting.recall_bot_id || undefined
            } as ErrorDetails,
            last_error_at: new Date().toISOString()
          })
          .eq('id', meeting.id)
        
        logStateTransition(
          meeting.id.toString(),
          'rescheduling',
          newStatus,
          { googleEventId: meeting.google_event_id, operation: 'state_recovery' }
        )
      }
    }

    // Process each temp meeting
    for (const tempRow of tempMeetings) {
      const tempMeeting: TempMeetingRow = tempRow as TempMeetingRow
      const userId: string = tempMeeting.user_id
      const event: GoogleCalendarEvent = tempMeeting.google_event_data
      
      console.log(`🔄 Processing temp_meeting_id: ${tempMeeting.id} for user: ${userId}`)

      // Get user email via admin API
      const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(userId)
      if (userErr || !userData?.user?.email) {
        console.error('❌ Could not load user record:', userErr)
        continue
      }
      const userEmail = userData.user.email
      const userDomain = userEmail.split('@')[1]

      // Compute new times and URL from current event (needed for both new and existing meetings)
      const startIso = event.start?.dateTime || event.start?.date || new Date().toISOString()
      const endIso = event.end?.dateTime || event.end?.date || startIso
      const { url: meetingUrl, type: meetingType } = getMeetingUrl(event)
      const hangoutLink = meetingType === 'google_meet' ? meetingUrl : null

      // Validate event before processing
      const validation = validateMeetingEvent(event)
      if (!validation.valid) {
        logError(undefined, new Error(`Event validation failed: ${validation.errors.join(', ')}`), {
          googleEventId: event.id,
          userId,
          operation: 'validate_event'
        }, 'high')
        await supabase
          .from('temp_meetings')
          .update({ processed: true })
          .eq('id', tempMeeting.id)
        continue
      }

      // Check timezone validity
      if (!hasValidTimezone(event)) {
        logMeetingEvent('warn', 'event_missing_timezone', {
          googleEventId: event.id,
          userId,
          startTime: startIso,
          endTime: endIso
        })
      }

      const correlationId = generateCorrelationId()
      const timing = createTimingContext()

      // Check if meeting already exists in main table
      const { data: existingMeeting, error: existingErr } = await supabase
        .from('meetings')
        .select('id, start_time, end_time, status, recall_bot_id, meeting_url, hangout_link, meeting_type, customer_id, company_id, title, last_reschedule_attempt, updated_at')
        .eq('google_event_id', event.id)
        .eq('user_id', userId)
        .maybeSingle()

      if (existingErr) {
        logError(undefined, existingErr, {
          googleEventId: event.id,
          userId,
          operation: 'check_existing_meeting',
          correlationId
        }, 'high')
        continue
      }

      if (existingMeeting) {
        logMeetingEvent('info', 'existing_meeting_found', {
          meetingId: existingMeeting.id.toString(),
          googleEventId: event.id,
          userId,
          correlationId
        })
        
        // Check if meeting time has changed
        const oldStartTime = existingMeeting.start_time
        const oldEndTime = existingMeeting.end_time
        const timeChanged = oldStartTime !== startIso || oldEndTime !== endIso
        
        // Check if meeting URL has changed
        const urlChanged = existingMeeting.meeting_url !== meetingUrl || 
                          existingMeeting.hangout_link !== hangoutLink
        
        // Check if title changed
        const titleChanged = event.summary && event.summary !== existingMeeting.title
        
        // Debouncing: Check if meeting was recently rescheduled (within last 2 minutes)
        const lastReschedule = existingMeeting.last_reschedule_attempt
        const now = Date.now()
        const twoMinutesAgo = now - (2 * 60 * 1000)
        const recentlyRescheduled = lastReschedule && new Date(lastReschedule).getTime() > twoMinutesAgo
        
        if (recentlyRescheduled && (timeChanged || urlChanged)) {
          logMeetingEvent('warn', 'reschedule_debounced', {
            meetingId: existingMeeting.id.toString(),
            googleEventId: event.id,
            userId,
            lastRescheduleAttempt: lastReschedule,
            correlationId
          })
          await supabase
            .from('temp_meetings')
            .update({ processed: true })
            .eq('id', tempMeeting.id)
          continue
        }
        
        if (timeChanged || urlChanged || titleChanged) {
          logMeetingEvent('info', 'meeting_update_detected', {
            meetingId: existingMeeting.id.toString(),
            googleEventId: event.id,
            userId,
            timeChanged,
            urlChanged,
            titleChanged,
            oldStartTime,
            newStartTime: startIso,
            correlationId
          })
          
          // Store old state for potential rollback
          const oldBotId = existingMeeting.recall_bot_id
          const oldStatus = existingMeeting.status
          const oldState = {
            recall_bot_id: oldBotId,
            status: oldStatus,
            start_time: oldStartTime,
            end_time: oldEndTime,
            meeting_url: existingMeeting.meeting_url,
            hangout_link: existingMeeting.hangout_link
          }
          
          // Set status to rescheduling while we work
          await supabase
            .from('meetings')
            .update({ 
              status: 'rescheduling',
              last_reschedule_attempt: new Date().toISOString()
            })
            .eq('id', existingMeeting.id)
          
          // If meeting has an existing bot, delete it from Recall.ai
          let botDeleted = false
          if (oldBotId && isValidBotId(oldBotId)) {
            const recallApiKey = Deno.env.get('RECALLAI_API_KEY')
            
            if (recallApiKey) {
              const deleteResult = await deleteBotWithRetry(oldBotId, recallApiKey, 3)
              botDeleted = deleteResult.deleted
              
              logBotOperation(
                'delete',
                oldBotId,
                existingMeeting.id.toString(),
                deleteResult.success ? 'success' : 'failure',
                { googleEventId: event.id, userId, correlationId },
                deleteResult.error
              )
              
              if (!deleteResult.success && deleteResult.statusCode !== 404) {
                logError(existingMeeting.id.toString(), new Error(deleteResult.error || 'Bot deletion failed'), {
                  googleEventId: event.id,
                  userId,
                  botId: oldBotId,
                  operation: 'delete_bot',
                  correlationId
                }, 'high')
              }
            } else {
              logError(existingMeeting.id.toString(), new Error('RECALLAI_API_KEY not found'), {
                googleEventId: event.id,
                userId,
                operation: 'delete_bot',
                correlationId
              }, 'high')
            }
          }
          
          // Determine new status based on updated end time and URL availability
          const isPastEvent = new Date(endIso).getTime() < Date.now()
          let statusToSet: MeetingStatus
          if (!meetingUrl) {
            statusToSet = 'missing_url'
          } else if (isPastEvent) {
            statusToSet = 'passed_event'
          } else {
            statusToSet = 'new'
          }
          
          // Preserve or re-resolve customer_id and company_id
          // First, try to preserve existing values
          let customerId = existingMeeting.customer_id
          let companyId = existingMeeting.company_id
          
          // If missing, try to re-resolve from event attendees
          if (!customerId || !companyId) {
            const attendees: Attendee[] = event.attendees || []
            const externalAttendees: Attendee[] = attendees.filter((a) => {
              if (!a.email) return false
              const domain = a.email.split('@')[1]
              return Boolean(domain) && domain !== userDomain
            })
            const externalEmails: string[] = externalAttendees.map(a => a.email)
            
            if (externalEmails.length > 0) {
              // Get user's companies first
              const { data: userCompanies, error: companiesErr } = await supabase
                .from('companies')
                .select('company_id')
                .eq('user_id', userId)
              
              if (!companiesErr && userCompanies && userCompanies.length > 0) {
                const companyIds = userCompanies.map(c => c.company_id)
                
                // Find customer in user's companies
                const { data: customer, error: findErr } = await supabase
                  .from('customers')
                  .select('customer_id, company_id')
                  .in('email', externalEmails)
                  .in('company_id', companyIds)
                  .limit(1)
                  .maybeSingle()
                
                if (!findErr && customer) {
                  customerId = customer.customer_id
                  companyId = customer.company_id
                  logMeetingEvent('info', 'resolved_customer_on_reschedule', {
                    meetingId: existingMeeting.id.toString(),
                    googleEventId: event.id,
                    userId,
                    customerId,
                    companyId,
                    correlationId
                  })
                }
              }
            }
          }
          
          // Update the meeting with new times, URL, title, and status
          const updatePayload: Partial<MeetingPayload> = {
            start_time: startIso,
            end_time: endIso,
            meeting_url: meetingUrl,
            hangout_link: hangoutLink,
            meeting_type: meetingType,
            status: statusToSet,
            recall_bot_id: null, // Clear old bot ID - will be set when new bot is created
            dispatch_status: 'pending', // Reset to allow new bot dispatch
            last_reschedule_attempt: new Date().toISOString(),
            error_details: null, // Clear any previous errors
            last_error_at: null,
            customer_id: customerId, // Preserve or use re-resolved customer_id
            company_id: companyId // Preserve or use re-resolved company_id
          }
          
          if (titleChanged) {
            updatePayload.title = event.summary || 'Untitled Meeting'
          }
          
          const { error: updateErr } = await supabase
            .from('meetings')
            .update(updatePayload)
            .eq('id', existingMeeting.id)
          
          if (updateErr) {
            // Rollback: Attempt to restore old state
            logError(existingMeeting.id.toString(), updateErr, {
              googleEventId: event.id,
              userId,
              operation: 'update_meeting_after_reschedule',
              oldState,
              correlationId
            }, 'critical')
            
            // Try to restore old bot ID (even if bot was deleted, at least preserve the reference)
            const rollbackPayload: Partial<MeetingPayload> = {
              status: oldStatus as MeetingStatus,
              recall_bot_id: oldBotId,
              error_details: {
                type: 'UpdateFailedAfterBotDeletion',
                message: 'Meeting update failed after bot deletion',
                context: {
                  oldState,
                  updateError: updateErr.message
                },
                timestamp: new Date().toISOString(),
                operation: 'reschedule_rollback',
                oldBotId: oldBotId || undefined
              } as ErrorDetails,
              last_error_at: new Date().toISOString()
            }
            
            await supabase
              .from('meetings')
              .update(rollbackPayload)
              .eq('id', existingMeeting.id)
            
            // Mark as processed to avoid infinite loop
            await supabase
              .from('temp_meetings')
              .update({ processed: true })
              .eq('id', tempMeeting.id)
            continue
          }
          
          logStateTransition(
            existingMeeting.id.toString(),
            'rescheduling',
            statusToSet,
            { googleEventId: event.id, userId, correlationId }
          )
          
          // If meeting is now in the future and has a meeting URL, dispatch a new bot
          if (statusToSet === 'new' && meetingUrl) {
            logMeetingEvent('info', 'dispatching_bot_for_reschedule', {
              meetingId: existingMeeting.id.toString(),
              googleEventId: event.id,
              userId,
              correlationId
            })
            
            try {
              await supabase.functions.invoke('dispatch-recall-bot', {
                body: {
                  meeting_id: event.id,
                  user_id: userId,
                  customer_id: customerId // Use re-resolved customer_id if available
                }
              })
              logMeetingEvent('info', 'bot_dispatched_for_reschedule', {
                meetingId: existingMeeting.id.toString(),
                googleEventId: event.id,
                userId,
                correlationId
              })
            } catch (botErr) {
              logError(existingMeeting.id.toString(), botErr, {
                googleEventId: event.id,
                userId,
                operation: 'dispatch_bot_reschedule',
                correlationId
              }, 'high')
              
              // Update meeting with error details
              await supabase
                .from('meetings')
                .update({
                  status: 'error',
                  error_details: {
                    type: 'BotDispatchFailed',
                    message: botErr instanceof Error ? botErr.message : String(botErr),
                    context: { operation: 'reschedule_bot_dispatch' },
                    timestamp: new Date().toISOString(),
                    operation: 'dispatch_bot_reschedule'
                  } as ErrorDetails,
                  last_error_at: new Date().toISOString()
                })
                .eq('id', existingMeeting.id)
            }
          } else if (statusToSet === 'missing_url') {
            logMeetingEvent('warn', 'reschedule_missing_url', {
              meetingId: existingMeeting.id.toString(),
              googleEventId: event.id,
              userId,
              correlationId
            })
          }
        } else {
          logMeetingEvent('info', 'no_changes_detected', {
            meetingId: existingMeeting.id.toString(),
            googleEventId: event.id,
            userId,
            correlationId
          })
        }
        
        // Mark temp meeting as processed
        await supabase
          .from('temp_meetings')
          .update({ processed: true })
          .eq('id', tempMeeting.id)
        continue
      }

      // Check for external attendees
      const attendees: Attendee[] = event.attendees || []
      let isExternal = false
      for (const a of attendees) {
        if (!a.email) continue
        const aDomain = a.email.split('@')[1]
        if (aDomain && aDomain !== userDomain) {
          isExternal = true
          break
        }
      }

      if (!isExternal) {
        console.log('ℹ️ No external attendees, marking as processed')
        await supabase
          .from('temp_meetings')
          .update({ processed: true })
          .eq('id', tempMeeting.id)
        continue
      }

      // Note: startIso, endIso, meetingUrl, hangoutLink, and meetingType are already computed above
      // (before the existing meeting check) and are available here for new meetings

      // Identify all external attendees
      const externalAttendees: Attendee[] = attendees.filter((a) => {
        if (!a.email) return false
        const domain = a.email.split('@')[1]
        return Boolean(domain) && domain !== userDomain
      })

      const externalEmails: string[] = externalAttendees.map(a => a.email)
      const externalDomains: (string | undefined)[] = externalAttendees.map(a => a.email?.split('@')[1])
      const primaryCustomer: string | null = (externalDomains.find(Boolean) as string | undefined) ?? null

      console.log(`🔍 Searching for existing customer using emails: ${externalEmails.join(', ')}`);

      let customerId = null;
      let companyId = null;

      // Find the first customer that matches any of the external attendees
      // CRITICAL: Filter by user_id to prevent cross-user data leakage
      // Get user's companies first, then find customers in those companies
      const { data: userCompanies, error: companiesErr } = await supabase
        .from('companies')
        .select('company_id')
        .eq('user_id', userId);

      if (companiesErr) {
        console.error('❌ Failed to fetch user companies:', companiesErr);
      } else if (userCompanies && userCompanies.length > 0) {
        const companyIds = userCompanies.map(c => c.company_id);
        
        // Find customer in user's companies only
        const { data: customer, error: findErr } = await supabase
          .from('customers')
          .select('customer_id, company_id')
          .in('email', externalEmails)
          .in('company_id', companyIds)  // CRITICAL: Only search in user's companies
          .limit(1)
          .maybeSingle();

        if (findErr) {
          console.error('❌ Customer lookup failed:', findErr);
        } else if (customer) {
          // We found a match!
          customerId = customer.customer_id;
          companyId = customer.company_id;
          console.log(`✅ Found matching customer: ${customerId} (Company: ${companyId})`);
        } else {
          // No match was found.
          console.warn(`ℹ️ No known customer found for this meeting. The meeting will be saved without a customer link.`);
        }
      } else {
        console.warn(`ℹ️ User has no companies. The meeting will be saved without a customer link.`);
      }

      // Determine status based on time and URL availability
      const isPastEvent = new Date(endIso).getTime() < Date.now()
      let statusToSet: MeetingStatus
      if (!meetingUrl) {
        statusToSet = 'missing_url'
      } else if (isPastEvent) {
        statusToSet = 'passed_event'
      } else {
        statusToSet = 'new'
      }

      // Diagnostic logging for missing URLs (meetingUrl already computed above)
      if (!meetingUrl) {
        const diagnosticInfo = {
          eventTitle: event.summary || 'Untitled',
          hangoutLink: event.hangoutLink || null,
          location: event.location || null,
          description: event.description ? event.description.substring(0, 200) + '...' : null,
          conferenceData: event.conferenceData ? JSON.stringify(event.conferenceData).substring(0, 200) + '...' : null
        }
        
        logMeetingEvent('warn', 'missing_meeting_url', {
          googleEventId: event.id,
          userId,
          correlationId,
          ...diagnosticInfo
        })
      }

      logMeetingEvent('info', 'meeting_url_detected', {
        googleEventId: event.id,
        userId,
        meetingUrl: meetingUrl || 'NONE',
        meetingType: meetingType || 'NONE',
        status: statusToSet,
        correlationId
      })

      // Step a: Create the Meeting Record with dispatch_status 'pending'
      // CRITICAL: Validate that customer_id belongs to user's company before linking
      if (customerId && companyId) {
        // Double-check: verify the company belongs to this user
        const { data: companyCheck, error: companyCheckErr } = await supabase
          .from('companies')
          .select('company_id')
          .eq('company_id', companyId)
          .eq('user_id', userId)
          .single();

        if (companyCheckErr || !companyCheck) {
          console.warn(`⚠️ Security check failed: Company ${companyId} does not belong to user ${userId}. Clearing customer/company link.`);
          customerId = null;
          companyId = null;
        }
      }

      // Prepare error details if missing URL
      const errorDetails: ErrorDetails | null = statusToSet === 'missing_url' ? {
        type: 'MissingMeetingUrl',
        message: 'No meeting URL found in event data',
        context: {
          hangoutLink: event.hangoutLink || null,
          location: event.location || null,
          hasDescription: !!event.description,
          hasConferenceData: !!event.conferenceData
        },
        timestamp: new Date().toISOString(),
        operation: 'create_meeting'
      } : null

      const meetingPayload: MeetingPayload = {
        user_id: userId,
        google_event_id: event.id,
        title: event.summary || 'Untitled Meeting',
        start_time: startIso,
        end_time: endIso,
        hangout_link: hangoutLink,
        meeting_url: meetingUrl,
        meeting_type: meetingType,
        attendees: externalEmails,
        meeting_customer: externalEmails.length > 0 ? externalEmails[0] : null,
        customer_id: customerId,
        company_id: companyId,
        status: statusToSet,
        dispatch_status: 'pending',
        error_details: errorDetails,
        last_error_at: errorDetails ? new Date().toISOString() : null,
        retry_count: 0
      }

      logMeetingEvent('info', 'creating_meeting_record', {
        googleEventId: event.id,
        userId,
        status: statusToSet,
        hasUrl: !!meetingUrl,
        correlationId
      })

      const { data: insertedMeeting, error: insertErr } = await supabase
        .from('meetings')
        .insert(meetingPayload)
        .select('id')
        .single()

      if (insertErr || !insertedMeeting) {
        logError(undefined, insertErr || new Error('Failed to insert meeting'), {
          googleEventId: event.id,
          userId,
          operation: 'insert_meeting',
          correlationId
        }, 'critical')
        continue
      }

      const meetingId = insertedMeeting.id.toString()
      logStateTransition(meetingId, null, statusToSet, {
        googleEventId: event.id,
        userId,
        correlationId
      })

      // Step b: Atomic Lock - try to update dispatch_status to 'processing'
      console.log('🔒 Attempting atomic lock for meeting:', event.id)
      const { count, error: lockErr } = await supabase
        .from('meetings')
        .update({ dispatch_status: 'processing' })
        .eq('google_event_id', event.id)
        .eq('user_id', userId)
        .eq('dispatch_status', 'pending')
        .select('*', { count: 'exact', head: true })

      if (lockErr) {
        console.error('❌ Failed to acquire lock:', lockErr)
        continue
      }

      // Step c: Check the Lock
      if (count === 0) {
        console.log('ℹ️ Another process is handling this meeting, skipping:', event.id)
        continue
      }

      console.log('✅ Successfully acquired lock for meeting:', event.id)

      // Step d: Dispatch the Bot (only for future meetings with URLs)
      if (statusToSet === 'new' && meetingUrl) {
        logMeetingEvent('info', 'dispatching_bot', {
          meetingId,
          googleEventId: event.id,
          userId,
          correlationId
        })
        
        try {
          await supabase.functions.invoke('dispatch-recall-bot', {
            body: {
              meeting_id: event.id,
              user_id: userId,
              customer_id: customerId
            }
          })
          logMeetingEvent('info', 'bot_dispatched', {
            meetingId,
            googleEventId: event.id,
            userId,
            correlationId
          })
        } catch (botErr) {
          logError(meetingId, botErr, {
            googleEventId: event.id,
            userId,
            operation: 'dispatch_bot',
            correlationId
          }, 'high')
          
          // Update meeting with error details
          await supabase
            .from('meetings')
            .update({
              status: 'error',
              error_details: {
                type: 'BotDispatchFailed',
                message: botErr instanceof Error ? botErr.message : String(botErr),
                context: { operation: 'initial_bot_dispatch' },
                timestamp: new Date().toISOString(),
                operation: 'dispatch_bot'
              } as ErrorDetails,
              last_error_at: new Date().toISOString(),
              retry_count: 1
            })
            .eq('id', insertedMeeting.id)
        }
      } else if (statusToSet === 'missing_url') {
        logMeetingEvent('info', 'skipping_bot_dispatch_missing_url', {
          meetingId,
          googleEventId: event.id,
          userId,
          correlationId
        })
      } else if (statusToSet === 'passed_event') {
        logMeetingEvent('info', 'skipping_bot_dispatch_past_event', {
          meetingId,
          googleEventId: event.id,
          userId,
          correlationId
        })
      }

      // Step e: Update on Success
      const { error: completeErr } = await supabase
        .from('meetings')
        .update({ dispatch_status: 'completed' })
        .eq('google_event_id', event.id)
        .eq('user_id', userId)

      if (completeErr) {
        console.error('❌ Failed to update dispatch_status to completed:', completeErr)
      } else {
        console.log('✅ Updated dispatch_status to completed for meeting:', event.id)
      }

      // Mark temp meeting as processed
      await supabase
        .from('temp_meetings')
        .update({ processed: true })
        .eq('id', tempMeeting.id)
    }

    console.log('🏁 Batch processing complete')
    return new Response(
      JSON.stringify({ message: 'Batch processing completed' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('💥 PROCESS-EVENTS UNCAUGHT ERROR:', e)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})


