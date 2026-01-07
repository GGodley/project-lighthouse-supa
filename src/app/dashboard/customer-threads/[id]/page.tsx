/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect } from "react";
import {
  Copy,
  RefreshCw,
  MoreHorizontal,
  Sparkles,
  Linkedin,
  MapPin,
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

export default function CompanyDetailDashboard({ params }: PageProps) {
  const [activeTab, setActiveTab] = useState<"highlights" | "timeline" | "tasks" | "requests">(
    "highlights",
  );
  const [company, setCompany] = useState<Company | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [insights, setInsights] = useState<AIInsights>({});
  const [loading, setLoading] = useState(true);
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

  // Helper function to get initials from name
  const getInitials = (name: string | null): string => {
    if (!name) return "?";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
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

  const renderDashboard = () => (
    <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-fr">
        <Card noPadding className="md:col-span-2 relative flex flex-col">
          <div className="p-5 h-full flex flex-col">
            <div className="flex items-center gap-2.5 mb-3">
              <Sparkles className="w-5 h-5 text-yellow-500 fill-yellow-500/20" />
              <h3 className="font-bold text-gray-900 text-base">Summary</h3>
            </div>
            <p className="text-gray-700 text-[15px] leading-7 font-medium">
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
          <UpcomingMeetingCard title="Demo Call" date="Nov 29, 10:40 AM" platform="Google Meet" />
        </div>
        <div className="h-full">
          <NextStepCard
            variant="compact"
            status="todo"
            companyName={company?.company_name || "Company"}
            contactName={customers[0]?.full_name || "Contact"}
            description="Release PDF order for finalized quantities."
            className="h-full"
          />
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
        <div className="relative pl-8">
          <div className="absolute -left-[21px] top-6 w-3 h-3 rounded-full bg-blue-500 border-2 border-white ring-1 ring-gray-100" />
          <span className="block text-sm font-bold text-gray-900 mb-3">Today, 2:00 PM</span>
          <TimelineCard
            type="thread"
            title="Re: Fuse Order AIRev"
            date="2h ago"
            summary="Attached is the revised PO for the EV fuses. Please confirm the lead time for the Israel shipment."
          />
        </div>
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
        <NextStepCard
          status="todo"
          companyName={company?.company_name || "Company"}
          contactName={customers[0]?.full_name || "Contact"}
          description="Release PDF order for the finalized fuse quantities."
          className="h-full"
        />
        <NextStepCard
          status="in_progress"
          companyName={company?.company_name || "Company"}
          contactName={customers[1]?.full_name || customers[0]?.full_name || "Contact"}
          description="Review contract."
          className="h-full"
        />
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

  return (
    <div className="flex h-full font-sans text-gray-900 bg-gray-50">
      <div className="flex-1 flex w-full">
        <div className="hidden lg:block w-[360px] shrink-0 p-8 border-r border-transparent overflow-hidden">
          <div className="pt-[0px]">
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
                    <div className="relative w-14 h-14 mb-3">
                      {company.domain_name ? (
                        <>
                          <img
                            src={`https://logo.clearbit.com/${company.domain_name}`}
                            alt={company.company_name || "Company logo"}
                            className="w-14 h-14 rounded-lg object-contain"
                            onError={(e) => {
                              // Hide image and show fallback
                              const target = e.target as HTMLImageElement;
                              target.style.display = "none";
                              const fallback = target.nextElementSibling as HTMLElement;
                              if (fallback) fallback.style.display = "flex";
                            }}
                          />
                          <div
                            className="w-14 h-14 bg-blue-600 rounded-lg hidden items-center justify-center text-white text-xl font-bold shadow-sm absolute top-0 left-0"
                          >
                            {getInitials(company.company_name)}
                          </div>
                        </>
                      ) : (
                        <div className="w-14 h-14 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xl font-bold shadow-sm">
                          {getInitials(company.company_name)}
                        </div>
                      )}
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                      {company.company_name || "Unnamed Company"}
                    </h1>
                    {insights.one_liner ? (
                      <p className="text-sm text-gray-500 font-medium mt-1">
                        {insights.one_liner}
                      </p>
                    ) : null}
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
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700 font-medium"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Info
                    </Button>
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
    </div>
  );
}


