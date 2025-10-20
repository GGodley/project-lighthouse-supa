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
      companies: {
        Row: {
          company_id: string
          company_name: string | null
          created_at: string | null
          domain_name: string
          health_score: number | null
          last_interaction_at: string | null
          mrr: number | null
          overall_sentiment: string | null
          renewal_date: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_id?: string
          company_name?: string | null
          created_at?: string | null
          domain_name: string
          health_score?: number | null
          last_interaction_at?: string | null
          mrr?: number | null
          overall_sentiment?: string | null
          renewal_date?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          company_name?: string | null
          created_at?: string | null
          domain_name?: string
          health_score?: number | null
          last_interaction_at?: string | null
          mrr?: number | null
          overall_sentiment?: string | null
          renewal_date?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          company_id: string
          created_at: string
          customer_id: string
          email: string
          full_name: string | null
          last_interaction_at: string | null
          overall_sentiment: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          customer_id?: string
          email: string
          full_name?: string | null
          last_interaction_at?: string | null
          overall_sentiment?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_id?: string
          email?: string
          full_name?: string | null
          last_interaction_at?: string | null
          overall_sentiment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["company_id"]
          },
        ]
      }
      customers_archive: {
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
            referencedColumns: ["customer_id"]
          },
        ]
      }
      feature_requests: {
        Row: {
          company_id: string | null
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
          company_id?: string | null
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
          company_id?: string | null
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
            foreignKeyName: "feature_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["company_id"]
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
      meeting_job_queue: {
        Row: {
          created_at: string
          id: number
          meeting_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: number
          meeting_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: number
          meeting_id?: string
          status?: string
        }
        Relationships: []
      }
      meetings: {
        Row: {
          attendees: Json | null
          created_at: string
          customer_id: string | null
          customer_sentiment: string | null
          description: string | null
          dispatch_status: string | null
          end_time: string | null
          google_event_id: string
          hangout_link: string | null
          meeting_customer: string | null
          next_steps: string | null
          recall_bot_id: string | null
          sentiment_score: number | null
          start_time: string | null
          status: string | null
          summary: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attendees?: Json | null
          created_at?: string
          customer_id?: string | null
          customer_sentiment?: string | null
          description?: string | null
          dispatch_status?: string | null
          end_time?: string | null
          google_event_id: string
          hangout_link?: string | null
          meeting_customer?: string | null
          next_steps?: string | null
          recall_bot_id?: string | null
          sentiment_score?: number | null
          start_time?: string | null
          status?: string | null
          summary?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attendees?: Json | null
          created_at?: string
          customer_id?: string | null
          customer_sentiment?: string | null
          description?: string | null
          dispatch_status?: string | null
          end_time?: string | null
          google_event_id?: string
          hangout_link?: string | null
          meeting_customer?: string | null
          next_steps?: string | null
          recall_bot_id?: string | null
          sentiment_score?: number | null
          start_time?: string | null
          status?: string | null
          summary?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["customer_id"]
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
      temp_meetings: {
        Row: {
          created_at: string
          google_event_data: Json
          google_event_id: string | null
          id: number
          processed: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          google_event_data: Json
          google_event_id?: string | null
          id?: number
          processed?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          google_event_data?: Json
          google_event_id?: string | null
          id?: number
          processed?: boolean
          user_id?: string
        }
        Relationships: []
      }
      transcription_jobs: {
        Row: {
          assemblyai_id: string | null
          audio_url: string | null
          company_id: string | null
          completed_at: string | null
          created_at: string | null
          customer_id: string | null
          entities: Json | null
          error_message: string | null
          failed_at: string | null
          highlights: Json | null
          iab_categories: Json | null
          id: string
          meeting_id: string
          meeting_url: string | null
          recall_bot_id: string | null
          sentiment_analysis: Json | null
          status: string
          summary: string | null
          summary_raw_response: string | null
          transcript_text: string | null
          updated_at: string | null
          user_id: string
          utterances: Json | null
        }
        Insert: {
          assemblyai_id?: string | null
          audio_url?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          entities?: Json | null
          error_message?: string | null
          failed_at?: string | null
          highlights?: Json | null
          iab_categories?: Json | null
          id?: string
          meeting_id: string
          meeting_url?: string | null
          recall_bot_id?: string | null
          sentiment_analysis?: Json | null
          status?: string
          summary?: string | null
          summary_raw_response?: string | null
          transcript_text?: string | null
          updated_at?: string | null
          user_id: string
          utterances?: Json | null
        }
        Update: {
          assemblyai_id?: string | null
          audio_url?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          entities?: Json | null
          error_message?: string | null
          failed_at?: string | null
          highlights?: Json | null
          iab_categories?: Json | null
          id?: string
          meeting_id?: string
          meeting_url?: string | null
          recall_bot_id?: string | null
          sentiment_analysis?: Json | null
          status?: string
          summary?: string | null
          summary_raw_response?: string | null
          transcript_text?: string | null
          updated_at?: string | null
          user_id?: string
          utterances?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "transcription_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "transcription_jobs_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["google_event_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_company_page_details: {
        Args: { company_id_param: string }
        Returns: Json
      }
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
