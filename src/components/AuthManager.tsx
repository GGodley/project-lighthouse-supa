'use client';
import { useEffect, useState } from 'react';

export default function AuthManager() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Set mounted flag to prevent hydration mismatch
    setIsMounted(true);
  }, []);

  // Prevent hydration mismatch by not rendering until mounted
  if (!isMounted) {
    return null;
  }

  return null;
}
