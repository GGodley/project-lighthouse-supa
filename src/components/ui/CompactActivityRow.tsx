/* eslint-disable @next/next/no-img-element */
"use client";
import React from "react";
import { LucideIcon } from "lucide-react";

interface CompactActivityRowProps {
  icon: LucideIcon;
  iconColor?: string;
  userName: string;
  avatarUrl?: string;
  action: string;
  target: string;
  time: string;
  isLast?: boolean;
}

export function CompactActivityRow({
  icon: Icon,
  iconColor = "text-gray-500",
  userName,
  avatarUrl,
  action,
  target,
  time,
  isLast = false,
}: CompactActivityRowProps) {
  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random&color=fff&size=64`;

  return (
    <div className="flex gap-4 relative group">
      {/* Spine Line */}
      {!isLast && (
        <div className="absolute left-[15px] top-8 bottom-[-16px] w-px bg-gray-200 group-hover:bg-gray-300 transition-colors" />
      )}

      {/* Icon Column */}
      <div className="relative z-10 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shadow-sm group-hover:border-blue-200 transition-colors">
           <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
      </div>

      {/* Content Column */}
      <div className="flex items-center gap-3 flex-1 min-w-0 py-1.5">
        <img src={avatarUrl || fallbackAvatar} alt={userName} className="w-5 h-5 rounded-full object-cover border border-gray-100 shrink-0" />
        <div className="text-sm truncate flex-1">
          <span className="font-bold text-gray-900">{userName}</span>
          <span className="text-gray-500 mx-1">{action}</span>
          <span className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-2 hover:text-blue-600 hover:decoration-blue-500 cursor-pointer transition-all">
            {target}
          </span>
        </div>
        <div className="text-xs text-gray-400 font-medium whitespace-nowrap">{time}</div>
      </div>
    </div>
  );
}
