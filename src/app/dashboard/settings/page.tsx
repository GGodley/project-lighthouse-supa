'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSupabase } from '@/components/SupabaseProvider'
import { Database } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { Mail, User, Key, Trash2, RefreshCw } from 'lucide-react'

type Profile = Database['public']['Tables']['profiles']['Row']

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const supabase = useSupabase()

  const fetchProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (error) throw error
      setProfile(data)
    } catch (error) {
      console.error('Error fetching profile:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const syncEmails = async () => {
    setSyncing(true)
    try {
      const response = await fetch('/api/sync-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        alert('Emails synced successfully!')
      } else {
        throw new Error('Failed to sync emails')
      }
    } catch (error) {
      console.error('Error syncing emails:', error)
      alert('Failed to sync emails. Please try again.')
    } finally {
      setSyncing(false)
    }
  }

  const disconnectGmail = async () => {
    if (!confirm('Are you sure you want to disconnect Gmail? This will stop email syncing.')) {
      return
    }

    if (!profile?.id) {
      alert('Profile not found. Please refresh the page and try again.')
      return
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          gmail_access_token: null,
          gmail_refresh_token: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)

      if (error) throw error
      await fetchProfile()
      alert('Gmail disconnected successfully!')
    } catch (error) {
      console.error('Error disconnecting Gmail:', error)
      alert('Failed to disconnect Gmail. Please try again.')
    }
  }

  const disconnectMicrosoft = async () => {
    if (!confirm('Are you sure you want to disconnect Microsoft? This will stop email syncing.')) {
      return
    }

    if (!profile?.id) {
      alert('Profile not found. Please refresh the page and try again.')
      return
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          microsoft_access_token: null,
          microsoft_refresh_token: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)

      if (error) throw error
      await fetchProfile()
      alert('Microsoft disconnected successfully!')
    } catch (error) {
      console.error('Error disconnecting Microsoft:', error)
      alert('Failed to disconnect Microsoft. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500">Profile not found</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen glass-bg">
      <div className="max-w-7xl mx-auto p-6">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage your account and integrations</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center space-x-3 mb-6">
            <User className="w-6 h-6 text-gray-600" />
            <h2 className="text-xl font-semibold text-gray-900">Profile Information</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <p className="mt-1 text-sm text-gray-900">{profile.full_name || 'Not provided'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <p className="mt-1 text-sm text-gray-900">{profile.email}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Provider</label>
              <p className="mt-1 text-sm text-gray-900 capitalize">{profile.provider}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Member Since</label>
              <p className="mt-1 text-sm text-gray-900">
                {new Date(profile.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Email Integrations */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center space-x-3 mb-6">
            <Mail className="w-6 h-6 text-gray-600" />
            <h2 className="text-xl font-semibold text-gray-900">Email Integrations</h2>
          </div>
          
          <div className="space-y-4">
            {/* Gmail Integration */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Mail className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Gmail</h3>
                  <p className="text-sm text-gray-500">
                    {profile.gmail_access_token ? 'Connected' : 'Not connected'}
                  </p>
                </div>
              </div>
              <div className="flex space-x-2">
                {profile.gmail_access_token ? (
                  <>
                    <Button
                      onClick={syncEmails}
                      disabled={syncing}
                      size="sm"
                      variant="outline"
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                      {syncing ? 'Syncing...' : 'Sync'}
                    </Button>
                    <Button
                      onClick={disconnectGmail}
                      size="sm"
                      variant="outline"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button size="sm">
                    Connect Gmail
                  </Button>
                )}
              </div>
            </div>

            {/* Microsoft Integration */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Mail className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Microsoft</h3>
                  <p className="text-sm text-gray-500">
                    {profile.microsoft_access_token ? 'Connected' : 'Not connected'}
                  </p>
                </div>
              </div>
              <div className="flex space-x-2">
                {profile.microsoft_access_token ? (
                  <>
                    <Button
                      onClick={syncEmails}
                      disabled={syncing}
                      size="sm"
                      variant="outline"
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                      {syncing ? 'Syncing...' : 'Sync'}
                    </Button>
                    <Button
                      onClick={disconnectMicrosoft}
                      size="sm"
                      variant="outline"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button size="sm">
                    Connect Microsoft
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Account Security */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center space-x-3 mb-6">
            <Key className="w-6 h-6 text-gray-600" />
            <h2 className="text-xl font-semibold text-gray-900">Account Security</h2>
          </div>
          
          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="text-sm font-medium text-yellow-800">Data Privacy</h3>
              <p className="mt-1 text-sm text-yellow-700">
                Your email data is encrypted and stored securely. We only access emails you explicitly grant permission for.
              </p>
            </div>
            
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-sm font-medium text-blue-800">Permissions</h3>
              <p className="mt-1 text-sm text-blue-700">
                You can revoke email access at any time by disconnecting your accounts above.
              </p>
            </div>
          </div>
        </div>

        {/* Usage Statistics */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Usage Statistics</h2>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Account Created</span>
              <span className="text-sm font-medium text-gray-900">
                {new Date(profile.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Last Updated</span>
              <span className="text-sm font-medium text-gray-900">
                {new Date(profile.updated_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Provider</span>
              <span className="text-sm font-medium text-gray-900 capitalize">
                {profile.provider}
              </span>
            </div>
          </div>
        </div>
      </div>
        </div>
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'
