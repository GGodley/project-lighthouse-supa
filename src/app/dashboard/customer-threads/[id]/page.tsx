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
  const [activeTab, setActiveTab] = useState<"highlights" | "timeline" | "tasks" | "requests">(
    "highlights",
  );

  // Temporary: just to verify param wiring
  console.log("Viewing Company ID:", params.companyId);

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
              Adlerelectric is prioritizing the "Fuse Order AIRev" project. Recent signals indicate
              they are waiting for the finalized PDF order before confirming the Israel shipment.
              Engagement is high, with 3 meetings in the last month. The engineering team is
              currently reviewing the new voltage specs to ensure compliance.
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
              <div className="text-lg font-bold text-gray-900 mb-1">Adlerelectric Inc.</div>
              <button className="group flex items-center text-sm font-semibold text-gray-500 hover:text-[#0A66C2] transition-colors">
                View Company Profile{" "}
                <span className="ml-1 group-hover:translate-x-0.5 transition-transform">→</span>
              </button>
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
          <div className="w-6 h-6 bg-blue-600 rounded-lg" />
          <span className="font-bold text-lg tracking-tight">Lighthouse</span>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {[
            { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
            { name: "Customers", href: "/dashboard/customer-threads", icon: Users },
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
                  <a href="#" className="hover:text-blue-600 hover:underline">
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
                  { name: "Eric Sin", role: "Procurement Lead", initials: "ES", color: "bg-indigo-600" },
                  { name: "Steven Zhong", role: "Engineering Head", initials: "SZ", color: "bg-orange-400" },
                  { name: "Sarah Connor", role: "Operations", initials: "SC", color: "bg-blue-500" },
                  { name: "Mike Ross", role: "Legal", initials: "MR", color: "bg-gray-500" },
                ].map((contact) => (
                  <div
                    key={contact.initials}
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


