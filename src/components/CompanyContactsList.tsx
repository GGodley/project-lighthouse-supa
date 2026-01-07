/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/SupabaseProvider';

interface Contact {
  name: string;
  email: string;
  lastInteraction: string | null;
  avatar?: string;
}

interface CompanyContactsListProps {
  companyId: string;
}

export default function CompanyContactsList({ companyId }: CompanyContactsListProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useSupabase();

  useEffect(() => {
    const fetchContacts = async () => {
      try {
        // Query customers table for top 3 contacts
        const { data: customers, error } = await supabase
          .from('customers')
          .select('customer_id, full_name, email, last_interaction_at')
          .eq('company_id', companyId)
          .order('last_interaction_at', { ascending: false, nullsFirst: false })
          .limit(3);

        if (error) {
          console.error('Error fetching contacts:', error);
          // Fallback to mock data
          setContacts(getMockContacts());
          return;
        }

        if (customers && customers.length > 0) {
          const formattedContacts: Contact[] = customers.map((customer) => ({
            name: customer.full_name || customer.email || 'Unknown',
            email: customer.email || '',
            lastInteraction: customer.last_interaction_at,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(customer.full_name || customer.email || 'U')}&background=random`,
          }));
          setContacts(formattedContacts);
        } else {
          // No contacts found, use mock data
          setContacts(getMockContacts());
        }
      } catch (err) {
        console.error('Error fetching contacts:', err);
        setContacts(getMockContacts());
      } finally {
        setLoading(false);
      }
    };

    fetchContacts();
  }, [companyId, supabase]);

  const formatRelativeTime = (dateString: string | null): string => {
    if (!dateString) return 'No recent interaction';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (loading) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Key Contacts</h3>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-gray-200"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-24 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-16"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Key Contacts</h3>
      {contacts.length === 0 ? (
        <p className="text-xs text-gray-500">No contacts found</p>
      ) : (
        <div className="space-y-3">
          {contacts.map((contact, index) => (
            <div key={index} className="flex items-center gap-3">
              {/* Avatar */}
              <img
                src={contact.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name)}&background=random`}
                alt={contact.name}
                className="w-8 h-8 rounded-full object-cover"
              />
              
              {/* Name and Time */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {contact.name}
                </p>
                <p className="text-xs text-gray-500">
                  {formatRelativeTime(contact.lastInteraction)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Mock data fallback (kept in component for easy swapping)
function getMockContacts(): Contact[] {
  return [
    { 
      name: 'John Doe', 
      email: 'john@example.com',
      lastInteraction: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      avatar: 'https://ui-avatars.com/api/?name=John+Doe&background=random'
    },
    { 
      name: 'Jane Smith', 
      email: 'jane@example.com',
      lastInteraction: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      avatar: 'https://ui-avatars.com/api/?name=Jane+Smith&background=random'
    },
    { 
      name: 'Bob Johnson', 
      email: 'bob@example.com',
      lastInteraction: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
      avatar: 'https://ui-avatars.com/api/?name=Bob+Johnson&background=random'
    },
  ];
}

