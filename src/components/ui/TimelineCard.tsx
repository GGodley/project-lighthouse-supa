"use client";

import React from "react";
import { Mail, Video } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export type TimelineItemType = 'thread' | 'meeting';

interface TimelineCardProps {
  type: TimelineItemType;
  title: string;
  summary: string;
  date: string; // Passed for context, though displayed in spine usually
  onClick?: () => void;
}

export function TimelineCard({ type, title, summary, date, onClick }: TimelineCardProps) {
  
  const config = {
    thread: {
      color: "blue",
      hoverBorder: "hover:border-blue-300 hover:shadow-blue-50/50",
      icon: Mail,
      iconColor: "text-blue-600",
      badgeVariant: "blue" as const,
      label: "Thread"
    },
    meeting: {
      color: "purple",
      hoverBorder: "hover:border-purple-300 hover:shadow-purple-50/50",
      icon: Video,
      iconColor: "text-purple-600",
      badgeVariant: "gray" as const, // Or create a purple variant if available, else gray/blue
      label: "Meeting"
    }
  };

  const theme = config[type];
  const Icon = theme.icon;

  return (
    <div 
      onClick={onClick}
      className={`
        group bg-white border border-gray-200 rounded-xl shadow-sm transition-all duration-200 cursor-pointer
        ${theme.hoverBorder} hover:shadow-md
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-gray-50 ${theme.iconColor} group-hover:bg-white group-hover:shadow-sm transition-all`}>
            <Icon className="w-4 h-4" />
          </div>
          <h4 className="font-semibold text-gray-900 text-sm">{title}</h4>
        </div>
        <Badge variant={theme.badgeVariant}>{theme.label}</Badge>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100" />

      {/* Body */}
      <div className="p-4">
        <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
          {summary}
        </p>
      </div>
    </div>
  );
}

