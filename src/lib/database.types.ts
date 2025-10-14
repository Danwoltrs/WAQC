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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          id: string
          processed_at: string | null
          processed_by: string | null
          request_message: string | null
          requested_at: string | null
          requested_laboratory_id: string | null
          requested_role: string | null
          status: string | null
          updated_at: string | null
          user_email: string
          user_full_name: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          request_message?: string | null
          requested_at?: string | null
          requested_laboratory_id?: string | null
          requested_role?: string | null
          status?: string | null
          updated_at?: string | null
          user_email: string
          user_full_name: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string | null
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          request_message?: string | null
          requested_at?: string | null
          requested_laboratory_id?: string | null
          requested_role?: string | null
          status?: string | null
          updated_at?: string | null
          user_email?: string
          user_full_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_requests_requested_laboratory_id_fkey"
            columns: ["requested_laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "access_requests_requested_laboratory_id_fkey"
            columns: ["requested_laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "access_requests_requested_laboratory_id_fkey"
            columns: ["requested_laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          activity_date: string
          activity_type: string | null
          assigned_team_ids: string[] | null
          company_id: string | null
          company_name: string | null
          cost: number | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          end_date: string | null
          end_time: string | null
          flight_id: string | null
          host: string | null
          hotel_id: string | null
          id: string
          is_confirmed: boolean | null
          is_parallel_allowed: boolean | null
          location: string | null
          meeting_id: string | null
          notes: string | null
          priority_level: string | null
          start_time: string | null
          status: string | null
          title: string
          trip_id: string
          type: string
          updated_at: string | null
          updated_by: string | null
          visibility_level: string | null
        }
        Insert: {
          activity_date: string
          activity_type?: string | null
          assigned_team_ids?: string[] | null
          company_id?: string | null
          company_name?: string | null
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          flight_id?: string | null
          host?: string | null
          hotel_id?: string | null
          id?: string
          is_confirmed?: boolean | null
          is_parallel_allowed?: boolean | null
          location?: string | null
          meeting_id?: string | null
          notes?: string | null
          priority_level?: string | null
          start_time?: string | null
          status?: string | null
          title: string
          trip_id: string
          type?: string
          updated_at?: string | null
          updated_by?: string | null
          visibility_level?: string | null
        }
        Update: {
          activity_date?: string
          activity_type?: string | null
          assigned_team_ids?: string[] | null
          company_id?: string | null
          company_name?: string | null
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          flight_id?: string | null
          host?: string | null
          hotel_id?: string | null
          id?: string
          is_confirmed?: boolean | null
          is_parallel_allowed?: boolean | null
          location?: string | null
          meeting_id?: string | null
          notes?: string | null
          priority_level?: string | null
          start_time?: string | null
          status?: string | null
          title?: string
          trip_id?: string
          type?: string
          updated_at?: string | null
          updated_by?: string | null
          visibility_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_flight_id_fkey"
            columns: ["flight_id"]
            isOneToOne: false
            referencedRelation: "trip_flights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "trip_hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "trip_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_notes: {
        Row: {
          content: Json
          created_at: string | null
          created_by_name: string | null
          id: string
          is_private: boolean | null
          itinerary_item_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content?: Json
          created_at?: string | null
          created_by_name?: string | null
          id?: string
          is_private?: boolean | null
          itinerary_item_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string | null
          created_by_name?: string | null
          id?: string
          is_private?: boolean | null
          itinerary_item_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_notes_itinerary_item_id_fkey"
            columns: ["itinerary_item_id"]
            isOneToOne: false
            referencedRelation: "itinerary_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_notes_itinerary_item_id_fkey"
            columns: ["itinerary_item_id"]
            isOneToOne: false
            referencedRelation: "upcoming_itinerary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_participants: {
        Row: {
          activity_id: string
          attendance_status: string | null
          created_at: string | null
          id: string
          participant_id: string
          role: string | null
          updated_at: string | null
        }
        Insert: {
          activity_id: string
          attendance_status?: string | null
          created_at?: string | null
          id?: string
          participant_id: string
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          activity_id?: string
          attendance_status?: string | null
          created_at?: string | null
          id?: string
          participant_id?: string
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_participants_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_participants_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities_with_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_participants_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "trip_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_itinerary_suggestions: {
        Row: {
          applied: boolean | null
          confidence_score: number | null
          created_at: string | null
          draft_id: string | null
          id: string
          original_input: string | null
          suggested_output: string | null
          suggestion_type: string
          trip_id: string | null
        }
        Insert: {
          applied?: boolean | null
          confidence_score?: number | null
          created_at?: string | null
          draft_id?: string | null
          id?: string
          original_input?: string | null
          suggested_output?: string | null
          suggestion_type: string
          trip_id?: string | null
        }
        Update: {
          applied?: boolean | null
          confidence_score?: number | null
          created_at?: string | null
          draft_id?: string | null
          id?: string
          original_input?: string | null
          suggested_output?: string | null
          suggestion_type?: string
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_itinerary_suggestions_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "trip_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_itinerary_suggestions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_itinerary_suggestions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_itinerary_suggestions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          api_key: string
          api_secret: string
          client_id: string | null
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_name: string
          last_used_at: string | null
          permissions: string[] | null
          rate_limit: number | null
        }
        Insert: {
          api_key: string
          api_secret: string
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_name: string
          last_used_at?: string | null
          permissions?: string[] | null
          rate_limit?: number | null
        }
        Update: {
          api_key?: string
          api_secret?: string
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_name?: string
          last_used_at?: string | null
          permissions?: string[] | null
          rate_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_billing_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_origin_pricing_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "api_keys_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_deliveries: {
        Row: {
          certificate_id: string | null
          created_at: string | null
          delivered_at: string | null
          delivery_method: string
          delivery_status: string
          error_message: string | null
          id: string
          opened_at: string | null
          recipient_email: string
          retry_count: number | null
          sent_at: string | null
        }
        Insert: {
          certificate_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_method?: string
          delivery_status: string
          error_message?: string | null
          id?: string
          opened_at?: string | null
          recipient_email: string
          retry_count?: number | null
          sent_at?: string | null
        }
        Update: {
          certificate_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_method?: string
          delivery_status?: string
          error_message?: string | null
          id?: string
          opened_at?: string | null
          recipient_email?: string
          retry_count?: number | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificate_deliveries_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_number_configs: {
        Row: {
          client_id: string | null
          created_at: string | null
          current_sequence: number | null
          format_pattern: string
          id: string
          notes: string | null
          quality_id: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          current_sequence?: number | null
          format_pattern: string
          id?: string
          notes?: string | null
          quality_id?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          current_sequence?: number | null
          format_pattern?: string
          id?: string
          notes?: string | null
          quality_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificate_number_configs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_billing_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_number_configs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_origin_pricing_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "certificate_number_configs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_number_configs_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "client_qualities"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_signatures: {
        Row: {
          certificate_id: string | null
          id: string
          signature_hash: string
          signature_type: string
          signed_at: string | null
          signer_id: string | null
        }
        Insert: {
          certificate_id?: string | null
          id?: string
          signature_hash: string
          signature_type: string
          signed_at?: string | null
          signer_id?: string | null
        }
        Update: {
          certificate_id?: string | null
          id?: string
          signature_hash?: string
          signature_type?: string
          signed_at?: string | null
          signer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificate_signatures_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_signatures_signer_id_fkey"
            columns: ["signer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_versions: {
        Row: {
          certificate_id: string | null
          changes_description: string | null
          created_at: string | null
          created_by: string | null
          id: string
          pdf_url: string | null
          version_number: number
        }
        Insert: {
          certificate_id?: string | null
          changes_description?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          pdf_url?: string | null
          version_number: number
        }
        Update: {
          certificate_id?: string | null
          changes_description?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          pdf_url?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "certificate_versions_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          certificate_number: string
          created_at: string | null
          id: string
          issued_by: string | null
          issued_to: string
          pdf_url: string | null
          sample_id: string | null
          status: Database["public"]["Enums"]["certificate_status"] | null
          updated_at: string | null
        }
        Insert: {
          certificate_number: string
          created_at?: string | null
          id?: string
          issued_by?: string | null
          issued_to: string
          pdf_url?: string | null
          sample_id?: string | null
          status?: Database["public"]["Enums"]["certificate_status"] | null
          updated_at?: string | null
        }
        Update: {
          certificate_number?: string
          created_at?: string | null
          id?: string
          issued_by?: string | null
          issued_to?: string
          pdf_url?: string | null
          sample_id?: string | null
          status?: Database["public"]["Enums"]["certificate_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      client_certificate_settings: {
        Row: {
          client_id: string | null
          created_at: string | null
          delivery_timing: string
          id: string
          include_photos: boolean | null
          language: string | null
          notification_emails: string[] | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          delivery_timing?: string
          id?: string
          include_photos?: boolean | null
          language?: string | null
          notification_emails?: string[] | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          delivery_timing?: string
          id?: string
          include_photos?: boolean | null
          language?: string | null
          notification_emails?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_certificate_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_billing_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_certificate_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_origin_pricing_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_certificate_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_matches: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          legacy_client_id: number | null
          match_confidence: number | null
          match_reasons: string[] | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          legacy_client_id?: number | null
          match_confidence?: number | null
          match_reasons?: string[] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          legacy_client_id?: number | null
          match_confidence?: number | null
          match_reasons?: string[] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_matches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_matches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_matches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "client_matches_legacy_client_id_fkey"
            columns: ["legacy_client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["legacy_client_id"]
          },
          {
            foreignKeyName: "client_matches_legacy_client_id_fkey"
            columns: ["legacy_client_id"]
            isOneToOne: false
            referencedRelation: "legacy_clients"
            referencedColumns: ["legacy_client_id"]
          },
        ]
      }
      client_origin_pricing: {
        Row: {
          client_id: string
          created_at: string | null
          currency: string | null
          id: string
          is_active: boolean | null
          origin: string
          price_per_pound_cents: number | null
          price_per_sample: number | null
          pricing_model: Database["public"]["Enums"]["pricing_model"]
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          currency?: string | null
          id?: string
          is_active?: boolean | null
          origin: string
          price_per_pound_cents?: number | null
          price_per_sample?: number | null
          pricing_model: Database["public"]["Enums"]["pricing_model"]
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          currency?: string | null
          id?: string
          is_active?: boolean | null
          origin?: string
          price_per_pound_cents?: number | null
          price_per_sample?: number | null
          pricing_model?: Database["public"]["Enums"]["pricing_model"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_origin_pricing_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_billing_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_origin_pricing_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_origin_pricing_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_origin_pricing_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_qualities: {
        Row: {
          client_id: string | null
          created_at: string | null
          custom_parameters: Json | null
          id: string
          origin: string | null
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          custom_parameters?: Json | null
          id?: string
          origin?: string | null
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          custom_parameters?: Json | null
          id?: string
          origin?: string | null
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_qualities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_billing_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_qualities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_origin_pricing_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_qualities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_qualities_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quality_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_taint_fault_customizations: {
        Row: {
          client_id: string | null
          created_at: string | null
          created_by: string | null
          custom_description_en: string | null
          custom_description_es: string | null
          custom_description_pt: string | null
          custom_scale: string | null
          custom_scale_increment: number | null
          custom_scale_max: number | null
          custom_scale_min: number | null
          definition_id: string | null
          id: string
          is_tolerance_counted: boolean | null
          max_acceptable_score: number | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_description_en?: string | null
          custom_description_es?: string | null
          custom_description_pt?: string | null
          custom_scale?: string | null
          custom_scale_increment?: number | null
          custom_scale_max?: number | null
          custom_scale_min?: number | null
          definition_id?: string | null
          id?: string
          is_tolerance_counted?: boolean | null
          max_acceptable_score?: number | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_description_en?: string | null
          custom_description_es?: string | null
          custom_description_pt?: string | null
          custom_scale?: string | null
          custom_scale_increment?: number | null
          custom_scale_max?: number | null
          custom_scale_min?: number | null
          definition_id?: string | null
          id?: string
          is_tolerance_counted?: boolean | null
          max_acceptable_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_taint_fault_customizations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_billing_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_taint_fault_customizations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_origin_pricing_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_taint_fault_customizations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_taint_fault_customizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_taint_fault_customizations_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "taint_fault_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string
          billing_basis: Database["public"]["Enums"]["billing_basis"] | null
          billing_notes: string | null
          certificate_delivery_timing: string | null
          city: string | null
          client_types: Database["public"]["Enums"]["client_type"][] | null
          company: string
          company_id: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          default_quality_specs: string[] | null
          email: string
          fantasy_name: string | null
          fee_payer: Database["public"]["Enums"]["fee_payer"] | null
          has_origin_pricing: boolean | null
          id: string
          is_active: boolean
          is_qc_client: boolean | null
          legacy_client_id: number | null
          name: string
          notification_emails: string[] | null
          payment_terms: string | null
          phone: string | null
          price_per_pound_cents: number | null
          price_per_sample: number | null
          pricing_model: Database["public"]["Enums"]["pricing_model"] | null
          qc_enabled: boolean | null
          state: string | null
          tracking_number_format: string | null
          updated_at: string | null
        }
        Insert: {
          address: string
          billing_basis?: Database["public"]["Enums"]["billing_basis"] | null
          billing_notes?: string | null
          certificate_delivery_timing?: string | null
          city?: string | null
          client_types?: Database["public"]["Enums"]["client_type"][] | null
          company: string
          company_id?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          default_quality_specs?: string[] | null
          email: string
          fantasy_name?: string | null
          fee_payer?: Database["public"]["Enums"]["fee_payer"] | null
          has_origin_pricing?: boolean | null
          id?: string
          is_active?: boolean
          is_qc_client?: boolean | null
          legacy_client_id?: number | null
          name: string
          notification_emails?: string[] | null
          payment_terms?: string | null
          phone?: string | null
          price_per_pound_cents?: number | null
          price_per_sample?: number | null
          pricing_model?: Database["public"]["Enums"]["pricing_model"] | null
          qc_enabled?: boolean | null
          state?: string | null
          tracking_number_format?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string
          billing_basis?: Database["public"]["Enums"]["billing_basis"] | null
          billing_notes?: string | null
          certificate_delivery_timing?: string | null
          city?: string | null
          client_types?: Database["public"]["Enums"]["client_type"][] | null
          company?: string
          company_id?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          default_quality_specs?: string[] | null
          email?: string
          fantasy_name?: string | null
          fee_payer?: Database["public"]["Enums"]["fee_payer"] | null
          has_origin_pricing?: boolean | null
          id?: string
          is_active?: boolean
          is_qc_client?: boolean | null
          legacy_client_id?: number | null
          name?: string
          notification_emails?: string[] | null
          payment_terms?: string | null
          phone?: string | null
          price_per_pound_cents?: number | null
          price_per_sample?: number | null
          pricing_model?: Database["public"]["Enums"]["pricing_model"] | null
          qc_enabled?: boolean | null
          state?: string | null
          tracking_number_format?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          admin_approval_required: boolean | null
          annual_trip_cost: number | null
          category: Database["public"]["Enums"]["company_category"] | null
          city: string | null
          client_type: Database["public"]["Enums"]["client_type_enum"] | null
          country: string | null
          created_at: string
          email: string | null
          fantasy_name: string | null
          id: string
          latitude: number | null
          legacy_client_id: number | null
          logo_url: string | null
          longitude: number | null
          name: string
          phone: string | null
          region: string | null
          staff_count: number | null
          state: string | null
          subcategories: string[] | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          admin_approval_required?: boolean | null
          annual_trip_cost?: number | null
          category?: Database["public"]["Enums"]["company_category"] | null
          city?: string | null
          client_type?: Database["public"]["Enums"]["client_type_enum"] | null
          country?: string | null
          created_at?: string
          email?: string | null
          fantasy_name?: string | null
          id?: string
          latitude?: number | null
          legacy_client_id?: number | null
          logo_url?: string | null
          longitude?: number | null
          name: string
          phone?: string | null
          region?: string | null
          staff_count?: number | null
          state?: string | null
          subcategories?: string[] | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          admin_approval_required?: boolean | null
          annual_trip_cost?: number | null
          category?: Database["public"]["Enums"]["company_category"] | null
          city?: string | null
          client_type?: Database["public"]["Enums"]["client_type_enum"] | null
          country?: string | null
          created_at?: string
          email?: string | null
          fantasy_name?: string | null
          id?: string
          latitude?: number | null
          legacy_client_id?: number | null
          logo_url?: string | null
          longitude?: number | null
          name?: string
          phone?: string | null
          region?: string | null
          staff_count?: number | null
          state?: string | null
          subcategories?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_legacy_client_id_fkey"
            columns: ["legacy_client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["legacy_client_id"]
          },
          {
            foreignKeyName: "companies_legacy_client_id_fkey"
            columns: ["legacy_client_id"]
            isOneToOne: false
            referencedRelation: "legacy_clients"
            referencedColumns: ["legacy_client_id"]
          },
        ]
      }
      company_contacts: {
        Row: {
          company_id: string
          contact_type: string | null
          created_at: string | null
          department: string | null
          email: string | null
          id: string
          is_active: boolean | null
          is_primary: boolean | null
          name: string
          notes: string | null
          phone: string | null
          title: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          company_id: string
          contact_type?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          company_id?: string
          contact_type?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      company_files: {
        Row: {
          archived_at: string | null
          category: Database["public"]["Enums"]["file_category"]
          client_portal_enabled: boolean
          company_id: string
          created_at: string
          description: string | null
          file_name: string
          file_size: number
          id: string
          is_archived: boolean
          is_client_visible: boolean
          is_latest_version: boolean
          itinerary_item_id: string | null
          meeting_note_id: string | null
          mime_type: string
          parent_file_id: string | null
          search_vector: unknown | null
          storage_bucket: string
          storage_path: string
          tags: string[] | null
          trip_id: string | null
          updated_at: string
          upload_context: Database["public"]["Enums"]["upload_context"]
          uploaded_by_id: string
          version_number: number
        }
        Insert: {
          archived_at?: string | null
          category: Database["public"]["Enums"]["file_category"]
          client_portal_enabled?: boolean
          company_id: string
          created_at?: string
          description?: string | null
          file_name: string
          file_size: number
          id?: string
          is_archived?: boolean
          is_client_visible?: boolean
          is_latest_version?: boolean
          itinerary_item_id?: string | null
          meeting_note_id?: string | null
          mime_type: string
          parent_file_id?: string | null
          search_vector?: unknown | null
          storage_bucket?: string
          storage_path: string
          tags?: string[] | null
          trip_id?: string | null
          updated_at?: string
          upload_context: Database["public"]["Enums"]["upload_context"]
          uploaded_by_id: string
          version_number?: number
        }
        Update: {
          archived_at?: string | null
          category?: Database["public"]["Enums"]["file_category"]
          client_portal_enabled?: boolean
          company_id?: string
          created_at?: string
          description?: string | null
          file_name?: string
          file_size?: number
          id?: string
          is_archived?: boolean
          is_client_visible?: boolean
          is_latest_version?: boolean
          itinerary_item_id?: string | null
          meeting_note_id?: string | null
          mime_type?: string
          parent_file_id?: string | null
          search_vector?: unknown | null
          storage_bucket?: string
          storage_path?: string
          tags?: string[] | null
          trip_id?: string | null
          updated_at?: string
          upload_context?: Database["public"]["Enums"]["upload_context"]
          uploaded_by_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_files_itinerary_item_id_fkey"
            columns: ["itinerary_item_id"]
            isOneToOne: false
            referencedRelation: "itinerary_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_files_itinerary_item_id_fkey"
            columns: ["itinerary_item_id"]
            isOneToOne: false
            referencedRelation: "upcoming_itinerary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_files_meeting_note_id_fkey"
            columns: ["meeting_note_id"]
            isOneToOne: false
            referencedRelation: "meeting_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_files_parent_file_id_fkey"
            columns: ["parent_file_id"]
            isOneToOne: false
            referencedRelation: "company_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_files_parent_file_id_fkey"
            columns: ["parent_file_id"]
            isOneToOne: false
            referencedRelation: "file_sharing_summary"
            referencedColumns: ["file_id"]
          },
          {
            foreignKeyName: "company_files_parent_file_id_fkey"
            columns: ["parent_file_id"]
            isOneToOne: false
            referencedRelation: "user_accessible_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_files_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_files_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_files_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_files_uploaded_by_id_fkey"
            columns: ["uploaded_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      company_interactions: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          file_id: string | null
          id: string
          interaction_date: string
          interaction_type: Database["public"]["Enums"]["interaction_type"]
          meeting_note_id: string | null
          metadata: Json | null
          title: string
          trip_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          file_id?: string | null
          id?: string
          interaction_date?: string
          interaction_type: Database["public"]["Enums"]["interaction_type"]
          meeting_note_id?: string | null
          metadata?: Json | null
          title: string
          trip_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          file_id?: string | null
          id?: string
          interaction_date?: string
          interaction_type?: Database["public"]["Enums"]["interaction_type"]
          meeting_note_id?: string | null
          metadata?: Json | null
          title?: string
          trip_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_interactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_interactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_interactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_interactions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "company_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_interactions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file_sharing_summary"
            referencedColumns: ["file_id"]
          },
          {
            foreignKeyName: "company_interactions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "user_accessible_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_interactions_meeting_note_id_fkey"
            columns: ["meeting_note_id"]
            isOneToOne: false
            referencedRelation: "meeting_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_interactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_interactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_interactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      company_locations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          cep: string | null
          city: string | null
          company_id: string
          contact_person: string | null
          country: string | null
          created_at: string
          description: string | null
          email: string | null
          id: string
          is_active: boolean | null
          is_headquarters: boolean | null
          last_visit_date: string | null
          latitude: number | null
          longitude: number | null
          meeting_history_count: number | null
          name: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          state_province: string | null
          updated_at: string
          visit_notes: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          cep?: string | null
          city?: string | null
          company_id: string
          contact_person?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_headquarters?: boolean | null
          last_visit_date?: string | null
          latitude?: number | null
          longitude?: number | null
          meeting_history_count?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          state_province?: string | null
          updated_at?: string
          visit_notes?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          cep?: string | null
          city?: string | null
          company_id?: string
          contact_person?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_headquarters?: boolean | null
          last_visit_date?: string | null
          latitude?: number | null
          longitude?: number | null
          meeting_history_count?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          state_province?: string | null
          updated_at?: string
          visit_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      company_tags: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          created_by_id: string
          id: string
          tag_category: string | null
          tag_name: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          created_by_id: string
          id?: string
          tag_category?: string | null
          tag_name: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          created_by_id?: string
          id?: string
          tag_category?: string | null
          tag_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_tags_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      company_user_roles: {
        Row: {
          can_create_trips: boolean | null
          can_edit_all_company_trips: boolean | null
          can_manage_users: boolean | null
          can_view_all_company_trips: boolean | null
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          can_create_trips?: boolean | null
          can_edit_all_company_trips?: boolean | null
          can_manage_users?: boolean | null
          can_view_all_company_trips?: boolean | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          role?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          can_create_trips?: boolean | null
          can_edit_all_company_trips?: boolean | null
          can_manage_users?: boolean | null
          can_view_all_company_trips?: boolean | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_user_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      convention_events: {
        Row: {
          convention_id: string
          created_at: string | null
          end_date: string | null
          estimated_cost: number | null
          id: string
          is_confirmed: boolean | null
          location: string | null
          notes: string | null
          registration_url: string | null
          start_date: string | null
          updated_at: string | null
          venue: string | null
          year: number
        }
        Insert: {
          convention_id: string
          created_at?: string | null
          end_date?: string | null
          estimated_cost?: number | null
          id?: string
          is_confirmed?: boolean | null
          location?: string | null
          notes?: string | null
          registration_url?: string | null
          start_date?: string | null
          updated_at?: string | null
          venue?: string | null
          year: number
        }
        Update: {
          convention_id?: string
          created_at?: string | null
          end_date?: string | null
          estimated_cost?: number | null
          id?: string
          is_confirmed?: boolean | null
          location?: string | null
          notes?: string | null
          registration_url?: string | null
          start_date?: string | null
          updated_at?: string | null
          venue?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "convention_events_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
        ]
      }
      conventions: {
        Row: {
          contact_info: Json | null
          created_at: string
          date_pattern: string | null
          description: string | null
          id: string
          is_predefined: boolean | null
          name: string
          organization: string | null
          search_keywords: string[] | null
          typical_dates: string | null
          typical_location: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          contact_info?: Json | null
          created_at?: string
          date_pattern?: string | null
          description?: string | null
          id?: string
          is_predefined?: boolean | null
          name: string
          organization?: string | null
          search_keywords?: string[] | null
          typical_dates?: string | null
          typical_location?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          contact_info?: Json | null
          created_at?: string
          date_pattern?: string | null
          description?: string | null
          id?: string
          is_predefined?: boolean | null
          name?: string
          organization?: string | null
          search_keywords?: string[] | null
          typical_dates?: string | null
          typical_location?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      cupping_attribute_definitions: {
        Row: {
          attribute_name: string
          attribute_name_en: string
          attribute_name_es: string | null
          attribute_name_pt: string | null
          client_id: string | null
          created_at: string | null
          display_order: number
          id: string
          is_active: boolean | null
          is_required: boolean | null
          only_for_q_grading: boolean | null
          quality_id: string | null
          scale_increment: number | null
          scale_max: number | null
          scale_min: number | null
          scale_type: string | null
          updated_at: string | null
        }
        Insert: {
          attribute_name: string
          attribute_name_en: string
          attribute_name_es?: string | null
          attribute_name_pt?: string | null
          client_id?: string | null
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          only_for_q_grading?: boolean | null
          quality_id?: string | null
          scale_increment?: number | null
          scale_max?: number | null
          scale_min?: number | null
          scale_type?: string | null
          updated_at?: string | null
        }
        Update: {
          attribute_name?: string
          attribute_name_en?: string
          attribute_name_es?: string | null
          attribute_name_pt?: string | null
          client_id?: string | null
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          only_for_q_grading?: boolean | null
          quality_id?: string | null
          scale_increment?: number | null
          scale_max?: number | null
          scale_min?: number | null
          scale_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cupping_attribute_definitions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_billing_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_attribute_definitions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_origin_pricing_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "cupping_attribute_definitions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_attribute_definitions_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "client_qualities"
            referencedColumns: ["id"]
          },
        ]
      }
      cupping_descriptors: {
        Row: {
          category: string | null
          created_at: string | null
          descriptor_name: string
          id: string
          is_active: boolean | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          descriptor_name: string
          id?: string
          is_active?: boolean | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          descriptor_name?: string
          id?: string
          is_active?: boolean | null
        }
        Relationships: []
      }
      cupping_scale_configs: {
        Row: {
          client_id: string | null
          created_at: string | null
          id: string
          increment: number
          max_value: number
          min_total_score: number | null
          min_value: number
          quality_id: string | null
          scale_type: string
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          increment: number
          max_value: number
          min_total_score?: number | null
          min_value: number
          quality_id?: string | null
          scale_type: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          increment?: number
          max_value?: number
          min_total_score?: number | null
          min_value?: number
          quality_id?: string | null
          scale_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cupping_scale_configs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_billing_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_scale_configs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_origin_pricing_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "cupping_scale_configs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_scale_configs_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "client_qualities"
            referencedColumns: ["id"]
          },
        ]
      }
      cupping_scores: {
        Row: {
          created_at: string | null
          cupper_id: string | null
          defects: Json | null
          id: string
          notes: string | null
          sample_id: string | null
          scores: Json
          session_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          cupper_id?: string | null
          defects?: Json | null
          id?: string
          notes?: string | null
          sample_id?: string | null
          scores?: Json
          session_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          cupper_id?: string | null
          defects?: Json | null
          id?: string
          notes?: string | null
          sample_id?: string | null
          scores?: Json
          session_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cupping_scores_cupper_id_fkey"
            columns: ["cupper_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_scores_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_scores_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cupping_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cupping_sessions: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          participants: string[]
          sample_ids: string[]
          session_type: Database["public"]["Enums"]["session_type"] | null
          status: Database["public"]["Enums"]["session_status"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          participants: string[]
          sample_ids: string[]
          session_type?: Database["public"]["Enums"]["session_type"] | null
          status?: Database["public"]["Enums"]["session_status"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          participants?: string[]
          sample_ids?: string[]
          session_type?: Database["public"]["Enums"]["session_type"] | null
          status?: Database["public"]["Enums"]["session_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cupping_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      defect_definitions: {
        Row: {
          category: Database["public"]["Enums"]["defect_category"]
          client_id: string | null
          created_at: string | null
          created_by: string | null
          defect_name: string
          description_en: string | null
          description_es: string | null
          description_pt: string | null
          id: string
          is_active: boolean | null
          name_en: string
          name_es: string | null
          name_pt: string | null
          origin: string
          point_value: number
          sample_size_grams: number | null
          updated_at: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["defect_category"]
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          defect_name: string
          description_en?: string | null
          description_es?: string | null
          description_pt?: string | null
          id?: string
          is_active?: boolean | null
          name_en: string
          name_es?: string | null
          name_pt?: string | null
          origin: string
          point_value: number
          sample_size_grams?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["defect_category"]
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          defect_name?: string
          description_en?: string | null
          description_es?: string | null
          description_pt?: string | null
          id?: string
          is_active?: boolean | null
          name_en?: string
          name_es?: string | null
          name_pt?: string | null
          origin?: string
          point_value?: number
          sample_size_grams?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "defect_definitions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_billing_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_definitions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_origin_pricing_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "defect_definitions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_permissions: {
        Row: {
          access_level: string | null
          company_id: string | null
          created_at: string | null
          document_id: string | null
          granted_by: string | null
          id: string
          lab_id: string | null
          user_id: string | null
        }
        Insert: {
          access_level?: string | null
          company_id?: string | null
          created_at?: string | null
          document_id?: string | null
          granted_by?: string | null
          id?: string
          lab_id?: string | null
          user_id?: string | null
        }
        Update: {
          access_level?: string | null
          company_id?: string | null
          created_at?: string | null
          document_id?: string | null
          granted_by?: string | null
          id?: string
          lab_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "document_permissions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_permissions_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          access_level: string | null
          category: string | null
          certifications: string[] | null
          coffee_metadata: Json | null
          company_id: string | null
          created_at: string | null
          crop_numbers: string[] | null
          crop_season: string | null
          description: string | null
          document_type: string | null
          file_size: number | null
          file_type: string
          filename: string
          harvest_year: number | null
          id: string
          is_shared: boolean | null
          lab_id: string | null
          meeting_id: string | null
          original_filename: string
          quality_grades: string[] | null
          regions: string[] | null
          sharing_policy: string | null
          storage_path: string
          suppliers: string[] | null
          supply_info: string[] | null
          tags: string[] | null
          trip_id: string | null
          updated_at: string | null
          uploaded_by: string | null
          urgency_level: string | null
          visibility: string | null
        }
        Insert: {
          access_level?: string | null
          category?: string | null
          certifications?: string[] | null
          coffee_metadata?: Json | null
          company_id?: string | null
          created_at?: string | null
          crop_numbers?: string[] | null
          crop_season?: string | null
          description?: string | null
          document_type?: string | null
          file_size?: number | null
          file_type: string
          filename: string
          harvest_year?: number | null
          id?: string
          is_shared?: boolean | null
          lab_id?: string | null
          meeting_id?: string | null
          original_filename: string
          quality_grades?: string[] | null
          regions?: string[] | null
          sharing_policy?: string | null
          storage_path: string
          suppliers?: string[] | null
          supply_info?: string[] | null
          tags?: string[] | null
          trip_id?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          urgency_level?: string | null
          visibility?: string | null
        }
        Update: {
          access_level?: string | null
          category?: string | null
          certifications?: string[] | null
          coffee_metadata?: Json | null
          company_id?: string | null
          created_at?: string | null
          crop_numbers?: string[] | null
          crop_season?: string | null
          description?: string | null
          document_type?: string | null
          file_size?: number | null
          file_type?: string
          filename?: string
          harvest_year?: number | null
          id?: string
          is_shared?: boolean | null
          lab_id?: string | null
          meeting_id?: string | null
          original_filename?: string
          quality_grades?: string[] | null
          regions?: string[] | null
          sharing_policy?: string | null
          storage_path?: string
          suppliers?: string[] | null
          supply_info?: string[] | null
          tags?: string[] | null
          trip_id?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          urgency_level?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "documents_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_handovers: {
        Row: {
          completed_at: string | null
          created_at: string
          digital_signature_data: Json | null
          fuel_level_percentage: number | null
          handover_datetime: string
          handover_location: string | null
          id: string
          incoming_driver_id: string
          issues_reported: string | null
          latitude: number | null
          longitude: number | null
          outgoing_driver_id: string
          photo_attachments: Json | null
          status: Database["public"]["Enums"]["handover_status"]
          trip_id: string
          updated_at: string
          vehicle_condition_notes: string | null
          vehicle_id: string
          vehicle_mileage: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          digital_signature_data?: Json | null
          fuel_level_percentage?: number | null
          handover_datetime: string
          handover_location?: string | null
          id?: string
          incoming_driver_id: string
          issues_reported?: string | null
          latitude?: number | null
          longitude?: number | null
          outgoing_driver_id: string
          photo_attachments?: Json | null
          status?: Database["public"]["Enums"]["handover_status"]
          trip_id: string
          updated_at?: string
          vehicle_condition_notes?: string | null
          vehicle_id: string
          vehicle_mileage: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          digital_signature_data?: Json | null
          fuel_level_percentage?: number | null
          handover_datetime?: string
          handover_location?: string | null
          id?: string
          incoming_driver_id?: string
          issues_reported?: string | null
          latitude?: number | null
          longitude?: number | null
          outgoing_driver_id?: string
          photo_attachments?: Json | null
          status?: Database["public"]["Enums"]["handover_status"]
          trip_id?: string
          updated_at?: string
          vehicle_condition_notes?: string | null
          vehicle_id?: string
          vehicle_mileage?: number
        }
        Relationships: [
          {
            foreignKeyName: "driver_handovers_incoming_driver_id_fkey"
            columns: ["incoming_driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_handovers_outgoing_driver_id_fkey"
            columns: ["outgoing_driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_handovers_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_handovers_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_handovers_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_handovers_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      dunkin_sample_import: {
        Row: {
          Acidity: string | null
          Aroma: string | null
          Bags: number | null
          Balance: string | null
          Body: string | null
          Broken: string | null
          "Certificate Valid Until": string | null
          "Certificate#": string
          "Certification#": string | null
          "Clean Cup": string | null
          Container: string | null
          "Contract #": string | null
          "Date R'Cd": string | null
          "Date Tested": string | null
          "DD Spec": boolean | null
          Estufagem: string | null
          Exporter: string | null
          "Exporter#": string | null
          Faults: string | null
          "Faults # of cups": string | null
          "Faults level": string | null
          Faults2: string | null
          "Faults2 level": string | null
          "Faults2 nr of cups": string | null
          Finish: string | null
          "Foreign Material": string | null
          Fragrance: string | null
          "Full Black": string | null
          "Full Sour": string | null
          Husk: string | null
          "Ico Marks#": string | null
          Importer: string | null
          "Importer Contract #": string | null
          "Lot #": string | null
          "Minor Broca": string | null
          modified: string | null
          Moisture: string | null
          Pan: string | null
          Parchment: string | null
          "Partial Black": string | null
          "Partial Sour": string | null
          "Pod Or Cherry": string | null
          Quakers: string | null
          Region: string | null
          Rejection: string | null
          "Roaster Destination": string | null
          "Sample Size": string | null
          Scr14: string | null
          Scr15: string | null
          Scr16: string | null
          "Severe Broca": string | null
          Shells: string | null
          Sort: string | null
          "Stone/Stick": string | null
          Sweetness: string | null
          Taints: string | null
          "Taints # of cups": string | null
          "Taints level": string | null
          Tester: string | null
          "Total Defects": string | null
          "Total Primary Defects": string | null
          "Total Secondary Defects": string | null
          "two samples": string | null
          "Uniform Cup": string | null
          "Unripe/Immature": string | null
        }
        Insert: {
          Acidity?: string | null
          Aroma?: string | null
          Bags?: number | null
          Balance?: string | null
          Body?: string | null
          Broken?: string | null
          "Certificate Valid Until"?: string | null
          "Certificate#": string
          "Certification#"?: string | null
          "Clean Cup"?: string | null
          Container?: string | null
          "Contract #"?: string | null
          "Date R'Cd"?: string | null
          "Date Tested"?: string | null
          "DD Spec"?: boolean | null
          Estufagem?: string | null
          Exporter?: string | null
          "Exporter#"?: string | null
          Faults?: string | null
          "Faults # of cups"?: string | null
          "Faults level"?: string | null
          Faults2?: string | null
          "Faults2 level"?: string | null
          "Faults2 nr of cups"?: string | null
          Finish?: string | null
          "Foreign Material"?: string | null
          Fragrance?: string | null
          "Full Black"?: string | null
          "Full Sour"?: string | null
          Husk?: string | null
          "Ico Marks#"?: string | null
          Importer?: string | null
          "Importer Contract #"?: string | null
          "Lot #"?: string | null
          "Minor Broca"?: string | null
          modified?: string | null
          Moisture?: string | null
          Pan?: string | null
          Parchment?: string | null
          "Partial Black"?: string | null
          "Partial Sour"?: string | null
          "Pod Or Cherry"?: string | null
          Quakers?: string | null
          Region?: string | null
          Rejection?: string | null
          "Roaster Destination"?: string | null
          "Sample Size"?: string | null
          Scr14?: string | null
          Scr15?: string | null
          Scr16?: string | null
          "Severe Broca"?: string | null
          Shells?: string | null
          Sort?: string | null
          "Stone/Stick"?: string | null
          Sweetness?: string | null
          Taints?: string | null
          "Taints # of cups"?: string | null
          "Taints level"?: string | null
          Tester?: string | null
          "Total Defects"?: string | null
          "Total Primary Defects"?: string | null
          "Total Secondary Defects"?: string | null
          "two samples"?: string | null
          "Uniform Cup"?: string | null
          "Unripe/Immature"?: string | null
        }
        Update: {
          Acidity?: string | null
          Aroma?: string | null
          Bags?: number | null
          Balance?: string | null
          Body?: string | null
          Broken?: string | null
          "Certificate Valid Until"?: string | null
          "Certificate#"?: string
          "Certification#"?: string | null
          "Clean Cup"?: string | null
          Container?: string | null
          "Contract #"?: string | null
          "Date R'Cd"?: string | null
          "Date Tested"?: string | null
          "DD Spec"?: boolean | null
          Estufagem?: string | null
          Exporter?: string | null
          "Exporter#"?: string | null
          Faults?: string | null
          "Faults # of cups"?: string | null
          "Faults level"?: string | null
          Faults2?: string | null
          "Faults2 level"?: string | null
          "Faults2 nr of cups"?: string | null
          Finish?: string | null
          "Foreign Material"?: string | null
          Fragrance?: string | null
          "Full Black"?: string | null
          "Full Sour"?: string | null
          Husk?: string | null
          "Ico Marks#"?: string | null
          Importer?: string | null
          "Importer Contract #"?: string | null
          "Lot #"?: string | null
          "Minor Broca"?: string | null
          modified?: string | null
          Moisture?: string | null
          Pan?: string | null
          Parchment?: string | null
          "Partial Black"?: string | null
          "Partial Sour"?: string | null
          "Pod Or Cherry"?: string | null
          Quakers?: string | null
          Region?: string | null
          Rejection?: string | null
          "Roaster Destination"?: string | null
          "Sample Size"?: string | null
          Scr14?: string | null
          Scr15?: string | null
          Scr16?: string | null
          "Severe Broca"?: string | null
          Shells?: string | null
          Sort?: string | null
          "Stone/Stick"?: string | null
          Sweetness?: string | null
          Taints?: string | null
          "Taints # of cups"?: string | null
          "Taints level"?: string | null
          Tester?: string | null
          "Total Defects"?: string | null
          "Total Primary Defects"?: string | null
          "Total Secondary Defects"?: string | null
          "two samples"?: string | null
          "Uniform Cup"?: string | null
          "Unripe/Immature"?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          card_holder_name: string | null
          card_last_four: string | null
          card_type: string | null
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          currency: string
          description: string | null
          expense_date: string
          expense_location: string | null
          id: string
          is_personal_card: boolean
          is_reimbursed: boolean
          receipt_image_url: string | null
          requires_reimbursement: boolean
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          card_holder_name?: string | null
          card_last_four?: string | null
          card_type?: string | null
          category: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          currency?: string
          description?: string | null
          expense_date: string
          expense_location?: string | null
          id?: string
          is_personal_card?: boolean
          is_reimbursed?: boolean
          receipt_image_url?: string | null
          requires_reimbursement?: boolean
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          card_holder_name?: string | null
          card_last_four?: string | null
          card_type?: string | null
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          currency?: string
          description?: string | null
          expense_date?: string
          expense_location?: string | null
          id?: string
          is_personal_card?: boolean
          is_reimbursed?: boolean
          receipt_image_url?: string | null
          requires_reimbursement?: boolean
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      external_drivers: {
        Row: {
          address: string | null
          cnh_category: string
          cnh_expiry_date: string | null
          cnh_number: string
          cpf_rg: string
          created_at: string | null
          created_by: string | null
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string
          id: string
          is_active: boolean | null
          notes: string | null
          updated_at: string | null
          whatsapp: string
        }
        Insert: {
          address?: string | null
          cnh_category: string
          cnh_expiry_date?: string | null
          cnh_number: string
          cpf_rg: string
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          updated_at?: string | null
          whatsapp: string
        }
        Update: {
          address?: string | null
          cnh_category?: string
          cnh_expiry_date?: string | null
          cnh_number?: string
          cpf_rg?: string
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          updated_at?: string | null
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_drivers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      file_access_logs: {
        Row: {
          access_method: string | null
          accessed_by_id: string | null
          action: string
          created_at: string
          file_id: string
          file_share_id: string | null
          id: string
          ip_address: unknown | null
          notes: string | null
          user_agent: string | null
        }
        Insert: {
          access_method?: string | null
          accessed_by_id?: string | null
          action: string
          created_at?: string
          file_id: string
          file_share_id?: string | null
          id?: string
          ip_address?: unknown | null
          notes?: string | null
          user_agent?: string | null
        }
        Update: {
          access_method?: string | null
          accessed_by_id?: string | null
          action?: string
          created_at?: string
          file_id?: string
          file_share_id?: string | null
          id?: string
          ip_address?: unknown | null
          notes?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_access_logs_accessed_by_id_fkey"
            columns: ["accessed_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_access_logs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "company_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_access_logs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file_sharing_summary"
            referencedColumns: ["file_id"]
          },
          {
            foreignKeyName: "file_access_logs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "user_accessible_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_access_logs_file_share_id_fkey"
            columns: ["file_share_id"]
            isOneToOne: false
            referencedRelation: "file_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      file_comments: {
        Row: {
          comment_text: string
          created_at: string
          file_id: string
          id: string
          is_resolved: boolean
          parent_comment_id: string | null
          resolved_at: string | null
          resolved_by_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          comment_text: string
          created_at?: string
          file_id: string
          id?: string
          is_resolved?: boolean
          parent_comment_id?: string | null
          resolved_at?: string | null
          resolved_by_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          comment_text?: string
          created_at?: string
          file_id?: string
          id?: string
          is_resolved?: boolean
          parent_comment_id?: string | null
          resolved_at?: string | null
          resolved_by_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_comments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "company_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file_sharing_summary"
            referencedColumns: ["file_id"]
          },
          {
            foreignKeyName: "file_comments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "user_accessible_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "file_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comments_resolved_by_id_fkey"
            columns: ["resolved_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      file_shares: {
        Row: {
          access_code: string | null
          created_at: string
          download_count: number | null
          expires_at: string | null
          file_id: string
          id: string
          is_active: boolean
          last_accessed_at: string | null
          max_downloads: number | null
          permission: Database["public"]["Enums"]["share_permission"]
          revoked_at: string | null
          share_message: string | null
          share_method: Database["public"]["Enums"]["share_method"]
          shared_by_id: string
          shared_with_company_id: string | null
          shared_with_user_id: string | null
        }
        Insert: {
          access_code?: string | null
          created_at?: string
          download_count?: number | null
          expires_at?: string | null
          file_id: string
          id?: string
          is_active?: boolean
          last_accessed_at?: string | null
          max_downloads?: number | null
          permission?: Database["public"]["Enums"]["share_permission"]
          revoked_at?: string | null
          share_message?: string | null
          share_method: Database["public"]["Enums"]["share_method"]
          shared_by_id: string
          shared_with_company_id?: string | null
          shared_with_user_id?: string | null
        }
        Update: {
          access_code?: string | null
          created_at?: string
          download_count?: number | null
          expires_at?: string | null
          file_id?: string
          id?: string
          is_active?: boolean
          last_accessed_at?: string | null
          max_downloads?: number | null
          permission?: Database["public"]["Enums"]["share_permission"]
          revoked_at?: string | null
          share_message?: string | null
          share_method?: Database["public"]["Enums"]["share_method"]
          shared_by_id?: string
          shared_with_company_id?: string | null
          shared_with_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_shares_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "company_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_shares_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file_sharing_summary"
            referencedColumns: ["file_id"]
          },
          {
            foreignKeyName: "file_shares_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "user_accessible_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_shares_shared_by_id_fkey"
            columns: ["shared_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_shares_shared_with_company_id_fkey"
            columns: ["shared_with_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_shares_shared_with_company_id_fkey"
            columns: ["shared_with_company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_shares_shared_with_company_id_fkey"
            columns: ["shared_with_company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "file_shares_shared_with_user_id_fkey"
            columns: ["shared_with_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      file_versions: {
        Row: {
          change_notes: string | null
          created_at: string
          file_name: string
          file_size: number
          id: string
          mime_type: string
          original_file_id: string
          storage_path: string
          uploaded_by_id: string
          version_number: number
        }
        Insert: {
          change_notes?: string | null
          created_at?: string
          file_name: string
          file_size: number
          id?: string
          mime_type: string
          original_file_id: string
          storage_path: string
          uploaded_by_id: string
          version_number: number
        }
        Update: {
          change_notes?: string | null
          created_at?: string
          file_name?: string
          file_size?: number
          id?: string
          mime_type?: string
          original_file_id?: string
          storage_path?: string
          uploaded_by_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "file_versions_original_file_id_fkey"
            columns: ["original_file_id"]
            isOneToOne: false
            referencedRelation: "company_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_versions_original_file_id_fkey"
            columns: ["original_file_id"]
            isOneToOne: false
            referencedRelation: "file_sharing_summary"
            referencedColumns: ["file_id"]
          },
          {
            foreignKeyName: "file_versions_original_file_id_fkey"
            columns: ["original_file_id"]
            isOneToOne: false
            referencedRelation: "user_accessible_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_versions_uploaded_by_id_fkey"
            columns: ["uploaded_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string | null
          declined_at: string | null
          email_sent_count: number | null
          expires_at: string | null
          guest_company: string | null
          guest_email: string
          guest_name: string
          guest_phone: string | null
          guest_title: string | null
          id: string
          invitation_message: string | null
          invitation_token: string
          invitation_type: string | null
          invited_by: string
          last_email_sent_at: string | null
          participant_id: string | null
          sent_at: string | null
          status: string | null
          trip_id: string
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string | null
          declined_at?: string | null
          email_sent_count?: number | null
          expires_at?: string | null
          guest_company?: string | null
          guest_email: string
          guest_name: string
          guest_phone?: string | null
          guest_title?: string | null
          id?: string
          invitation_message?: string | null
          invitation_token: string
          invitation_type?: string | null
          invited_by: string
          last_email_sent_at?: string | null
          participant_id?: string | null
          sent_at?: string | null
          status?: string | null
          trip_id: string
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string | null
          declined_at?: string | null
          email_sent_count?: number | null
          expires_at?: string | null
          guest_company?: string | null
          guest_email?: string
          guest_name?: string
          guest_phone?: string | null
          guest_title?: string | null
          id?: string
          invitation_message?: string | null
          invitation_token?: string
          invitation_type?: string | null
          invited_by?: string
          last_email_sent_at?: string | null
          participant_id?: string | null
          sent_at?: string | null
          status?: string | null
          trip_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_invitations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_invitations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_invitations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_items: {
        Row: {
          activity_date: string
          activity_type: Database["public"]["Enums"]["activity_type"]
          confirmation_details: string | null
          created_at: string
          custom_location: string | null
          description: string | null
          end_time: string | null
          id: string
          is_confirmed: boolean
          location_id: string | null
          notes: string | null
          sort_order: number
          start_time: string | null
          title: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          activity_date: string
          activity_type: Database["public"]["Enums"]["activity_type"]
          confirmation_details?: string | null
          created_at?: string
          custom_location?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          is_confirmed?: boolean
          location_id?: string | null
          notes?: string | null
          sort_order?: number
          start_time?: string | null
          title: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          activity_date?: string
          activity_type?: Database["public"]["Enums"]["activity_type"]
          confirmation_details?: string | null
          created_at?: string
          custom_location?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          is_confirmed?: boolean
          location_id?: string | null
          notes?: string | null
          sort_order?: number
          start_time?: string | null
          title?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "company_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_capabilities: {
        Row: {
          created_at: string | null
          equipment: Json | null
          id: string
          laboratory_id: string | null
          max_daily_capacity: number | null
          services_offered: string[] | null
          staff_count: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          equipment?: Json | null
          id?: string
          laboratory_id?: string | null
          max_daily_capacity?: number | null
          services_offered?: string[] | null
          staff_count?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          equipment?: Json | null
          id?: string
          laboratory_id?: string | null
          max_daily_capacity?: number | null
          services_offered?: string[] | null
          staff_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_capabilities_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: true
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "lab_capabilities_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: true
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "lab_capabilities_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: true
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_pricing: {
        Row: {
          approved_pricing: number | null
          client_id: string | null
          created_at: string | null
          currency: string | null
          id: string
          laboratory_id: string | null
          notes: string | null
          price_amount: number
          pricing_type: string
          rejected_pricing: number | null
          updated_at: string | null
        }
        Insert: {
          approved_pricing?: number | null
          client_id?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          laboratory_id?: string | null
          notes?: string | null
          price_amount: number
          pricing_type: string
          rejected_pricing?: number | null
          updated_at?: string | null
        }
        Update: {
          approved_pricing?: number | null
          client_id?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          laboratory_id?: string | null
          notes?: string | null
          price_amount?: number
          pricing_type?: string
          rejected_pricing?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_pricing_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_billing_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_pricing_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_origin_pricing_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "lab_pricing_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_pricing_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "lab_pricing_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "lab_pricing_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_shelves: {
        Row: {
          allow_client_view: boolean | null
          client_id: string | null
          columns: number
          created_at: string | null
          id: string
          laboratory_id: string | null
          naming_convention: string | null
          position_layout: string
          rows: number
          samples_per_position: number
          shelf_letter: string
          shelf_number: number
          updated_at: string | null
          x_position: number | null
          y_position: number | null
        }
        Insert: {
          allow_client_view?: boolean | null
          client_id?: string | null
          columns: number
          created_at?: string | null
          id?: string
          laboratory_id?: string | null
          naming_convention?: string | null
          position_layout: string
          rows: number
          samples_per_position?: number
          shelf_letter: string
          shelf_number: number
          updated_at?: string | null
          x_position?: number | null
          y_position?: number | null
        }
        Update: {
          allow_client_view?: boolean | null
          client_id?: string | null
          columns?: number
          created_at?: string | null
          id?: string
          laboratory_id?: string | null
          naming_convention?: string | null
          position_layout?: string
          rows?: number
          samples_per_position?: number
          shelf_letter?: string
          shelf_number?: number
          updated_at?: string | null
          x_position?: number | null
          y_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_shelves_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_billing_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_shelves_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_origin_pricing_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "lab_shelves_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_shelves_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "lab_shelves_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "lab_shelves_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
        ]
      }
      laboratories: {
        Row: {
          billing_basis: string | null
          code: string
          created_at: string | null
          entrance_x_position: number | null
          entrance_y_position: number | null
          fee_currency: string | null
          fee_per_sample: number | null
          id: string
          is_3rd_party: boolean | null
          is_active: boolean | null
          location: string | null
          name: string
          storage_capacity: number | null
          storage_layout: Json | null
          supported_origins: string[] | null
          tax_region: string | null
          timezone: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          billing_basis?: string | null
          code: string
          created_at?: string | null
          entrance_x_position?: number | null
          entrance_y_position?: number | null
          fee_currency?: string | null
          fee_per_sample?: number | null
          id?: string
          is_3rd_party?: boolean | null
          is_active?: boolean | null
          location?: string | null
          name: string
          storage_capacity?: number | null
          storage_layout?: Json | null
          supported_origins?: string[] | null
          tax_region?: string | null
          timezone?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_basis?: string | null
          code?: string
          created_at?: string | null
          entrance_x_position?: number | null
          entrance_y_position?: number | null
          fee_currency?: string | null
          fee_per_sample?: number | null
          id?: string
          is_3rd_party?: boolean | null
          is_active?: boolean | null
          location?: string | null
          name?: string
          storage_capacity?: number | null
          storage_layout?: Json | null
          supported_origins?: string[] | null
          tax_region?: string | null
          timezone?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      laboratory_invoices: {
        Row: {
          approved_count: number | null
          created_at: string | null
          currency: string | null
          due_date: string
          id: string
          invoice_number: string
          laboratory_id: string
          notes: string | null
          paid_date: string | null
          period_end: string
          period_start: string
          rejected_count: number | null
          sample_count: number
          status: Database["public"]["Enums"]["invoice_status"] | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          approved_count?: number | null
          created_at?: string | null
          currency?: string | null
          due_date: string
          id?: string
          invoice_number: string
          laboratory_id: string
          notes?: string | null
          paid_date?: string | null
          period_end: string
          period_start: string
          rejected_count?: number | null
          sample_count?: number
          status?: Database["public"]["Enums"]["invoice_status"] | null
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          approved_count?: number | null
          created_at?: string | null
          currency?: string | null
          due_date?: string
          id?: string
          invoice_number?: string
          laboratory_id?: string
          notes?: string | null
          paid_date?: string | null
          period_end?: string
          period_start?: string
          rejected_count?: number | null
          sample_count?: number
          status?: Database["public"]["Enums"]["invoice_status"] | null
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "laboratory_invoices_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "laboratory_invoices_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "laboratory_invoices_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
        ]
      }
      laboratory_third_party_config: {
        Row: {
          billing_basis: Database["public"]["Enums"]["billing_basis"] | null
          contact_email: string | null
          contact_name: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string | null
          currency: string | null
          fee_per_sample: number
          id: string
          is_active: boolean | null
          laboratory_id: string
          notes: string | null
          payment_schedule:
            | Database["public"]["Enums"]["payment_schedule"]
            | null
          updated_at: string | null
        }
        Insert: {
          billing_basis?: Database["public"]["Enums"]["billing_basis"] | null
          contact_email?: string | null
          contact_name?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          currency?: string | null
          fee_per_sample: number
          id?: string
          is_active?: boolean | null
          laboratory_id: string
          notes?: string | null
          payment_schedule?:
            | Database["public"]["Enums"]["payment_schedule"]
            | null
          updated_at?: string | null
        }
        Update: {
          billing_basis?: Database["public"]["Enums"]["billing_basis"] | null
          contact_email?: string | null
          contact_name?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          currency?: string | null
          fee_per_sample?: number
          id?: string
          is_active?: boolean | null
          laboratory_id?: string
          notes?: string | null
          payment_schedule?:
            | Database["public"]["Enums"]["payment_schedule"]
            | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "laboratory_third_party_config_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: true
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "laboratory_third_party_config_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: true
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "laboratory_third_party_config_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: true
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
        ]
      }
      labs: {
        Row: {
          country: string
          created_at: string | null
          id: string
          is_main_office: boolean | null
          name: string
          parent_lab_id: string | null
          region: string | null
          updated_at: string | null
        }
        Insert: {
          country: string
          created_at?: string | null
          id?: string
          is_main_office?: boolean | null
          name: string
          parent_lab_id?: string | null
          region?: string | null
          updated_at?: string | null
        }
        Update: {
          country?: string
          created_at?: string | null
          id?: string
          is_main_office?: boolean | null
          name?: string
          parent_lab_id?: string | null
          region?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "labs_parent_lab_id_fkey"
            columns: ["parent_lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_clients: {
        Row: {
          ativo: boolean | null
          auto_size: boolean | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          company_id: string | null
          complemento: string | null
          created_at: string | null
          descricao: string | null
          descricao_fantasia: string | null
          documento1: string | null
          documento2: string | null
          documento3: string | null
          email: string | null
          email_contratos: string | null
          endereco: string | null
          grupo1: string | null
          grupo2: string | null
          id: number
          id_usuario: number | null
          id_usuario_ultimo: number | null
          legacy_client_id: number
          logo: string | null
          logo_altura: number | null
          logo_largura: number | null
          numero: string | null
          obs: string | null
          pais: string | null
          pessoa: string | null
          referencias: string | null
          telefone1: string | null
          telefone2: string | null
          telefone3: string | null
          telefone4: string | null
          uf: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          auto_size?: boolean | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          company_id?: string | null
          complemento?: string | null
          created_at?: string | null
          descricao?: string | null
          descricao_fantasia?: string | null
          documento1?: string | null
          documento2?: string | null
          documento3?: string | null
          email?: string | null
          email_contratos?: string | null
          endereco?: string | null
          grupo1?: string | null
          grupo2?: string | null
          id?: number
          id_usuario?: number | null
          id_usuario_ultimo?: number | null
          legacy_client_id: number
          logo?: string | null
          logo_altura?: number | null
          logo_largura?: number | null
          numero?: string | null
          obs?: string | null
          pais?: string | null
          pessoa?: string | null
          referencias?: string | null
          telefone1?: string | null
          telefone2?: string | null
          telefone3?: string | null
          telefone4?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          auto_size?: boolean | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          company_id?: string | null
          complemento?: string | null
          created_at?: string | null
          descricao?: string | null
          descricao_fantasia?: string | null
          documento1?: string | null
          documento2?: string | null
          documento3?: string | null
          email?: string | null
          email_contratos?: string | null
          endereco?: string | null
          grupo1?: string | null
          grupo2?: string | null
          id?: number
          id_usuario?: number | null
          id_usuario_ultimo?: number | null
          legacy_client_id?: number
          logo?: string | null
          logo_altura?: number | null
          logo_largura?: number | null
          numero?: string | null
          obs?: string | null
          pais?: string | null
          pessoa?: string | null
          referencias?: string | null
          telefone1?: string | null
          telefone2?: string | null
          telefone3?: string | null
          telefone4?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legacy_clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      login_events: {
        Row: {
          created_at: string
          id: string
          ip_address: unknown | null
          login_provider: string
          login_timestamp: string
          login_timezone: string
          user_agent: string | null
          user_email: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: unknown | null
          login_provider: string
          login_timestamp?: string
          login_timezone: string
          user_agent?: string | null
          user_email: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: unknown | null
          login_provider?: string
          login_timestamp?: string
          login_timezone?: string
          user_agent?: string | null
          user_email?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "login_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_attendees: {
        Row: {
          attendance_status: string | null
          attendee_company: string | null
          attendee_email: string | null
          attendee_name: string
          attendee_phone: string | null
          attendee_title: string | null
          created_at: string | null
          id: string
          is_external: boolean | null
          meeting_id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          attendance_status?: string | null
          attendee_company?: string | null
          attendee_email?: string | null
          attendee_name: string
          attendee_phone?: string | null
          attendee_title?: string | null
          created_at?: string | null
          id?: string
          is_external?: boolean | null
          meeting_id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          attendance_status?: string | null
          attendee_company?: string | null
          attendee_email?: string | null
          attendee_name?: string
          attendee_phone?: string | null
          attendee_title?: string | null
          created_at?: string | null
          id?: string
          is_external?: boolean | null
          meeting_id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "trip_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_files: {
        Row: {
          created_at: string | null
          file_category: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          is_latest_version: boolean | null
          meeting_id: string
          mime_type: string | null
          ocr_confidence: number | null
          ocr_status: string | null
          ocr_text: string | null
          parent_file_id: string | null
          preview_path: string | null
          processing_error: string | null
          processing_status: string | null
          thumbnail_path: string | null
          updated_at: string | null
          uploaded_by: string | null
          version: number | null
        }
        Insert: {
          created_at?: string | null
          file_category?: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          is_latest_version?: boolean | null
          meeting_id: string
          mime_type?: string | null
          ocr_confidence?: number | null
          ocr_status?: string | null
          ocr_text?: string | null
          parent_file_id?: string | null
          preview_path?: string | null
          processing_error?: string | null
          processing_status?: string | null
          thumbnail_path?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string | null
          file_category?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          is_latest_version?: boolean | null
          meeting_id?: string
          mime_type?: string | null
          ocr_confidence?: number | null
          ocr_status?: string | null
          ocr_text?: string | null
          parent_file_id?: string | null
          preview_path?: string | null
          processing_error?: string | null
          processing_status?: string | null
          thumbnail_path?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_files_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "trip_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_files_parent_file_id_fkey"
            columns: ["parent_file_id"]
            isOneToOne: false
            referencedRelation: "meeting_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_notes: {
        Row: {
          activity_id: string | null
          company_location_id: string | null
          content: string | null
          created_at: string
          file_attachments: Json | null
          id: string
          itinerary_item_id: string | null
          note_type: Database["public"]["Enums"]["note_type"]
          ocr_processed: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_id?: string | null
          company_location_id?: string | null
          content?: string | null
          created_at?: string
          file_attachments?: Json | null
          id?: string
          itinerary_item_id?: string | null
          note_type: Database["public"]["Enums"]["note_type"]
          ocr_processed?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_id?: string | null
          company_location_id?: string | null
          content?: string | null
          created_at?: string
          file_attachments?: Json | null
          id?: string
          itinerary_item_id?: string | null
          note_type?: Database["public"]["Enums"]["note_type"]
          ocr_processed?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_notes_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_notes_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities_with_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_notes_company_location_id_fkey"
            columns: ["company_location_id"]
            isOneToOne: false
            referencedRelation: "company_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_notes_itinerary_item_id_fkey"
            columns: ["itinerary_item_id"]
            isOneToOne: false
            referencedRelation: "itinerary_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_notes_itinerary_item_id_fkey"
            columns: ["itinerary_item_id"]
            isOneToOne: false
            referencedRelation: "upcoming_itinerary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_participants: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          meeting_id: string | null
          role: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          meeting_id?: string | null
          role?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          meeting_id?: string | null
          role?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_participants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_participants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_participants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_responses: {
        Row: {
          activity_id: string | null
          company_name: string | null
          created_at: string
          host_email: string
          host_name: string
          id: string
          meeting_id: string
          organizer_notified: boolean | null
          organizer_notified_at: string | null
          original_meeting_date: string | null
          original_meeting_time: string | null
          processed_at: string | null
          processed_by: string | null
          reschedule_requested_date: string | null
          reschedule_requested_time: string | null
          responded_at: string
          response_message: string | null
          response_token: string
          response_type: string
          status: string | null
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          activity_id?: string | null
          company_name?: string | null
          created_at?: string
          host_email: string
          host_name: string
          id?: string
          meeting_id: string
          organizer_notified?: boolean | null
          organizer_notified_at?: string | null
          original_meeting_date?: string | null
          original_meeting_time?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reschedule_requested_date?: string | null
          reschedule_requested_time?: string | null
          responded_at?: string
          response_message?: string | null
          response_token: string
          response_type: string
          status?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          activity_id?: string | null
          company_name?: string | null
          created_at?: string
          host_email?: string
          host_name?: string
          id?: string
          meeting_id?: string
          organizer_notified?: boolean | null
          organizer_notified_at?: string | null
          original_meeting_date?: string | null
          original_meeting_time?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reschedule_requested_date?: string | null
          reschedule_requested_time?: string | null
          responded_at?: string
          response_message?: string | null
          response_token?: string
          response_type?: string
          status?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_responses_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_responses_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities_with_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_responses_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_responses_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_responses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_responses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_responses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string | null
          date: string
          id: string
          lab_id: string | null
          location: string | null
          meeting_type: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date: string
          id?: string
          lab_id?: string | null
          location?: string | null
          meeting_type?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string
          id?: string
          lab_id?: string | null
          location?: string | null
          meeting_type?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      note_attachments: {
        Row: {
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          mime_type: string | null
          note_id: string
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          mime_type?: string | null
          note_id: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          mime_type?: string | null
          note_id?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "note_attachments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "activity_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      note_charts: {
        Row: {
          chart_config: Json
          chart_data: Json
          chart_type: string
          created_at: string | null
          id: string
          note_id: string
          position_in_note: number | null
        }
        Insert: {
          chart_config?: Json
          chart_data?: Json
          chart_type: string
          created_at?: string | null
          id?: string
          note_id: string
          position_in_note?: number | null
        }
        Update: {
          chart_config?: Json
          chart_data?: Json
          chart_type?: string
          created_at?: string | null
          id?: string
          note_id?: string
          position_in_note?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "note_charts_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "activity_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      note_history: {
        Row: {
          edited_at: string | null
          edited_by: string
          id: string
          note_id: string
          previous_content: Json
        }
        Insert: {
          edited_at?: string | null
          edited_by: string
          id?: string
          note_id: string
          previous_content: Json
        }
        Update: {
          edited_at?: string | null
          edited_by?: string
          id?: string
          note_id?: string
          previous_content?: Json
        }
        Relationships: [
          {
            foreignKeyName: "note_history_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_history_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "activity_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_batches: {
        Row: {
          batch_date: string
          email_results: Json | null
          id: string
          recipients: string[]
          sent_at: string | null
          total_changes: number
          trip_id: string
        }
        Insert: {
          batch_date: string
          email_results?: Json | null
          id?: string
          recipients: string[]
          sent_at?: string | null
          total_changes?: number
          trip_id: string
        }
        Update: {
          batch_date?: string
          email_results?: Json | null
          id?: string
          recipients?: string[]
          sent_at?: string | null
          total_changes?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_batches_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_batches_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_batches_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          browser_push_enabled: boolean | null
          created_at: string | null
          do_not_disturb_end: string | null
          do_not_disturb_start: string | null
          email_enabled: boolean | null
          email_frequency: string | null
          id: string
          notification_types: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          browser_push_enabled?: boolean | null
          created_at?: string | null
          do_not_disturb_end?: string | null
          do_not_disturb_start?: string | null
          email_enabled?: boolean | null
          email_frequency?: string | null
          id?: string
          notification_types?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          browser_push_enabled?: boolean | null
          created_at?: string | null
          do_not_disturb_end?: string | null
          do_not_disturb_start?: string | null
          email_enabled?: boolean | null
          email_frequency?: string | null
          id?: string
          notification_types?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          change_details: Json
          changed_by: string
          created_at: string
          id: string
          notification_type: string
          scheduled_send_time: string
          sent: boolean
          sent_at: string | null
          trip_code: string
          trip_id: string
        }
        Insert: {
          change_details?: Json
          changed_by: string
          created_at?: string
          id?: string
          notification_type: string
          scheduled_send_time: string
          sent?: boolean
          sent_at?: string | null
          trip_code: string
          trip_id: string
        }
        Update: {
          change_details?: Json
          changed_by?: string
          created_at?: string
          id?: string
          notification_type?: string
          scheduled_send_time?: string
          sent?: boolean
          sent_at?: string | null
          trip_code?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          notification_type: string
          read_at: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          notification_type: string
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          notification_type?: string
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_metrics: {
        Row: {
          approval_rate: number | null
          approved_samples: number | null
          client_id: string | null
          created_at: string | null
          id: string
          laboratory_id: string | null
          month: number
          processing_time_avg: number | null
          rejected_samples: number | null
          supplier_name: string
          total_bags: number | null
          total_certificates: number | null
          total_samples: number | null
          updated_at: string | null
          year: number
        }
        Insert: {
          approval_rate?: number | null
          approved_samples?: number | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          laboratory_id?: string | null
          month: number
          processing_time_avg?: number | null
          rejected_samples?: number | null
          supplier_name: string
          total_bags?: number | null
          total_certificates?: number | null
          total_samples?: number | null
          updated_at?: string | null
          year: number
        }
        Update: {
          approval_rate?: number | null
          approved_samples?: number | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          laboratory_id?: string | null
          month?: number
          processing_time_avg?: number | null
          rejected_samples?: number | null
          supplier_name?: string
          total_bags?: number | null
          total_certificates?: number | null
          total_samples?: number | null
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_billing_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_origin_pricing_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "performance_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_metrics_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "performance_metrics_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "performance_metrics_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          client_id: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_global_admin: boolean | null
          laboratory_id: string | null
          qc_enabled: boolean | null
          qc_permissions: Json | null
          qc_role: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          email: string
          full_name: string
          id: string
          is_global_admin?: boolean | null
          laboratory_id?: string | null
          qc_enabled?: boolean | null
          qc_permissions?: Json | null
          qc_role?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_global_admin?: boolean | null
          laboratory_id?: string | null
          qc_enabled?: boolean | null
          qc_permissions?: Json | null
          qc_role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_billing_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_origin_pricing_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "profiles_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "profiles_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_activities: {
        Row: {
          activity_type: string
          created_at: string | null
          description: string
          id: string
          laboratory_id: string | null
          metadata: Json | null
          related_entity_id: string | null
          related_entity_type: string | null
          user_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string | null
          description: string
          id?: string
          laboratory_id?: string | null
          metadata?: Json | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          description?: string
          id?: string
          laboratory_id?: string | null
          metadata?: Json | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_activities_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "qc_activities_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "qc_activities_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_assessments: {
        Row: {
          assessor_id: string | null
          compliance_status:
            | Database["public"]["Enums"]["compliance_status"]
            | null
          created_at: string | null
          defect_photos: string[] | null
          green_bean_data: Json | null
          id: string
          moisture_standard:
            | Database["public"]["Enums"]["moisture_standard"]
            | null
          roast_data: Json | null
          sample_id: string | null
          sample_size_grams: number | null
          updated_at: string | null
        }
        Insert: {
          assessor_id?: string | null
          compliance_status?:
            | Database["public"]["Enums"]["compliance_status"]
            | null
          created_at?: string | null
          defect_photos?: string[] | null
          green_bean_data?: Json | null
          id?: string
          moisture_standard?:
            | Database["public"]["Enums"]["moisture_standard"]
            | null
          roast_data?: Json | null
          sample_id?: string | null
          sample_size_grams?: number | null
          updated_at?: string | null
        }
        Update: {
          assessor_id?: string | null
          compliance_status?:
            | Database["public"]["Enums"]["compliance_status"]
            | null
          created_at?: string | null
          defect_photos?: string[] | null
          green_bean_data?: Json | null
          id?: string
          moisture_standard?:
            | Database["public"]["Enums"]["moisture_standard"]
            | null
          roast_data?: Json | null
          sample_id?: string | null
          sample_size_grams?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_assessments_assessor_id_fkey"
            columns: ["assessor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_assessments_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_overrides: {
        Row: {
          approved_by: string | null
          created_at: string | null
          id: string
          justification: string
          original_value: Json | null
          override_value: Json
          parameter_name: string
          sample_id: string | null
        }
        Insert: {
          approved_by?: string | null
          created_at?: string | null
          id?: string
          justification: string
          original_value?: Json | null
          override_value: Json
          parameter_name: string
          sample_id?: string | null
        }
        Update: {
          approved_by?: string | null
          created_at?: string | null
          id?: string
          justification?: string
          original_value?: Json | null
          override_value?: Json
          parameter_name?: string
          sample_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_overrides_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_overrides_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_parameters: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          parameter_name: string
          parameter_type: string
          parameter_value: Json
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          parameter_name: string
          parameter_type: string
          parameter_value: Json
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          parameter_name?: string
          parameter_type?: string
          parameter_value?: Json
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_parameters_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quality_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          cupping_scale_increment: number | null
          cupping_scale_max: number | null
          cupping_scale_min: number | null
          cupping_scale_type: string | null
          defect_thresholds_primary: number | null
          defect_thresholds_secondary: number | null
          description: string | null
          description_en: string | null
          description_es: string | null
          description_pt: string | null
          id: string
          is_active: boolean | null
          is_global: boolean | null
          laboratory_id: string | null
          max_faults_allowed: number | null
          max_taints_allowed: number | null
          moisture_standard:
            | Database["public"]["Enums"]["moisture_standard"]
            | null
          name: string
          name_en: string
          name_es: string | null
          name_pt: string | null
          parameters: Json
          sample_size_grams: number
          screen_size_requirements: Json | null
          taint_fault_rule_type: string | null
          template_parent_id: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          cupping_scale_increment?: number | null
          cupping_scale_max?: number | null
          cupping_scale_min?: number | null
          cupping_scale_type?: string | null
          defect_thresholds_primary?: number | null
          defect_thresholds_secondary?: number | null
          description?: string | null
          description_en?: string | null
          description_es?: string | null
          description_pt?: string | null
          id?: string
          is_active?: boolean | null
          is_global?: boolean | null
          laboratory_id?: string | null
          max_faults_allowed?: number | null
          max_taints_allowed?: number | null
          moisture_standard?:
            | Database["public"]["Enums"]["moisture_standard"]
            | null
          name: string
          name_en: string
          name_es?: string | null
          name_pt?: string | null
          parameters?: Json
          sample_size_grams?: number
          screen_size_requirements?: Json | null
          taint_fault_rule_type?: string | null
          template_parent_id?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          cupping_scale_increment?: number | null
          cupping_scale_max?: number | null
          cupping_scale_min?: number | null
          cupping_scale_type?: string | null
          defect_thresholds_primary?: number | null
          defect_thresholds_secondary?: number | null
          description?: string | null
          description_en?: string | null
          description_es?: string | null
          description_pt?: string | null
          id?: string
          is_active?: boolean | null
          is_global?: boolean | null
          laboratory_id?: string | null
          max_faults_allowed?: number | null
          max_taints_allowed?: number | null
          moisture_standard?:
            | Database["public"]["Enums"]["moisture_standard"]
            | null
          name?: string
          name_en?: string
          name_es?: string | null
          name_pt?: string | null
          parameters?: Json
          sample_size_grams?: number
          screen_size_requirements?: Json | null
          taint_fault_rule_type?: string | null
          template_parent_id?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_templates_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "quality_templates_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "quality_templates_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_templates_template_parent_id_fkey"
            columns: ["template_parent_id"]
            isOneToOne: false
            referencedRelation: "quality_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      roast_photos: {
        Row: {
          description: string | null
          id: string
          photo_type: string
          photo_url: string
          roast_profile_id: string | null
          uploaded_at: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          photo_type: string
          photo_url: string
          roast_profile_id?: string | null
          uploaded_at?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          photo_type?: string
          photo_url?: string
          roast_profile_id?: string | null
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roast_photos_roast_profile_id_fkey"
            columns: ["roast_profile_id"]
            isOneToOne: false
            referencedRelation: "roast_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roast_profiles: {
        Row: {
          actual_roast_level: string | null
          agtron_score: number | null
          assessor_id: string | null
          batch_size_grams: number | null
          cooling_time_minutes: number | null
          created_at: string | null
          cupping_scheduled_at: string | null
          cups_prepared: number
          first_crack_time_seconds: number | null
          grind_setting: string | null
          id: string
          notes: string | null
          quaker_count: number | null
          quaker_threshold: number | null
          rest_time_hours: number | null
          roast_date: string
          roast_time_seconds: number | null
          sample_id: string | null
          target_roast_level: string | null
          updated_at: string | null
        }
        Insert: {
          actual_roast_level?: string | null
          agtron_score?: number | null
          assessor_id?: string | null
          batch_size_grams?: number | null
          cooling_time_minutes?: number | null
          created_at?: string | null
          cupping_scheduled_at?: string | null
          cups_prepared: number
          first_crack_time_seconds?: number | null
          grind_setting?: string | null
          id?: string
          notes?: string | null
          quaker_count?: number | null
          quaker_threshold?: number | null
          rest_time_hours?: number | null
          roast_date?: string
          roast_time_seconds?: number | null
          sample_id?: string | null
          target_roast_level?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_roast_level?: string | null
          agtron_score?: number | null
          assessor_id?: string | null
          batch_size_grams?: number | null
          cooling_time_minutes?: number | null
          created_at?: string | null
          cupping_scheduled_at?: string | null
          cups_prepared?: number
          first_crack_time_seconds?: number | null
          grind_setting?: string | null
          id?: string
          notes?: string | null
          quaker_count?: number | null
          quaker_threshold?: number | null
          rest_time_hours?: number | null
          roast_date?: string
          roast_time_seconds?: number | null
          sample_id?: string | null
          target_roast_level?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roast_profiles_assessor_id_fkey"
            columns: ["assessor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roast_profiles_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: true
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_transfers: {
        Row: {
          approved_by: string | null
          created_at: string | null
          estimated_arrival: string | null
          from_laboratory_id: string | null
          id: string
          received_at: string | null
          rejection_reason: string | null
          requested_by: string | null
          sample_id: string | null
          shipped_at: string | null
          special_instructions: string | null
          status: string
          to_laboratory_id: string | null
          tracking_number: string | null
          transfer_reason: string
          updated_at: string | null
        }
        Insert: {
          approved_by?: string | null
          created_at?: string | null
          estimated_arrival?: string | null
          from_laboratory_id?: string | null
          id?: string
          received_at?: string | null
          rejection_reason?: string | null
          requested_by?: string | null
          sample_id?: string | null
          shipped_at?: string | null
          special_instructions?: string | null
          status?: string
          to_laboratory_id?: string | null
          tracking_number?: string | null
          transfer_reason: string
          updated_at?: string | null
        }
        Update: {
          approved_by?: string | null
          created_at?: string | null
          estimated_arrival?: string | null
          from_laboratory_id?: string | null
          id?: string
          received_at?: string | null
          rejection_reason?: string | null
          requested_by?: string | null
          sample_id?: string | null
          shipped_at?: string | null
          special_instructions?: string | null
          status?: string
          to_laboratory_id?: string | null
          tracking_number?: string | null
          transfer_reason?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sample_transfers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_transfers_from_laboratory_id_fkey"
            columns: ["from_laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "sample_transfers_from_laboratory_id_fkey"
            columns: ["from_laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "sample_transfers_from_laboratory_id_fkey"
            columns: ["from_laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_transfers_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_transfers_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_transfers_to_laboratory_id_fkey"
            columns: ["to_laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "sample_transfers_to_laboratory_id_fkey"
            columns: ["to_laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "sample_transfers_to_laboratory_id_fkey"
            columns: ["to_laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
        ]
      }
      samples: {
        Row: {
          assigned_to: string | null
          bag_count: number | null
          bag_weight_kg: number | null
          bags: number | null
          bags_quantity_mt: number | null
          buyer: string | null
          buyer_contract_nr: string | null
          calculated_client_fee: number | null
          calculated_lab_fee: number | null
          client_id: string | null
          container: string | null
          container_nr: string | null
          contract_number: string | null
          created_at: string | null
          destination: string | null
          exporter: string | null
          exporter_contract_nr: string | null
          ico_marks: string | null
          ico_number: string | null
          id: string
          importer: string | null
          laboratory_id: string | null
          origin: string
          processing_method: string | null
          quality_name: string | null
          quality_spec_id: string | null
          roaster: string | null
          roaster_contract_nr: string | null
          sample_type: Database["public"]["Enums"]["sample_type_enum"] | null
          status: Database["public"]["Enums"]["sample_status"] | null
          storage_position: string | null
          supplier: string
          supplier_type: string | null
          tracking_number: string
          updated_at: string | null
          wolthers_contract_nr: string | null
          workflow_stage: string | null
        }
        Insert: {
          assigned_to?: string | null
          bag_count?: number | null
          bag_weight_kg?: number | null
          bags?: number | null
          bags_quantity_mt?: number | null
          buyer?: string | null
          buyer_contract_nr?: string | null
          calculated_client_fee?: number | null
          calculated_lab_fee?: number | null
          client_id?: string | null
          container?: string | null
          container_nr?: string | null
          contract_number?: string | null
          created_at?: string | null
          destination?: string | null
          exporter?: string | null
          exporter_contract_nr?: string | null
          ico_marks?: string | null
          ico_number?: string | null
          id?: string
          importer?: string | null
          laboratory_id?: string | null
          origin: string
          processing_method?: string | null
          quality_name?: string | null
          quality_spec_id?: string | null
          roaster?: string | null
          roaster_contract_nr?: string | null
          sample_type?: Database["public"]["Enums"]["sample_type_enum"] | null
          status?: Database["public"]["Enums"]["sample_status"] | null
          storage_position?: string | null
          supplier: string
          supplier_type?: string | null
          tracking_number: string
          updated_at?: string | null
          wolthers_contract_nr?: string | null
          workflow_stage?: string | null
        }
        Update: {
          assigned_to?: string | null
          bag_count?: number | null
          bag_weight_kg?: number | null
          bags?: number | null
          bags_quantity_mt?: number | null
          buyer?: string | null
          buyer_contract_nr?: string | null
          calculated_client_fee?: number | null
          calculated_lab_fee?: number | null
          client_id?: string | null
          container?: string | null
          container_nr?: string | null
          contract_number?: string | null
          created_at?: string | null
          destination?: string | null
          exporter?: string | null
          exporter_contract_nr?: string | null
          ico_marks?: string | null
          ico_number?: string | null
          id?: string
          importer?: string | null
          laboratory_id?: string | null
          origin?: string
          processing_method?: string | null
          quality_name?: string | null
          quality_spec_id?: string | null
          roaster?: string | null
          roaster_contract_nr?: string | null
          sample_type?: Database["public"]["Enums"]["sample_type_enum"] | null
          status?: Database["public"]["Enums"]["sample_status"] | null
          storage_position?: string | null
          supplier?: string
          supplier_type?: string | null
          tracking_number?: string
          updated_at?: string | null
          wolthers_contract_nr?: string | null
          workflow_stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "samples_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_billing_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_origin_pricing_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "samples_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "samples_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "samples_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_quality_spec_id_fkey"
            columns: ["quality_spec_id"]
            isOneToOne: false
            referencedRelation: "client_qualities"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_history: {
        Row: {
          action: string
          created_at: string | null
          id: string
          notes: string | null
          performed_by: string | null
          position_id: string | null
          sample_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          position_id?: string | null
          sample_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          position_id?: string | null
          sample_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storage_history_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_history_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "storage_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_history_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_positions: {
        Row: {
          allow_client_view: boolean | null
          capacity_per_position: number
          client_id: string | null
          column_number: number
          created_at: string | null
          current_count: number | null
          current_samples: string[] | null
          id: string
          is_available: boolean | null
          laboratory_id: string | null
          position_code: string
          row_number: number
          shelf_id: string | null
          updated_at: string | null
        }
        Insert: {
          allow_client_view?: boolean | null
          capacity_per_position: number
          client_id?: string | null
          column_number: number
          created_at?: string | null
          current_count?: number | null
          current_samples?: string[] | null
          id?: string
          is_available?: boolean | null
          laboratory_id?: string | null
          position_code: string
          row_number: number
          shelf_id?: string | null
          updated_at?: string | null
        }
        Update: {
          allow_client_view?: boolean | null
          capacity_per_position?: number
          client_id?: string | null
          column_number?: number
          created_at?: string | null
          current_count?: number | null
          current_samples?: string[] | null
          id?: string
          is_available?: boolean | null
          laboratory_id?: string | null
          position_code?: string
          row_number?: number
          shelf_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storage_positions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_billing_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_positions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_origin_pricing_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "storage_positions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_positions_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "storage_positions_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "storage_positions_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_positions_shelf_id_fkey"
            columns: ["shelf_id"]
            isOneToOne: false
            referencedRelation: "client_visible_shelves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_positions_shelf_id_fkey"
            columns: ["shelf_id"]
            isOneToOne: false
            referencedRelation: "lab_shelves"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_reviews: {
        Row: {
          approval_rate: number | null
          approved_samples: number | null
          average_processing_time: number | null
          average_quality_score: number | null
          created_at: string | null
          id: string
          laboratory_id: string | null
          pss_approval_rate: number | null
          pss_approved_samples: number | null
          pss_total_samples: number | null
          quarter: number
          rejected_samples: number | null
          ss_approval_rate: number | null
          ss_approved_samples: number | null
          ss_total_samples: number | null
          supplier_name: string
          total_bags: number | null
          total_samples: number | null
          updated_at: string | null
          year: number
        }
        Insert: {
          approval_rate?: number | null
          approved_samples?: number | null
          average_processing_time?: number | null
          average_quality_score?: number | null
          created_at?: string | null
          id?: string
          laboratory_id?: string | null
          pss_approval_rate?: number | null
          pss_approved_samples?: number | null
          pss_total_samples?: number | null
          quarter: number
          rejected_samples?: number | null
          ss_approval_rate?: number | null
          ss_approved_samples?: number | null
          ss_total_samples?: number | null
          supplier_name: string
          total_bags?: number | null
          total_samples?: number | null
          updated_at?: string | null
          year: number
        }
        Update: {
          approval_rate?: number | null
          approved_samples?: number | null
          average_processing_time?: number | null
          average_quality_score?: number | null
          created_at?: string | null
          id?: string
          laboratory_id?: string | null
          pss_approval_rate?: number | null
          pss_approved_samples?: number | null
          pss_total_samples?: number | null
          quarter?: number
          rejected_samples?: number | null
          ss_approval_rate?: number | null
          ss_approved_samples?: number | null
          ss_total_samples?: number | null
          supplier_name?: string
          total_bags?: number | null
          total_samples?: number | null
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_reviews_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "supplier_reviews_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "supplier_reviews_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_chain_flows: {
        Row: {
          approval_rate: number | null
          certificate_count: number | null
          created_at: string | null
          exporter: string
          id: string
          importer: string
          laboratory_id: string | null
          month: number | null
          roaster: string
          total_bags: number | null
          total_value: number | null
          updated_at: string | null
          year: number
        }
        Insert: {
          approval_rate?: number | null
          certificate_count?: number | null
          created_at?: string | null
          exporter: string
          id?: string
          importer: string
          laboratory_id?: string | null
          month?: number | null
          roaster: string
          total_bags?: number | null
          total_value?: number | null
          updated_at?: string | null
          year: number
        }
        Update: {
          approval_rate?: number | null
          certificate_count?: number | null
          created_at?: string | null
          exporter?: string
          id?: string
          importer?: string
          laboratory_id?: string | null
          month?: number | null
          roaster?: string
          total_bags?: number | null
          total_value?: number | null
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "supply_chain_flows_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "supply_chain_flows_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "supply_chain_flows_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
        ]
      }
      taint_fault_definitions: {
        Row: {
          client_id: string | null
          created_at: string | null
          created_by: string | null
          default_scale: string | null
          default_scale_increment: number | null
          default_scale_max: number | null
          default_scale_min: number | null
          default_threshold: number | null
          description_en: string | null
          description_es: string | null
          description_pt: string | null
          id: string
          is_active: boolean | null
          name: string
          name_en: string
          name_es: string | null
          name_pt: string | null
          origin: string
          severity_levels: Json
          tolerance_distinction: boolean | null
          type: Database["public"]["Enums"]["taint_fault_type"]
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          default_scale?: string | null
          default_scale_increment?: number | null
          default_scale_max?: number | null
          default_scale_min?: number | null
          default_threshold?: number | null
          description_en?: string | null
          description_es?: string | null
          description_pt?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          name_en: string
          name_es?: string | null
          name_pt?: string | null
          origin: string
          severity_levels?: Json
          tolerance_distinction?: boolean | null
          type: Database["public"]["Enums"]["taint_fault_type"]
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          default_scale?: string | null
          default_scale_increment?: number | null
          default_scale_max?: number | null
          default_scale_min?: number | null
          default_threshold?: number | null
          description_en?: string | null
          description_es?: string | null
          description_pt?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          name_en?: string
          name_es?: string | null
          name_pt?: string | null
          origin?: string
          severity_levels?: Json
          tolerance_distinction?: boolean | null
          type?: Database["public"]["Enums"]["taint_fault_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "taint_fault_definitions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_billing_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taint_fault_definitions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_origin_pricing_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "taint_fault_definitions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taint_fault_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      template_taint_fault_config: {
        Row: {
          created_at: string | null
          definition_id: string | null
          id: string
          is_blocking: boolean | null
          max_allowed_count: number | null
          template_id: string | null
          template_scale: string | null
          template_scale_increment: number | null
          template_scale_max: number | null
          template_scale_min: number | null
          template_threshold: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          definition_id?: string | null
          id?: string
          is_blocking?: boolean | null
          max_allowed_count?: number | null
          template_id?: string | null
          template_scale?: string | null
          template_scale_increment?: number | null
          template_scale_max?: number | null
          template_scale_min?: number | null
          template_threshold?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          definition_id?: string | null
          id?: string
          is_blocking?: boolean | null
          max_allowed_count?: number | null
          template_id?: string | null
          template_scale?: string | null
          template_scale_increment?: number | null
          template_scale_max?: number | null
          template_scale_min?: number | null
          template_threshold?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_taint_fault_config_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "taint_fault_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_taint_fault_config_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quality_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_versions: {
        Row: {
          changes_description: string | null
          created_at: string | null
          created_by: string | null
          id: string
          parameters: Json
          template_id: string | null
          version_number: number
        }
        Insert: {
          changes_description?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          parameters: Json
          template_id?: string | null
          version_number: number
        }
        Update: {
          changes_description?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          parameters?: Json
          template_id?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quality_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      third_party_lab_fees: {
        Row: {
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string | null
          currency: string | null
          fee_per_sample: number
          id: string
          is_active: boolean | null
          our_charge_approved: number | null
          our_charge_rejected: number | null
          third_party_lab_name: string
          updated_at: string | null
        }
        Insert: {
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          currency?: string | null
          fee_per_sample: number
          id?: string
          is_active?: boolean | null
          our_charge_approved?: number | null
          our_charge_rejected?: number | null
          third_party_lab_name: string
          updated_at?: string | null
        }
        Update: {
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          currency?: string | null
          fee_per_sample?: number
          id?: string
          is_active?: boolean | null
          our_charge_approved?: number | null
          our_charge_rejected?: number | null
          third_party_lab_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      transfer_history: {
        Row: {
          action: string
          created_at: string | null
          id: string
          notes: string | null
          performed_by: string | null
          transfer_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          transfer_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_history_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_history_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "sample_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_access_permissions: {
        Row: {
          expires_at: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          permission_type: string
          trip_id: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          permission_type: string
          trip_id: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          permission_type?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_access_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_access_permissions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_access_permissions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_access_permissions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_access_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_changes: {
        Row: {
          affected_participants: string[] | null
          change_data: Json
          change_type: string
          created_at: string | null
          created_by: string | null
          id: string
          notification_batch_id: string | null
          notified_at: string | null
          old_data: Json | null
          trip_id: string
        }
        Insert: {
          affected_participants?: string[] | null
          change_data: Json
          change_type: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notification_batch_id?: string | null
          notified_at?: string | null
          old_data?: Json | null
          trip_id: string
        }
        Update: {
          affected_participants?: string[] | null
          change_data?: Json
          change_type?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notification_batch_id?: string | null
          notified_at?: string | null
          old_data?: Json | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_changes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_changes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_changes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_changes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_drafts: {
        Row: {
          access_token: string | null
          completion_percentage: number | null
          created_at: string | null
          creator_id: string
          current_step: number | null
          draft_data: Json
          expires_at: string | null
          id: string
          last_accessed_at: string | null
          trip_id: string | null
          trip_type: Database["public"]["Enums"]["trip_type"]
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          completion_percentage?: number | null
          created_at?: string | null
          creator_id: string
          current_step?: number | null
          draft_data: Json
          expires_at?: string | null
          id?: string
          last_accessed_at?: string | null
          trip_id?: string | null
          trip_type: Database["public"]["Enums"]["trip_type"]
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          completion_percentage?: number | null
          created_at?: string | null
          creator_id?: string
          current_step?: number | null
          draft_data?: Json
          expires_at?: string | null
          id?: string
          last_accessed_at?: string | null
          trip_id?: string | null
          trip_type?: Database["public"]["Enums"]["trip_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_drafts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_drafts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_drafts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_drafts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_flights: {
        Row: {
          aircraft_type: string | null
          airline: string
          arrival_airport: string
          arrival_city: string
          arrival_date: string
          arrival_time: string
          baggage_allowance: string | null
          booking_date: string | null
          booking_reference: string | null
          booking_status: string | null
          cost_amount: number | null
          cost_currency: string | null
          created_at: string | null
          created_by: string | null
          departure_airport: string
          departure_city: string
          departure_date: string
          departure_time: string
          flight_duration_minutes: number | null
          flight_number: string
          flight_type: string
          id: string
          meal_preferences: string | null
          passenger_names: string[] | null
          seat_preferences: string | null
          trip_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          aircraft_type?: string | null
          airline: string
          arrival_airport: string
          arrival_city: string
          arrival_date: string
          arrival_time: string
          baggage_allowance?: string | null
          booking_date?: string | null
          booking_reference?: string | null
          booking_status?: string | null
          cost_amount?: number | null
          cost_currency?: string | null
          created_at?: string | null
          created_by?: string | null
          departure_airport: string
          departure_city: string
          departure_date: string
          departure_time: string
          flight_duration_minutes?: number | null
          flight_number: string
          flight_type: string
          id?: string
          meal_preferences?: string | null
          passenger_names?: string[] | null
          seat_preferences?: string | null
          trip_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          aircraft_type?: string | null
          airline?: string
          arrival_airport?: string
          arrival_city?: string
          arrival_date?: string
          arrival_time?: string
          baggage_allowance?: string | null
          booking_date?: string | null
          booking_reference?: string | null
          booking_status?: string | null
          cost_amount?: number | null
          cost_currency?: string | null
          created_at?: string | null
          created_by?: string | null
          departure_airport?: string
          departure_city?: string
          departure_date?: string
          departure_time?: string
          flight_duration_minutes?: number | null
          flight_number?: string
          flight_type?: string
          id?: string
          meal_preferences?: string | null
          passenger_names?: string[] | null
          seat_preferences?: string | null
          trip_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_flights_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_flights_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_flights_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_flights_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_flights_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_hotels: {
        Row: {
          booking_date: string | null
          booking_reference: string | null
          booking_status: string | null
          check_in_date: string
          check_out_date: string
          contact_email: string | null
          contact_phone: string | null
          cost_amount: number | null
          cost_currency: string | null
          created_at: string | null
          created_by: string | null
          guest_names: string[] | null
          hotel_address: string
          hotel_name: string
          id: string
          nights_count: number | null
          room_type: string | null
          special_requests: string | null
          trip_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          booking_date?: string | null
          booking_reference?: string | null
          booking_status?: string | null
          check_in_date: string
          check_out_date: string
          contact_email?: string | null
          contact_phone?: string | null
          cost_amount?: number | null
          cost_currency?: string | null
          created_at?: string | null
          created_by?: string | null
          guest_names?: string[] | null
          hotel_address: string
          hotel_name: string
          id?: string
          nights_count?: number | null
          room_type?: string | null
          special_requests?: string | null
          trip_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          booking_date?: string | null
          booking_reference?: string | null
          booking_status?: string | null
          check_in_date?: string
          check_out_date?: string
          contact_email?: string | null
          contact_phone?: string | null
          cost_amount?: number | null
          cost_currency?: string | null
          created_at?: string | null
          created_by?: string | null
          guest_names?: string[] | null
          hotel_address?: string
          hotel_name?: string
          id?: string
          nights_count?: number | null
          room_type?: string | null
          special_requests?: string | null
          trip_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_hotels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_hotels_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_hotels_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_hotels_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_hotels_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_meetings: {
        Row: {
          agenda: string | null
          company_location_id: string | null
          created_at: string | null
          created_by: string | null
          deal_currency: string | null
          deal_value: number | null
          description: string | null
          end_time: string | null
          follow_up_date: string | null
          id: string
          is_supplier_meeting: boolean | null
          lead_status: string | null
          location: string | null
          meeting_date: string
          meeting_notes: string | null
          meeting_status: string | null
          meeting_type: string
          priority_level: string | null
          start_time: string
          supplier_company_name: string | null
          title: string
          trip_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          agenda?: string | null
          company_location_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_currency?: string | null
          deal_value?: number | null
          description?: string | null
          end_time?: string | null
          follow_up_date?: string | null
          id?: string
          is_supplier_meeting?: boolean | null
          lead_status?: string | null
          location?: string | null
          meeting_date: string
          meeting_notes?: string | null
          meeting_status?: string | null
          meeting_type: string
          priority_level?: string | null
          start_time: string
          supplier_company_name?: string | null
          title: string
          trip_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          agenda?: string | null
          company_location_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_currency?: string | null
          deal_value?: number | null
          description?: string | null
          end_time?: string | null
          follow_up_date?: string | null
          id?: string
          is_supplier_meeting?: boolean | null
          lead_status?: string | null
          location?: string | null
          meeting_date?: string
          meeting_notes?: string | null
          meeting_status?: string | null
          meeting_type?: string
          priority_level?: string | null
          start_time?: string
          supplier_company_name?: string | null
          title?: string
          trip_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_meetings_company_location_id_fkey"
            columns: ["company_location_id"]
            isOneToOne: false
            referencedRelation: "company_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_meetings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_meetings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_meetings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_meetings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_participant_emails: {
        Row: {
          created_at: string | null
          email_type: Database["public"]["Enums"]["participant_email_type"]
          error_message: string | null
          id: string
          participant_id: string
          retry_count: number | null
          sent_at: string | null
          status: Database["public"]["Enums"]["email_status"] | null
          trip_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email_type: Database["public"]["Enums"]["participant_email_type"]
          error_message?: string | null
          id?: string
          participant_id: string
          retry_count?: number | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"] | null
          trip_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email_type?: Database["public"]["Enums"]["participant_email_type"]
          error_message?: string | null
          id?: string
          participant_id?: string
          retry_count?: number | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"] | null
          trip_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_participant_emails_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_participant_emails_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_participant_emails_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_participant_emails_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_participants: {
        Row: {
          company_id: string | null
          created_at: string
          email_error: string | null
          email_sent: boolean | null
          email_sent_at: string | null
          email_type:
            | Database["public"]["Enums"]["participant_email_type"]
            | null
          guest_company: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          guest_title: string | null
          id: string
          invited_by: string | null
          is_partial: boolean
          participation_end_date: string | null
          participation_start_date: string | null
          role: string
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email_error?: string | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          email_type?:
            | Database["public"]["Enums"]["participant_email_type"]
            | null
          guest_company?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          guest_title?: string | null
          id?: string
          invited_by?: string | null
          is_partial?: boolean
          participation_end_date?: string | null
          participation_start_date?: string | null
          role?: string
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email_error?: string | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          email_type?:
            | Database["public"]["Enums"]["participant_email_type"]
            | null
          guest_company?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          guest_title?: string | null
          id?: string
          invited_by?: string | null
          is_partial?: boolean
          participation_end_date?: string | null
          participation_start_date?: string | null
          role?: string
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_participants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_participants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_participants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "trip_participants_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_participants_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_participants_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_participants_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_requests: {
        Row: {
          approved_by: string | null
          company_id: string
          created_at: string | null
          id: string
          notes: string | null
          original_trip_id: string | null
          requested_by: string
          requested_dates: unknown | null
          status: string
          updated_at: string | null
        }
        Insert: {
          approved_by?: string | null
          company_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          original_trip_id?: string | null
          requested_by: string
          requested_dates?: unknown | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          approved_by?: string | null
          company_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          original_trip_id?: string | null
          requested_by?: string
          requested_dates?: unknown | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "trip_requests_original_trip_id_fkey"
            columns: ["original_trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_requests_original_trip_id_fkey"
            columns: ["original_trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_requests_original_trip_id_fkey"
            columns: ["original_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_vehicles: {
        Row: {
          assigned_from: string
          assigned_to: string
          created_at: string
          driver_id: string | null
          id: string
          trip_id: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          assigned_from: string
          assigned_to: string
          created_at?: string
          driver_id?: string | null
          id?: string
          trip_id: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          assigned_from?: string
          assigned_to?: string
          created_at?: string
          driver_id?: string | null
          id?: string
          trip_id?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_vehicles_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_vehicles_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_vehicles_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_vehicles_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_vehicles_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          access_code: string | null
          completion_step: number | null
          convention_id: string | null
          created_at: string
          creation_status:
            | Database["public"]["Enums"]["trip_creation_status"]
            | null
          creator_id: string
          description: string | null
          draft_completed_at: string | null
          end_date: string
          estimated_budget: number | null
          id: string
          is_draft: boolean | null
          last_edited_at: string | null
          last_edited_by: string | null
          metadata: Json | null
          parent_trip_id: string | null
          progress_percentage: number | null
          short_code: string | null
          slug: string | null
          start_date: string
          status: Database["public"]["Enums"]["trip_status"]
          step_data: Json | null
          subject: string | null
          title: string
          total_cost: number | null
          trip_type: Database["public"]["Enums"]["trip_type"]
          updated_at: string
          year: number | null
        }
        Insert: {
          access_code?: string | null
          completion_step?: number | null
          convention_id?: string | null
          created_at?: string
          creation_status?:
            | Database["public"]["Enums"]["trip_creation_status"]
            | null
          creator_id: string
          description?: string | null
          draft_completed_at?: string | null
          end_date: string
          estimated_budget?: number | null
          id?: string
          is_draft?: boolean | null
          last_edited_at?: string | null
          last_edited_by?: string | null
          metadata?: Json | null
          parent_trip_id?: string | null
          progress_percentage?: number | null
          short_code?: string | null
          slug?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["trip_status"]
          step_data?: Json | null
          subject?: string | null
          title: string
          total_cost?: number | null
          trip_type: Database["public"]["Enums"]["trip_type"]
          updated_at?: string
          year?: number | null
        }
        Update: {
          access_code?: string | null
          completion_step?: number | null
          convention_id?: string | null
          created_at?: string
          creation_status?:
            | Database["public"]["Enums"]["trip_creation_status"]
            | null
          creator_id?: string
          description?: string | null
          draft_completed_at?: string | null
          end_date?: string
          estimated_budget?: number | null
          id?: string
          is_draft?: boolean | null
          last_edited_at?: string | null
          last_edited_by?: string | null
          metadata?: Json | null
          parent_trip_id?: string | null
          progress_percentage?: number | null
          short_code?: string | null
          slug?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["trip_status"]
          step_data?: Json | null
          subject?: string | null
          title?: string
          total_cost?: number | null
          trip_type?: Database["public"]["Enums"]["trip_type"]
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_last_edited_by_fkey"
            columns: ["last_edited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_parent_trip_id_fkey"
            columns: ["parent_trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_parent_trip_id_fkey"
            columns: ["parent_trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_parent_trip_id_fkey"
            columns: ["parent_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invitations: {
        Row: {
          company_id: string
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invitation_token: string | null
          invited_by: string
          invited_name: string | null
          invited_whatsapp: string | null
          role: string
          status: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invitation_token?: string | null
          invited_by: string
          invited_name?: string | null
          invited_whatsapp?: string | null
          role?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invitation_token?: string | null
          invited_by?: string
          invited_name?: string | null
          invited_whatsapp?: string | null
          role?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "user_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_labs: {
        Row: {
          created_at: string | null
          id: string
          lab_id: string | null
          role: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          lab_id?: string | null
          role?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          lab_id?: string | null
          role?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_labs_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_labs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          can_view_all_trips: boolean
          can_view_company_trips: boolean
          company_id: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_global_admin: boolean
          is_primary_contact: boolean | null
          last_login_at: string | null
          last_login_provider: string | null
          last_login_timezone: string | null
          last_profile_update: string | null
          last_profile_updated_by: string | null
          microsoft_oauth_id: string | null
          notification_preferences: Json | null
          password_hash: string | null
          phone: string | null
          profile_picture_url: string | null
          role: string | null
          timezone: string | null
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type"]
          whatsapp: string | null
        }
        Insert: {
          can_view_all_trips?: boolean
          can_view_company_trips?: boolean
          company_id?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_global_admin?: boolean
          is_primary_contact?: boolean | null
          last_login_at?: string | null
          last_login_provider?: string | null
          last_login_timezone?: string | null
          last_profile_update?: string | null
          last_profile_updated_by?: string | null
          microsoft_oauth_id?: string | null
          notification_preferences?: Json | null
          password_hash?: string | null
          phone?: string | null
          profile_picture_url?: string | null
          role?: string | null
          timezone?: string | null
          updated_at?: string
          user_type: Database["public"]["Enums"]["user_type"]
          whatsapp?: string | null
        }
        Update: {
          can_view_all_trips?: boolean
          can_view_company_trips?: boolean
          company_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_global_admin?: boolean
          is_primary_contact?: boolean | null
          last_login_at?: string | null
          last_login_provider?: string | null
          last_login_timezone?: string | null
          last_profile_update?: string | null
          last_profile_updated_by?: string | null
          microsoft_oauth_id?: string | null
          notification_preferences?: Json | null
          password_hash?: string | null
          phone?: string | null
          profile_picture_url?: string | null
          role?: string | null
          timezone?: string | null
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "users_last_profile_updated_by_fkey"
            columns: ["last_profile_updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_insurance: {
        Row: {
          agent_contact: string | null
          agent_name: string | null
          coverage_amount_brl: number | null
          created_at: string | null
          deductible_brl: number | null
          expiry_date: string
          id: string
          insurance_company: string
          is_active: boolean | null
          payment_frequency: string | null
          policy_documents: Json | null
          policy_number: string
          policy_type: string
          premium_amount_brl: number | null
          start_date: string
          updated_at: string | null
          vehicle_id: string | null
        }
        Insert: {
          agent_contact?: string | null
          agent_name?: string | null
          coverage_amount_brl?: number | null
          created_at?: string | null
          deductible_brl?: number | null
          expiry_date: string
          id?: string
          insurance_company: string
          is_active?: boolean | null
          payment_frequency?: string | null
          policy_documents?: Json | null
          policy_number: string
          policy_type: string
          premium_amount_brl?: number | null
          start_date: string
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Update: {
          agent_contact?: string | null
          agent_name?: string | null
          coverage_amount_brl?: number | null
          created_at?: string | null
          deductible_brl?: number | null
          expiry_date?: string
          id?: string
          insurance_company?: string
          is_active?: boolean | null
          payment_frequency?: string | null
          policy_documents?: Json | null
          policy_number?: string
          policy_type?: string
          premium_amount_brl?: number | null
          start_date?: string
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_insurance_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_logs: {
        Row: {
          created_at: string | null
          driver_id: string | null
          end_location: string | null
          end_mileage: number | null
          fuel_level_end: number | null
          fuel_level_start: number | null
          id: string
          notes: string | null
          start_location: string | null
          start_mileage: number
          trip_id: string | null
          updated_at: string | null
          usage_end_datetime: string | null
          usage_start_datetime: string
          usage_type: string | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string | null
          driver_id?: string | null
          end_location?: string | null
          end_mileage?: number | null
          fuel_level_end?: number | null
          fuel_level_start?: number | null
          id?: string
          notes?: string | null
          start_location?: string | null
          start_mileage: number
          trip_id?: string | null
          updated_at?: string | null
          usage_end_datetime?: string | null
          usage_start_datetime: string
          usage_type?: string | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string | null
          driver_id?: string | null
          end_location?: string | null
          end_mileage?: number | null
          fuel_level_end?: number | null
          fuel_level_start?: number | null
          id?: string
          notes?: string | null
          start_location?: string | null
          start_mileage?: number
          trip_id?: string | null
          updated_at?: string | null
          usage_end_datetime?: string | null
          usage_start_datetime?: string
          usage_type?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_logs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_logs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_logs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_maintenance: {
        Row: {
          cost_brl: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          invoice_attachments: Json | null
          maintenance_date: string
          maintenance_type: string
          mileage_at_service: number | null
          next_service_due_date: string | null
          next_service_due_mileage: number | null
          service_provider: string | null
          updated_at: string | null
          vehicle_id: string | null
          warranty_until: string | null
        }
        Insert: {
          cost_brl?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          invoice_attachments?: Json | null
          maintenance_date: string
          maintenance_type: string
          mileage_at_service?: number | null
          next_service_due_date?: string | null
          next_service_due_mileage?: number | null
          service_provider?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
          warranty_until?: string | null
        }
        Update: {
          cost_brl?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          invoice_attachments?: Json | null
          maintenance_date?: string
          maintenance_type?: string
          mileage_at_service?: number | null
          next_service_due_date?: string | null
          next_service_due_mileage?: number | null
          service_provider?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
          warranty_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_maintenance_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_mileage_logs: {
        Row: {
          created_at: string | null
          fuel_cost_brl: number | null
          fuel_efficiency_kmpl: number | null
          fuel_purchased_liters: number | null
          id: string
          location: string | null
          mileage_reading: number
          odometer_photo_url: string | null
          recorded_by: string | null
          recorded_date: string
          vehicle_id: string | null
          vehicle_log_id: string | null
        }
        Insert: {
          created_at?: string | null
          fuel_cost_brl?: number | null
          fuel_efficiency_kmpl?: number | null
          fuel_purchased_liters?: number | null
          id?: string
          location?: string | null
          mileage_reading: number
          odometer_photo_url?: string | null
          recorded_by?: string | null
          recorded_date: string
          vehicle_id?: string | null
          vehicle_log_id?: string | null
        }
        Update: {
          created_at?: string | null
          fuel_cost_brl?: number | null
          fuel_efficiency_kmpl?: number | null
          fuel_purchased_liters?: number | null
          id?: string
          location?: string | null
          mileage_reading?: number
          odometer_photo_url?: string | null
          recorded_by?: string | null
          recorded_date?: string
          vehicle_id?: string | null
          vehicle_log_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_mileage_logs_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_mileage_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_mileage_logs_vehicle_log_id_fkey"
            columns: ["vehicle_log_id"]
            isOneToOne: false
            referencedRelation: "vehicle_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          color: string | null
          created_at: string
          current_mileage: number | null
          focal_point_x: number | null
          focal_point_y: number | null
          fuel_capacity_liters: number | null
          gallery_images: Json | null
          id: string
          image_url: string | null
          insurance_expiry_date: string | null
          insurance_policy_number: string | null
          ipva_paid_until: string | null
          is_available: boolean
          is_rental: boolean | null
          last_maintenance_date: string | null
          last_maintenance_mileage: number | null
          license_plate: string
          model: string
          notes: string | null
          registration_expiry_date: string | null
          renavam_number: string | null
          rental_company: string | null
          rental_contact_info: string | null
          rental_cost_per_day: number | null
          seating_capacity: number | null
          updated_at: string
          vehicle_type: string | null
          year: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          current_mileage?: number | null
          focal_point_x?: number | null
          focal_point_y?: number | null
          fuel_capacity_liters?: number | null
          gallery_images?: Json | null
          id?: string
          image_url?: string | null
          insurance_expiry_date?: string | null
          insurance_policy_number?: string | null
          ipva_paid_until?: string | null
          is_available?: boolean
          is_rental?: boolean | null
          last_maintenance_date?: string | null
          last_maintenance_mileage?: number | null
          license_plate: string
          model: string
          notes?: string | null
          registration_expiry_date?: string | null
          renavam_number?: string | null
          rental_company?: string | null
          rental_contact_info?: string | null
          rental_cost_per_day?: number | null
          seating_capacity?: number | null
          updated_at?: string
          vehicle_type?: string | null
          year?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          current_mileage?: number | null
          focal_point_x?: number | null
          focal_point_y?: number | null
          fuel_capacity_liters?: number | null
          gallery_images?: Json | null
          id?: string
          image_url?: string | null
          insurance_expiry_date?: string | null
          insurance_policy_number?: string | null
          ipva_paid_until?: string | null
          is_available?: boolean
          is_rental?: boolean | null
          last_maintenance_date?: string | null
          last_maintenance_mileage?: number | null
          license_plate?: string
          model?: string
          notes?: string | null
          registration_expiry_date?: string | null
          renavam_number?: string | null
          rental_company?: string | null
          rental_contact_info?: string | null
          rental_cost_per_day?: number | null
          seating_capacity?: number | null
          updated_at?: string
          vehicle_type?: string | null
          year?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      activities_with_participants: {
        Row: {
          activity_date: string | null
          activity_type: string | null
          assigned_team_ids: string[] | null
          company_id: string | null
          company_name: string | null
          cost: number | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          end_date: string | null
          end_time: string | null
          flight_id: string | null
          host: string | null
          hotel_id: string | null
          id: string | null
          is_confirmed: boolean | null
          is_parallel_allowed: boolean | null
          location: string | null
          meeting_id: string | null
          notes: string | null
          participants: Json | null
          priority_level: string | null
          start_time: string | null
          status: string | null
          title: string | null
          trip_id: string | null
          type: string | null
          updated_at: string | null
          updated_by: string | null
          visibility_level: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_flight_id_fkey"
            columns: ["flight_id"]
            isOneToOne: false
            referencedRelation: "trip_flights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "trip_hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "trip_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_billing_summary: {
        Row: {
          approved_samples: number | null
          billing_basis: Database["public"]["Enums"]["billing_basis"] | null
          company: string | null
          currency: string | null
          has_origin_pricing: boolean | null
          id: string | null
          in_progress_samples: number | null
          is_qc_client: boolean | null
          last_sample_date: string | null
          name: string | null
          price_per_pound_cents: number | null
          price_per_sample: number | null
          pricing_model: Database["public"]["Enums"]["pricing_model"] | null
          received_samples: number | null
          rejected_samples: number | null
          total_billable_amount: number | null
          total_potential_amount: number | null
          total_samples: number | null
        }
        Relationships: []
      }
      client_origin_pricing_summary: {
        Row: {
          approved_count: number | null
          billable_amount: number | null
          client_id: string | null
          client_name: string | null
          company: string | null
          currency: string | null
          is_active: boolean | null
          origin: string | null
          price_per_pound_cents: number | null
          price_per_sample: number | null
          pricing_model: Database["public"]["Enums"]["pricing_model"] | null
          rejected_count: number | null
          samples_count: number | null
        }
        Relationships: []
      }
      client_search_view: {
        Row: {
          address: string | null
          city: string | null
          company_id: string | null
          country: string | null
          created_at: string | null
          email: string | null
          fantasy_name: string | null
          legacy_client_id: number | null
          name: string | null
          phone: string | null
          primary_category: string | null
          qc_client_id: string | null
          source_table: string | null
          state: string | null
          subcategories: string[] | null
          updated_at: string | null
        }
        Relationships: []
      }
      client_visible_shelves: {
        Row: {
          client_id: string | null
          client_name: string | null
          columns: number | null
          created_at: string | null
          id: string | null
          laboratory_id: string | null
          laboratory_location: string | null
          laboratory_name: string | null
          naming_convention: string | null
          rows: number | null
          samples_per_position: number | null
          shelf_letter: string | null
          shelf_number: number | null
          total_capacity: number | null
          updated_at: string | null
          x_position: number | null
          y_position: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_shelves_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_billing_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_shelves_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_origin_pricing_summary"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "lab_shelves_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_shelves_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "lab_shelves_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "lab_shelves_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
        ]
      }
      companies_with_legacy: {
        Row: {
          annual_trip_cost: number | null
          category: Database["public"]["Enums"]["company_category"] | null
          client_type: Database["public"]["Enums"]["client_type_enum"] | null
          created_at: string | null
          fantasy_name: string | null
          id: string | null
          legacy_client_id: number | null
          legacy_description: string | null
          legacy_fantasy_name: string | null
          name: string | null
          staff_count: number | null
          subcategories: string[] | null
          updated_at: string | null
        }
        Relationships: []
      }
      company_crm_timeline: {
        Row: {
          company_id: string | null
          company_name: string | null
          created_at: string | null
          description: string | null
          file_category: Database["public"]["Enums"]["file_category"] | null
          file_id: string | null
          file_name: string | null
          id: string | null
          interaction_date: string | null
          interaction_type:
            | Database["public"]["Enums"]["interaction_type"]
            | null
          meeting_note_id: string | null
          metadata: Json | null
          title: string | null
          trip_id: string | null
          trip_title: string | null
          user_id: string | null
          user_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_interactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_interactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_interactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_interactions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "company_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_interactions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file_sharing_summary"
            referencedColumns: ["file_id"]
          },
          {
            foreignKeyName: "company_interactions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "user_accessible_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_interactions_meeting_note_id_fkey"
            columns: ["meeting_note_id"]
            isOneToOne: false
            referencedRelation: "meeting_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_interactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_interactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_interactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      company_file_summaries: {
        Row: {
          all_tags: string[] | null
          company_id: string | null
          company_name: string | null
          contracts: number | null
          cupping_notes: number | null
          last_file_uploaded: string | null
          photos: number | null
          presentations: number | null
          reports: number | null
          total_files: number | null
          total_size_bytes: number | null
          unique_uploaders: number | null
        }
        Relationships: []
      }
      file_sharing_summary: {
        Row: {
          active_shares: number | null
          company_id: string | null
          company_name: string | null
          file_id: string | null
          file_name: string | null
          last_downloaded: string | null
          shared_with_companies: number | null
          shared_with_users: number | null
          total_downloads: number | null
          total_shares: number | null
          uploaded_by_id: string | null
          uploaded_by_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_files_uploaded_by_id_fkey"
            columns: ["uploaded_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_invoice_summary: {
        Row: {
          approved_count: number | null
          created_at: string | null
          currency: string | null
          days_overdue: number | null
          due_date: string | null
          invoice_id: string | null
          invoice_number: string | null
          lab_location: string | null
          lab_name: string | null
          laboratory_id: string | null
          paid_date: string | null
          payment_status: string | null
          period_end: string | null
          period_start: string | null
          rejected_count: number | null
          sample_count: number | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          total_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "laboratory_invoices_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "laboratory_invoices_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "laboratory_invoices_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_payment_summary: {
        Row: {
          approved_samples: number | null
          billing_basis: Database["public"]["Enums"]["billing_basis"] | null
          contact_email: string | null
          contact_name: string | null
          currency: string | null
          fee_per_sample: number | null
          first_sample_date: string | null
          is_active: boolean | null
          laboratory_id: string | null
          last_sample_date: string | null
          location: string | null
          name: string | null
          payment_schedule:
            | Database["public"]["Enums"]["payment_schedule"]
            | null
          pending_samples: number | null
          rejected_samples: number | null
          total_owed_amount: number | null
          total_potential_amount: number | null
          total_samples: number | null
          type: string | null
        }
        Relationships: []
      }
      lab_sample_breakdown: {
        Row: {
          approval_rate: number | null
          approved_samples: number | null
          laboratory_id: string | null
          location: string | null
          name: string | null
          pending_samples: number | null
          rejected_samples: number | null
          total_samples: number | null
          type: string | null
        }
        Relationships: []
      }
      trip_card_data: {
        Row: {
          access_code: string | null
          client: Json | null
          drivers: Json | null
          end_date: string | null
          guests: Json | null
          id: string | null
          notes_count: number | null
          progress: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["trip_status"] | null
          subject: string | null
          title: string | null
          vehicles: Json | null
          visit_count: number | null
          wolthers_staff: Json | null
        }
        Relationships: []
      }
      trip_expense_summaries: {
        Row: {
          category_breakdown: Json | null
          currency: string | null
          expense_count: number | null
          pending_reimbursement_amount: number | null
          pending_reimbursements: number | null
          total_amount: number | null
          trip_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_summaries: {
        Row: {
          access_code: string | null
          company_count: number | null
          company_names: string[] | null
          created_at: string | null
          creator_email: string | null
          creator_id: string | null
          creator_name: string | null
          description: string | null
          end_date: string | null
          id: string | null
          participant_count: number | null
          progress_percentage: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["trip_status"] | null
          title: string | null
          total_cost: number | null
          trip_type: Database["public"]["Enums"]["trip_type"] | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      upcoming_itinerary: {
        Row: {
          activity_date: string | null
          activity_type: Database["public"]["Enums"]["activity_type"] | null
          confirmation_details: string | null
          created_at: string | null
          custom_location: string | null
          description: string | null
          end_time: string | null
          id: string | null
          is_confirmed: boolean | null
          location_city: string | null
          location_country: string | null
          location_id: string | null
          location_name: string | null
          notes: string | null
          sort_order: number | null
          start_time: string | null
          title: string | null
          trip_id: string | null
          trip_status: Database["public"]["Enums"]["trip_status"] | null
          trip_title: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "company_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_card_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      user_accessible_files: {
        Row: {
          access_type: string | null
          category: Database["public"]["Enums"]["file_category"] | null
          company_id: string | null
          created_at: string | null
          description: string | null
          file_name: string | null
          file_size: number | null
          id: string | null
          mime_type: string | null
          tags: string[] | null
          uploaded_by_id: string | null
          uploaded_by_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_files_uploaded_by_id_fkey"
            columns: ["uploaded_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      calculate_client_fee: {
        Args: { client_id_param: string; sample_id_param: string }
        Returns: number
      }
      calculate_invoice_due_date: {
        Args: { invoice_date: string; lab_id: string }
        Returns: string
      }
      calculate_lab_fee: {
        Args: {
          laboratory_id_param: string
          sample_status_param: Database["public"]["Enums"]["sample_status"]
        }
        Returns: number
      }
      calculate_scaled_defect_points: {
        Args: {
          p_base_points: number
          p_base_size_grams?: number
          p_sample_size_grams: number
        }
        Returns: number
      }
      can_access_file: {
        Args: { p_file_id: string; p_user_id: string }
        Returns: boolean
      }
      can_create_laboratories: {
        Args: { user_id: string }
        Returns: boolean
      }
      check_staff_availability: {
        Args: {
          exclude_trip_id?: string
          staff_user_id: string
          trip_end_date: string
          trip_start_date: string
        }
        Returns: boolean
      }
      check_vehicle_availability: {
        Args: {
          exclude_trip_id?: string
          trip_end_date: string
          trip_start_date: string
          vehicle_id: string
        }
        Returns: boolean
      }
      cleanup_old_drafts: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      clone_quality_template: {
        Args: {
          p_created_by?: string
          p_is_global?: boolean
          p_laboratory_id?: string
          p_new_name_en: string
          p_new_name_es?: string
          p_new_name_pt?: string
          p_source_template_id: string
        }
        Returns: string
      }
      evaluate_sample_taints_faults: {
        Args: {
          p_client_id: string
          p_sample_id: string
          p_template_id: string
        }
        Returns: {
          failing_items: Json
          max_faults_allowed: number
          max_taints_allowed: number
          passes_faults: boolean
          passes_taints: boolean
          total_faults: number
          total_taints: number
        }[]
      }
      generate_lab_invoice_number: {
        Args: { lab_id: string; period_end_date: string }
        Returns: string
      }
      generate_position_code: {
        Args: {
          p_column_number: number
          p_row_number: number
          p_shelf_letter: string
        }
        Returns: string
      }
      generate_storage_path: {
        Args: {
          p_company_id: string
          p_file_category: Database["public"]["Enums"]["file_category"]
          p_original_filename: string
        }
        Returns: string
      }
      generate_storage_positions_for_shelf: {
        Args: { p_shelf_id: string }
        Returns: number
      }
      generate_tracking_number: {
        Args: {
          p_client_id: string
          p_laboratory_id: string
          p_origin?: string
        }
        Returns: string
      }
      generate_trip_access_token: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      generate_unique_trip_slug: {
        Args: { base_slug: string; creator_user_id: string }
        Returns: string
      }
      get_activity_duration_days: {
        Args: { activity_date: string; end_date: string }
        Returns: number
      }
      get_client_samples_in_storage: {
        Args: { p_client_id: string; p_laboratory_id?: string }
        Returns: {
          client_reference: string
          intake_date: string
          laboratory_id: string
          laboratory_name: string
          origin: string
          position_code: string
          sample_id: string
          shelf_id: string
          shelf_letter: string
          status: string
          storage_position: string
          tracking_number: string
        }[]
      }
      get_companies_with_locations: {
        Args: Record<PropertyKey, never>
        Returns: {
          company_email: string
          company_id: string
          company_name: string
          company_phone: string
          location_count: number
          primary_location_address: string
          primary_location_id: string
          primary_location_name: string
        }[]
      }
      get_company_crm_summary: {
        Args: { p_company_id: string }
        Returns: {
          last_interaction_date: string
          primary_contacts: string[]
          total_file_size_mb: number
          total_files: number
          total_interactions: number
          total_meetings: number
          total_trips: number
        }[]
      }
      get_cupping_attribute_name: {
        Args: { p_attribute_id: string; p_language?: string }
        Returns: string
      }
      get_defect_category_name: {
        Args: {
          p_category: Database["public"]["Enums"]["defect_category"]
          p_language?: string
        }
        Returns: string
      }
      get_defect_description: {
        Args: { p_defect_id: string; p_language?: string }
        Returns: string
      }
      get_defect_name: {
        Args: { p_defect_id: string; p_language?: string }
        Returns: string
      }
      get_effective_taint_fault_scale: {
        Args: { p_client_id?: string; p_definition_id: string }
        Returns: {
          scale_increment: number
          scale_max: number
          scale_min: number
          scale_type: string
          threshold: number
        }[]
      }
      get_legacy_client_stats: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_quality_template_description: {
        Args: { p_language?: string; p_template_id: string }
        Returns: string
      }
      get_quality_template_name: {
        Args: { p_language?: string; p_template_id: string }
        Returns: string
      }
      get_scale_type_name: {
        Args: { p_language?: string; p_scale_type: string }
        Returns: string
      }
      get_shelf_utilization: {
        Args: { p_shelf_id: string }
        Returns: {
          current_count: number
          occupied_positions: number
          total_capacity: number
          total_positions: number
          utilization_percentage: number
        }[]
      }
      get_taint_fault_description: {
        Args: { p_definition_id: string; p_language?: string }
        Returns: string
      }
      get_taint_fault_name: {
        Args: { p_definition_id: string; p_language?: string }
        Returns: string
      }
      get_taint_fault_type_name: {
        Args: {
          p_language?: string
          p_type: Database["public"]["Enums"]["taint_fault_type"]
        }
        Returns: string
      }
      get_trip_by_access_code: {
        Args: { p_access_code: string }
        Returns: Json
      }
      get_trips_simple: {
        Args: Record<PropertyKey, never>
        Returns: {
          access_code: string
          description: string
          end_date: string
          id: string
          progress_percentage: number
          start_date: string
          status: string
          title: string
        }[]
      }
      get_user_company_id: {
        Args: { user_id: string }
        Returns: string
      }
      get_user_laboratory: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_user_qc_laboratory: {
        Args: { user_id: string }
        Returns: string
      }
      get_user_qc_role: {
        Args: { user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      has_global_qc_access: {
        Args: { user_id: string }
        Returns: boolean
      }
      has_user_type: {
        Args: { user_id: string; user_types: string[] }
        Returns: boolean
      }
      is_global_admin: {
        Args: Record<PropertyKey, never> | { user_id: string }
        Returns: boolean
      }
      is_lab_manager: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_trip_creator: {
        Args: { trip_id: string; user_id: string }
        Returns: boolean
      }
      is_trip_participant: {
        Args: { trip_id: string; user_id: string }
        Returns: boolean
      }
      save_trip_draft: {
        Args: {
          p_creator_id: string
          p_current_step?: number
          p_draft_data: Json
          p_trip_type: Database["public"]["Enums"]["trip_type"]
        }
        Returns: string
      }
      search_clients: {
        Args: { limit_count?: number; search_term: string }
        Returns: {
          address: string
          city: string
          company_id: string
          country: string
          email: string
          fantasy_name: string
          name: string
          phone: string
          primary_category: string
          qc_client_id: string
          relevance_score: number
          source_table: string
          state: string
          subcategories: string[]
        }[]
      }
      search_company_files: {
        Args: {
          p_category?: Database["public"]["Enums"]["file_category"]
          p_company_id?: string
          p_limit?: number
          p_search_query: string
        }
        Returns: {
          category: Database["public"]["Enums"]["file_category"]
          company_id: string
          company_name: string
          created_at: string
          description: string
          file_name: string
          id: string
          rank: number
          tags: string[]
        }[]
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      sync_activities_from_existing_data: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      update_user_password: {
        Args: { new_password: string; user_email: string }
        Returns: {
          email: string
          id: string
          success: boolean
        }[]
      }
      validate_scale_config: {
        Args: {
          p_scale_increment: number
          p_scale_max: number
          p_scale_min: number
          p_scale_type: string
        }
        Returns: boolean
      }
      validate_taint_fault_score: {
        Args: {
          p_client_id: string
          p_count?: number
          p_definition_id: string
          p_score: number
        }
        Returns: {
          is_valid: boolean
          message: string
          threshold_exceeded: boolean
        }[]
      }
      verify_user_password: {
        Args: { user_email: string; user_password: string }
        Returns: {
          can_view_all_trips: boolean
          can_view_company_trips: boolean
          company_id: string
          company_name: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_global_admin: boolean
          is_valid: boolean
          last_login_at: string
          last_login_provider: string
          last_login_timezone: string
          microsoft_oauth_id: string
          notification_preferences: Json
          phone: string
          profile_picture_url: string
          timezone: string
          updated_at: string
          user_type: string
          whatsapp: string
        }[]
      }
    }
    Enums: {
      activity_type:
        | "meeting"
        | "visit"
        | "travel"
        | "hotel"
        | "meal"
        | "activity"
        | "conference_session"
        | "networking_event"
        | "presentation"
        | "flight_travel"
      billing_basis: "approved_only" | "approved_and_rejected" | "all_samples"
      certificate_status: "draft" | "issued" | "revoked"
      client_type:
        | "producer"
        | "producer_exporter"
        | "cooperative"
        | "exporter"
        | "importer_buyer"
        | "roaster"
        | "final_buyer"
        | "roaster_final_buyer"
        | "service_provider"
      client_type_enum:
        | "roasters"
        | "dealers_importers"
        | "exporters_coops"
        | "service_providers"
      company_category:
        | "importer_roaster"
        | "exporter_coop"
        | "service_provider"
        | "buyer"
        | "supplier"
        | "exporter"
        | "importer"
        | "cooperative"
        | "roaster"
      compliance_status: "pass" | "fail" | "pending"
      defect_category: "primary" | "secondary"
      email_status: "sent" | "failed" | "pending"
      expense_category:
        | "transport"
        | "accommodation"
        | "meals"
        | "activities"
        | "business"
        | "other"
      fee_payer:
        | "exporter"
        | "importer"
        | "roaster"
        | "final_buyer"
        | "client_pays"
      file_category:
        | "presentation"
        | "contract"
        | "cupping_notes"
        | "photo"
        | "chart"
        | "report"
        | "correspondence"
        | "certificate"
        | "other"
      handover_status: "pending" | "completed" | "disputed"
      interaction_type:
        | "meeting"
        | "email"
        | "phone_call"
        | "file_upload"
        | "file_share"
        | "note_added"
        | "trip_visit"
        | "contract_signed"
        | "sample_sent"
        | "cupping_session"
      invoice_status: "pending" | "approved" | "paid" | "disputed"
      moisture_standard: "coffee_industry" | "iso_6673"
      note_type:
        | "text"
        | "ocr_handwritten"
        | "chart_recreation"
        | "cupping_notes"
      participant_email_type:
        | "host_invitation"
        | "meeting_request"
        | "guest_itinerary"
        | "staff_notification"
        | "general_notification"
      payment_schedule: "net_30" | "net_45" | "end_of_next_month"
      pricing_model: "per_sample" | "per_pound" | "complimentary"
      sample_status:
        | "received"
        | "in_progress"
        | "under_review"
        | "approved"
        | "rejected"
      sample_type_enum: "pss" | "ss" | "type"
      session_status: "setup" | "active" | "completed"
      session_type: "digital" | "handwritten" | "q_grading"
      share_method: "client_portal" | "email_link" | "direct_share"
      share_permission: "view_only" | "download" | "comment" | "full_access"
      taint_fault_type: "taint" | "fault"
      trip_creation_status:
        | "draft"
        | "step1_completed"
        | "step2_completed"
        | "step3_completed"
        | "published"
        | "incomplete"
        | "step4_completed"
        | "pending_confirmation"
      trip_status:
        | "planning"
        | "confirmed"
        | "ongoing"
        | "completed"
        | "cancelled"
      trip_type: "convention" | "in_land"
      upload_context:
        | "meeting_notes"
        | "trip_summary"
        | "manual_upload"
        | "email_attachment"
        | "expense_receipt"
        | "handover_photo"
      user_role:
        | "lab_personnel"
        | "lab_finance_manager"
        | "lab_quality_manager"
        | "santos_hq_finance"
        | "global_finance_admin"
        | "global_quality_admin"
        | "global_admin"
        | "client"
        | "supplier"
        | "buyer"
      user_type: "wolthers_staff" | "client" | "driver" | "admin"
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
      activity_type: [
        "meeting",
        "visit",
        "travel",
        "hotel",
        "meal",
        "activity",
        "conference_session",
        "networking_event",
        "presentation",
        "flight_travel",
      ],
      billing_basis: ["approved_only", "approved_and_rejected", "all_samples"],
      certificate_status: ["draft", "issued", "revoked"],
      client_type: [
        "producer",
        "producer_exporter",
        "cooperative",
        "exporter",
        "importer_buyer",
        "roaster",
        "final_buyer",
        "roaster_final_buyer",
        "service_provider",
      ],
      client_type_enum: [
        "roasters",
        "dealers_importers",
        "exporters_coops",
        "service_providers",
      ],
      company_category: [
        "importer_roaster",
        "exporter_coop",
        "service_provider",
        "buyer",
        "supplier",
        "exporter",
        "importer",
        "cooperative",
        "roaster",
      ],
      compliance_status: ["pass", "fail", "pending"],
      defect_category: ["primary", "secondary"],
      email_status: ["sent", "failed", "pending"],
      expense_category: [
        "transport",
        "accommodation",
        "meals",
        "activities",
        "business",
        "other",
      ],
      fee_payer: [
        "exporter",
        "importer",
        "roaster",
        "final_buyer",
        "client_pays",
      ],
      file_category: [
        "presentation",
        "contract",
        "cupping_notes",
        "photo",
        "chart",
        "report",
        "correspondence",
        "certificate",
        "other",
      ],
      handover_status: ["pending", "completed", "disputed"],
      interaction_type: [
        "meeting",
        "email",
        "phone_call",
        "file_upload",
        "file_share",
        "note_added",
        "trip_visit",
        "contract_signed",
        "sample_sent",
        "cupping_session",
      ],
      invoice_status: ["pending", "approved", "paid", "disputed"],
      moisture_standard: ["coffee_industry", "iso_6673"],
      note_type: [
        "text",
        "ocr_handwritten",
        "chart_recreation",
        "cupping_notes",
      ],
      participant_email_type: [
        "host_invitation",
        "meeting_request",
        "guest_itinerary",
        "staff_notification",
        "general_notification",
      ],
      payment_schedule: ["net_30", "net_45", "end_of_next_month"],
      pricing_model: ["per_sample", "per_pound", "complimentary"],
      sample_status: [
        "received",
        "in_progress",
        "under_review",
        "approved",
        "rejected",
      ],
      sample_type_enum: ["pss", "ss", "type"],
      session_status: ["setup", "active", "completed"],
      session_type: ["digital", "handwritten", "q_grading"],
      share_method: ["client_portal", "email_link", "direct_share"],
      share_permission: ["view_only", "download", "comment", "full_access"],
      taint_fault_type: ["taint", "fault"],
      trip_creation_status: [
        "draft",
        "step1_completed",
        "step2_completed",
        "step3_completed",
        "published",
        "incomplete",
        "step4_completed",
        "pending_confirmation",
      ],
      trip_status: [
        "planning",
        "confirmed",
        "ongoing",
        "completed",
        "cancelled",
      ],
      trip_type: ["convention", "in_land"],
      upload_context: [
        "meeting_notes",
        "trip_summary",
        "manual_upload",
        "email_attachment",
        "expense_receipt",
        "handover_photo",
      ],
      user_role: [
        "lab_personnel",
        "lab_finance_manager",
        "lab_quality_manager",
        "santos_hq_finance",
        "global_finance_admin",
        "global_quality_admin",
        "global_admin",
        "client",
        "supplier",
        "buyer",
      ],
      user_type: ["wolthers_staff", "client", "driver", "admin"],
    },
  },
} as const
