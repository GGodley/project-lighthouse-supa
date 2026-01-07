"use client";

import React from "react";
import { Heart, Calendar, Phone, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/Banner";
import { NextStepCard } from "@/components/ui/NextStepCard";
import { TimelineCard } from "@/components/ui/TimelineCard";
import { FeedbackRequestCard } from "@/components/ui/FeedbackRequestCard";
import { CompactActivityRow } from "@/components/ui/CompactActivityRow";

export default function DesignPreviewPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-12 space-y-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Lighthouse Design System</h1>
        <p className="text-gray-500 mt-2">Core primitives validation.</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">1. Containers</h2>
        <Card className="max-w-md">
          <h3 className="font-semibold text-lg mb-2">Standard Card</h3>
          <p className="text-gray-600 text-sm">This is the standard surface for the dashboard.</p>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">2. Buttons</h2>
        <div className="flex flex-wrap gap-4 items-center">
          <Button variant="primary">Primary Action</Button>
          <Button variant="outline">Secondary Action</Button>
          <Button variant="ghost">Ghost Action</Button>
          <Button variant="danger">Danger Action</Button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">3. Badges</h2>
        <div className="flex gap-3">
          <Badge variant="gray">Neutral</Badge>
          <Badge variant="blue">Info</Badge>
          <Badge variant="green">Success</Badge>
          <Badge variant="yellow">Warning</Badge>
          <Badge variant="red">Error</Badge>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">4. Banners</h2>
        <div className="space-y-4 max-w-xl">
          <Banner variant="info" title="AI Insight Generated" description="The profile summary has been updated." />
          <Banner variant="warning" title="Missing Data" description="No sentiment data available." />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">5. Complex Components (Next Step Card)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* State: To Do (Grey) */}
          <NextStepCard
            status="todo"
            companyName="Amphenol"
            contactName="Eran Gdalyahu"
            description="Check lead time and price for 5 units of connector p/n: 62GB14F1405SN."
            logoUrl="https://logo.clearbit.com/amphenol.com"
          />
          {/* State: In Progress (Blue) */}
          <NextStepCard
            status="in_progress"
            companyName="GreenLeaf Inc."
            contactName="Sarah Johnson"
            description="Waiting on feedback regarding the proposed data infrastructure modernization plan sent on Tuesday."
            logoUrl="https://logo.clearbit.com/greenleaf.com"
          />
          {/* State: Done (Green) */}
          <NextStepCard
            status="done"
            companyName="TechSolutions Ltd."
            contactName="Mike Chen"
            description="Schedule introductory demo call for next week. (Completed via email)."
            logoUrl="https://logo.clearbit.com/techsolutions.com"
          />
        </div>
      </section>

      <section className="space-y-8 max-w-3xl">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">6. Timeline Elements (Spine & Cards)</h2>
        
        <div className="relative pl-8 border-l border-gray-200 space-y-8">
          
          {/* Item 1: Thread */}
          <div className="relative">
            {/* The Dot on the Spine */}
            <div className="absolute -left-[37px] top-6 w-3 h-3 rounded-full bg-blue-500 border-4 border-white shadow-sm"></div>
            
            {/* The Date (Floating left) */}
            <span className="absolute -left-32 top-5 text-xs font-medium text-gray-400 w-20 text-right">
              2 hours ago
            </span>

            <TimelineCard 
              type="thread"
              title="Re: Pricing Negotiation"
              date="2 hours ago"
              summary="Hi team, regarding the connector p/n 62GB14F1405SN, we have reviewed the volume discount proposal. We can move forward if we can lock in the delivery date by Friday."
            />
          </div>

          {/* Item 2: Meeting */}
          <div className="relative">
            {/* The Dot on the Spine */}
            <div className="absolute -left-[37px] top-6 w-3 h-3 rounded-full bg-purple-500 border-4 border-white shadow-sm"></div>
            
            <span className="absolute -left-32 top-5 text-xs font-medium text-gray-400 w-20 text-right">
              Yesterday
            </span>

            <TimelineCard 
              type="meeting"
              title="Weekly Sync: Project Alpha"
              date="Yesterday"
              summary="Discussed the new API integration requirements. Action items: Sarah to send over the documentation, Mike to set up the staging environment."
            />
          </div>

           {/* Item 3: Thread */}
           <div className="relative">
            <div className="absolute -left-[37px] top-6 w-3 h-3 rounded-full bg-gray-300 border-4 border-white shadow-sm"></div>
            
            <span className="absolute -left-32 top-5 text-xs font-medium text-gray-400 w-20 text-right">
              Dec 12
            </span>

            <TimelineCard 
              type="thread"
              title="Introductory Call Follow-up"
              date="Dec 12"
              summary="Thanks for the time today. As discussed, here is the deck we presented. Looking forward to hearing back next week."
            />
          </div>

        </div>
      </section>

      <section className="space-y-8 border-t border-gray-200 pt-8">
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">7. Compact Dashboard Views</h2>
          <p className="text-sm text-gray-500 mb-6">These are the specialized &ldquo;Widget&rdquo; variants designed for the dashboard grid.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* 1. Next Step (Compact) */}
          <div className="md:col-span-1">
            <NextStepCard
              variant="compact"
              status="in_progress"
              companyName="GreenLeaf Inc."
              contactName="Sarah Johnson"
              description="Waiting on feedback regarding the proposed data infrastructure modernization plan."
              className="h-full"
            />
          </div>

          {/* 2. Feedback Request (Compact) */}
          <div className="md:col-span-1">
            <FeedbackRequestCard
              variant="compact"
              title="Add call recording"
              context="Product review"
              date="Nov 29"
              status="completed"
              className="h-full"
            />
          </div>

          {/* 3. Feedback Request (Compact - Open) */}
          <div className="md:col-span-1">
            <FeedbackRequestCard
              variant="compact"
              title="Automated email sequences"
              context="Feature Request"
              date="Dec 12"
              status="open"
              className="h-full"
            />
          </div>

        </div>
      </section>

      <section className="space-y-8 border-t border-gray-200 pt-8 max-w-3xl">
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">8. Compact Activity Feed</h2>
          <p className="text-sm text-gray-500 mb-6">High-density timeline for the dashboard view.</p>
        </div>

        {/* The Container Card */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2 cursor-pointer hover:bg-gray-50 transition-colors">
            <h3 className="font-bold text-gray-900 text-lg">Activity</h3>
            <span className="text-gray-400 text-lg">›</span>
          </div>

          {/* List Content */}
          <div className="p-6 space-y-4">
            
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
      </section>
    </div>
  );
}

