"use client";

import React, { useState } from "react";
import { ArrowRight, CheckSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/Button";

export type NextStepStatus = 'todo' | 'in_progress' | 'done';

interface NextStepCardProps {
  companyName: string;
  contactName: string;
  description: string;
  status: NextStepStatus;
  logoUrl?: string;
  onGoToSource?: () => void;
  onStatusChange?: (status: NextStepStatus) => void;
  className?: string;
  variant?: "default" | "compact"; 
}

export function NextStepCard({
  companyName,
  contactName,
  description,
  status: initialStatus,
  logoUrl,
  onGoToSource,
  onStatusChange,
  className = "",
  variant = "default", 
}: NextStepCardProps) {
  const [currentStatus, setCurrentStatus] = useState<NextStepStatus>(initialStatus);

  const handleStatusClick = (newStatus: NextStepStatus) => {
    setCurrentStatus(newStatus);
    if (onStatusChange) onStatusChange(newStatus);
  };

  const statusConfig = {
    todo: {
      container: "bg-gray-50 border-gray-100",
      text: "text-gray-800",
      iconText: "text-gray-600 hover:text-gray-900",
      icon: ArrowRight,
      label: "Go to source",
      activeColor: "!bg-gray-500 hover:!bg-gray-600 !border-gray-500", 
    },
    in_progress: {
      container: "bg-blue-50 border-blue-100",
      text: "text-blue-800",
      iconText: "text-blue-600 hover:text-blue-800",
      icon: ArrowRight,
      label: "Go to source",
      activeColor: "!bg-blue-500 hover:!bg-blue-600 !border-blue-500",
    },
    done: {
      container: "bg-green-50 border-green-100",
      text: "text-green-800",
      iconText: "text-green-600 hover:text-green-800",
      icon: ArrowRight,
      label: "Go to source",
      activeColor: "!bg-emerald-500 hover:!bg-emerald-600 !border-emerald-500",
    },
  };

  const config = statusConfig[currentStatus];
  const Icon = config.icon;
  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(companyName)}&background=random&color=fff`;

  const isCompact = variant === "compact";
  const heightClass = isCompact ? "h-full min-h-[180px]" : "h-auto"; 
  
  // Use p-4 for the inner content box, p-5 for the outer card padding in compact mode
  const paddingClass = isCompact ? "p-4" : "p-4"; 

  return (
    <Card noPadding className={`flex flex-col ${heightClass} ${className}`}>
      <div className={`flex flex-col h-full ${isCompact ? "p-5" : "p-6"}`}>
        
        {isCompact && (
          <div className="flex justify-between items-center mb-2">
             <span className="text-xs font-bold text-gray-900 uppercase tracking-wide">Next Step</span>
             <CheckSquare className="w-4 h-4 text-gray-400" />
          </div>
        )}

        {/* Company Header */}
        <div className={`flex justify-between items-start ${isCompact ? "mb-3" : "mb-4"}`}>
          <div>
            <h3 className={`text-base font-bold text-gray-900 leading-none truncate pr-2`}>
              {companyName}
            </h3>
            <p className={`text-sm text-gray-500 mt-1 truncate`}>
              {contactName}
            </p>
          </div>
          <img 
              src={logoUrl || fallbackAvatar} 
              alt={`${companyName} logo`}
              className={`w-9 h-9 rounded-full border border-gray-100 object-cover shrink-0`}
          />
        </div>

        {/* Content Box */}
        <div className={`
          rounded-lg border transition-colors duration-300 ${config.container} 
          mt-auto flex flex-col justify-between flex-1
          ${paddingClass} 
        `}>
          <p className={`leading-relaxed font-medium text-sm ${config.text} line-clamp-3`}>
            {description}
          </p>
          
          <button onClick={onGoToSource} className={`flex items-center gap-2 text-xs font-bold transition-colors ${config.iconText} mt-3`}>
            <Icon className="w-3.5 h-3.5" />
            {config.label}
          </button>
        </div>

        {!isCompact && (
          <div className="mt-3 flex gap-2">
            {(['todo', 'in_progress', 'done'] as NextStepStatus[]).map((s) => {
              const isActive = currentStatus === s;
              const labels = { todo: "To Do", in_progress: "In Progress", done: "Done" };
              return (
                <Button
                  key={s}
                  size="sm"
                  onClick={() => handleStatusClick(s)}
                  variant={isActive ? "primary" : "outline"}
                  className={`
                    text-xs px-3 h-7 transition-colors flex-1
                    ${isActive 
                      ? `${statusConfig[s].activeColor} text-white shadow-sm` 
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-900"
                    }
                  `}
                >
                  {labels[s]}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
