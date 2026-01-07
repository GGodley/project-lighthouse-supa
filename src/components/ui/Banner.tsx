import React from "react";
import { Info, AlertTriangle, CheckCircle } from "lucide-react";

interface BannerProps {
  title: string;
  description?: string;
  variant?: "info" | "warning" | "success";
}

export function Banner({ title, description, variant = "info" }: BannerProps) {
  const styles = {
    info: "bg-blue-50 border-blue-100 text-blue-900",
    warning: "bg-yellow-50 border-yellow-100 text-yellow-900",
    success: "bg-green-50 border-green-100 text-green-900",
  };

  const icons = {
    info: <Info className="w-5 h-5 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 shrink-0" />,
    success: <CheckCircle className="w-5 h-5 shrink-0" />,
  };

  return (
    <div className={`rounded-lg p-4 border flex gap-3 ${styles[variant]}`}>
      {icons[variant]}
      <div className="text-sm">
        <h4 className="font-medium">{title}</h4>
        {description && <p className="opacity-90 mt-1">{description}</p>}
      </div>
    </div>
  );
}

