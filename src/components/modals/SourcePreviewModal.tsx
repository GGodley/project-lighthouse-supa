"use client";

import React, { useState, useEffect } from "react";
import { X, Video, Mail, Calendar, ExternalLink } from "lucide-react";
import { useSupabase } from "@/components/SupabaseProvider";
import { getThreadById } from "@/lib/threads/queries";
import type { Thread, LLMSummary } from "@/lib/types/threads";

interface SourcePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceId: string;
  sourceType: "meeting" | "thread" | "manual";
  companyId?: string | null;
}

interface MeetingData {
  title: string | null;
  start_time: string | null;
  summary: string | null;
  transcript: string | null;
  meeting_uuid_id: string;
}

export function SourcePreviewModal({
  isOpen,
  onClose,
  sourceId,
  sourceType,
  companyId,
}: SourcePreviewModalProps) {
  const [content, setContent] = useState<MeetingData | Thread | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = useSupabase();

  // Fetch data when modal opens or source changes
  useEffect(() => {
    if (!isOpen || !sourceId || sourceType === "manual") {
      setContent(null);
      setError(null);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setContent(null);

      try {
        if (sourceType === "meeting") {
          // Query meetings by meeting_uuid_id (which is what meeting_id in next_steps refers to)
          const { data: meeting, error: meetingError } = await supabase
            .from("meetings")
            .select("title, start_time, summary, transcript, meeting_uuid_id")
            .eq("meeting_uuid_id", sourceId)
            .single();

          if (meetingError) {
            console.error("Error fetching meeting:", meetingError);
            setError("Failed to load meeting details");
          } else if (meeting) {
            setContent(meeting as MeetingData);
          } else {
            setError("Meeting not found");
          }
        } else if (sourceType === "thread") {
          const { data: thread, error: threadError } = await getThreadById(
            supabase,
            sourceId
          );

          if (threadError) {
            console.error("Error fetching thread:", threadError);
            setError("Failed to load thread details");
          } else if (thread) {
            setContent(thread);
          } else {
            setError("Thread not found");
          }
        }
      } catch (err) {
        console.error("Unexpected error:", err);
        setError("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, sourceId, sourceType, supabase]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Format date helper
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "No date available";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  // Get summary text based on source type
  const getSummaryText = (): string => {
    if (sourceType === "manual") {
      return "This task was created manually.";
    }

    if (loading) {
      return "";
    }

    if (error || !content) {
      return error || "No content available";
    }

    if (sourceType === "meeting") {
      const meeting = content as MeetingData;
      // Try to extract summary from JSONB if it's a JSON object
      if (meeting.summary) {
        try {
          const parsed = JSON.parse(meeting.summary);
          if (typeof parsed === "object" && parsed !== null) {
            return (
              parsed.timeline_summary ||
              parsed.problem_statement ||
              parsed.summary ||
              meeting.summary
            );
          }
        } catch {
          // Not JSON, use as-is
        }
      }
      return meeting.summary || "No summary available";
    } else if (sourceType === "thread") {
      const thread = content as Thread;
      if (thread.llm_summary) {
        if (typeof thread.llm_summary === "object" && "error" in thread.llm_summary) {
          return thread.snippet || "No summary available";
        }
        const summary = thread.llm_summary as LLMSummary;
        return (
          summary.timeline_summary ||
          summary.problem_statement ||
          summary.summary ||
          thread.snippet ||
          "No summary available"
        );
      }
      return thread.snippet || "No summary available";
    }

    return "No content available";
  };

  // Get title based on source type
  const getTitle = (): string => {
    if (sourceType === "manual") {
      return "Manual Task";
    }

    if (loading || error || !content) {
      return sourceType === "meeting" ? "Meeting" : "Thread";
    }

    if (sourceType === "meeting") {
      const meeting = content as MeetingData;
      return meeting.title || "Untitled Meeting";
    } else if (sourceType === "thread") {
      const thread = content as Thread;
      return thread.subject || "No Subject";
    }

    return "Source";
  };

  // Get date based on source type
  const getDate = (): string => {
    if (sourceType === "manual" || !content) {
      return "";
    }

    if (sourceType === "meeting") {
      const meeting = content as MeetingData;
      return formatDate(meeting.start_time);
    } else if (sourceType === "thread") {
      const thread = content as Thread;
      return formatDate(thread.last_message_date);
    }

    return "";
  };

  // Get view full page URL
  const getViewFullPageUrl = (): string | null => {
    if (sourceType === "manual" || !companyId) {
      return null;
    }

    if (sourceType === "thread") {
      return `/dashboard/customer-threads/${companyId}?thread=${sourceId}`;
    } else if (sourceType === "meeting") {
      // For meetings, we might need to find the meeting by meeting_uuid_id first
      // For now, just link to the company page
      return `/dashboard/customer-threads/${companyId}`;
    }

    return null;
  };

  const viewFullPageUrl = getViewFullPageUrl();
  const Icon = sourceType === "meeting" ? Video : sourceType === "thread" ? Mail : Calendar;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" />

      {/* Modal */}
      <div className="glass-modal w-full max-w-2xl max-h-[90vh] relative z-10 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50">
              <Icon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {loading ? "Loading..." : getTitle()}
              </h2>
              {getDate() && (
                <p className="text-sm text-gray-500 mt-1">{getDate()}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100/50 transition-colors text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-gray-500">Loading source content...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-red-600">{error}</div>
            </div>
          ) : sourceType === "manual" ? (
            <div className="py-12">
              <p className="text-gray-700 leading-relaxed text-center">
                This task was created manually.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Summary</h3>
                <div className="prose prose-sm max-w-none">
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {getSummaryText()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200/50">
          <div></div>
          <div className="flex items-center gap-3">
            {viewFullPageUrl && (
              <a
                href={viewFullPageUrl}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                View Full Page
              </a>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-sm font-medium rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

