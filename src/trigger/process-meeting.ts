import { task } from "@trigger.dev/sdk/v3";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { GoogleCalendarEvent } from "./_shared/meeting-utils";
import { getMeetingUrl } from "./_shared/meeting-utils";
import { ensureUTCISO, calculateJoinTime, isTimeChanged } from "./_shared/timezone-utils";
import { deleteBotFromRecall, createBotInRecall } from "./_shared/bot-utils";

/**
 * Process Meeting Task - Processes individual calendar events
 * 
 * Pattern: Follows hydrate-thread.ts structure (check if exists, compare, update if changed)
 * 
 * Flow (matching user requirements):
 * 1. Check if meeting exists (by google_event_id + user_id)
 * 2. If exists:
 *    - Verify recording is allowed (bot_enabled = true)
 *    - If recording allowed:
 *      - Check if meeting time has changed (compare start_time, end_time, meeting_url)
 *      - If time changed:
 *        - Delete old scheduled bot (if recall_bot_id exists)
 *        - Remove recall_bot_id from meeting
 *        - Create new bot with updated time
 *        - Save new recall_bot_id
 *    - If recording not allowed: Update metadata only, skip bot operations
 * 3. If doesn't exist:
 *    - Create new meeting
 *    - If bot_enabled = true, create bot
 *    - Save recall_bot_id
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
  run: async (payload: { userId: string; googleEventId: string }) => {
    const { userId, googleEventId } = payload;

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
      // Step 1: Check if meeting exists (by google_event_id + user_id)
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

      // Fetch latest event data from Google Calendar
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/fetch-calendar-events`;
      
      // We need to get the calendar ID first - for now, we'll fetch from primary calendar
      // In a production system, you might want to store calendar_id in the meeting record
      // For now, we'll try to fetch the event from the primary calendar
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

      if (!calendarListResponse.ok) {
        throw new Error(
          `Failed to fetch calendar list: ${calendarListResponse.status}`
        );
      }

      const calendarListData: {
        calendars?: Array<{ id: string }>;
      } = await calendarListResponse.json();
      const primaryCalendar = calendarListData.calendars?.[0];

      if (!primaryCalendar) {
        throw new Error("No calendars found for user");
      }

      // Fetch the specific event
      const now = new Date();
      const twoWeeksFromNow = new Date();
      twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
      const timeMin = now.toISOString();
      const timeMax = twoWeeksFromNow.toISOString();

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
          calendarId: primaryCalendar.id,
          timeMin,
          timeMax,
        }),
      });

      if (!eventResponse.ok) {
        // Event might have been deleted - handle gracefully
        if (eventResponse.status === 404) {
          console.log(
            `⚠️  Event ${googleEventId} not found in Google Calendar, skipping`
          );
          return {
            ok: true,
            userId,
            googleEventId,
            processed: false,
            reason: "event_not_found",
          };
        }
        throw new Error(
          `Failed to fetch event: ${eventResponse.status}`
        );
      }

      const eventsData: { events?: GoogleCalendarEvent[] } =
        await eventResponse.json();
      const event = eventsData.events?.find((e) => e.id === googleEventId);

      if (!event) {
        console.log(
          `⚠️  Event ${googleEventId} not found in fetched events, skipping`
        );
        return {
          ok: true,
          userId,
          googleEventId,
          processed: false,
          reason: "event_not_found",
        };
      }

      // Extract meeting details from event
      const startIso =
        event.start?.dateTime || event.start?.date || new Date().toISOString();
      const endIso =
        event.end?.dateTime || event.end?.date || startIso;
      const startTimeUTC = ensureUTCISO(startIso);
      const endTimeUTC = ensureUTCISO(endIso);
      const { url: meetingUrl, type: meetingType } = getMeetingUrl(event);
      const hangoutLink =
        meetingType === "google_meet" ? meetingUrl : null;

      // Extract external attendees
      const attendees: Array<{ email: string }> = event.attendees || [];
      const userEmail = (await supabaseAdmin.auth.admin.getUserById(userId))
        .data?.user?.email;
      const userDomain = userEmail?.split("@")[1];

      const isGoogleCalendarResource = (email: string): boolean => {
        return (
          email.startsWith("c_") &&
          (email.includes("@resource.calendar.google.com") ||
            email.includes("@group.calendar.google.com"))
        );
      };

      const externalAttendees = attendees.filter((a) => {
        if (!a.email) return false;
        if (isGoogleCalendarResource(a.email)) return false;
        const domain = a.email.split("@")[1];
        return Boolean(domain) && domain !== userDomain;
      });

      const externalEmails = externalAttendees.map((a) => a.email);

      // Resolve customer/company (re-resolve if missing)
      let customerId: string | null = existingMeeting?.customer_id || null;
      let companyId: string | null = existingMeeting?.company_id || null;

      if (externalEmails.length > 0 && (!customerId || !companyId)) {
        const { data: userCompanies, error: companiesErr } =
          await supabaseAdmin
            .from("companies")
            .select("company_id")
            .eq("user_id", userId);

        if (!companiesErr && userCompanies && userCompanies.length > 0) {
          const companyIds = userCompanies.map((c) => c.company_id);

          // Try exact email match first
          const { data: customer, error: findErr } = await supabaseAdmin
            .from("customers")
            .select("customer_id, company_id")
            .in("email", externalEmails)
            .in("company_id", companyIds)
            .limit(1)
            .maybeSingle();

          if (!findErr && customer) {
            customerId = customer.customer_id;
            companyId = customer.company_id;
          } else {
            // Try domain-based matching
            const externalDomains = externalAttendees
              .map((a) => a.email?.split("@")[1])
              .filter((d): d is string => Boolean(d));

            if (externalDomains.length > 0) {
              const { data: domainCompany, error: domainErr } =
                await supabaseAdmin
                  .from("companies")
                  .select("company_id, domain_name")
                  .in("domain_name", externalDomains)
                  .eq("user_id", userId)
                  .limit(1)
                  .maybeSingle();

              if (!domainErr && domainCompany) {
                const { data: companyCustomer, error: companyCustomerErr } =
                  await supabaseAdmin
                    .from("customers")
                    .select("customer_id, company_id")
                    .eq("company_id", domainCompany.company_id)
                    .order("created_at", { ascending: true })
                    .limit(1)
                    .maybeSingle();

                if (!companyCustomerErr && companyCustomer) {
                  customerId = companyCustomer.customer_id;
                  companyId = companyCustomer.company_id;
                }
              }
            }
          }
        }
      }

      // Determine status
      const isPastEvent = new Date(endTimeUTC).getTime() < Date.now();
      let status: string;
      if (!meetingUrl) {
        status = "missing_url";
      } else if (isPastEvent) {
        status = "passed_event";
      } else {
        status = "new";
      }

      // If meeting exists
      if (existingMeeting) {
        console.log(
          `✅ Meeting exists: ${existingMeeting.id}, bot_enabled: ${existingMeeting.bot_enabled}`
        );

        // Step 2: Verify recording is allowed (bot_enabled = true)
        if (existingMeeting.bot_enabled === true) {
          // Step 3: Check if meeting time has changed
          const timeChanged =
            isTimeChanged(existingMeeting.start_time, startTimeUTC) ||
            isTimeChanged(existingMeeting.end_time, endTimeUTC) ||
            existingMeeting.meeting_url !== meetingUrl;

          if (timeChanged) {
            console.log(
              `⏰ Meeting time/URL changed - deleting old bot and creating new one`
            );

            // Step 4: Delete old scheduled bot (if recall_bot_id exists)
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
                // Continue anyway - bot might already be deleted
              }
            }

            // Step 5: Remove bot ID from meeting
            await supabaseAdmin
              .from("meetings")
              .update({
                recall_bot_id: null,
                dispatch_status: "pending",
              })
              .eq("id", existingMeeting.id);

            // Step 6: Create new bot
            if (meetingUrl && !isPastEvent) {
              const joinAt = calculateJoinTime(startTimeUTC);
              console.log(
                `🤖 Creating new bot for meeting: ${meetingUrl}, join_at: ${joinAt}`
              );

              const webhookUrl = `${supabaseUrl}/functions/v1/process-transcript`;
              const createResult = await createBotInRecall(
                meetingUrl,
                joinAt,
                webhookUrl,
                recallApiKey
              );

              if (!createResult.success) {
                throw new Error(
                  `Failed to create bot: ${createResult.error}`
                );
              }

              // Step 7: Save new bot ID
              await supabaseAdmin
                .from("meetings")
                .update({
                  recall_bot_id: createResult.botId,
                  status: "recording_scheduled", // status can be 'recording_scheduled'
                  dispatch_status: "completed", // dispatch_status must be 'pending', 'processing', or 'completed'
                  title: event.summary || "Untitled Meeting",
                  description: event.description || null,
                  start_time: startTimeUTC,
                  end_time: endTimeUTC,
                  meeting_url: meetingUrl,
                  hangout_link: hangoutLink,
                  meeting_type: meetingType,
                  attendees: externalEmails.length > 0 ? externalEmails : null,
                  meeting_customer:
                    externalEmails.length > 0 ? externalEmails[0] : null,
                  customer_id: customerId,
                  company_id: companyId,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", existingMeeting.id);

              console.log(
                `✅ Updated meeting with new bot ID: ${createResult.botId}`
              );
            } else {
              // No URL or past event - just update metadata
              await supabaseAdmin
                .from("meetings")
                .update({
                  status: status,
                  title: event.summary || "Untitled Meeting",
                  description: event.description || null,
                  start_time: startTimeUTC,
                  end_time: endTimeUTC,
                  meeting_url: meetingUrl,
                  hangout_link: hangoutLink,
                  meeting_type: meetingType,
                  attendees: externalEmails.length > 0 ? externalEmails : null,
                  meeting_customer:
                    externalEmails.length > 0 ? externalEmails[0] : null,
                  customer_id: customerId,
                  company_id: companyId,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", existingMeeting.id);
            }
          } else {
            // Time not changed - just update metadata if needed
            console.log(`⏭️  Meeting time unchanged, updating metadata only`);
            await supabaseAdmin
              .from("meetings")
              .update({
                title: event.summary || "Untitled Meeting",
                description: event.description || null,
                attendees: externalEmails.length > 0 ? externalEmails : null,
                meeting_customer:
                  externalEmails.length > 0 ? externalEmails[0] : null,
                customer_id: customerId,
                company_id: companyId,
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
              title: event.summary || "Untitled Meeting",
              description: event.description || null,
              start_time: startTimeUTC,
              end_time: endTimeUTC,
              meeting_url: meetingUrl,
              hangout_link: hangoutLink,
              meeting_type: meetingType,
              attendees: externalEmails.length > 0 ? externalEmails : null,
              meeting_customer:
                externalEmails.length > 0 ? externalEmails[0] : null,
              customer_id: customerId,
              company_id: companyId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingMeeting.id);
        }
      } else {
        // Meeting doesn't exist - create new meeting
        console.log(`🆕 Creating new meeting: ${googleEventId}`);

        // Type for meeting insert data
        type MeetingInsert = {
          google_event_id: string;
          user_id: string;
          title: string | null;
          description: string | null;
          start_time: string;
          end_time: string;
          meeting_url: string | null;
          hangout_link: string | null;
          meeting_type: string | null;
          attendees: string[] | null;
          meeting_customer: string | null;
          customer_id: string | null;
          company_id: string | null;
          status: string;
          bot_enabled: boolean;
          dispatch_status: string;
          recall_bot_id?: string | null;
        };

        const newMeetingData: MeetingInsert = {
          google_event_id: googleEventId,
          user_id: userId,
          title: event.summary || "Untitled Meeting",
          description: event.description || null,
          start_time: startTimeUTC,
          end_time: endTimeUTC,
          meeting_url: meetingUrl,
          hangout_link: hangoutLink,
          meeting_type: meetingType,
          attendees: externalEmails.length > 0 ? externalEmails : null,
          meeting_customer:
            externalEmails.length > 0 ? externalEmails[0] : null,
          customer_id: customerId,
          company_id: companyId,
          status: status,
          bot_enabled: true, // Default enabled
          dispatch_status: "pending",
        };

        // If bot_enabled = true and meeting has URL and is not past
        if (meetingUrl && !isPastEvent) {
          const joinAt = calculateJoinTime(startTimeUTC);
          console.log(
            `🤖 Creating bot for new meeting: ${meetingUrl}, join_at: ${joinAt}`
          );

          const webhookUrl = `${supabaseUrl}/functions/v1/process-transcript`;
          const createResult = await createBotInRecall(
            meetingUrl,
            joinAt,
            webhookUrl,
            recallApiKey
          );

          if (!createResult.success) {
            throw new Error(
              `Failed to create bot: ${createResult.error}`
            );
          }

          // Add bot ID to meeting data
          newMeetingData.recall_bot_id = createResult.botId;
          newMeetingData.status = "recording_scheduled"; // status can be 'recording_scheduled'
          newMeetingData.dispatch_status = "completed"; // dispatch_status must be 'pending', 'processing', or 'completed'
        }

        const { error: insertError } = await supabaseAdmin
          .from("meetings")
          .insert(newMeetingData);

        if (insertError) {
          throw new Error(
            `Failed to create meeting: ${insertError.message}`
          );
        }

        console.log(`✅ Created new meeting: ${googleEventId}`);
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

