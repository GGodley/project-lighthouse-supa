import React from 'react';
import { Rocket } from 'lucide-react';

export function ComingSoonState() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
      <Rocket className="w-16 h-16 text-gray-300" />
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Coming Soon</h2>
        <p className="text-gray-500 max-w-md">
          We are working hard to bring you this feature. Stay tuned!
        </p>
      </div>
    </div>
  );
}

