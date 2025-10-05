export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      customers: {
        Row: {
          company_name: string | null
          contact_email: string | null
          created_at: string
          email: string | null
          health_score: number | null
          id: string
          last_interaction_at: string | null
          mrr: number | null
          name: string
          overall_sentiment: string | null
          renewal_date: string | null
          status: Database["public"]["Enums"]["customer_status"] | null
          user_id: string | null
        }
        Insert: {
          company_name?: string | null
          contact_email?: string | null
          created_at?: string
          email?: string | null
          health_score?: number | null
          id?: string
          last_interaction_at?: string | null
          mrr?: number | null
          name: string
          overall_sentiment?: string | null
          renewal_date?: string | null
          status?: Database["public"]["Enums"]["customer_status"] | null
          user_id?: string | null
        }
        Update: {
          company_name?: string | null
          contact_email?: string | null
          created_at?: string
          email?: string | null
          health_score?: number | null
          id?: string
          last_interaction_at?: string | null
          mrr?: number | null
          name?: string
          overall_sentiment?: string | null
          renewal_date?: string | null
          status?: Database["public"]["Enums"]["customer_status"] | null
          user_id?: string | null
        }
        Relationships: []
      }
      emails: {
        Row: {
          body_html: string | null
          body_text: string | null
          created_at: string
          customer_id: string | null
          gmail_message_id: string | null
          id: number
          next_steps: string[] | null
          outstanding_issues: string[] | null
          received_at: string | null
          recipient: string | null
          sender: string | null
          sentiment: string | null
          snippet: string | null
          subject: string | null
          summary: string | null
          user_id: string
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          customer_id?: string | null
          gmail_message_id?: string | null
          id?: never
          next_steps?: string[] | null
          outstanding_issues?: string[] | null
          received_at?: string | null
          recipient?: string | null
          sender?: string | null
          sentiment?: string | null
          snippet?: string | null
          subject?: string | null
          summary?: string | null
          user_id: string
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          customer_id?: string | null
          gmail_message_id?: string | null
          id?: never
          next_steps?: string[] | null
          outstanding_issues?: string[] | null
          received_at?: string | null
          recipient?: string | null
          sender?: string | null
          sentiment?: string | null
          snippet?: string | null
          subject?: string | null
          summary?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emails_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_requests: {
        Row: {
          customer_id: string
          email_id: number | null
          feature_id: string
          id: string
          meeting_id: number | null
          request_details: string | null
          requested_at: string
          source: Database["public"]["Enums"]["feature_request_source"] | null
          urgency: Database["public"]["Enums"]["urgency_level"]
        }
        Insert: {
          customer_id: string
          email_id?: number | null
          feature_id: string
          id?: string
          meeting_id?: number | null
          request_details?: string | null
          requested_at?: string
          source?: Database["public"]["Enums"]["feature_request_source"] | null
          urgency?: Database["public"]["Enums"]["urgency_level"]
        }
        Update: {
          customer_id?: string
          email_id?: number | null
          feature_id?: string
          id?: string
          meeting_id?: number | null
          request_details?: string | null
          requested_at?: string
          source?: Database["public"]["Enums"]["feature_request_source"] | null
          urgency?: Database["public"]["Enums"]["urgency_level"]
        }
        Relationships: [
          {
            foreignKeyName: "feature_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_requests_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_requests_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_requests_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      features: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          high_urgency_count: number
          id: string
          low_urgency_count: number
          medium_urgency_count: number
          request_count: number
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          high_urgency_count?: number
          id?: string
          low_urgency_count?: number
          medium_urgency_count?: number
          request_count?: number
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          high_urgency_count?: number
          id?: string
          low_urgency_count?: number
          medium_urgency_count?: number
          request_count?: number
          title?: string
        }
        Relationships: []
      }
      meetings: {
        Row: {
          attendants: Json | null
          attendees: Json | null
          created_at: string
          customer_id: string | null
          description: string | null
          end_date: string | null
          external_attendees: Json | null
          google_event_id: string | null
          id: number
          location: string | null
          meeting_date: string
          next_steps: Json | null
          outstanding_issues: Json | null
          sentiment: string | null
          summary: string | null
          title: string | null
          topics: Json | null
          user_id: string
        }
        Insert: {
          attendants?: Json | null
          attendees?: Json | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          end_date?: string | null
          external_attendees?: Json | null
          google_event_id?: string | null
          id?: never
          location?: string | null
          meeting_date: string
          next_steps?: Json | null
          outstanding_issues?: Json | null
          sentiment?: string | null
          summary?: string | null
          title?: string | null
          topics?: Json | null
          user_id: string
        }
        Update: {
          attendants?: Json | null
          attendees?: Json | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          end_date?: string | null
          external_attendees?: Json | null
          google_event_id?: string | null
          id?: never
          location?: string | null
          meeting_date?: string
          next_steps?: Json | null
          outstanding_issues?: Json | null
          sentiment?: string | null
          summary?: string | null
          title?: string | null
          topics?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          gmail_access_token: string | null
          gmail_refresh_token: string | null
          id: string
          microsoft_access_token: string | null
          microsoft_refresh_token: string | null
          provider: string | null
          provider_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          gmail_access_token?: string | null
          gmail_refresh_token?: string | null
          id: string
          microsoft_access_token?: string | null
          microsoft_refresh_token?: string | null
          provider?: string | null
          provider_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          gmail_access_token?: string | null
          gmail_refresh_token?: string | null
          id?: string
          microsoft_access_token?: string | null
          microsoft_refresh_token?: string | null
          provider?: string | null
          provider_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      summarization_jobs: {
        Row: {
          attempts: number
          created_at: string
          details: string | null
          email_id: number
          id: number
          status: string
          updated_at: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          details?: string | null
          email_id: number
          id?: number
          status?: string
          updated_at?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          details?: string | null
          email_id?: number
          id?: number
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "summarization_jobs_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: true
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_jobs: {
        Row: {
          created_at: string
          details: string | null
          id: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_customer_profile_details: {
        Args: { p_customer_id: string; p_requesting_user_id: string }
        Returns: Json
      }
      get_user_feature_analytics: {
        Args: { requesting_user_id: string }
        Returns: {
          high_urgency_count: number
          low_urgency_count: number
          medium_urgency_count: number
          title: string
        }[]
      }
    }
    Enums: {
      customer_status: "Healthy" | "Needs Attention" | "At Risk"
      feature_request_source: "email" | "meeting" | "manual"
      urgency_level: "Low" | "Medium" | "High"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      customer_status: ["Healthy", "Needs Attention", "At Risk"],
      feature_request_source: ["email", "meeting", "manual"],
      urgency_level: ["Low", "Medium", "High"],
    },
  },
} as const
