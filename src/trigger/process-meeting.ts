import { task } from "@trigger.dev/sdk/v3";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { GoogleCalendarEvent } from "./_shared/meeting-utils";
import { getMeetingUrl } from "./_shared/meeting-utils";
import { ensureUTCISO, calculateJoinTime, isTimeChanged } from "./_shared/timezone-utils";
import { deleteBotFromRecall, createBotInRecall } from "./_shared/bot-utils";

/**
 * Process Meeting Task - Processes individual calendar events
 * 
 * Pattern: Database is source of truth, Google Calendar fetch is optional for change detection
 * 
 * Flow (matching user requirements):
 * 1. Check if meeting exists in database (by google_event_id + user_id)
 * 2. Use database data as source of truth
 * 3. Optionally fetch from Google Calendar to check for time changes (non-blocking)
 * 4. If exists:
 *    - Verify recording is allowed (bot_enabled = true)
 *    - If recording allowed:
 *      - Check if meeting time has changed (compare database vs Google Calendar)
 *      - If time changed:
 *        - Delete old scheduled bot (if recall_bot_id exists)
 *        - Remove recall_bot_id from meeting
 *        - Create new bot with updated time
 *        - Save new recall_bot_id
 *      - If time not changed but bot doesn't exist, create bot
 *    - If recording not allowed: Update metadata only, skip bot operations
 */
