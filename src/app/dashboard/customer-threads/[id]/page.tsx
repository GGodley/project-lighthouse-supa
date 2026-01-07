"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Copy,
  RefreshCw,
  MoreHorizontal,
  Sparkles,
  Linkedin,
  LayoutDashboard,
  Users,
  Calendar as CalendarIcon,
  Settings,
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

interface PageProps {
  params: { companyId: string };
}

export default function CompanyDetailDashboard({ params }: PageProps) {
  const [activeTab, setActiveTab] = useState("highlights");

  // Temporary: prove we have the dynamic route param
  console.log("Viewing Company ID:", params.companyId);

  // --- VIEW: DASHBOARD (HIGHLIGHTS) ---
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
              Adlerelectric is prioritizing the "Fuse Order AIRev" project. Recent
              signals indicate they are waiting for the finalized PDF order before
              confirming the Israel shipment. Engagement is high, with 3 meetings in
              the last month. The engineering team is currently reviewing the new
              voltage specs to ensure compliance.
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
                Adlerelectric Inc.
              </div>
              <button className="group flex items-center text-sm font-semibold text-gray-500 hover:text-[#0A66C2] transition-colors">
                View Company Profile{" "}
                <span className="ml-1 group-hover:translate-x-0.5 transition-transform">
                  →
                </span>
              </button>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-fr">
        <div className="h-full">
          <UpcomingMeetingCard
            title="Demo Call"
            date="Nov 29, 10:40 AM"
            platform="Google Meet"
          />
        </div>
        <div className="h-full">
          <NextStepCard
            variant="compact"
            status="todo"
            companyName="Adlerelectric"
            contactName="Steven Zhong"
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
          <span className="text-gray-400 group-hover:translate-x-1 transition-transform">
            ›
          </span>
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
              isLast={true}
            />
          </div>
        </div>
      </div>
    </div>
  );

  // --- VIEW: TIMELINE ---
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
          <div className="absolute -left-[21px] top-6 w-3 h-3 rounded-full bg-blue-500 border-2 border-white ring-1 ring-gray-100"></div>
          <span className="block text-sm font-bold text-gray-900 mb-3">
            Today, 2:00 PM
          </span>
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

  // --- VIEW: TASKS ---
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
          companyName="Adlerelectric"
          contactName="Steven Zhong"
          description="Release PDF order for the finalized fuse quantities."
          className="h-full"
        />
        <NextStepCard
          status="in_progress"
          companyName="Adlerelectric"
          contactName="Sarah Connor"
          description="Review contract."
          className="h-full"
        />
      </div>
    </div>
  );

  // --- VIEW: REQUESTS ---
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
    <div className="h-screen bg-gray-50 font-sans text-gray-900 flex overflow-hidden">
      <aside className="w-64 bg-white border-r border-gray-200 hidden xl:flex flex-col z-20 shrink-0">
        <div className="p-6 flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-600 rounded-lg"></div>
          <span className="font-bold text-lg tracking-tight">Lighthouse</span>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {[
            { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
            {
              name: "Customers",
              href: "/dashboard/customer-threads",
              icon: Users,
            },
            { name: "Calendar", href: "/dashboard/calendar", icon: CalendarIcon },
            { name: "Settings", href: "/settings", icon: Settings },
          ].map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            >
              <item.icon className="w-4 h-4" />
              {item.name}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        <div className="hidden lg:block w-[360px] shrink-0 p-8 border-r border-transparent overflow-hidden">
          <div className="pt-[52px]">
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm mb-6">
              <div className="mb-4">
                <div className="w-14 h-14 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xl font-bold mb-3 shadow-sm">
                  A
                </div>
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                  Adlerelectric
                </h1>
                <p className="text-sm text-gray-500 font-medium">
                  Global EV Fuse Manufacturer
                </p>
              </div>
              <div className="space-y-3 mb-5">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span>San Francisco, CA</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Globe className="w-4 h-4 text-gray-400" />
                  <a
                    href="#"
                    className="hover:text-blue-600 hover:underline"
                  >
                    adlerelectric.com
                  </a>
                </div>
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
                  3 Active
                </span>
              </div>
              <div className="space-y-2">
                {[
                  {
                    name: "Eric Sin",
                    role: "Procurement Lead",
                    initials: "ES",
                    color: "bg-indigo-600",
                  },
                  {
                    name: "Steven Zhong",
                    role: "Engineering Head",
                    initials: "SZ",
                    color: "bg-orange-400",
                  },
                  {
                    name: "Sarah Connor",
                    role: "Operations",
                    initials: "SC",
                    color: "bg-blue-500",
                  },
                  {
                    name: "Mike Ross",
                    role: "Legal",
                    initials: "MR",
                    color: "bg-gray-500",
                  },
                ].map((contact, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:shadow-sm transition-shadow cursor-pointer"
                  >
                    <div
                      className={`w-8 h-8 rounded-full ${contact.color} flex items
<<<<<<< HEAD
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Linkedin, Calendar, CheckSquare, MessageSquare } from 'lucide-react';
import { useSupabase } from '@/components/SupabaseProvider';
import { useParams } from 'next/navigation';
import type { CompanyData } from '@/lib/companies/getCompanyDetails';

export default function HighlightsPage() {
  const params = useParams();
  const companyId = params.id as string;
  const supabase = useSupabase();
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!companyId) return;
      
      setLoading(true);
      try {
        const functionName = `get-company-page-details?company_id=${companyId}`;
        const { data, error } = await supabase.functions.invoke<CompanyData>(functionName, {
          method: 'GET',
        });

        if (error) {
          throw error;
        }

        setCompanyData(data);
      } catch (err) {
        console.error('Error fetching company data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId, supabase]);

  if (loading || !companyData) {
    return (
      <div className="space-y-6">
        <div className="h-32 bg-gray-200 rounded-xl animate-pulse"></div>
        <div className="h-24 bg-gray-200 rounded-xl animate-pulse"></div>
      </div>
    );
  }

  const { company_details, interaction_timeline, next_steps } = companyData;
  const aiInsights = company_details.ai_insights;
  const linkedinUrl = aiInsights?.linkedin_url || `https://linkedin.com/company/${company_details.company_name || company_details.domain_name}`;

  // Get next upcoming task
  const upcomingTask = next_steps
    ?.filter(step => step.status !== 'done')
    .sort((a, b) => {
      if (a.due_date && b.due_date) {
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      return 0;
    })[0];

  // Get recent activity (3 items)
  const recentActivity = interaction_timeline?.slice(0, 3) || [];

  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffHours < 24) {
      return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  // Get product feedback count for placeholder
  const productFeedbackCount = companyData.product_feedback?.length || 0;

  return (
    <div className="space-y-6 mt-6">
      {/* Intelligence Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Summary - Spans 2 columns */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:col-span-2 h-48 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-yellow-500" />
            <h3 className="text-lg font-semibold text-gray-900 tracking-tight antialiased">Summary</h3>
          </div>
          <div className="overflow-hidden flex-1">
            <p className="text-sm text-gray-600 leading-relaxed line-clamp-4">
              {aiInsights?.summary || 'No summary available. Click "Generate Profile" in the sidebar to create an AI-generated summary.'}
            </p>
          </div>
        </div>

        {/* Card 2: LinkedIn - Spans 1 column */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:col-span-1 h-48 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Linkedin className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900 tracking-tight antialiased">LinkedIn</h3>
          </div>
          <div className="flex-1 flex items-start">
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
            >
              View Company Profile →
            </a>
          </div>
        </div>

        {/* Card 3: Next Step - Spans 1 column */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:col-span-1 h-48 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <CheckSquare className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900 tracking-tight antialiased">Next Step</h3>
          </div>
          <div className="flex-1">
            {upcomingTask ? (
              <div>
                <p className="text-sm text-gray-900 mb-2">{upcomingTask.text}</p>
                {upcomingTask.due_date && (
                  <p className="text-xs text-gray-500">
                    Due: {new Date(upcomingTask.due_date).toLocaleDateString()}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No upcoming tasks</p>
            )}
          </div>
        </div>

        {/* Card 4: Tasks/Requests Placeholder - Spans 1 column */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:col-span-1 h-48 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900 tracking-tight antialiased">Requests</h3>
          </div>
          <div className="flex-1">
            {productFeedbackCount > 0 ? (
              <div>
                <p className="text-sm text-gray-900 mb-2">{productFeedbackCount} active request{productFeedbackCount !== 1 ? 's' : ''}</p>
                <Link
                  href={`/dashboard/customer-threads/${companyId}/requests`}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                >
                  View all →
                </Link>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No requests</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 tracking-tight antialiased">Recent Activity</h3>
          <Link
            href={`/dashboard/customer-threads/${companyId}/timeline`}
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            View all →
          </Link>
        </div>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-gray-500">No recent activity</p>
        ) : (
          <div className="space-y-3">
            {recentActivity.map((activity) => (
              <div key={`${activity.interaction_type}-${activity.id}`} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatRelativeTime(activity.interaction_date)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
=======
"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Copy,
  RefreshCw,
  MoreHorizontal,
  Sparkles,
  Linkedin,
  LayoutDashboard,
  Users,
  Calendar as CalendarIcon,
  Settings,
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

interface PageProps {
  params: { companyId: string };
}

export default function CompanyDetailDashboard({ params }: PageProps) {
  const [activeTab, setActiveTab] = useState("highlights");

  // For now, we just log the ID to prove we have it
  console.log("Viewing Company ID:", params.companyId);

  // --- VIEW: DASHBOARD (HIGHLIGHTS) ---
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
              Adlerelectric is prioritizing the "Fuse Order AIRev" project. Recent
              signals indicate they are waiting for the finalized PDF order before
              confirming the Israel shipment. Engagement is high, with 3 meetings in
              the last month. The engineering team is currently reviewing the new
              voltage specs to ensure compliance.
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
                Adlerelectric Inc.
              </div>
              <button className="group flex items-center text-sm font-semibold text-gray-500 hover:text-[#0A66C2] transition-colors">
                View Company Profile{" "}
                <span className="ml-1 group-hover:translate-x-0.5 transition-transform">
                  →
                </span>
              </button>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-fr">
        <div className="h-full">
          <UpcomingMeetingCard
            title="Demo Call"
            date="Nov 29, 10:40 AM"
            platform="Google Meet"
          />
        </div>
        <div className="h-full">
          <NextStepCard
            variant="compact"
            status="todo"
            companyName="Adlerelectric"
            contactName="Steven Zhong"
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
          <span className="text-gray-400 group-hover:translate-x-1 transition-transform">
            ›
          </span>
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
              isLast={true}
            />
          </div>
        </div>
      </div>
    </div>
  );

  // --- VIEW: TIMELINE ---
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
          <div className="absolute -left-[21px] top-6 w-3 h-3 rounded-full bg-blue-500 border-2 border-white ring-1 ring-gray-100"></div>
          <span className="block text-sm font-bold text-gray-900 mb-3">
            Today, 2:00 PM
          </span>
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

  // --- VIEW: TASKS ---
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
          companyName="Adlerelectric"
          contactName="Steven Zhong"
          description="Release PDF order for the finalized fuse quantities."
          className="h-full"
        />
        <NextStepCard
          status="in_progress"
          companyName="Adlerelectric"
          contactName="Sarah Connor"
          description="Review contract."
          className="h-full"
        />
      </div>
    </div>
  );

  // --- VIEW: REQUESTS ---
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
    <div className="h-screen bg-gray-50 font-sans text-gray-900 flex overflow-hidden">
      <aside className="w-64 bg-white border-r border-gray-200 hidden xl:flex flex-col z-20 shrink-0">
        <div className="p-6 flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-600 rounded-lg"></div>
          <span className="font-bold text-lg tracking-tight">Lighthouse</span>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {[
            { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
            {
              name: "Customers",
              href: "/dashboard/customer-threads",
              icon: Users,
            },
            { name: "Calendar", href: "/dashboard/calendar", icon: CalendarIcon },
            { name: "Settings", href: "/settings", icon: Settings },
          ].map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            >
              <item.icon className="w-4 h-4" />
              {item.name}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        <div className="hidden lg:block w-[360px] shrink-0 p-8 border-r border-transparent overflow-hidden">
          <div className="pt-[52px]">
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm mb-6">
              <div className="mb-4">
                <div className="w-14 h-14 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xl font-bold mb-3 shadow-sm">
                  A
                </div>
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                  Adlerelectric
                </h1>
                <p className="text-sm text-gray-500 font-medium">
                  Global EV Fuse Manufacturer
                </p>
              </div>
              <div className="space-y-3 mb-5">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span>San Francisco, CA</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Globe className="w-4 h-4 text-gray-400" />
                  <a
                    href="#"
                    className="hover:text-blue-600 hover:underline"
                  >
                    adlerelectric.com
                  </a>
                </div>
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
                  3 Active
                </span>
              </div>
              <div className="space-y-2">
                {[
                  {
                    name: "Eric Sin",
                    role: "Procurement Lead",
                    initials: "ES",
                    color: "bg-indigo-600",
                  },
                  {
                    name: "Steven Zhong",
                    role: "Engineering Head",
                    initials: "SZ",
                    color: "bg-orange-400",
                  },
                  {
                    name: "Sarah Connor",
                    role: "Operations",
                    initials: "SC",
                    color: "bg-blue-500",
                  },
                  {
                    name: "Mike Ross",
                    role: "Legal",
                    initials: "MR",
                    color: "bg-gray-500",
                  },
                ].map((contact, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:shadow-sm transition-shadow cursor-pointer"
                  >
                    <div
                      className={`w-8 h-8 rounded-full ${contact.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}
                    >
                      {contact.initials}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">
                        {contact.name}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {contact.role}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-8 h-full">
          <div className="space-y-6 max-w-5xl">
            <div className="flex gap-8 border-b border-gray-200 mb-6">
              {["Highlights", "Timeline", "Tasks", "Requests"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab.toLowerCase())}
                  className={`pb-3 text-sm font-bold transition-colors border-b-2 ${
                    activeTab === tab.toLowerCase()
                      ? "border-gray-900 text-gray-900"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === "highlights" ? renderDashboard() : null}
            {activeTab === "timeline" ? renderTimeline() : null}
            {activeTab === "tasks" ? renderTasks() : null}
            {activeTab === "requests" ? renderRequests() : null}
          </div>
        </main>
>>>>>>> dev
      </div>
    </div>
  );
}
