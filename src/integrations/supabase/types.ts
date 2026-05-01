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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cases: {
        Row: {
          address: string | null
          ai_summary: string | null
          ai_summary_generated_at: string | null
          case_number: string
          client_name: string
          client_phone: string | null
          created_at: string
          drive_folder_url: string | null
          estimated_value: number | null
          id: string
          inspection_date: string | null
          status: string
          tags: string[] | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          ai_summary?: string | null
          ai_summary_generated_at?: string | null
          case_number: string
          client_name: string
          client_phone?: string | null
          created_at?: string
          drive_folder_url?: string | null
          estimated_value?: number | null
          id?: string
          inspection_date?: string | null
          status?: string
          tags?: string[] | null
          title: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          ai_summary?: string | null
          ai_summary_generated_at?: string | null
          case_number?: string
          client_name?: string
          client_phone?: string | null
          created_at?: string
          drive_folder_url?: string | null
          estimated_value?: number | null
          id?: string
          inspection_date?: string | null
          status?: string
          tags?: string[] | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meeting_recordings: {
        Row: {
          created_at: string
          drive_url: string | null
          duration: string | null
          filename: string
          id: string
          meeting_id: string
          recorded_at: string
          transcript: string | null
          transcript_status: string
          transcription_service: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          drive_url?: string | null
          duration?: string | null
          filename: string
          id?: string
          meeting_id: string
          recorded_at?: string
          transcript?: string | null
          transcript_status?: string
          transcription_service?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          drive_url?: string | null
          duration?: string | null
          filename?: string
          id?: string
          meeting_id?: string
          recorded_at?: string
          transcript?: string | null
          transcript_status?: string
          transcription_service?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_recordings_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          ai_summary: string | null
          ai_summary_generated_at: string | null
          client_name: string | null
          created_at: string
          id: string
          location: string | null
          meeting_date: string | null
          notes: string | null
          project_name: string | null
          status: string
          tags: string[] | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_summary?: string | null
          ai_summary_generated_at?: string | null
          client_name?: string | null
          created_at?: string
          id?: string
          location?: string | null
          meeting_date?: string | null
          notes?: string | null
          project_name?: string | null
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_summary?: string | null
          ai_summary_generated_at?: string | null
          client_name?: string | null
          created_at?: string
          id?: string
          location?: string | null
          meeting_date?: string | null
          notes?: string | null
          project_name?: string | null
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          case_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          case_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          case_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          caption: string | null
          case_id: string
          created_at: string
          id: string
          source: string
          uploaded_at: string
          url: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          case_id: string
          created_at?: string
          id?: string
          source?: string
          uploaded_at?: string
          url: string
          user_id: string
        }
        Update: {
          caption?: string | null
          case_id?: string
          created_at?: string
          id?: string
          source?: string
          uploaded_at?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recordings: {
        Row: {
          case_id: string
          created_at: string
          drive_url: string | null
          duration: string | null
          filename: string
          id: string
          recorded_at: string
          transcript: string | null
          transcript_status: string
          transcription_service: string | null
          user_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          drive_url?: string | null
          duration?: string | null
          filename: string
          id?: string
          recorded_at?: string
          transcript?: string | null
          transcript_status?: string
          transcription_service?: string | null
          user_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          drive_url?: string | null
          duration?: string | null
          filename?: string
          id?: string
          recorded_at?: string
          transcript?: string | null
          transcript_status?: string
          transcription_service?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recordings_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          content: string
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          cost_usd: number
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          quantity: number
          service: string
          unit: string
          user_id: string
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          quantity?: number
          service: string
          unit: string
          user_id: string
        }
        Update: {
          cost_usd?: number
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          quantity?: number
          service?: string
          unit?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "appraiser" | "architect" | "admin"
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
      app_role: ["appraiser", "architect", "admin"],
    },
  },
} as const
