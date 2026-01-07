import React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: "gray" | "blue" | "green" | "yellow" | "red" | "outline";
}

export function Badge({ children, variant = "gray", className = "", ...props }: BadgeProps) {
  const variants = {
    gray: "bg-gray-100 text-gray-800",
    blue: "bg-blue-50 text-blue-700 border border-blue-100",
    green: "bg-green-50 text-green-700 border border-green-100",
    yellow: "bg-yellow-50 text-yellow-800 border border-yellow-100",
    red: "bg-red-50 text-red-700 border border-red-100",
    outline: "bg-white text-gray-700 border border-gray-200",
  };

  return (
    <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium ${variants[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
}
