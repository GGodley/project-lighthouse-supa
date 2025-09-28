export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          provider: 'google' | 'microsoft'
          provider_id: string
          gmail_access_token: string | null
          gmail_refresh_token: string | null
          microsoft_access_token: string | null
          microsoft_refresh_token: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          provider: 'google' | 'microsoft'
          provider_id: string
          gmail_access_token?: string | null
          gmail_refresh_token?: string | null
          microsoft_access_token?: string | null
          microsoft_refresh_token?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          provider?: 'google' | 'microsoft'
          provider_id?: string
          gmail_access_token?: string | null
          gmail_refresh_token?: string | null
          microsoft_access_token?: string | null
          microsoft_refresh_token?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      clients: {
        Row: {
          id: string
          user_id: string
          name: string
          email: string
          company: string | null
          phone: string | null
          status: 'active' | 'inactive' | 'prospect'
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          email: string
          company?: string | null
          phone?: string | null
          status?: 'active' | 'inactive' | 'prospect'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          email?: string
          company?: string | null
          phone?: string | null
          status?: 'active' | 'inactive' | 'prospect'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      tickets: {
        Row: {
          id: string
          user_id: string
          client_id: string
          title: string
          description: string
          status: 'open' | 'in_progress' | 'resolved' | 'closed'
          priority: 'low' | 'medium' | 'high' | 'urgent'
          assigned_to: string | null
          due_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          client_id: string
          title: string
          description: string
          status?: 'open' | 'in_progress' | 'resolved' | 'closed'
          priority?: 'low' | 'medium' | 'high' | 'urgent'
          assigned_to?: string | null
          due_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          client_id?: string
          title?: string
          description?: string
          status?: 'open' | 'in_progress' | 'resolved' | 'closed'
          priority?: 'low' | 'medium' | 'high' | 'urgent'
          assigned_to?: string | null
          due_date?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      events: {
        Row: {
          id: string
          user_id: string
          client_id: string | null
          title: string
          description: string | null
          start_date: string
          end_date: string
          type: 'meeting' | 'call' | 'email' | 'task' | 'other'
          status: 'scheduled' | 'completed' | 'cancelled'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          client_id?: string | null
          title: string
          description?: string | null
          start_date: string
          end_date: string
          type?: 'meeting' | 'call' | 'email' | 'task' | 'other'
          status?: 'scheduled' | 'completed' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          client_id?: string | null
          title?: string
          description?: string | null
          start_date?: string
          end_date?: string
          type?: 'meeting' | 'call' | 'email' | 'task' | 'other'
          status?: 'scheduled' | 'completed' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
      }
      emails: {
        Row: {
          id: string
          user_id: string
          client_id: string | null
          message_id: string
          thread_id: string
          subject: string
          sender: string
          recipient: string
          body: string
          html_body: string | null
          date: string
          is_read: boolean
          labels: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          client_id?: string | null
          message_id: string
          thread_id: string
          subject: string
          sender: string
          recipient: string
          body: string
          html_body?: string | null
          date: string
          is_read?: boolean
          labels?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          client_id?: string | null
          message_id?: string
          thread_id?: string
          subject?: string
          sender?: string
          recipient?: string
          body?: string
          html_body?: string | null
          date?: string
          is_read?: boolean
          labels?: string[]
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
