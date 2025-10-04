'use client';
import { useEffect } from 'react';

export default function CookieCleaner() {
  useEffect(() => {
    // Clear all Supabase-related cookies
    const clearSupabaseCookies = () => {
      const cookies = document.cookie.split(';');
      
      cookies.forEach(cookie => {
        const eqPos = cookie.indexOf('=');
        const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
        
        // Clear any cookie that starts with 'sb-' (Supabase cookies)
        if (name.startsWith('sb-')) {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${window.location.hostname}`;
        }
      });
      
      console.log('🧹 Cleared all Supabase cookies');
    };

    // Clear cookies on component mount
    clearSupabaseCookies();
    
    // Also clear localStorage and sessionStorage of any Supabase data
    const clearStorage = () => {
      const keysToRemove = [];
      
      // Clear localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('supabase') || key.includes('sb-'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Clear sessionStorage
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.includes('supabase') || key.includes('sb-'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => sessionStorage.removeItem(key));
      
      console.log('🧹 Cleared Supabase storage data');
    };

    clearStorage();
    
    // Force a page reload to ensure clean state
    setTimeout(() => {
      console.log('🔄 Reloading page to ensure clean authentication state...');
      window.location.reload();
    }, 1000);
    
  }, []);

  return (
    <div style={{ 
      position: 'fixed', 
      top: '50%', 
      left: '50%', 
      transform: 'translate(-50%, -50%)',
      background: 'white',
      padding: '20px',
      borderRadius: '8px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      zIndex: 9999
    }}>
      <h3>🧹 Cleaning Authentication State...</h3>
      <p>Clearing corrupted cookies and reloading page...</p>
    </div>
  );
}
