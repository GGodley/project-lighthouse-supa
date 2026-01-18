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
  Calendar,
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
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";

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

// Extend Meeting type to include location and transcripts fields (exist in DB but not in generated types)
type Meeting = Database["public"]["Tables"]["meetings"]["Row"] & {
  location?: string | null;
  transcripts?: string | null;
  meeting_llm_summary?: string | null;
};

// Interface for parsed meeting LLM summary
interface MeetingLLMSummary {
  sentiment?: string;
  sentiment_score?: number;
  action_items?: Array<{
    text: string;
    owner: string | null;
    due_date: string | null;
  }>;
  feature_requests?: Array<{
    title: string;
    urgency: string;
    use_case: string;
    customer_impact: string;
    urgency_signals: string;
    customer_description: string;
  }>;
  discussion_points?: string;
}

type NextStep = Database["public"]["Tables"]["next_steps"]["Row"];

// Structure of a single request inside the JSONB column
interface LLMRequestItem {
  title: string;
  urgency?: 'Low' | 'Medium' | 'High';
  customer_description?: string; // Sometimes called this
  description?: string;          // Sometimes called this
  use_case?: string;
  customer_impact?: string;
}

// Structure of the Thread Query Result
interface ThreadQueryRow {
  company_id: string;
  threads: {
    thread_id: string;
    subject: string | null;
    last_message_date: string | null;
    llm_summary: {
      feature_requests?: LLMRequestItem[];
    } | null; // llm_summary can be null or any JSON
  };
}

// Structure of the Meeting Query Result
interface MeetingQueryRow {
  id: string;
  title: string | null;
  start_time: string | null;
  meeting_llm_summary: {
    feature_requests?: LLMRequestItem[];
  } | null;
  meeting_attendees: {
    customer_id: string;
  }[];
}

