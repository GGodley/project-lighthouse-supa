"use client";
import React from "react";
import { Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface UpcomingMeetingCardProps {
  title: string;
  date: string;
  platform?: string;
}

export function UpcomingMeetingCard({ title, date, platform = "Zoom" }: UpcomingMeetingCardProps) {
  return (
    // Added noPadding and manual p-5 to match NextStepCard exactly
    <Card noPadding className="flex flex-col h-full min-h-[180px] shadow-none">
       <div className="flex flex-col h-full justify-between p-5">
         {/* Header */}
         <div className="flex justify-between items-center mb-2">
           <span className="text-xs font-bold text-gray-900 uppercase tracking-wide">Upcoming</span>
           <Calendar className="w-4 h-4 text-gray-400" />
         </div>

         {/* Main Info */}
         <div className="flex-1 mt-2">
           <div className="font-bold text-gray-900 text-2xl leading-tight mb-1">{title}</div>
           <div className="text-sm text-gray-500 font-medium">{date}</div>
         </div>

         {/* Footer */}
         <div className="mt-4">
            <Badge variant="gray" className="gap-1.5 pl-1.5 pr-2.5 py-1">
               <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></div>
               {platform}
            </Badge>
         </div>
       </div>
    </Card>
  );
}
