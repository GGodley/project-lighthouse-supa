"use client";

import React from "react";
import { CheckSquare, Calendar, ThumbsUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";

interface FeedbackRequestCardProps {
  title: string;
  context: string;
  date: string;
  status?: "open" | "under_review" | "completed"; // Expanded status
  variant?: "default" | "compact";
  description?: string; // NEW PROP
  voteCount?: number;   // NEW PROP
  className?: string;
}

export function FeedbackRequestCard({
  title,
  context,
  date,
  status = "open",
  variant = "default",
  description,
  voteCount = 0,
  className = "",
}: FeedbackRequestCardProps) {
  
  const isCompact = variant === "compact";

  // Height & Padding logic matching NextStepCard
  const heightClass = isCompact ? "h-full min-h-[180px]" : "h-full";
  const paddingClass = isCompact ? "p-5" : "p-6";

  return (
    <Card noPadding className={`flex flex-col ${heightClass} ${className}`}>
      <div className={`flex flex-col h-full ${paddingClass}`}>
        
        {/* Header */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
             <span className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                {isCompact ? "Feature Requests" : context} 
             </span>
             {/* Show status badge in full view */}
             {!isCompact && (
               <Badge variant={status === 'completed' ? 'green' : status === 'under_review' ? 'yellow' : 'gray'}>
                 {status.replace('_', ' ')}
               </Badge>
             )}
          </div>
          <CheckSquare className={`w-4 h-4 ${status === 'completed' ? 'text-green-500' : 'text-gray-400'}`} />
        </div>

        {/* Main Content */}
        <div className="flex-1">
          <h4 className={`font-bold text-gray-900 mb-2 ${isCompact ? "text-xl leading-tight" : "text-lg"}`}>
            {title}
          </h4>
          
          {/* Description - Only show provided text or fallback in Full Mode */}
          {!isCompact && description && (
            <p className="text-gray-600 text-sm leading-relaxed mb-4">
              {description}
            </p>
          )}
        </div>

        {/* Footer / Meta */}
        <div className="flex items-center justify-between mt-auto pt-2">
          
          {/* Left: Date (Compact) or Context (Compact) */}
          <div className="flex items-center gap-3">
             {isCompact && <Badge variant="green" className="py-1">{context}</Badge>}
             <div className="flex items-center text-gray-400 text-xs font-medium">
               <Calendar className="w-3 h-3 mr-1" />
               {date}
             </div>
          </div>

          {/* Right: Votes (Full View Only) */}
          {!isCompact && (
             <div className="flex items-center gap-1.5 text-gray-500 text-xs font-semibold bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                <ThumbsUp className="w-3 h-3" />
                {voteCount}
             </div>
          )}
        </div>
      </div>
    </Card>
  );
}
