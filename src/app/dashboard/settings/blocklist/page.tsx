'use client'

import React, { useState, useEffect } from 'react'
import { useSupabase } from '@/components/SupabaseProvider'
import { Trash2, Plus, Loader2 } from 'lucide-react'

interface BlockedDomain {
  id: string
  domain: string
  created_at: string
}

const BlocklistPage: React.FC = () => {
  const [domains, setDomains] = useState<BlockedDomain[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newDomain, setNewDomain] = useState('')
  const [adding, setAdding] = useState(false)
  const supabase = useSupabase()

  const fetchBlocklist = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Not authenticated')
        return
      }

      const { data, error: fetchError } = await (supabase as any)
        .from('domain_blocklist')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (fetchError) {
        throw fetchError
      }

      setDomains(data || [])
    } catch (err) {
      console.error('Error fetching blocklist:', err)
      setError('Failed to load blocklist')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBlocklist()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  const handleAddDomain = async () => {
    if (!newDomain.trim()) return

    // Basic domain validation
    const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/
    if (!domainPattern.test(newDomain.trim())) {
      setError('Please enter a valid domain (e.g., example.com)')
      return
    }

    try {
      setAdding(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Not authenticated')
        return
      }

      const { error: insertError } = await (supabase as any)
        .from('domain_blocklist')
        .insert({
          user_id: user.id,
          domain: newDomain.trim().toLowerCase()
        })

      if (insertError) {
        if (insertError.code === '23505') {
          setError('This domain is already in your blocklist')
        } else {
          throw insertError
        }
        return
      }

      setNewDomain('')
      await fetchBlocklist()
    } catch (err) {
      console.error('Error adding domain:', err)
      setError('Failed to add domain')
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteDomain = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this domain from the blocklist?')) {
      return
    }

    try {
      const { error: deleteError } = await (supabase as any)
        .from('domain_blocklist')
        .delete()
        .eq('id', id)

      if (deleteError) {
        throw deleteError
      }

      await fetchBlocklist()
    } catch (err) {
      console.error('Error deleting domain:', err)
      setError('Failed to delete domain')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Domain Blocklist</h1>
          <p className="text-sm text-gray-500 mt-1">
            <a href="/dashboard" className="hover:underline">Dashboard</a> / <a href="/dashboard/settings" className="hover:underline">Settings</a> / <span className="font-medium">Blocklist</span>
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Blocked domains will be excluded from thread syncing. Emails from these domains will not appear in your customer threads.
          </p>
        </header>

        {/* Add Domain Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Add Domain to Blocklist</h2>
          <div className="flex space-x-3">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => {
                setNewDomain(e.target.value)
                setError(null)
              }}
              placeholder="example.com"
              className="flex-1 px-4 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddDomain()
                }
              }}
            />
            <button
              onClick={handleAddDomain}
              disabled={adding || !newDomain.trim()}
              className="px-5 py-2 text-sm font-semibold text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {adding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Adding...</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>Add</span>
                </>
              )}
            </button>
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Blocklist Table */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Blocked Domains</h2>
          
          {loading ? (
            <div className="text-center p-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">Loading blocklist...</p>
            </div>
          ) : domains.length === 0 ? (
            <div className="text-center p-8 text-gray-500">
              <p>No domains in your blocklist yet.</p>
              <p className="text-sm mt-1">Add a domain above to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-600">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3">Domain</th>
                    <th scope="col" className="px-6 py-3">Added</th>
                    <th scope="col" className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {domains.map((domain) => (
                    <tr key={domain.id} className="bg-white border-b hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {domain.domain}
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {new Date(domain.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDeleteDomain(domain.id)}
                          className="text-red-600 hover:text-red-800 transition-colors"
                          title="Remove from blocklist"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'

export default BlocklistPage

