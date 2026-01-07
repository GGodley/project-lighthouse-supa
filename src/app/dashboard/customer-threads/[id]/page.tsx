/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect } from "react";
import {
  Copy,
  RefreshCw,
  MoreHorizontal,
  Sparkles,
  Linkedin,
  Globe,
  Search,
  Filter,
  ArrowDownWideNarrow,
  Heart,
  Calendar,
  Phone,
  Mail,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/Button";
import { NextStepCard } from "@/components/ui/NextStepCard";
import { TimelineCard } from "@/components/ui/TimelineCard";
import { FeedbackRequestCard } from "@/components/ui/FeedbackRequestCard";
import { UpcomingMeetingCard } from "@/components/ui/UpcomingMeetingCard";
import { CompactActivityRow } from "@/components/ui/CompactActivityRow";
import { useSupabase } from "@/components/SupabaseProvider";
import { generateCompanyInsights } from "@/app/actions/generateCompanyInsights";
import type { ThreadMessage } from "@/lib/types/threads";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Use the Database type for accurate typing
import type { Database } from "@/types/database";

// Extend the base Company type to include ai_insights (jsonb column)
// ai_insights is stored as JSONB in the database, so it can be an object, string (if stored incorrectly), or null
// The Database type doesn't include ai_insights, so we add it explicitly
type Company = Omit<Database["public"]["Tables"]["companies"]["Row"], "ai_insights"> & {
  ai_insights: string | object | null;
};

interface Customer {
  customer_id: string;
  full_name: string | null;
  email: string | null;
}

interface AIInsights {
  one_liner?: string;
  summary?: string;
  linkedin_url?: string;
}

interface TimelineEvent {
  id: string;
  type: "thread" | "meeting";
  date: string; // ISO string
  title: string;
  summary: string;
}

interface ThreadLinkResponse {
  company_id: string;
  threads: {
    thread_id: string;
    subject: string | null;
    snippet: string | null;
    llm_summary: { timeline_summary?: string } | null;
    last_message_date: string | null;
    created_at: string | null;
  };
}

interface MeetingWithAttendees extends Meeting {
  meeting_attendees: { customer_id: string }[];
}

// Extend Meeting type to include location field (exists in DB but not in generated types)
type Meeting = Database["public"]["Tables"]["meetings"]["Row"] & {
  location?: string | null;
};

type NextStep = Database["public"]["Tables"]["next_steps"]["Row"];

export default function CompanyDetailDashboard({ params }: PageProps) {
  const [activeTab, setActiveTab] = useState<"highlights" | "timeline" | "tasks" | "requests">(
    "highlights",
  );
  const [company, setCompany] = useState<Company | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [insights, setInsights] = useState<AIInsights>({});
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [nextMeeting, setNextMeeting] = useState<Meeting | null>(null);
  const [nextStep, setNextStep] = useState<NextStep | null>(null);
  const [allTasks, setAllTasks] = useState<NextStep[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<{
    id: string;
    type: "thread" | "meeting";
  } | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [meetingDetails, setMeetingDetails] = useState<Meeting | null>(null);
  const [threadContext, setThreadContext] = useState<{
    steps: NextStep[];
    requests: unknown[];
    attendees: string[];
  }>({ steps: [], requests: [], attendees: [] });
  const [logoError, setLogoError] = useState(false);
  const supabase = useSupabase();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const resolvedParams = await params;
        const companyId = resolvedParams.id;

        // Fetch company data - select all columns (ai_insights is JSONB in DB)
        const { data: companyData, error: companyError } = await supabase
          .from("companies")
          .select("*")
          .eq("company_id", companyId)
          .single();

        if (companyError) {
          console.error("Error fetching company:", companyError);
          setLoading(false);
          return;
        }

        if (companyData) {
          // Type assertion: ai_insights exists in DB (jsonb) but not in generated types
          const companyWithInsights = companyData as unknown as Company;
          setCompany(companyWithInsights);

          // Parse AI insights
          let parsedInsights: AIInsights = {};
          if (companyWithInsights.ai_insights) {
            try {
              parsedInsights =
                typeof companyWithInsights.ai_insights === "string"
                  ? JSON.parse(companyWithInsights.ai_insights)
                  : (companyWithInsights.ai_insights as AIInsights);
            } catch (e) {
              console.error("Error parsing AI insights:", e);
            }
          }
          setInsights(parsedInsights);

          // Fetch customers
          const { data: customerData, error: customerError } = await supabase
            .from("customers")
            .select("customer_id, full_name, email")
            .eq("company_id", companyId);

          if (customerError) {
            console.error("Error fetching customers:", customerError);
          } else {
            setCustomers(customerData || []);

            // Fetch next upcoming meeting for these customers
            const customerIds = (customerData || []).map((c: Customer) => c.customer_id);

            if (customerIds.length > 0) {
              const { data: meetingData, error: meetingError } = await supabase
                .from("meetings")
                .select(
                  `
                  *,
                  meeting_attendees!inner(customer_id)
                `
                )
                .in("meeting_attendees.customer_id", customerIds)
                .gt("start_time", new Date().toISOString())
                .order("start_time", { ascending: true })
                .limit(1)
                .maybeSingle();

              if (meetingError) {
                console.error("Error fetching next meeting:", meetingError);
              } else if (meetingData) {
                setNextMeeting(meetingData);
              }

              // Fetch most recent next step for these customers (for widget)
              const { data: stepData, error: stepError } = await supabase
                .from("next_steps")
                .select(
                  `
                  *,
                  next_step_assignments!inner(customer_id)
                `
                )
                .in("next_step_assignments.customer_id", customerIds)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (stepError) {
                console.error("Error fetching next step:", stepError);
              } else if (stepData) {
                setNextStep(stepData);
              }

              // Fetch ALL tasks for the Tasks Tab
              const { data: tasksData, error: tasksError } = await supabase
                .from("next_steps")
                .select(
                  `
                  *,
                  next_step_assignments!inner(customer_id)
                `
                )
                .in("next_step_assignments.customer_id", customerIds)
                .order("created_at", { ascending: false });

              if (tasksError) {
                console.error("Error fetching tasks:", tasksError);
              } else {
                setAllTasks(tasksData || []);
              }

              // Fetch timeline events (threads and meetings)
              // Query 1: Fetch threads via thread_company_link
              // Note: thread_company_link is not in generated types, so we use type assertion
              type UntypedSupabase = {
                from: (table: string) => {
                  select: (columns: string) => {
                    eq: (column: string, value: string) => Promise<{
                      data: ThreadLinkResponse[] | null;
                      error: { message: string } | null;
                    }>;
                  };
                };
              };
              const untypedSupabase = supabase as unknown as UntypedSupabase;
              
              const { data: threadLinkData, error: threadLinkError } = await untypedSupabase
                .from("thread_company_link")
                .select(
                  `
                  company_id,
                  threads!inner (
                    thread_id,
                    subject,
                    snippet,
                    llm_summary,
                    last_message_date,
                    created_at
                  )
                `
                )
                .eq("company_id", companyId);

              // Query 2: Fetch meetings via meeting_attendees
              const { data: allMeetings, error: meetingsError } = await supabase
                .from("meetings")
                .select(
                  `
                  id,
                  title,
                  start_time,
                  meeting_attendees!inner(customer_id)
                `
                )
                .in("meeting_attendees.customer_id", customerIds)
                .order("start_time", { ascending: false });

              if (threadLinkError) {
                console.error("Error fetching threads:", threadLinkError);
              }
              if (meetingsError) {
                console.error("Error fetching meetings:", meetingsError);
              }

              // Transform threads to TimelineEvent
              const threadEvents: TimelineEvent[] =
                (threadLinkData as ThreadLinkResponse[] | null)?.map((link) => {
                  const thread = link.threads;
                  const llmSummary =
                    thread.llm_summary && typeof thread.llm_summary === "object"
                      ? (thread.llm_summary as { timeline_summary?: string })
                      : null;
                  return {
                    id: `thread-${thread.thread_id}`,
                    type: "thread" as const,
                    date: thread.last_message_date || thread.created_at || new Date().toISOString(),
                    title: thread.subject || "No subject",
                    summary:
                      llmSummary?.timeline_summary ||
                      thread.snippet ||
                      "No summary available",
                  };
                }) || [];

              // Transform meetings to TimelineEvent
              const meetingEvents: TimelineEvent[] =
                (allMeetings as MeetingWithAttendees[] | null)?.map((meeting) => ({
                  id: `meeting-${meeting.id}`,
                  type: "meeting" as const,
                  date: meeting.start_time || new Date().toISOString(),
                  title: meeting.title || "Meeting",
                  summary: `Meeting with ${companyData?.company_name || "company"}`,
                })) || [];

              // Combine and sort by date (descending - newest first)
              const combinedEvents = [...threadEvents, ...meetingEvents].sort(
                (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
              );

              setTimelineEvents(combinedEvents);
            }
          }
        }
      } catch (err) {
        console.error("Error in fetchData:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [params, supabase]);

  // Fetch event details when an event is selected
  useEffect(() => {
    if (!selectedEvent) {
      setThreadMessages([]);
      setMeetingDetails(null);
      setThreadContext({ steps: [], requests: [], attendees: [] });
      return;
    }

    const fetchDetails = async () => {
      // Reset state
      setThreadMessages([]);
      setMeetingDetails(null);
      setThreadContext({ steps: [], requests: [], attendees: [] });

      // === SCENARIO A: THREAD ===
      if (selectedEvent.type === "thread") {
        // Extract thread_id from selectedEvent.id (format: "thread-{thread_id}")
        const threadId = selectedEvent.id.replace("thread-", "");

        // 1. Fetch Messages
        // Note: thread_messages is not in generated types, so we use type assertion
        type UntypedSupabaseMessages = {
          from: (table: string) => {
            select: (columns: string) => {
              eq: (column: string, value: string) => {
                order: (
                  column: string,
                  options: { ascending: boolean }
                ) => Promise<{
                  data: ThreadMessage[] | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
        const untypedSupabaseMessages = supabase as unknown as UntypedSupabaseMessages;

        const { data: msgs, error: msgsError } = await untypedSupabaseMessages
          .from("thread_messages")
          .select("*")
          .eq("thread_id", threadId)
          .order("sent_date", { ascending: true });

        if (msgsError) {
          console.error("Error fetching thread messages:", msgsError);
        } else {
          setThreadMessages(msgs || []);
        }

        // 2. Fetch Linked Context (Next Steps)
        const { data: steps, error: stepsError } = await supabase
          .from("next_steps")
          .select("*")
          .eq("thread_id", threadId);

        if (stepsError) {
          console.error("Error fetching thread next steps:", stepsError);
        } else {
          setThreadContext((prev) => ({
            ...prev,
            steps: (steps as NextStep[]) || [],
          }));
        }
      }
      // === SCENARIO B: MEETING ===
      else if (selectedEvent.type === "meeting") {
        // Extract meeting_id from selectedEvent.id (format: "meeting-{meeting_id}")
        const meetingId = selectedEvent.id.replace("meeting-", "");

        // 1. Fetch Meeting Details
        const { data: meeting, error: meetingError } = await supabase
          .from("meetings")
          .select("*")
          .eq("id", parseInt(meetingId, 10))
          .single();

        if (meetingError) {
          console.error("Error fetching meeting details:", meetingError);
        } else {
          setMeetingDetails(meeting as Meeting);
        }

        // 2. Fetch Attendees (via meeting_attendees -> customers)
        // Note: meeting_attendees is not in generated types, so we use type assertion
        type UntypedSupabaseAttendees = {
          from: (table: string) => {
            select: (columns: string) => {
              eq: (
                column: string,
                value: number
              ) => Promise<{
                data: Array<{
                  customer: {
                    first_name: string | null;
                    last_name: string | null;
                    email: string | null;
                  } | null;
                }> | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
        const untypedSupabaseAttendees = supabase as unknown as UntypedSupabaseAttendees;

        const { data: attendeesData, error: attendeesError } = await untypedSupabaseAttendees
          .from("meeting_attendees")
          .select(
            `
            customer:customers!inner (
              first_name,
              last_name,
              email
            )
          `
          )
          .eq("meeting_id", parseInt(meetingId, 10));

        if (attendeesError) {
          console.error("Error fetching meeting attendees:", attendeesError);
        } else {
          const attendeeList =
            attendeesData
              ?.map((a: { customer: { email: string | null } | null }) => a.customer?.email)
              .filter((email): email is string => email !== null && email !== undefined) || [];
          setThreadContext((prev) => ({
            ...prev,
            attendees: attendeeList,
          }));
        }

        // 3. Fetch Context (Steps linked to Meeting)
        // Note: meeting_id in next_steps is a string, but meetings.id is a number
        const { data: steps, error: stepsError } = await supabase
          .from("next_steps")
          .select("*")
          .eq("meeting_id", meetingId);

        if (stepsError) {
          console.error("Error fetching meeting next steps:", stepsError);
        } else {
          setThreadContext((prev) => ({
            ...prev,
            steps: (steps as NextStep[]) || [],
          }));
        }
      }
    };

    fetchDetails();
  }, [selectedEvent, supabase]);

  // Reset logo error when company changes
  useEffect(() => {
    setLogoError(false);
  }, [company?.domain_name]);

  // Helper function to get initials from name
  const getInitials = (name: string | null): string => {
    if (!name) return "?";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Helper function to format meeting date
  const formatMeetingDate = (dateString: string | null): string => {
    if (!dateString) return "Date TBD";
    try {
    const date = new Date(dateString);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "Date TBD";
    }
  };

  // Helper function to get platform from meeting
  const getMeetingPlatform = (meeting: Meeting | null): string => {
    if (!meeting) return "Google Meet";
    if (meeting?.meeting_url) {
      const url = meeting.meeting_url.toLowerCase();
      if (url.includes("zoom")) return "Zoom";
      if (url.includes("teams") || url.includes("microsoft")) return "Microsoft Teams";
      if (url.includes("meet") || url.includes("google")) return "Google Meet";
      return "Video Call";
    }
    if (meeting?.hangout_link) return "Google Meet";
    if (meeting?.location) {
      const location = meeting.location.toLowerCase();
      if (location.includes("zoom")) return "Zoom";
      if (location.includes("teams")) return "Microsoft Teams";
      if (location.includes("meet")) return "Google Meet";
      return meeting.location;
    }
    return "Google Meet"; // Default fallback
  };

  // Helper function to map next step status to NextStepCard status
  const mapStepStatus = (status: string | null | undefined): "todo" | "in_progress" | "done" => {
    if (!status) return "todo";
    const statusLower = status.toLowerCase();
    if (statusLower === "in_progress" || statusLower === "in-progress") return "in_progress";
    if (statusLower === "done" || statusLower === "completed") return "done";
    return "todo";
  };

  // Helper function to format priority for contact name
  const formatPriority = (priority: string | null | undefined): string => {
    if (!priority) return "Priority: Medium";
    return `Priority: ${priority.charAt(0).toUpperCase() + priority.slice(1)}`;
  };

  // Handler to update task status in database
  const handleStatusUpdate = async (
    stepId: string,
    newStatus: "todo" | "in_progress" | "done"
  ) => {
    // Store previous state for potential revert
    const previousTasks = [...allTasks];
    const previousNextStep = nextStep;

    // 1. Optimistic Update (Update UI immediately)
    setAllTasks((prevTasks) =>
      prevTasks.map((task) =>
        task.step_id === stepId ? { ...task, status: newStatus } : task
      )
    );

    // Also update the widget if it's the same step
    setNextStep((prevStep) =>
      prevStep && prevStep.step_id === stepId
        ? { ...prevStep, status: newStatus }
        : prevStep
    );

    // 2. Database Update
    const { error } = await supabase
      .from("next_steps")
      .update({ status: newStatus })
      .eq("step_id", stepId);

    if (error) {
      console.error("Error updating status:", error);
      // Revert optimistic update on error
      setAllTasks(previousTasks);
      setNextStep(previousNextStep);
    }
  };

  // Helper function to get color for customer avatar
  const getCustomerColor = (index: number): string => {
    const colors = [
      "bg-indigo-600",
      "bg-orange-400",
      "bg-blue-500",
      "bg-gray-500",
      "bg-purple-500",
      "bg-green-500",
    ];
    return colors[index % colors.length];
  };

  // Handle AI summary generation
  const handleGenerateProfile = async () => {
    if (!company) return;
    
    setIsGenerating(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const result = await generateCompanyInsights(company.company_id, company.domain_name);
      
      if (!result.success) {
        setError(result.error || "Failed to generate insights");
    } else {
        setSuccessMessage("Profile generation started! Please refresh the page in a few moments to see the results.");
      }
    } catch (err) {
      console.error("Error generating insights:", err);
      setError("An unexpected error occurred");
    } finally {
      setIsGenerating(false);
    }
  };

  const renderDashboard = () => (
    <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-fr">
        <Card
          noPadding
          className="md:col-span-2 relative flex flex-col cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setIsSummaryOpen(true)}
        >
          <div className="p-5 h-full flex flex-col">
            <div className="flex items-center gap-2.5 mb-3">
              <Sparkles className="w-5 h-5 text-yellow-500 fill-yellow-500/20" />
              <h3 className="font-bold text-gray-900 text-base">Summary</h3>
            </div>
            <p className="text-gray-700 text-[15px] leading-7 font-medium line-clamp-4">
              {insights.summary ||
                "No summary available. AI insights are being generated."}
            </p>
          </div>
        </Card>

        <Card noPadding className="flex flex-col h-full">
          <div className="p-5 h-full flex flex-col">
            <div className="flex justify-between items-start mb-6">
              <h3 className="font-bold text-gray-900 text-base">LinkedIn</h3>
              <Linkedin className="w-6 h-6 text-[#0A66C2]" />
            </div>
            <div className="mt-auto mb-2">
              <div className="text-lg font-bold text-gray-900 mb-1">
                {company?.company_name || "Company"}
              </div>
              {insights.linkedin_url ? (
                <a
                  href={insights.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center text-sm font-semibold text-gray-500 hover:text-[#0A66C2] transition-colors"
                >
                  View Company Profile{" "}
                  <span className="ml-1 group-hover:translate-x-0.5 transition-transform">
                    →
                  </span>
                </a>
              ) : (
                <span className="text-sm text-gray-400">No LinkedIn profile</span>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-fr">
        <div className="h-full">
          <UpcomingMeetingCard
            title={nextMeeting?.title || "No upcoming meetings"}
            date={formatMeetingDate(nextMeeting?.start_time ?? null)}
            platform={getMeetingPlatform(nextMeeting)}
          />
        </div>
        <div
          className="h-full cursor-pointer"
          onClick={() => setActiveTab("tasks")}
        >
          {nextStep ? (
            <NextStepCard
              variant="compact"
              status={mapStepStatus(nextStep.status)}
              companyName={nextStep.owner || company?.company_name || "Company"}
              contactName={formatPriority(nextStep.priority)}
              description={nextStep.description}
              className="h-full"
            />
          ) : (
          <NextStepCard
              variant="compact"
              status="todo"
              companyName={company?.company_name || "Company"}
              contactName="No active next steps"
              description="No next steps have been created yet."
              className="h-full"
            />
          )}
        </div>
        <div className="h-full">
          <FeedbackRequestCard
            variant="compact"
            title="Automated invoices"
            context="Feature Request"
            date="2 days ago"
            status="open"
            className="h-full"
          />
        </div>
      </div>

      <div className="pt-4 pb-12">
        <div
          className="flex items-center gap-2 mb-4 group cursor-pointer"
          onClick={() => setActiveTab("timeline")}
        >
          <h3 className="font-bold text-gray-900 text-lg">Activity</h3>
          <span className="text-gray-400 group-hover:translate-x-1 transition-transform">›</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <div className="space-y-4">
            <CompactActivityRow
              icon={Heart}
              userName="Michael Chang"
              action="attended an"
              target="in-person meeting"
              time="6 hours ago"
            />
            <CompactActivityRow
              icon={Calendar}
              userName="Sarah Johnson"
              action="attended an"
              target="event"
              time="2 days ago"
            />
            <CompactActivityRow
              icon={Phone}
              iconColor="text-green-600"
              userName="Michael Chang"
              action="made an"
              target="outbound phone call"
              time="4 days ago"
            />
            <CompactActivityRow
              icon={Mail}
              userName="System"
              action="sent an"
              target="automated email sequence"
              time="5 days ago"
              isLast
            />
          </div>
        </div>
      </div>
            </div>
  );

  const renderTimeline = () => (
    <div className="space-y-6 pb-12 animate-in slide-in-from-right-8 fade-in duration-500">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-xl font-bold text-gray-900">Interaction History</h2>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search events..."
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          </div>
          <Button variant="outline" size="icon" className="border-gray-200">
            <Filter className="w-4 h-4 text-gray-500" />
          </Button>
          <Button variant="outline" size="icon" className="border-gray-200">
            <ArrowDownWideNarrow className="w-4 h-4 text-gray-500" />
          </Button>
            </div>
      </div>

      <div className="relative pl-4 space-y-10 border-l border-gray-200 ml-3">
        {timelineEvents.length > 0 ? (
          timelineEvents.map((event) => {
            const eventDate = new Date(event.date);
            const formattedDate = eventDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: eventDate.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
            });
            const formattedTime = eventDate.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div key={event.id} className="relative pl-8">
                <div
                  className={`absolute -left-[21px] top-6 w-3 h-3 rounded-full border-2 border-white ring-1 ring-gray-100 ${
                    event.type === "meeting" ? "bg-purple-500" : "bg-blue-500"
                  }`}
                />
                <span className="block text-sm font-bold text-gray-900 mb-3">
                  {formattedDate}, {formattedTime}
                </span>
                <div
                  onClick={() =>
                    setSelectedEvent({ id: event.id, type: event.type })
                  }
                  className="cursor-pointer hover:bg-gray-50 rounded-lg transition-colors p-2 -ml-2"
                >
                  <TimelineCard
                    type={event.type}
                    title={event.title}
                    date={formattedTime}
                    summary={event.summary}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
            No interaction history found
            </div>
        )}
      </div>
    </div>
  );

  const renderTasks = () => (
    <div className="space-y-6 pb-12 animate-in slide-in-from-right-8 fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Tasks</h2>
          <p className="text-sm text-gray-500 mt-1">Manage action items.</p>
        </div>
        <Button
          variant="primary"
          className="bg-gray-900 text-white hover:bg-gray-800 shadow-sm"
        >
          + New Task
        </Button>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {allTasks.length > 0 ? (
          allTasks.map((task) => (
            <NextStepCard
              key={task.step_id}
              status={mapStepStatus(task.status)}
              companyName={task.owner || company?.company_name || "Unknown Owner"}
              contactName={formatPriority(task.priority)}
              description={task.description}
              className="h-full"
              onStatusChange={(newStatus) => handleStatusUpdate(task.step_id, newStatus)}
            />
          ))
        ) : (
          <div className="col-span-full text-center py-12 text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
            No tasks found for this company.
          </div>
        )}
      </div>
    </div>
  );

  const renderRequests = () => (
    <div className="space-y-6 pb-12 animate-in slide-in-from-right-8 fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
            <div>
          <h2 className="text-xl font-bold text-gray-900">Requests & Feedback</h2>
          <p className="text-sm text-gray-500 mt-1">Track feature requests.</p>
        </div>
        <Button
          variant="primary"
          className="bg-gray-900 text-white hover:bg-gray-800 shadow-sm"
        >
          + Log Request
        </Button>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <FeedbackRequestCard
          title="Automated invoices via API"
          context="Feature Request"
          date="2 days ago"
          status="open"
          voteCount={12}
          description="Customer wants to pull PDF invoices directly."
        />
        <FeedbackRequestCard
          title="Dark Mode Support"
          context="UX Enhancement"
          date="3 weeks ago"
          status="completed"
          voteCount={45}
          description="Engineering team requested dark mode."
        />
      </div>
    </div>
  );

  // Render Event Detail Modal
  const renderEventModal = () => {
    if (!selectedEvent) return null;

    const event = timelineEvents.find((e) => e.id === selectedEvent.id);
    if (!event) return null;

    // Get unique attendees - for threads from messages, for meetings from context
    const uniqueAttendees =
      selectedEvent.type === "thread"
        ? Array.from(
            new Set(
              threadMessages
                .flatMap((msg) => [
                  msg.from_address,
                  ...(msg.to_addresses || []),
                  ...(msg.cc_addresses || []),
                ])
                .filter((email): email is string => email !== null && email !== undefined)
            )
          )
        : threadContext.attendees;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={() => setSelectedEvent(null)}
      >
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* LEFT: Content (Thread Messages or Meeting Details) */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-gray-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-start">
              <h2 className="text-xl font-bold text-gray-900 truncate pr-4">
                {event.title || (selectedEvent.type === "thread" ? "Conversation" : "Meeting")}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedEvent(null)}
                className="shrink-0"
              >
                <span className="sr-only">Close</span>
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/50">
              {selectedEvent.type === "thread" ? (
                // Thread: Show Message History
                threadMessages.length > 0 ? (
                  threadMessages.map((msg) => {
                    const senderInitial = msg.from_address
                      ? msg.from_address.charAt(0).toUpperCase()
                      : "?";
                    return (
                      <div key={msg.message_id} className="flex gap-4 group">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold shrink-0 text-sm">
                          {senderInitial}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between mb-1">
                            <span className="font-semibold text-gray-900">
                              {msg.from_address || "Unknown"}
                            </span>
                            <span className="text-xs text-gray-500">
                              {msg.sent_date
                                ? new Date(msg.sent_date).toLocaleString()
                                : "Date unknown"}
                            </span>
                          </div>
                          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm text-sm text-gray-800 prose max-w-none">
                            {msg.body_html ? (
                              <div
                                dangerouslySetInnerHTML={{ __html: msg.body_html }}
                                className="prose prose-sm max-w-none"
                              />
                            ) : (
                              <div className="whitespace-pre-wrap">{msg.body_text || "No content"}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 text-gray-500">Loading messages...</div>
                )
              ) : (
                // Meeting: Show Meeting Details
                meetingDetails ? (
                  <div className="space-y-6">
                    <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Meeting Details</h3>
                      <div className="space-y-4">
                        <div>
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Date & Time
                          </span>
                          <p className="text-base text-gray-900 mt-1">
                            {meetingDetails.start_time
                              ? formatMeetingDate(meetingDetails.start_time)
                              : "Not specified"}
                          </p>
                        </div>
                        {meetingDetails.location && (
                          <div>
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Location
                            </span>
                            <p className="text-base text-gray-900 mt-1">{meetingDetails.location}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Platform
                          </span>
                          <p className="text-base text-gray-900 mt-1">
                            {getMeetingPlatform(meetingDetails)}
                          </p>
                        </div>
                        {meetingDetails.description && (
                          <div>
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Description
                            </span>
                            <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                              {meetingDetails.description}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">Loading meeting details...</div>
                )
              )}
            </div>
          </div>

          {/* RIGHT: Context Sidebar */}
          <div className="w-[320px] bg-gray-50 p-6 overflow-y-auto shrink-0 space-y-8">
            {/* Summary */}
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                Summary
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                {event.summary || "No summary available."}
              </p>
            </div>

            {/* Next Steps - Using NextStepCard Components */}
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                Extracted Steps
              </h3>
              {threadContext.steps.length > 0 ? (
                <div className="space-y-3">
                  {threadContext.steps.map((step) => (
                    <div
                      key={step.step_id}
                      onClick={() => {
                        setSelectedEvent(null); // Close Modal
                        setActiveTab("tasks"); // Switch Tab
                      }}
                      className="cursor-pointer"
                    >
                      <NextStepCard
                        variant="compact"
                        status={mapStepStatus(step.status)}
                        companyName={step.owner || company?.company_name || "Owner"}
                        contactName="Linked Task"
                        description={step.description}
                        className="mb-0 hover:ring-2 hover:ring-blue-500 transition-all"
                      />
                    </div>
                  ))}
            </div>
          ) : (
                <div className="text-xs text-gray-400 italic">No steps detected.</div>
          )}
      </div>

            {/* Attendees */}
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                Attendees
              </h3>
              {uniqueAttendees.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {uniqueAttendees.map((email) => (
                    <span
                      key={email}
                      className="px-2 py-1 bg-white border border-gray-200 rounded-md text-xs text-gray-600 truncate max-w-[140px]"
                      title={email}
                    >
                      {email}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-400 italic">No attendees found.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full font-sans text-gray-900 bg-gray-50">
      <div className="flex-1 flex w-full">
        <div className="hidden lg:block w-[360px] shrink-0 p-8 border-r border-transparent overflow-hidden">
          <div className="pt-[85px]">
            {loading ? (
              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm mb-6">
                <div className="animate-pulse">
                  <div className="w-14 h-14 bg-gray-200 rounded-lg mb-3" />
                  <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ) : company ? (
              <>
                <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm mb-6">
                  <div className="mb-4">
                    {/* LOGO LOGIC */}
                    {company.domain_name && !logoError ? (
                      <img
                        src={`https://logo.clearbit.com/${company.domain_name}`}
                        alt={`${company.company_name || "Company"} logo`}
                        className="w-14 h-14 rounded-lg object-contain mb-3 border border-gray-100 shadow-sm"
                        onError={() => setLogoError(true)}
                      />
                    ) : (
                      <div className="w-14 h-14 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xl font-bold mb-3 shadow-sm">
                        {company.company_name?.charAt(0) || "A"}
                      </div>
                    )}
                    {/* Name & Title */}
                    <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                      {company.company_name || "Company"}
                    </h1>
                    <p className="text-sm text-gray-500 font-medium">
                      {insights.one_liner || "Global EV Fuse Manufacturer"}
                    </p>
                  </div>
                  <div className="space-y-3 mb-5">
                    {company.domain_name && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Globe className="w-4 h-4 text-gray-400" />
                        <a
                          href={`https://${company.domain_name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-blue-600 hover:underline"
                        >
                          {company.domain_name}
                        </a>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {!insights.one_liner ? (
                        <Button
                          variant="outline"
                          onClick={handleGenerateProfile}
                          disabled={isGenerating}
                          className="flex-1 bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700 font-medium disabled:opacity-50"
                        >
                          <Sparkles className="w-4 h-4 mr-2" />
                          {isGenerating ? "Generating..." : "Generate Profile"}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="flex-1 bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700 font-medium"
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copy Info
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="bg-gray-50 border-gray-200 hover:bg-gray-100"
                      >
                        <RefreshCw className="w-4 h-4 text-gray-600" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="bg-gray-50 border-gray-200 hover:bg-gray-100"
                      >
                        <MoreHorizontal className="w-4 h-4 text-gray-600" />
                      </Button>
                    </div>
                    {successMessage && (
                      <p className="text-xs text-green-600 text-left">{successMessage}</p>
                    )}
                    {error && (
                      <p className="text-xs text-red-500 text-left">{error}</p>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h3 className="text-sm font-bold text-gray-900">Customers</h3>
                    <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded-full">
                      {customers.length} Active
                    </span>
                  </div>
                  <div className="space-y-2">
                    {customers.length > 0 ? (
                      customers.map((customer, index) => {
                        const initials = getInitials(customer.full_name);
                        const color = getCustomerColor(index);
                        return (
                          <div
                            key={customer.customer_id}
                            className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:shadow-sm transition-shadow cursor-pointer"
                          >
                            <div
                              className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-white text-xs font-bold shrink-0`}
                            >
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">
                                {customer.full_name || customer.email || "Unknown"}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm text-gray-500 text-center py-4">
                        No customers found
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm mb-6">
                <p className="text-sm text-gray-500">Company not found</p>
              </div>
            )}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-8 h-full">
          <div className="space-y-6 max-w-5xl">
            <div className="flex gap-8 border-b border-gray-200 mb-6">
              {["Highlights", "Timeline", "Tasks", "Requests"].map((tab) => {
                const key = tab.toLowerCase() as "highlights" | "timeline" | "tasks" | "requests";
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(key)}
                    className={`pb-3 text-sm font-bold transition-colors border-b-2 ${
                      activeTab === key
                        ? "border-gray-900 text-gray-900"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>

            {activeTab === "highlights" && renderDashboard()}
            {activeTab === "timeline" && renderTimeline()}
            {activeTab === "tasks" && renderTasks()}
            {activeTab === "requests" && renderRequests()}
          </div>
        </main>
      </div>

      {/* Summary Modal */}
      {isSummaryOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setIsSummaryOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-500" />
                <h3 className="text-lg font-bold text-gray-900">AI Summary</h3>
              </div>
              <button
                onClick={() => setIsSummaryOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">Close</span>
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-700 text-base leading-relaxed whitespace-pre-wrap">
                {insights?.summary || "No summary available."}
              </p>
            </div>
            <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end">
              <Button variant="outline" onClick={() => setIsSummaryOpen(false)}>
                Close
              </Button>
            </div>
          </div>
          </div>
        )}

      {/* Event Detail Modal */}
      {renderEventModal()}
    </div>
  );
}


