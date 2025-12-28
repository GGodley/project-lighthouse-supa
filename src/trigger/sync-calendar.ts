import { task } from "@trigger.dev/sdk/v3";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { processMeetingTask } from "./process-meeting";
import type { GoogleCalendarEvent } from "./_shared/meeting-utils";
import { getMeetingUrl } from "./_shared/meeting-utils";
import { ensureUTCISO, isTimeChanged } from "./_shared/timezone-utils";

/**
 * Sync Calendar Task - Orchestrates Google Calendar sync
 * 
 * Pattern: Follows ingest-threads.ts structure exactly
 * 
 * Flow:
 * 1. Call fetch-calendar-events Edge Function in pagination loop
 * 2. Upsert events directly to meetings table (no temp_meetings)
 * 3. Resolve external attendees to customer_id/company_id
 * 4. Immediately trigger process-meeting tasks for each event
 */
export const syncCalendarTask = task({
  id: "sync-calendar",
  run: async (payload: { userId: string }) => {
    const { userId } = payload;

    console.log(`🔄 Starting calendar sync for user: ${userId}`);

    // Initialize Supabase client with service role key
    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
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
      // Calculate 2-week window: now to 14 days from now
      const now = new Date();
      const twoWeeksFromNow = new Date();
      twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
      const timeMin = now.toISOString();
      const timeMax = twoWeeksFromNow.toISOString();

      console.log(
        `📅 Calendar sync window: ${timeMin} to ${timeMax} (2 weeks)`
      );

      // Get user email for domain filtering
      const { data: userData, error: userErr } =
        await supabaseAdmin.auth.admin.getUserById(userId);
      if (userErr || !userData?.user?.email) {
        throw new Error(`Failed to get user: ${userErr?.message}`);
      }
      const userEmail = userData.user.email;
      const userDomain = userEmail.split("@")[1];

      // Step 1: Fetch calendar list
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/fetch-calendar-events`;
      const brokerSecret = process.env.BROKER_SHARED_SECRET;
      const supabaseAnonKey =
        process.env.SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!brokerSecret) {
        throw new Error("BROKER_SHARED_SECRET environment variable is not set");
      }

      if (!supabaseAnonKey) {
        throw new Error(
          "SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable is not set"
        );
      }

      // Fetch calendar list
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
        const errorText = await calendarListResponse.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: "unknown" };
        }

        // Handle token errors
        if (
          calendarListResponse.status === 401 &&
          errorData.error === "calendar_unauthorized"
        ) {
          throw new Error("TOKEN_EXPIRED_RECONNECT");
        }

        if (
          calendarListResponse.status === 412 &&
          (errorData.error === "missing_google_token" ||
            errorData.error === "token_expired")
        ) {
          throw new Error("TOKEN_EXPIRED_RECONNECT");
        }

        throw new Error(
          `Failed to fetch calendar list: ${calendarListResponse.status} - ${errorData.error || "unknown"}`
        );
      }

      const calendarListData: { calendars?: Array<{ id: string; summary?: string }> } =
        await calendarListResponse.json();
      const calendars = calendarListData.calendars || [];

      console.log(`📚 Found ${calendars.length} calendars`);

      let totalEventsFetched = 0;

      // Step 2: Fetch events for each calendar
      for (const cal of calendars) {
        let pageToken: string | null = null;
        let batchIndex = 0;

        do {
          console.log(
            `🔄 Fetching events for calendar: ${cal.id} (batch #${batchIndex + 1}, pageToken: ${pageToken || "none"})`
          );

          const eventsResponse = await fetch(edgeFunctionUrl, {
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
              pageToken: pageToken || undefined,
              timeMin,
              timeMax,
            }),
          });

          if (!eventsResponse.ok) {
            const errorText = await eventsResponse.text();
            let errorData;
            try {
              errorData = JSON.parse(errorText);
            } catch {
              errorData = { error: "unknown" };
            }

            // Handle token errors
            if (
              eventsResponse.status === 401 &&
              errorData.error === "calendar_unauthorized"
            ) {
              throw new Error("TOKEN_EXPIRED_RECONNECT");
            }

            if (
              eventsResponse.status === 412 &&
              (errorData.error === "missing_google_token" ||
                errorData.error === "token_expired")
            ) {
              throw new Error("TOKEN_EXPIRED_RECONNECT");
            }

            console.error(
              `❌ Failed to fetch events for calendar ${cal.id}, skipping`
            );
            break; // Skip this calendar, continue with next
          }

          const eventsData: {
            events?: GoogleCalendarEvent[];
            nextPageToken?: string;
          } = await eventsResponse.json();

          const events = eventsData.events || [];
          const nextPageToken = eventsData.nextPageToken || null;

          console.log(
            `📧 Fetched ${events.length} events from calendar ${cal.id} (hasNextPage: ${!!nextPageToken})`
          );

          if (events.length > 0) {
            // Step 1: Fetch existing meetings from database to compare times
            const eventIds = events.map((e) => e.id);
            const { data: existingMeetings, error: fetchError } =
              await supabaseAdmin
                .from("meetings")
                .select("google_event_id, start_time, end_time, meeting_url")
                .in("google_event_id", eventIds)
                .eq("user_id", userId);

            if (fetchError) {
              console.warn(
                `⚠️  Failed to fetch existing meetings for comparison: ${fetchError.message}`
              );
            }

            // Create a map for quick lookup
            const existingMeetingsMap = new Map<
              string,
              { start_time: string | null; end_time: string | null; meeting_url: string | null }
            >();
            if (existingMeetings) {
              for (const meeting of existingMeetings) {
                existingMeetingsMap.set(meeting.google_event_id, {
                  start_time: meeting.start_time,
                  end_time: meeting.end_time,
                  meeting_url: meeting.meeting_url,
                });
              }
            }

            // Step 2: Process events: extract meeting data and resolve customers
            const meetingsToUpsert = await Promise.all(
              events.map(async (event) => {
                // Extract meeting details
                const startIso =
                  event.start?.dateTime ||
                  event.start?.date ||
                  new Date().toISOString();
                const endIso =
                  event.end?.dateTime || event.end?.date || startIso;

                // Ensure UTC timestamps
                const startTimeUTC = ensureUTCISO(startIso);
                const endTimeUTC = ensureUTCISO(endIso);

                // Get meeting URL and type
                const { url: meetingUrl, type: meetingType } =
                  getMeetingUrl(event);
                const hangoutLink =
                  meetingType === "google_meet" ? meetingUrl : null;

                // Extract external attendees
                const attendees: Array<{ email: string }> =
                  event.attendees || [];
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
                const externalDomains = externalAttendees
                  .map((a) => a.email?.split("@")[1])
                  .filter((d): d is string => Boolean(d));

                // Resolve customer/company (basic resolution during sync)
                let customerId: string | null = null;
                let companyId: string | null = null;

                if (externalEmails.length > 0) {
                  // Get user's companies first
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
                    } else if (externalDomains.length > 0) {
                      // Try domain-based matching
                      const { data: domainCompany, error: domainErr } =
                        await supabaseAdmin
                          .from("companies")
                          .select("company_id, domain_name")
                          .in("domain_name", externalDomains)
                          .eq("user_id", userId)
                          .limit(1)
                          .maybeSingle();

                      if (!domainErr && domainCompany) {
                        // Get first customer from that company
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

                return {
                  google_event_id: event.id,
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
              })
            );

            // Upsert meetings directly to meetings table
            // Note: Primary key is google_event_id, but we also have unique constraint on (user_id, google_event_id)
            // Using primary key for conflict resolution
            const { error: upsertError } = await supabaseAdmin
              .from("meetings")
              .upsert(meetingsToUpsert, {
                onConflict: "google_event_id",
                ignoreDuplicates: false,
              });

            if (upsertError) {
              throw new Error(
                `Failed to upsert meetings: ${upsertError.message}`
              );
            }

            console.log(
              `✅ Upserted ${meetingsToUpsert.length} meetings to database`
            );

            // Step 3: Detect time changes and trigger process-meeting tasks only when needed
            // Only trigger if: time changed OR meeting is new (doesn't exist in database)
            if (events.length > 0) {
              const eventsToProcess: Array<{
                userId: string;
                googleEventId: string;
                timeChanged: boolean;
              }> = [];

              for (const event of events) {
                // Extract new event data for comparison
                const startIso =
                  event.start?.dateTime ||
                  event.start?.date ||
                  new Date().toISOString();
                const endIso =
                  event.end?.dateTime || event.end?.date || startIso;
                const startTimeUTC = ensureUTCISO(startIso);
                const endTimeUTC = ensureUTCISO(endIso);
                const { url: meetingUrl } = getMeetingUrl(event);

                // Get existing meeting data (before upsert)
                const existingMeeting = existingMeetingsMap.get(event.id);

                // Detect if time changed by comparing existing vs new data
                let timeChanged = false;
                if (existingMeeting) {
                  timeChanged =
                    isTimeChanged(
                      existingMeeting.start_time,
                      startTimeUTC
                    ) ||
                    isTimeChanged(existingMeeting.end_time, endTimeUTC) ||
                    existingMeeting.meeting_url !== meetingUrl;
                }

                // Only trigger process-meeting if:
                // 1. Time changed (needs bot update)
                // 2. Meeting is new (doesn't exist in database - needs bot creation)
                if (timeChanged || !existingMeeting) {
                  eventsToProcess.push({
                    userId,
                    googleEventId: event.id,
                    timeChanged,
                  });
                } else {
                  console.log(
                    `⏭️  Skipping ${event.id} - no changes detected, meeting already processed`
                  );
                }
              }

              if (eventsToProcess.length > 0) {
                console.log(
                  `🚀 Dispatching ${eventsToProcess.length} process-meeting jobs (${events.length - eventsToProcess.length} skipped)`
                );

                await Promise.all(
                  eventsToProcess.map((eventData) => {
                    return processMeetingTask.trigger(eventData);
                  })
                );

                console.log(
                  `✅ Dispatched ${eventsToProcess.length} process-meeting jobs`
                );
              } else {
                console.log(
                  `⏭️  No process-meeting jobs needed - all events unchanged`
                );
              }
            }

            totalEventsFetched += events.length;
          }

          pageToken = nextPageToken;
          batchIndex += 1;
        } while (pageToken);
      }

      console.log(
        `✅ Calendar sync completed successfully for user ${userId} (fetched: ${totalEventsFetched} events)`
      );

      return {
        success: true,
        calendarsProcessed: calendars.length,
        eventsFetched: totalEventsFetched,
      };
    } catch (error) {
      console.error(
        `❌ Error in calendar sync for user ${userId}:`,
        error
      );

      // Re-throw to mark job as failed
      throw error;
    }
  },
});