interface FeatureRequestItem {
  id: string; // Unique ID (generated)
  title: string;
  urgency: 'Low' | 'Medium' | 'High';
  customer_description: string;
  use_case?: string;
  customer_impact?: string;
  sourceType: 'thread' | 'meeting';
  sourceTitle: string;
  date: string; // ISO string
}


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
  const [recentActivities, setRecentActivities] = useState<MeetingWithAttendees[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<{
    id: string;
    type: "thread" | "meeting";
  } | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [meetingDetails, setMeetingDetails] = useState<Meeting | null>(null);
  const [meetingTranscript, setMeetingTranscript] = useState<string>("");
  const [meetingLLMSummary, setMeetingLLMSummary] = useState<MeetingLLMSummary | null>(null);
  const [threadContext, setThreadContext] = useState<{
    steps: NextStep[];
    requests: unknown[];
    attendees: string[];
  }>({ steps: [], requests: [], attendees: [] });
  const [featureRequests, setFeatureRequests] = useState<FeatureRequestItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [typeFilter, setTypeFilter] = useState<'all' | 'meeting' | 'thread'>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
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

              // Fetch recent past meetings for Activity section (last 4 meetings)
              const { data: recentMeetingsData, error: recentMeetingsError } = await supabase
                .from("meetings")
                .select(
                  `
                  *,
                  meeting_attendees!inner(customer_id)
                `
                )
                .in("meeting_attendees.customer_id", customerIds)
                .lt("start_time", new Date().toISOString()) // Past meetings only
                .order("start_time", { ascending: false })
                .limit(4);

              if (recentMeetingsError) {
                console.error("Error fetching recent meetings:", recentMeetingsError);
                setRecentActivities([]);
              } else if (recentMeetingsData) {
                // Transform the data to match MeetingWithAttendees type
                // The query returns meetings with meeting_attendees as an array
                const transformedMeetings: MeetingWithAttendees[] = recentMeetingsData.map((meeting) => {
                  const baseMeeting = meeting as Meeting;
                  // Extract meeting_attendees - handle the response structure
                  const meetingData = meeting as {
                    meeting_attendees?: { customer_id: string }[] | { error: true } | string;
                  };
                  let attendees: { customer_id: string }[] = [];
                  if (Array.isArray(meetingData.meeting_attendees)) {
                    attendees = meetingData.meeting_attendees;
                  }
                  return {
                    ...baseMeeting,
                    meeting_attendees: attendees,
                  };
                });
                setRecentActivities(transformedMeetings);
              } else {
                setRecentActivities([]);
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

              // Fetch Feature Requests from Threads and Meetings
              // 1. Fetch Thread Requests
              const { data: threadReqs, error: threadReqsError } = await untypedSupabase
                .from("thread_company_link")
                .select(
                  `
                  company_id,
                  threads!inner (
                    thread_id,
                    subject,
                    last_message_date,
                    llm_summary
                  )
                `
                )
                .eq("company_id", companyId);

              // 2. Fetch Meeting Requests
              const { data: meetingReqs, error: meetingReqsError } = await supabase
                .from("meetings")
                .select(
                  `
                  id,
                  title,
                  start_time,
                  meeting_llm_summary,
                  meeting_attendees!inner(customer_id)
                `
                )
                .in("meeting_attendees.customer_id", customerIds);

              if (threadReqsError) {
                console.error("Error fetching thread requests:", threadReqsError);
              }
              if (meetingReqsError) {
                console.error("Error fetching meeting requests:", meetingReqsError);
              }

              // 3. Transform & Merge
              const allRequests: FeatureRequestItem[] = [];

              // Process Threads
              // Cast data to known type: (threadReqs as unknown as ThreadQueryRow[])
              (threadReqs as unknown as ThreadQueryRow[])?.forEach((row) => {
                // Use optional chaining carefully
                const summary = row.threads.llm_summary; 
                // Need to cast summary to expected shape if Supabase returns 'any' for JSONB
                const requests = (summary as { feature_requests?: LLMRequestItem[] })?.feature_requests || [];
                
                requests.forEach((req, idx) => {
                  allRequests.push({
                    id: `thread-${row.threads.thread_id}-${idx}`,
                    title: req.title || 'Untitled Request',
                    urgency: req.urgency || 'Low',
                    customer_description: req.customer_description || req.description || '',
                    use_case: req.use_case,
                    customer_impact: req.customer_impact,
                    sourceType: 'thread',
                    sourceTitle: row.threads.subject || 'Email Thread',
                    date: row.threads.last_message_date || new Date().toISOString()
                  });
                });
              });

              // Process Meetings
              (meetingReqs as unknown as MeetingQueryRow[])?.forEach((row) => {
                const summary = row.meeting_llm_summary;
                const requests = (summary as { feature_requests?: LLMRequestItem[] })?.feature_requests || [];

                requests.forEach((req, idx) => {
                  allRequests.push({
                    id: `meeting-${row.id}-${idx}`,
                    title: req.title || 'Untitled Request',
                    urgency: req.urgency || 'Low',
                    customer_description: req.customer_description || req.description || '',
                    use_case: req.use_case,
                    customer_impact: req.customer_impact,
                    sourceType: 'meeting',
                    sourceTitle: row.title || 'Meeting',
                    date: row.start_time || new Date().toISOString()
                  });
                });
              });

              // Sort by Urgency (High -> Medium -> Low) then Date
              const urgencyOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
              allRequests.sort((a, b) => {
                const diff = (urgencyOrder[b.urgency] || 0) - (urgencyOrder[a.urgency] || 0);
                if (diff !== 0) return diff;
                return new Date(b.date).getTime() - new Date(a.date).getTime();
              });

              setFeatureRequests(allRequests);
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
      setMeetingTranscript("");
      setMeetingLLMSummary(null);
      setThreadContext({ steps: [], requests: [], attendees: [] });
      return;
    }

    const fetchDetails = async () => {
      // Reset state
      setThreadMessages([]);
      setMeetingDetails(null);
      setMeetingTranscript("");
      setMeetingLLMSummary(null);
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

        // 1. Fetch Meeting Details (including transcript)
        const { data: meeting, error: meetingError } = await supabase
          .from("meetings")
          .select("*")
          .eq("id", parseInt(meetingId, 10))
          .single();

        if (meetingError) {
          console.error("Error fetching meeting details:", meetingError);
        } else {
          const meetingData = meeting as Meeting;
          setMeetingDetails(meetingData);
          // Extract transcript from meeting data (using transcripts plural field)
          setMeetingTranscript(meetingData?.transcripts || meetingData?.transcript || "");
          
          // Parse meeting_llm_summary if it exists
          if (meetingData?.meeting_llm_summary) {
            try {
              const parsedSummary = typeof meetingData.meeting_llm_summary === 'string'
                ? JSON.parse(meetingData.meeting_llm_summary)
                : meetingData.meeting_llm_summary;
              setMeetingLLMSummary(parsedSummary as MeetingLLMSummary);
            } catch (error) {
              console.error("Error parsing meeting_llm_summary:", error);
              setMeetingLLMSummary(null);
            }
    } else {
            setMeetingLLMSummary(null);
          }
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

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.filter-dropdown') && !target.closest('.sort-dropdown')) {
        setIsFilterOpen(false);
        setIsSortOpen(false);
      }
    };

    if (isFilterOpen || isSortOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isFilterOpen, isSortOpen]);

  // Helper function to get initials from name
  const getInitials = (name: string | null): string => {
    if (!name) return "?";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Helper function to format relative time (e.g., "2 hours ago", "3 days ago")
  const formatRelativeTime = (dateString: string | null): string => {
    if (!dateString) return "Unknown time";
    
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
    }
    if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
    }
    if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} ${days === 1 ? "day" : "days"} ago`;
    }
    if (diffInSeconds < 2592000) {
      const weeks = Math.floor(diffInSeconds / 604800);
      return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
    }
      return date.toLocaleDateString();
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Summary Widget - Full Width */}
        <div className="col-span-2 border border-gray-200 rounded-xl p-6 cursor-pointer hover:border-gray-300 transition-colors" onClick={() => setIsSummaryOpen(true)}>
          <div className="flex items-center gap-2.5 mb-3">
            <Sparkles className="w-5 h-5 text-yellow-500 fill-yellow-500/20" />
            <h3 className="font-bold text-gray-900 text-base">Summary</h3>
          </div>
          <p className="text-gray-700 text-[15px] leading-7 font-medium line-clamp-4">
            {insights.summary ||
              "No summary available. AI insights are being generated."}
          </p>
        </div>

        {/* LinkedIn Widget */}
        <div className="border border-gray-200 rounded-xl p-6">
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

        {/* Upcoming Meeting Widget */}
        <div className="h-full">
          <UpcomingMeetingCard
            title={nextMeeting?.title || "No upcoming meetings"}
            date={formatMeetingDate(nextMeeting?.start_time ?? null)}
            platform={getMeetingPlatform(nextMeeting)}
          />
        </div>

        {/* Next Steps Widget */}
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

        {/* Feature Request Widget */}
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

      {/* Activity Feed below widgets */}
      <div className="mt-8">
        <div
          className="flex items-center gap-2 mb-4 group cursor-pointer"
          onClick={() => setActiveTab("timeline")}
        >
          <h3 className="font-bold text-gray-900 text-lg">Activity</h3>
          <span className="text-gray-400 group-hover:translate-x-1 transition-transform">›</span>
        </div>
        <div className="space-y-4">
          {recentActivities.length > 0 ? (
            recentActivities.map((meeting, index) => {
              // Get meeting platform for icon color
              const platform = getMeetingPlatform(meeting);
              const iconColor = platform === "Google Meet" 
                ? "text-blue-600" 
                : platform === "Zoom" 
                ? "text-blue-500" 
                : "text-gray-500";
              
              // Get attendee name from customers list or use meeting title
              const attendeeName = customers.find(
                c => meeting.meeting_attendees?.some((ma: { customer_id: string }) => ma.customer_id === c.customer_id)
              )?.full_name || meeting.title || "Team member";
              
              return (
                <CompactActivityRow
                  key={meeting.id}
                  icon={Calendar}
                  iconColor={iconColor}
                  userName={attendeeName}
                  action="attended"
                  target={meeting.title || "a meeting"}
                  time={formatRelativeTime(meeting.start_time)}
                  isLast={index === recentActivities.length - 1}
                />
              );
            })
          ) : (
            <div className="text-center py-8 text-gray-400 text-sm">
              No recent activity found
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderTimeline = () => {
    // Filter and sort timeline events
    const filteredTimeline = timelineEvents
      .filter((item) => {
        // 1. Search Filter
        const searchTarget = `${item.title} ${item.summary}`.toLowerCase();
        const matchesSearch = searchTarget.includes(searchQuery.toLowerCase());

        // 2. Type Filter
        const matchesType = typeFilter === 'all' || item.type === typeFilter;

        return matchesSearch && matchesType;
      })
      .sort((a, b) => {
        // 3. Sort Logic
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      });

    return (
      <div className="space-y-6 pb-12 animate-in slide-in-from-right-8 fade-in duration-500">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-bold text-gray-900">Interaction History</h2>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
              />
            </div>
            <div className="relative filter-dropdown">
              <Button 
                variant="outline" 
                size="icon" 
                className="border-gray-200"
                onClick={() => setIsFilterOpen(!isFilterOpen)}
              >
                <Filter className="w-4 h-4 text-gray-500" />
              </Button>
              {isFilterOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                  <button
                    onClick={() => {
                      setTypeFilter('all');
                      setIsFilterOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                      typeFilter === 'all' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'
                    }`}
                  >
                    All Types
                  </button>
                  <button
                    onClick={() => {
                      setTypeFilter('meeting');
                      setIsFilterOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                      typeFilter === 'meeting' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'
                    }`}
                  >
                    Meetings
                  </button>
                  <button
                    onClick={() => {
                      setTypeFilter('thread');
                      setIsFilterOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                      typeFilter === 'thread' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'
                    }`}
                  >
                    Threads
                  </button>
                </div>
              )}
            </div>
            <div className="relative sort-dropdown">
              <Button 
                variant="outline" 
                size="icon" 
                className="border-gray-200"
                onClick={() => setIsSortOpen(!isSortOpen)}
              >
                <ArrowDownWideNarrow className="w-4 h-4 text-gray-500" />
              </Button>
              {isSortOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                  <button
                    onClick={() => {
                      setSortOrder('desc');
                      setIsSortOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                      sortOrder === 'desc' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'
                    }`}
                  >
                    Newest First
                  </button>
                  <button
                    onClick={() => {
                      setSortOrder('asc');
                      setIsSortOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                      sortOrder === 'asc' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'
                    }`}
                  >
                    Oldest First
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="relative pl-4 space-y-10 border-l border-gray-200 ml-3">
          {filteredTimeline.length > 0 ? (
            filteredTimeline.map((event) => {
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
                    eventDate={event.date}
                    summary={event.summary}
                  />
                </div>
              </div>
            );
          })
          ) : (
            <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
              {timelineEvents.length > 0 
                ? "No events found matching your search" 
                : "No interaction history found"}
            </div>
          )}
        </div>
      </div>
    );
  };

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
          onClick={() => setIsTaskModalOpen(true)}
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
          disabled
        >
          + Log Request
        </Button>
            </div>
      <div className="grid grid-cols-1 gap-6">
        {featureRequests.length > 0 ? (
          featureRequests.map((req) => (
            <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-6 hover:border-gray-300 transition-colors">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-bold text-gray-900">{req.title}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide border ${
                      req.urgency === 'High' ? 'bg-red-50 text-red-700 border-red-100' :
                      req.urgency === 'Medium' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                      'bg-blue-50 text-blue-700 border-blue-100'
                    }`}>
                      {req.urgency}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 flex items-center gap-2">
                    From {req.sourceType === 'meeting' ? '🎥' : '✉️'} <span className="font-medium text-gray-700">{req.sourceTitle}</span> on {new Date(req.date).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="space-y-4 mt-4">
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                  <p className="text-sm text-gray-800 italic">&quot;{req.customer_description}&quot;</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {req.use_case && (
                     <div>
                       <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">Use Case</h4>
                       <p className="text-sm text-gray-700">{req.use_case}</p>
                     </div>
                  )}
                  {req.customer_impact && (
                     <div>
                       <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">Impact</h4>
                       <p className="text-sm text-gray-700">{req.customer_impact}</p>
                     </div>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500">
            No feature requests detected yet.
          </div>
        )}
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
                // Meeting: Show Meeting Transcript
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
                  <div className="bg-white border border-gray-200 rounded-lg p-8 shadow-sm">
                    <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                        <span className="text-purple-600">📝</span>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                          Meeting Transcript
                        </h3>
                        <p className="text-xs text-gray-500">Auto-generated recording text</p>
                      </div>
      </div>

                    <div className="prose max-w-none text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-mono">
                      {meetingTranscript || (
                        <span className="text-gray-400 italic">
                          No transcript available for this meeting.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Context Sidebar */}
          <div className="w-[320px] bg-gray-50 p-6 overflow-y-auto shrink-0 space-y-8">
            {selectedEvent.type === "meeting" && meetingLLMSummary ? (
              <>
                {/* Sentiment */}
                {meetingLLMSummary.sentiment && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                      Sentiment
                    </h3>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          meetingLLMSummary.sentiment === "Positive"
                            ? "bg-green-100 text-green-800"
                            : meetingLLMSummary.sentiment === "Negative"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {meetingLLMSummary.sentiment}
                      </span>
                      {meetingLLMSummary.sentiment_score !== undefined && (
                        <span className="text-xs text-gray-500">
                          Score: {meetingLLMSummary.sentiment_score}
                        </span>
                      )}
        </div>
                  </div>
                )}

                {/* Summary (from discussion_points) */}
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                    Summary
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {meetingLLMSummary.discussion_points || "No summary available."}
                  </p>
                </div>

                {/* Next Steps (from action_items) */}
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                    Action Items
                  </h3>
                  {meetingLLMSummary.action_items && meetingLLMSummary.action_items.length > 0 ? (
                    <div className="space-y-3">
                      {meetingLLMSummary.action_items.map((item, index) => (
                        <NextStepCard
                          key={index}
                          variant="compact"
                          status="todo"
                          companyName={item.owner || company?.company_name || "Unassigned"}
                          contactName="Action Item"
                          description={item.text}
                          className="mb-0"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 italic">No action items found.</div>
                  )}
                </div>

                {/* Feature Requests */}
                {meetingLLMSummary.feature_requests && meetingLLMSummary.feature_requests.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                      Feature Requests
                    </h3>
          <div className="space-y-3">
                      {meetingLLMSummary.feature_requests.map((request, index) => (
                        <FeedbackRequestCard
                          key={index}
                          variant="compact"
                          title={request.title}
                          context={request.urgency}
                          date={meetingDetails?.start_time ? formatMeetingDate(meetingDetails.start_time) : "Recently"}
                          status="open"
                          description={request.customer_description}
                          className="mb-0"
                        />
                      ))}
                </div>
                  </div>
                )}

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
              </>
            ) : (
              <>
                {/* Thread View - Original Logic */}
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
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="flex min-h-screen bg-white">
      <div className="flex-1 flex w-full">
        <aside className="hidden lg:block w-80 border-r border-gray-200 p-6 flex flex-col gap-6 shrink-0 h-screen sticky top-0 overflow-y-auto">
          <div className="pt-[60px]">
            {loading ? (
              <div className="animate-pulse">
                <div className="w-14 h-14 bg-gray-200 rounded-lg mb-3" />
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            ) : company ? (
              <>
                {/* Profile Info (No Card Wrapper) */}
                <div className="mb-4">
                  <div className="w-14 h-14 rounded-lg overflow-hidden mb-3 border border-gray-200 bg-white flex items-center justify-center">
                    {company?.domain_name ? (
                      <img
                        src={`https://unavatar.io/${company.domain_name}`}
                        alt={`${company?.company_name} logo`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Fallback to initials if Unavatar fails
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const fallback = target.parentElement?.querySelector('.logo-fallback') as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div className="logo-fallback w-full h-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold" style={{ display: company?.domain_name ? 'none' : 'flex' }}>
                      {company?.company_name?.charAt(0) || 'C'}
                    </div>
                  </div>

                  <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                    {company?.company_name || "Company"}
                  </h1>
                  <p className="text-sm text-gray-500 font-medium">
                    {insights?.one_liner || "No description available"}
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

                <div className="border-t border-gray-100 my-2" />

                {/* Contact List */}
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
                            className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors cursor-pointer"
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
              <div>
                <p className="text-sm text-gray-500">Company not found</p>
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT PANE - Dashboard Widgets */}
        <div className="flex-1 p-8 overflow-y-auto">
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
        </div>
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

      {/* Create Task Modal */}
      {customers.length > 0 && (
        <CreateTaskModal
          isOpen={isTaskModalOpen}
          onClose={() => setIsTaskModalOpen(false)}
          customerId={customers[0].customer_id}
          onSuccess={() => window.location.reload()}
        />
      )}
    </main>
  );
}