export const processMeetingTask = task({
  id: "process-meeting",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    randomize: true,
  },
  run: async (payload: { userId: string; googleEventId: string; timeChanged?: boolean }) => {
    const { userId, googleEventId, timeChanged: timeChangedFromSync } = payload;

    console.log(
      `🔄 Processing meeting: ${googleEventId} for user: ${userId}`
    );

    // Initialize Supabase client with service role key
    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const recallApiKey = process.env.RECALL_API_KEY;
    const brokerSecret = process.env.BROKER_SHARED_SECRET;
    const supabaseAnonKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
      );
    }

    if (!recallApiKey) {
      throw new Error("RECALL_API_KEY environment variable is not set");
    }

    if (!brokerSecret || !supabaseAnonKey) {
      throw new Error(
        "BROKER_SHARED_SECRET or SUPABASE_ANON_KEY not configured"
      );
    }

    const supabaseAdmin = createSupabaseClient(
      supabaseUrl,
      supabaseServiceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      }
    );

    try {
      // Step 1: Check if meeting exists in database (by google_event_id + user_id)
      const { data: existingMeeting, error: meetingError } =
        await supabaseAdmin
          .from("meetings")
          .select("*")
          .eq("google_event_id", googleEventId)
          .eq("user_id", userId)
          .maybeSingle();

      if (meetingError) {
        throw new Error(
          `Failed to fetch meeting: ${meetingError.message}`
        );
      }

      // If meeting doesn't exist, we can't process it (should have been created in sync-calendar)
      if (!existingMeeting) {
        console.log(
          `⚠️  Meeting ${googleEventId} not found in database, skipping`
        );
        return {
          ok: true,
          userId,
          googleEventId,
          processed: false,
          reason: "meeting_not_in_database",
        };
      }

      // Step 2: Use database as source of truth
      const dbStartTime = existingMeeting.start_time;
      const dbEndTime = existingMeeting.end_time;
      const dbMeetingUrl = existingMeeting.meeting_url;
      const dbMeetingType = existingMeeting.meeting_type;

      console.log(
        `✅ Meeting exists in database: ${existingMeeting.id}, bot_enabled: ${existingMeeting.bot_enabled}`
      );

      // Step 3: Optionally fetch from Google Calendar to check for changes (NON-BLOCKING)
      // Skip if timeChanged was already detected in sync-calendar
      let googleStartTime: string | null = null;
      let googleEndTime: string | null = null;
      let googleMeetingUrl: string | null = null;
      let googleMeetingType: string | null = null;
      let timeChanged = timeChangedFromSync || false; // Use flag from sync-calendar if provided
      let googleEvent: GoogleCalendarEvent | null = null;

      // Only fetch from Google Calendar if time change wasn't already detected in sync-calendar
      if (!timeChangedFromSync) {
        try {
          const edgeFunctionUrl = `${supabaseUrl}/functions/v1/fetch-calendar-events`;

          // Get all calendars
          const calendarListResponse = await fetch(edgeFunctionUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              "x-broker-secret": brokerSecret,
            },
            body: JSON.stringify({ userId }),
          });

          if (calendarListResponse.ok) {
            const calendarListData: {
              calendars?: Array<{ id: string }>;
            } = await calendarListResponse.json();
            const calendars = calendarListData.calendars || [];

            // Expand time window: 30 days back to 14 days forward
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const twoWeeksFromNow = new Date();
            twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
            const timeMin = thirtyDaysAgo.toISOString();
            const timeMax = twoWeeksFromNow.toISOString();

            // Search all calendars for the event
            for (const cal of calendars) {
              const eventResponse = await fetch(edgeFunctionUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: supabaseAnonKey,
                  Authorization: `Bearer ${supabaseAnonKey}`,
                  "x-broker-secret": brokerSecret,
                },
                body: JSON.stringify({
                  userId,
                  calendarId: cal.id,
                  timeMin,
                  timeMax,
                }),
              });

              if (eventResponse.ok) {
                const eventsData: { events?: GoogleCalendarEvent[] } =
                  await eventResponse.json();
                const foundEvent = eventsData.events?.find(
                  (e) => e.id === googleEventId
                );
                if (foundEvent) {
                  googleEvent = foundEvent;
                  break; // Found it, stop searching
                }
              }
            }

            // If we found the event, extract data for comparison
            if (googleEvent) {
              const startIso =
                googleEvent.start?.dateTime ||
                googleEvent.start?.date ||
                dbStartTime ||
                new Date().toISOString();
              const endIso =
                googleEvent.end?.dateTime ||
                googleEvent.end?.date ||
                dbEndTime ||
                startIso;
              googleStartTime = ensureUTCISO(startIso);
              googleEndTime = ensureUTCISO(endIso);
              const urlResult = getMeetingUrl(googleEvent);
              googleMeetingUrl = urlResult.url;
              googleMeetingType = urlResult.type;

              // Compare database vs Google Calendar to detect changes
              timeChanged =
                isTimeChanged(dbStartTime, googleStartTime) ||
                isTimeChanged(dbEndTime, googleEndTime) ||
                dbMeetingUrl !== googleMeetingUrl;

              if (timeChanged) {
                console.log(
                  `⏰ Time change detected: DB start=${dbStartTime}, Google start=${googleStartTime}`
                );
              }
            } else {
              console.log(
                `ℹ️  Event ${googleEventId} not found in Google Calendar, using database data only`
              );
            }
          }
        } catch (error) {
          // Google Calendar fetch failed - assume no changes, use database data
          console.warn(
            `⚠️  Could not fetch from Google Calendar for event ${googleEventId}, using database data:`,
            error instanceof Error ? error.message : String(error)
          );
          // Don't override timeChanged if it was set from sync-calendar
          if (!timeChangedFromSync) {
            timeChanged = false;
          }
        }
      } else {
        console.log(
          `ℹ️  Time change already detected in sync-calendar, skipping Google Calendar fetch`
        );
      }

      // Step 4: Use database data as source of truth (or updated data if time changed)
      const finalStartTime =
        timeChanged && googleStartTime ? googleStartTime : dbStartTime;
      const finalEndTime =
        timeChanged && googleEndTime ? googleEndTime : dbEndTime;
      const finalMeetingUrl =
        timeChanged && googleMeetingUrl ? googleMeetingUrl : dbMeetingUrl;
      const finalMeetingType =
        timeChanged && googleMeetingType ? googleMeetingType : dbMeetingType;
      const finalHangoutLink =
        finalMeetingType === "google_meet" ? finalMeetingUrl : null;

      // Determine status based on final values
      const isPastEvent = finalEndTime
        ? new Date(finalEndTime).getTime() < Date.now()
        : false;
      let status: string;
      if (!finalMeetingUrl) {
        status = "missing_url";
      } else if (isPastEvent) {
        status = "passed_event";
      } else {
        status = "new";
      }

      // Step 5: Verify recording is allowed (bot_enabled = true)
      if (existingMeeting.bot_enabled === true) {
        // Step 6: If time changed, delete old bot and create new one
        if (timeChanged) {
          console.log(
            `⏰ Meeting time/URL changed - deleting old bot and creating new one`
          );

          // Step 7: Delete old scheduled bot (if recall_bot_id exists)
          if (existingMeeting.recall_bot_id) {
            console.log(
              `🗑️  Deleting old bot: ${existingMeeting.recall_bot_id}`
            );
            const deleteResult = await deleteBotFromRecall(
              existingMeeting.recall_bot_id,
              recallApiKey
            );

            if (!deleteResult.success && deleteResult.statusCode !== 404) {
              console.warn(
                `⚠️  Failed to delete old bot (non-critical): ${deleteResult.error}`
              );
            }
          }

          // Step 8: Remove bot ID from meeting
          await supabaseAdmin
            .from("meetings")
            .update({
              recall_bot_id: null,
              dispatch_status: "pending",
            })
            .eq("id", existingMeeting.id);
        }

        // Step 9: Create bot if conditions are met
        // This handles both: time changed (new bot) and initial creation (if bot wasn't created before)
        if (finalMeetingUrl && !isPastEvent) {
          // Only create bot if we don't already have one (unless time changed, which we handled above)
          if (!existingMeeting.recall_bot_id || timeChanged) {
            const joinAt = calculateJoinTime(
              finalStartTime || new Date().toISOString()
            );
            console.log(
              `🤖 Creating bot for meeting: ${finalMeetingUrl}, join_at: ${joinAt}`
            );

            const webhookUrl = `${supabaseUrl}/functions/v1/process-transcript`;
            const createResult = await createBotInRecall(
              finalMeetingUrl,
              joinAt,
              webhookUrl,
              recallApiKey
            );

            if (!createResult.success) {
              // Log error and update meeting with error details
              console.error(`❌ Failed to create bot: ${createResult.error}`);

              await supabaseAdmin
                .from("meetings")
                .update({
                  dispatch_status: "pending",
                  error_details: {
                    type: "bot_creation_failed",
                    message: createResult.error,
                    timestamp: new Date().toISOString(),
                  },
                  last_error_at: new Date().toISOString(),
                  retry_count: (existingMeeting.retry_count || 0) + 1,
                })
                .eq("id", existingMeeting.id);

              // Re-throw to trigger retry
              throw new Error(`Failed to create bot: ${createResult.error}`);
            }

            // Step 10: Save new bot ID
            await supabaseAdmin
              .from("meetings")
              .update({
                recall_bot_id: createResult.botId,
                status: "recording_scheduled",
                dispatch_status: "completed",
                start_time: finalStartTime,
                end_time: finalEndTime,
                meeting_url: finalMeetingUrl,
                hangout_link: finalHangoutLink,
                meeting_type: finalMeetingType,
                error_details: null,
                last_error_at: null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingMeeting.id);

            console.log(
              `✅ Updated meeting with bot ID: ${createResult.botId}`
            );
          } else {
            // Bot already exists and time didn't change - just update metadata if needed
            console.log(
              `⏭️  Bot already exists (${existingMeeting.recall_bot_id}), no changes needed`
            );

            // Update metadata if time changed but we're keeping the same bot
            if (timeChanged) {
              await supabaseAdmin
                .from("meetings")
                .update({
                  start_time: finalStartTime,
                  end_time: finalEndTime,
                  meeting_url: finalMeetingUrl,
                  hangout_link: finalHangoutLink,
                  meeting_type: finalMeetingType,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", existingMeeting.id);
            }
          }
        } else {
          // No URL or past event - update status
          console.log(
            `⏭️  Meeting has no URL or is past event, updating status only`
          );
          await supabaseAdmin
            .from("meetings")
            .update({
              status: status,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingMeeting.id);
        }
      } else {
        // Recording not allowed (bot_enabled = false) - update metadata only
        console.log(
          `⏭️  Bot disabled for this meeting, updating metadata only`
        );
        await supabaseAdmin
          .from("meetings")
          .update({
            status: status,
            start_time: finalStartTime,
            end_time: finalEndTime,
            meeting_url: finalMeetingUrl,
            hangout_link: finalHangoutLink,
            meeting_type: finalMeetingType,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingMeeting.id);
      }

      return {
        ok: true,
        userId,
        googleEventId,
        processed: true,
      };
    } catch (error) {
      console.error(
        `❌ Error processing meeting ${googleEventId} for user ${userId}:`,
        error
      );

      // Re-throw to trigger retry
      throw error;
    }
  },
});
