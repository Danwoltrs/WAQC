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
      access_requests: {
        Row: {
          admin_notes: string | null
          approved_laboratory_id: string | null
          approved_role: string | null
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
          approved_laboratory_id?: string | null
          approved_role?: string | null
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
          approved_laboratory_id?: string | null
          approved_role?: string | null
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
            foreignKeyName: "access_requests_approved_laboratory_id_fkey"
            columns: ["approved_laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "access_requests_approved_laboratory_id_fkey"
            columns: ["approved_laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "access_requests_approved_laboratory_id_fkey"
            columns: ["approved_laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "access_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      activity_feed: {
        Row: {
          action: string
          actor_id: string | null
          client_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          laboratory_id: string | null
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          client_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          laboratory_id?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          client_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          laboratory_id?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_activity_feed_client"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_feed_client"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_feed_client"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "fk_activity_feed_laboratory"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "fk_activity_feed_laboratory"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "fk_activity_feed_laboratory"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
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
      ai_autonomy_levels: {
        Row: {
          action_type: string
          autonomous_threshold: number | null
          client_id: string
          consecutive_approvals: number | null
          current_level: string
          draft_threshold: number | null
          id: string
          level_changed_at: string | null
          lock_reason: string | null
          locked_at: string | null
          locked_by: string | null
          manually_locked_level: string | null
          total_approved: number | null
          total_corrected: number | null
          total_predictions: number | null
          total_rejected: number | null
          updated_at: string
        }
        Insert: {
          action_type: string
          autonomous_threshold?: number | null
          client_id: string
          consecutive_approvals?: number | null
          current_level?: string
          draft_threshold?: number | null
          id?: string
          level_changed_at?: string | null
          lock_reason?: string | null
          locked_at?: string | null
          locked_by?: string | null
          manually_locked_level?: string | null
          total_approved?: number | null
          total_corrected?: number | null
          total_predictions?: number | null
          total_rejected?: number | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          autonomous_threshold?: number | null
          client_id?: string
          consecutive_approvals?: number | null
          current_level?: string
          draft_threshold?: number | null
          id?: string
          level_changed_at?: string | null
          lock_reason?: string | null
          locked_at?: string | null
          locked_by?: string | null
          manually_locked_level?: string | null
          total_approved?: number | null
          total_corrected?: number | null
          total_predictions?: number | null
          total_rejected?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_autonomy_levels_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_autonomy_levels_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_autonomy_levels_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      ai_confidence_scores: {
        Row: {
          accuracy_pct: number | null
          action_type: string
          client_id: string
          consecutive_correct: number
          current_level: string
          demoted_at: string | null
          id: string
          promoted_at: string | null
          total_correct: number
          total_predictions: number
          updated_at: string
        }
        Insert: {
          accuracy_pct?: number | null
          action_type: string
          client_id: string
          consecutive_correct?: number
          current_level?: string
          demoted_at?: string | null
          id?: string
          promoted_at?: string | null
          total_correct?: number
          total_predictions?: number
          updated_at?: string
        }
        Update: {
          accuracy_pct?: number | null
          action_type?: string
          client_id?: string
          consecutive_correct?: number
          current_level?: string
          demoted_at?: string | null
          id?: string
          promoted_at?: string | null
          total_correct?: number
          total_predictions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_confidence_scores_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_confidence_scores_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_confidence_scores_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      ai_drafts_log: {
        Row: {
          classification: string | null
          classification_confidence: number | null
          contract_id: string
          created_at: string
          diff: Json | null
          direction: string | null
          document_ids: string[]
          editor_user_id: string | null
          final_sent: Json | null
          graph_reply_to_message_id: string | null
          id: string
          model: string
          original_draft: Json
          sent_at: string | null
          status: string
        }
        Insert: {
          classification?: string | null
          classification_confidence?: number | null
          contract_id: string
          created_at?: string
          diff?: Json | null
          direction?: string | null
          document_ids: string[]
          editor_user_id?: string | null
          final_sent?: Json | null
          graph_reply_to_message_id?: string | null
          id?: string
          model: string
          original_draft: Json
          sent_at?: string | null
          status: string
        }
        Update: {
          classification?: string | null
          classification_confidence?: number | null
          contract_id?: string
          created_at?: string
          diff?: Json | null
          direction?: string | null
          document_ids?: string[]
          editor_user_id?: string | null
          final_sent?: Json | null
          graph_reply_to_message_id?: string | null
          id?: string
          model?: string
          original_draft?: Json
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_drafts_log_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_drafts_log_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_drafts_log_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
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
      ai_learning_log: {
        Row: {
          action_type: string
          actual_value: Json | null
          client_id: string | null
          confidence: number
          consecutive_correct: number
          created_at: string
          email_from: string | null
          email_message_id: string | null
          email_message_uuid: string | null
          email_received_at: string | null
          email_subject: string | null
          id: string
          metadata: Json
          predicted_value: Json
          resolved_at: string | null
          resolved_by: string | null
          was_correct: boolean | null
          xp_client_action: string | null
        }
        Insert: {
          action_type: string
          actual_value?: Json | null
          client_id?: string | null
          confidence: number
          consecutive_correct?: number
          created_at?: string
          email_from?: string | null
          email_message_id?: string | null
          email_message_uuid?: string | null
          email_received_at?: string | null
          email_subject?: string | null
          id?: string
          metadata?: Json
          predicted_value: Json
          resolved_at?: string | null
          resolved_by?: string | null
          was_correct?: boolean | null
          xp_client_action?: string | null
        }
        Update: {
          action_type?: string
          actual_value?: Json | null
          client_id?: string | null
          confidence?: number
          consecutive_correct?: number
          created_at?: string
          email_from?: string | null
          email_message_id?: string | null
          email_message_uuid?: string | null
          email_received_at?: string | null
          email_subject?: string | null
          id?: string
          metadata?: Json
          predicted_value?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          was_correct?: boolean | null
          xp_client_action?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_learning_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_learning_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_learning_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ai_learning_log_email_message_uuid_fkey"
            columns: ["email_message_uuid"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_writing_samples: {
        Row: {
          author_email: string | null
          author_user_id: string | null
          body_html: string | null
          body_text: string | null
          cc_emails: string[]
          client_id: string | null
          conversation_id: string | null
          created_at: string
          document_ids: string[]
          document_type_ids: string[]
          email_message_id: string | null
          id: string
          learning_log_ids: string[]
          recipient_emails: string[]
          sample_type: string
          sent_at: string | null
          source: string
          subject: string
        }
        Insert: {
          author_email?: string | null
          author_user_id?: string | null
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[]
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          document_ids?: string[]
          document_type_ids?: string[]
          email_message_id?: string | null
          id?: string
          learning_log_ids?: string[]
          recipient_emails?: string[]
          sample_type: string
          sent_at?: string | null
          source?: string
          subject: string
        }
        Update: {
          author_email?: string | null
          author_user_id?: string | null
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[]
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          document_ids?: string[]
          document_type_ids?: string[]
          email_message_id?: string | null
          id?: string
          learning_log_ids?: string[]
          recipient_emails?: string[]
          sample_type?: string
          sent_at?: string | null
          source?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_writing_samples_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_writing_samples_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_writing_samples_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      bag_markings: {
        Row: {
          approved_at: string | null
          buyer_feedback: string | null
          buyer_response_at: string | null
          contract_id: string
          created_at: string
          document_id: string | null
          exporter_notified_at: string | null
          forwarded_to_buyer_at: string | null
          id: string
          last_reminder_at: string | null
          notes: string | null
          previous_marking_id: string | null
          reminder_count: number | null
          revision_number: number | null
          status: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          buyer_feedback?: string | null
          buyer_response_at?: string | null
          contract_id: string
          created_at?: string
          document_id?: string | null
          exporter_notified_at?: string | null
          forwarded_to_buyer_at?: string | null
          id?: string
          last_reminder_at?: string | null
          notes?: string | null
          previous_marking_id?: string | null
          reminder_count?: number | null
          revision_number?: number | null
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          buyer_feedback?: string | null
          buyer_response_at?: string | null
          contract_id?: string
          created_at?: string
          document_id?: string | null
          exporter_notified_at?: string | null
          forwarded_to_buyer_at?: string | null
          id?: string
          last_reminder_at?: string | null
          notes?: string | null
          previous_marking_id?: string | null
          reminder_count?: number | null
          revision_number?: number | null
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bag_markings_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bag_markings_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bag_markings_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bag_markings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "trade_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bag_markings_previous_marking_id_fkey"
            columns: ["previous_marking_id"]
            isOneToOne: false
            referencedRelation: "bag_markings"
            referencedColumns: ["id"]
          },
        ]
      }
      bag_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_bulk: boolean
          name: string
          sort_order: number
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_bulk?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_bulk?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      bag_weight_standards: {
        Row: {
          bag_type: Database["public"]["Enums"]["bag_type_enum"]
          created_at: string | null
          description: string | null
          equivalent_60kg_bags: number
          id: string
          is_active: boolean | null
          updated_at: string | null
          weight_kg: number
        }
        Insert: {
          bag_type: Database["public"]["Enums"]["bag_type_enum"]
          created_at?: string | null
          description?: string | null
          equivalent_60kg_bags: number
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          weight_kg: number
        }
        Update: {
          bag_type?: Database["public"]["Enums"]["bag_type_enum"]
          created_at?: string | null
          description?: string | null
          equivalent_60kg_bags?: number
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          weight_kg?: number
        }
        Relationships: []
      }
      certificate_definitions: {
        Row: {
          color: string | null
          created_at: string | null
          default_premium_cents_lb: number | null
          default_premium_label: string | null
          full_name: string
          id: string
          is_active: boolean | null
          options: string[] | null
          short_label: string | null
          sort_order: number | null
          tag: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          default_premium_cents_lb?: number | null
          default_premium_label?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          options?: string[] | null
          short_label?: string | null
          sort_order?: number | null
          tag: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          default_premium_cents_lb?: number | null
          default_premium_label?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          options?: string[] | null
          short_label?: string | null
          sort_order?: number | null
          tag?: string
          updated_at?: string | null
        }
        Relationships: []
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_number_configs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_number_configs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
      certificate_revisions: {
        Row: {
          certificate_id: string
          changes_made: Json
          created_at: string
          id: string
          new_data: Json
          previous_data: Json
          revised_at: string
          revised_by: string
          revision_number: number
          revision_reason: string
        }
        Insert: {
          certificate_id: string
          changes_made: Json
          created_at?: string
          id?: string
          new_data: Json
          previous_data: Json
          revised_at?: string
          revised_by: string
          revision_number: number
          revision_reason: string
        }
        Update: {
          certificate_id?: string
          changes_made?: Json
          created_at?: string
          id?: string
          new_data?: Json
          previous_data?: Json
          revised_at?: string
          revised_by?: string
          revision_number?: number
          revision_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificate_revisions_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_sequences: {
        Row: {
          client_id: string
          last_sequence: number
          year: number
        }
        Insert: {
          client_id: string
          last_sequence?: number
          year: number
        }
        Update: {
          client_id?: string
          last_sequence?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "certificate_sequences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_sequences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_sequences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
      certificate_types: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
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
          approved: boolean
          certificate_data: Json
          certificate_number: string
          compliance_violations: Json | null
          created_at: string | null
          id: string
          is_latest: boolean | null
          is_rejected: boolean | null
          issued_at: string
          issued_by: string | null
          issued_to: string
          override_comment: string | null
          pdf_url: string | null
          revision_number: number | null
          sample_contract_id: string | null
          sample_id: string | null
          status: Database["public"]["Enums"]["certificate_status"] | null
          superseded_by: string | null
          updated_at: string | null
          valid_from: string
          valid_until: string
        }
        Insert: {
          approved?: boolean
          certificate_data?: Json
          certificate_number: string
          compliance_violations?: Json | null
          created_at?: string | null
          id?: string
          is_latest?: boolean | null
          is_rejected?: boolean | null
          issued_at?: string
          issued_by?: string | null
          issued_to: string
          override_comment?: string | null
          pdf_url?: string | null
          revision_number?: number | null
          sample_contract_id?: string | null
          sample_id?: string | null
          status?: Database["public"]["Enums"]["certificate_status"] | null
          superseded_by?: string | null
          updated_at?: string | null
          valid_from: string
          valid_until: string
        }
        Update: {
          approved?: boolean
          certificate_data?: Json
          certificate_number?: string
          compliance_violations?: Json | null
          created_at?: string | null
          id?: string
          is_latest?: boolean | null
          is_rejected?: boolean | null
          issued_at?: string
          issued_by?: string | null
          issued_to?: string
          override_comment?: string | null
          pdf_url?: string | null
          revision_number?: number | null
          sample_contract_id?: string | null
          sample_id?: string | null
          status?: Database["public"]["Enums"]["certificate_status"] | null
          superseded_by?: string | null
          updated_at?: string | null
          valid_from?: string
          valid_until?: string
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
            foreignKeyName: "certificates_sample_contract_id_fkey"
            columns: ["sample_contract_id"]
            isOneToOne: false
            referencedRelation: "sample_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "certificates"
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_certificate_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_certificate_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      client_laboratory_config: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          laboratory_id: string
          notes: string | null
          starting_sequence: number | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          laboratory_id: string
          notes?: string | null
          starting_sequence?: number | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          laboratory_id?: string
          notes?: string | null
          starting_sequence?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_laboratory_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_laboratory_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_laboratory_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "client_laboratory_config_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "client_laboratory_config_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "client_laboratory_config_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_origin_pricing_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_origin_pricing_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      client_qualities: {
        Row: {
          certificate_suffix: string | null
          client_id: string | null
          code_position: string | null
          created_at: string | null
          cups_per_sample: number | null
          custom_name: string | null
          custom_parameters: Json | null
          description: string | null
          discrepancy_threshold: number | null
          fee_currency: string | null
          fee_price: number | null
          fee_unit: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          origin: string | null
          quality_code: string | null
          template_id: string | null
          updated_at: string | null
          uses_certificate_suffix: boolean | null
        }
        Insert: {
          certificate_suffix?: string | null
          client_id?: string | null
          code_position?: string | null
          created_at?: string | null
          cups_per_sample?: number | null
          custom_name?: string | null
          custom_parameters?: Json | null
          description?: string | null
          discrepancy_threshold?: number | null
          fee_currency?: string | null
          fee_price?: number | null
          fee_unit?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          origin?: string | null
          quality_code?: string | null
          template_id?: string | null
          updated_at?: string | null
          uses_certificate_suffix?: boolean | null
        }
        Update: {
          certificate_suffix?: string | null
          client_id?: string | null
          code_position?: string | null
          created_at?: string | null
          cups_per_sample?: number | null
          custom_name?: string | null
          custom_parameters?: Json | null
          description?: string | null
          discrepancy_threshold?: number | null
          fee_currency?: string | null
          fee_price?: number | null
          fee_unit?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          origin?: string | null
          quality_code?: string | null
          template_id?: string | null
          updated_at?: string | null
          uses_certificate_suffix?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "client_qualities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_qualities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_qualities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_taint_fault_customizations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_taint_fault_customizations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
      commissions: {
        Row: {
          calculated_amount_confirmed: number | null
          calculated_amount_estimated: number | null
          co_broker_id: string | null
          co_broker_share: number | null
          contract_id: string
          created_at: string
          created_by: string | null
          currency: string
          exchange_rate_at_calc: number | null
          id: string
          invoice_id: string | null
          notes: string | null
          rate: number
          rate_unit: string
          shipment_id: string | null
          source: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          calculated_amount_confirmed?: number | null
          calculated_amount_estimated?: number | null
          co_broker_id?: string | null
          co_broker_share?: number | null
          contract_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange_rate_at_calc?: number | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          rate: number
          rate_unit: string
          shipment_id?: string | null
          source: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          calculated_amount_confirmed?: number | null
          calculated_amount_estimated?: number | null
          co_broker_id?: string | null
          co_broker_share?: number | null
          contract_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange_rate_at_calc?: number | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          rate?: number
          rate_unit?: string
          shipment_id?: string | null
          source?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_co_broker_id_fkey"
            columns: ["co_broker_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_co_broker_id_fkey"
            columns: ["co_broker_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_co_broker_id_fkey"
            columns: ["co_broker_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "commissions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_commission_invoice"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          admin_approval_required: boolean | null
          annual_trip_cost: number | null
          category: Database["public"]["Enums"]["company_category"] | null
          certifications: string[]
          city: string | null
          client_type: Database["public"]["Enums"]["client_type_enum"] | null
          company_types: string[]
          condition_order: Json | null
          country: string | null
          created_at: string
          created_by: string | null
          default_arbitration: string | null
          default_commission_rate: number | null
          default_commission_unit: string | null
          default_destination_port: string | null
          default_destination_port_ids: string[]
          default_fixation_type: string | null
          default_packaging: string | null
          default_packaging_options: Json
          default_payment_term_template_id: string | null
          default_payment_terms: string | null
          document_cnpj: string | null
          document_ie: string | null
          domains: string[]
          email: string | null
          email_contracts: string | null
          email_domains: string[]
          eudr_status: string | null
          fantasy_name: string | null
          fantasy_name_search: string | null
          fantasy_name_unaccent: string | null
          flo_id: string | null
          gets_own_shipment_update: boolean
          id: string
          is_active: boolean
          is_qc_client: boolean
          latitude: number | null
          legacy_client_id: number | null
          logo_url: string | null
          longitude: number | null
          name: string
          name_search: string | null
          name_unaccent: string | null
          neighbourhood: string | null
          notes: string | null
          person_type: string | null
          pf_terms: Json | null
          phone: string | null
          phone_secondary: string | null
          preferred_certifications: Json | null
          pss_lead_weeks: number | null
          receives_shipment_updates: boolean
          region: string | null
          shipment_update_layout: string
          staff_count: number | null
          state: string | null
          street: string | null
          street_number: string | null
          subcategories: string[] | null
          trading_roles: Json
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          admin_approval_required?: boolean | null
          annual_trip_cost?: number | null
          category?: Database["public"]["Enums"]["company_category"] | null
          certifications?: string[]
          city?: string | null
          client_type?: Database["public"]["Enums"]["client_type_enum"] | null
          company_types?: string[]
          condition_order?: Json | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          default_arbitration?: string | null
          default_commission_rate?: number | null
          default_commission_unit?: string | null
          default_destination_port?: string | null
          default_destination_port_ids?: string[]
          default_fixation_type?: string | null
          default_packaging?: string | null
          default_packaging_options?: Json
          default_payment_term_template_id?: string | null
          default_payment_terms?: string | null
          document_cnpj?: string | null
          document_ie?: string | null
          domains?: string[]
          email?: string | null
          email_contracts?: string | null
          email_domains?: string[]
          eudr_status?: string | null
          fantasy_name?: string | null
          fantasy_name_search?: string | null
          fantasy_name_unaccent?: string | null
          flo_id?: string | null
          gets_own_shipment_update?: boolean
          id?: string
          is_active?: boolean
          is_qc_client?: boolean
          latitude?: number | null
          legacy_client_id?: number | null
          logo_url?: string | null
          longitude?: number | null
          name: string
          name_search?: string | null
          name_unaccent?: string | null
          neighbourhood?: string | null
          notes?: string | null
          person_type?: string | null
          pf_terms?: Json | null
          phone?: string | null
          phone_secondary?: string | null
          preferred_certifications?: Json | null
          pss_lead_weeks?: number | null
          receives_shipment_updates?: boolean
          region?: string | null
          shipment_update_layout?: string
          staff_count?: number | null
          state?: string | null
          street?: string | null
          street_number?: string | null
          subcategories?: string[] | null
          trading_roles?: Json
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          admin_approval_required?: boolean | null
          annual_trip_cost?: number | null
          category?: Database["public"]["Enums"]["company_category"] | null
          certifications?: string[]
          city?: string | null
          client_type?: Database["public"]["Enums"]["client_type_enum"] | null
          company_types?: string[]
          condition_order?: Json | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          default_arbitration?: string | null
          default_commission_rate?: number | null
          default_commission_unit?: string | null
          default_destination_port?: string | null
          default_destination_port_ids?: string[]
          default_fixation_type?: string | null
          default_packaging?: string | null
          default_packaging_options?: Json
          default_payment_term_template_id?: string | null
          default_payment_terms?: string | null
          document_cnpj?: string | null
          document_ie?: string | null
          domains?: string[]
          email?: string | null
          email_contracts?: string | null
          email_domains?: string[]
          eudr_status?: string | null
          fantasy_name?: string | null
          fantasy_name_search?: string | null
          fantasy_name_unaccent?: string | null
          flo_id?: string | null
          gets_own_shipment_update?: boolean
          id?: string
          is_active?: boolean
          is_qc_client?: boolean
          latitude?: number | null
          legacy_client_id?: number | null
          logo_url?: string | null
          longitude?: number | null
          name?: string
          name_search?: string | null
          name_unaccent?: string | null
          neighbourhood?: string | null
          notes?: string | null
          person_type?: string | null
          pf_terms?: Json | null
          phone?: string | null
          phone_secondary?: string | null
          preferred_certifications?: Json | null
          pss_lead_weeks?: number | null
          receives_shipment_updates?: boolean
          region?: string | null
          shipment_update_layout?: string
          staff_count?: number | null
          state?: string | null
          street?: string | null
          street_number?: string | null
          subcategories?: string[] | null
          trading_roles?: Json
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_default_payment_term_template_id_fkey"
            columns: ["default_payment_term_template_id"]
            isOneToOne: false
            referencedRelation: "condition_templates"
            referencedColumns: ["id"]
          },
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
      company_bank_accounts: {
        Row: {
          account_number: string | null
          bank_name: string | null
          branch: string | null
          company_id: string
          created_at: string
          id: string
          is_primary: boolean | null
          legacy_id: number | null
          routing_code: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          bank_name?: string | null
          branch?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_primary?: boolean | null
          legacy_id?: number | null
          routing_code?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          bank_name?: string | null
          branch?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean | null
          legacy_id?: number | null
          routing_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
          search_vector: unknown
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
          search_vector?: unknown
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
          search_vector?: unknown
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
      company_fixation_brokers: {
        Row: {
          broker_id: string
          company_id: string
          created_by: string | null
          first_seen_at: string
          is_pinned: boolean
          last_used_at: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          broker_id: string
          company_id: string
          created_by?: string | null
          first_seen_at?: string
          is_pinned?: boolean
          last_used_at?: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          broker_id?: string
          company_id?: string
          created_by?: string | null
          first_seen_at?: string
          is_pinned?: boolean
          last_used_at?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_fixation_brokers_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_fixation_brokers_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_fixation_brokers_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_fixation_brokers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_fixation_brokers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_fixation_brokers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
      company_merges: {
        Row: {
          fk_counts: Json
          id: string
          loser_ids: string[]
          loser_snapshots: Json
          performed_at: string
          performed_by: string | null
          survivor_id: string | null
        }
        Insert: {
          fk_counts: Json
          id?: string
          loser_ids: string[]
          loser_snapshots: Json
          performed_at?: string
          performed_by?: string | null
          survivor_id?: string | null
        }
        Update: {
          fk_counts?: Json
          id?: string
          loser_ids?: string[]
          loser_snapshots?: Json
          performed_at?: string
          performed_by?: string | null
          survivor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_merges_survivor_id_fkey"
            columns: ["survivor_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_merges_survivor_id_fkey"
            columns: ["survivor_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_merges_survivor_id_fkey"
            columns: ["survivor_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      company_qualities: {
        Row: {
          company_id: string
          contract_clause_text: string | null
          created_at: string
          created_by: string | null
          end_client_id: string | null
          full_description: string | null
          id: string
          inquiry_text: string | null
          is_active: boolean
          is_private: boolean
          quality_id: string | null
          short_name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          company_id: string
          contract_clause_text?: string | null
          created_at?: string
          created_by?: string | null
          end_client_id?: string | null
          full_description?: string | null
          id?: string
          inquiry_text?: string | null
          is_active?: boolean
          is_private?: boolean
          quality_id?: string | null
          short_name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          contract_clause_text?: string | null
          created_at?: string
          created_by?: string | null
          end_client_id?: string | null
          full_description?: string | null
          id?: string
          inquiry_text?: string | null
          is_active?: boolean
          is_private?: boolean
          quality_id?: string | null
          short_name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_qualities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_qualities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_qualities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_qualities_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_qualities_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_qualities_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_qualities_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "quality_master"
            referencedColumns: ["id"]
          },
        ]
      }
      company_recipient_memory: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          email: string
          first_used_at: string
          id: string
          last_used_at: string
          name: string | null
          placement: string
          purpose: string
          updated_at: string
          use_count: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          email: string
          first_used_at?: string
          id?: string
          last_used_at?: string
          name?: string | null
          placement?: string
          purpose: string
          updated_at?: string
          use_count?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          email?: string
          first_used_at?: string
          id?: string
          last_used_at?: string
          name?: string | null
          placement?: string
          purpose?: string
          updated_at?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_recipient_memory_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_recipient_memory_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_recipient_memory_company_id_fkey"
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
      condition_template_versions: {
        Row: {
          category: string
          certificate_subtype: string | null
          edit_reason: string | null
          edited_at: string
          edited_by: string | null
          id: string
          template_id: string
          template_variables: Json | null
          text: string
          version_number: number
        }
        Insert: {
          category: string
          certificate_subtype?: string | null
          edit_reason?: string | null
          edited_at?: string
          edited_by?: string | null
          id?: string
          template_id: string
          template_variables?: Json | null
          text: string
          version_number: number
        }
        Update: {
          category?: string
          certificate_subtype?: string | null
          edit_reason?: string | null
          edited_at?: string
          edited_by?: string | null
          id?: string
          template_id?: string
          template_variables?: Json | null
          text?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "condition_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "condition_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      condition_templates: {
        Row: {
          actionable: boolean | null
          auto_offer: boolean
          category: string | null
          certificate_subtype: string | null
          checklist_items: string[] | null
          conditions: Json
          created_at: string
          created_by: string | null
          default_checked: boolean
          edit_count: number
          header_template: string | null
          id: string
          include_on_inquiry: boolean | null
          inquiry_text: string | null
          is_active: boolean
          last_used_at: string | null
          legacy_id: number | null
          linked_certificate: string | null
          linked_company_id: string | null
          linked_destination: string | null
          linked_destinations: string[] | null
          linked_quality_id: string | null
          linked_route: string | null
          managed_by: string
          name: string | null
          notes: string | null
          overrides: boolean | null
          phrase_template: string | null
          reminder_days: number | null
          removal_count: number
          sets_count: number
          sort_order: number | null
          source_type: string | null
          specification: string | null
          status: string
          template_variables: Json | null
          text: string | null
          trigger: string
          type: string | null
          updated_at: string
          usage_count: number
          version: number
        }
        Insert: {
          actionable?: boolean | null
          auto_offer?: boolean
          category?: string | null
          certificate_subtype?: string | null
          checklist_items?: string[] | null
          conditions?: Json
          created_at?: string
          created_by?: string | null
          default_checked?: boolean
          edit_count?: number
          header_template?: string | null
          id?: string
          include_on_inquiry?: boolean | null
          inquiry_text?: string | null
          is_active?: boolean
          last_used_at?: string | null
          legacy_id?: number | null
          linked_certificate?: string | null
          linked_company_id?: string | null
          linked_destination?: string | null
          linked_destinations?: string[] | null
          linked_quality_id?: string | null
          linked_route?: string | null
          managed_by?: string
          name?: string | null
          notes?: string | null
          overrides?: boolean | null
          phrase_template?: string | null
          reminder_days?: number | null
          removal_count?: number
          sets_count?: number
          sort_order?: number | null
          source_type?: string | null
          specification?: string | null
          status?: string
          template_variables?: Json | null
          text?: string | null
          trigger?: string
          type?: string | null
          updated_at?: string
          usage_count?: number
          version?: number
        }
        Update: {
          actionable?: boolean | null
          auto_offer?: boolean
          category?: string | null
          certificate_subtype?: string | null
          checklist_items?: string[] | null
          conditions?: Json
          created_at?: string
          created_by?: string | null
          default_checked?: boolean
          edit_count?: number
          header_template?: string | null
          id?: string
          include_on_inquiry?: boolean | null
          inquiry_text?: string | null
          is_active?: boolean
          last_used_at?: string | null
          legacy_id?: number | null
          linked_certificate?: string | null
          linked_company_id?: string | null
          linked_destination?: string | null
          linked_destinations?: string[] | null
          linked_quality_id?: string | null
          linked_route?: string | null
          managed_by?: string
          name?: string | null
          notes?: string | null
          overrides?: boolean | null
          phrase_template?: string | null
          reminder_days?: number | null
          removal_count?: number
          sets_count?: number
          sort_order?: number | null
          source_type?: string | null
          specification?: string | null
          status?: string
          template_variables?: Json | null
          text?: string | null
          trigger?: string
          type?: string | null
          updated_at?: string
          usage_count?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "condition_templates_linked_company_id_fkey"
            columns: ["linked_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "condition_templates_linked_company_id_fkey"
            columns: ["linked_company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "condition_templates_linked_company_id_fkey"
            columns: ["linked_company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "condition_templates_linked_quality_id_fkey"
            columns: ["linked_quality_id"]
            isOneToOne: false
            referencedRelation: "quality_master"
            referencedColumns: ["id"]
          },
        ]
      }
      condition_templates_backup_2026_04_22: {
        Row: {
          actionable: boolean | null
          category: string | null
          certificate_subtype: string | null
          conditions: Json | null
          created_at: string | null
          created_by: string | null
          edit_count: number | null
          id: string | null
          include_on_inquiry: boolean | null
          inquiry_text: string | null
          is_active: boolean | null
          last_used_at: string | null
          legacy_id: number | null
          linked_certificate: string | null
          linked_company_id: string | null
          linked_destination: string | null
          linked_destinations: string[] | null
          linked_quality_id: string | null
          linked_route: string | null
          name: string | null
          notes: string | null
          overrides: boolean | null
          reminder_days: number | null
          removal_count: number | null
          sort_order: number | null
          source_type: string | null
          specification: string | null
          status: string | null
          template_variables: Json | null
          text: string | null
          trigger: string | null
          type: string | null
          updated_at: string | null
          usage_count: number | null
          version: number | null
        }
        Insert: {
          actionable?: boolean | null
          category?: string | null
          certificate_subtype?: string | null
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          edit_count?: number | null
          id?: string | null
          include_on_inquiry?: boolean | null
          inquiry_text?: string | null
          is_active?: boolean | null
          last_used_at?: string | null
          legacy_id?: number | null
          linked_certificate?: string | null
          linked_company_id?: string | null
          linked_destination?: string | null
          linked_destinations?: string[] | null
          linked_quality_id?: string | null
          linked_route?: string | null
          name?: string | null
          notes?: string | null
          overrides?: boolean | null
          reminder_days?: number | null
          removal_count?: number | null
          sort_order?: number | null
          source_type?: string | null
          specification?: string | null
          status?: string | null
          template_variables?: Json | null
          text?: string | null
          trigger?: string | null
          type?: string | null
          updated_at?: string | null
          usage_count?: number | null
          version?: number | null
        }
        Update: {
          actionable?: boolean | null
          category?: string | null
          certificate_subtype?: string | null
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          edit_count?: number | null
          id?: string | null
          include_on_inquiry?: boolean | null
          inquiry_text?: string | null
          is_active?: boolean | null
          last_used_at?: string | null
          legacy_id?: number | null
          linked_certificate?: string | null
          linked_company_id?: string | null
          linked_destination?: string | null
          linked_destinations?: string[] | null
          linked_quality_id?: string | null
          linked_route?: string | null
          name?: string | null
          notes?: string | null
          overrides?: boolean | null
          reminder_days?: number | null
          removal_count?: number | null
          sort_order?: number | null
          source_type?: string | null
          specification?: string | null
          status?: string | null
          template_variables?: Json | null
          text?: string | null
          trigger?: string | null
          type?: string | null
          updated_at?: string | null
          usage_count?: number | null
          version?: number | null
        }
        Relationships: []
      }
      condition_usage_log: {
        Row: {
          buyer_id: string
          condition_number: number
          condition_template_id: string
          contract_id: string
          created_at: string
          destination: string | null
          id: string
          quality_id: string | null
          was_kept: boolean
        }
        Insert: {
          buyer_id: string
          condition_number: number
          condition_template_id: string
          contract_id: string
          created_at?: string
          destination?: string | null
          id?: string
          quality_id?: string | null
          was_kept?: boolean
        }
        Update: {
          buyer_id?: string
          condition_number?: number
          condition_template_id?: string
          contract_id?: string
          created_at?: string
          destination?: string | null
          id?: string
          quality_id?: string | null
          was_kept?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "condition_usage_log_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "condition_usage_log_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "condition_usage_log_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "condition_usage_log_condition_template_id_fkey"
            columns: ["condition_template_id"]
            isOneToOne: false
            referencedRelation: "condition_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "condition_usage_log_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "condition_usage_log_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "condition_usage_log_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "condition_usage_log_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "quality_master"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          is_group: boolean
          is_primary: boolean | null
          name: string
          name_search: string | null
          nickname: string | null
          nickname_search: string | null
          notes: string | null
          phone: string | null
          preferred_language: string | null
          role: string | null
          routing_purposes: string[]
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_group?: boolean
          is_primary?: boolean | null
          name: string
          name_search?: string | null
          nickname?: string | null
          nickname_search?: string | null
          notes?: string | null
          phone?: string | null
          preferred_language?: string | null
          role?: string | null
          routing_purposes?: string[]
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_group?: boolean
          is_primary?: boolean | null
          name?: string
          name_search?: string | null
          nickname?: string | null
          nickname_search?: string | null
          notes?: string | null
          phone?: string | null
          preferred_language?: string | null
          role?: string | null
          routing_purposes?: string[]
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      containers: {
        Row: {
          container_number: string
          container_type: string | null
          created_at: string
          id: string
          seal_number: string | null
          tare_weight_kg: number | null
          updated_at: string
        }
        Insert: {
          container_number: string
          container_type?: string | null
          created_at?: string
          id?: string
          seal_number?: string | null
          tare_weight_kg?: number | null
          updated_at?: string
        }
        Update: {
          container_number?: string
          container_type?: string | null
          created_at?: string
          id?: string
          seal_number?: string | null
          tare_weight_kg?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      contract_assembled_conditions: {
        Row: {
          category: string | null
          condition_template_id: string | null
          contract_id: string
          created_at: string
          id: string
          is_active: boolean
          panel_key: string | null
          sort_order: number
          source_type: string
          text: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          condition_template_id?: string | null
          contract_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          panel_key?: string | null
          sort_order: number
          source_type: string
          text: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          condition_template_id?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          panel_key?: string | null
          sort_order?: number
          source_type?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_assembled_conditions_condition_template_id_fkey"
            columns: ["condition_template_id"]
            isOneToOne: false
            referencedRelation: "condition_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_assembled_conditions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_assembled_conditions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_assembled_conditions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_conditions: {
        Row: {
          conditions: Json
          contract_id: string
          created_at: string
          id: string
          revised_at: string | null
          revised_by: string | null
          revision_number: number
          source_templates: Json | null
        }
        Insert: {
          conditions?: Json
          contract_id: string
          created_at?: string
          id?: string
          revised_at?: string | null
          revised_by?: string | null
          revision_number?: number
          source_templates?: Json | null
        }
        Update: {
          conditions?: Json
          contract_id?: string
          created_at?: string
          id?: string
          revised_at?: string | null
          revised_by?: string | null
          revision_number?: number
          source_templates?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_conditions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_conditions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_conditions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_drafts: {
        Row: {
          buyer_id: string | null
          buyer_name: string | null
          created_at: string
          created_by: string
          id: string
          issued_contract_id: string | null
          owner_changed_at: string | null
          owner_id: string
          payload: Json
          previous_owner_id: string | null
          quality_summary: string | null
          seller_id: string | null
          seller_name: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          buyer_id?: string | null
          buyer_name?: string | null
          created_at?: string
          created_by: string
          id?: string
          issued_contract_id?: string | null
          owner_changed_at?: string | null
          owner_id: string
          payload: Json
          previous_owner_id?: string | null
          quality_summary?: string | null
          seller_id?: string | null
          seller_name?: string | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          buyer_id?: string | null
          buyer_name?: string | null
          created_at?: string
          created_by?: string
          id?: string
          issued_contract_id?: string | null
          owner_changed_at?: string | null
          owner_id?: string
          payload?: Json
          previous_owner_id?: string | null
          quality_summary?: string | null
          seller_id?: string | null
          seller_name?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_drafts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_drafts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_drafts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contract_drafts_issued_contract_id_fkey"
            columns: ["issued_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_drafts_issued_contract_id_fkey"
            columns: ["issued_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_drafts_issued_contract_id_fkey"
            columns: ["issued_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_drafts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_drafts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_drafts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      contract_revisions: {
        Row: {
          changed_fields: string[]
          contract_id: string
          created_at: string
          created_by: string | null
          id: string
          reason: string | null
          revision: number
          snapshot: Json
        }
        Insert: {
          changed_fields?: string[]
          contract_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          revision: number
          snapshot: Json
        }
        Update: {
          changed_fields?: string[]
          contract_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          revision?: number
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "contract_revisions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_revisions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_revisions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_send_log: {
        Row: {
          body_snapshot: string
          contract_id: string
          error_message: string | null
          graph_message_id: string | null
          hide_commission_on_pdf: boolean
          id: string
          is_sandbox: boolean
          pdf_storage_path: string | null
          recipients_cc: Json
          recipients_to: Json
          sent_at: string
          sent_by: string
          side: string
          status: string
        }
        Insert: {
          body_snapshot: string
          contract_id: string
          error_message?: string | null
          graph_message_id?: string | null
          hide_commission_on_pdf: boolean
          id?: string
          is_sandbox?: boolean
          pdf_storage_path?: string | null
          recipients_cc?: Json
          recipients_to?: Json
          sent_at?: string
          sent_by: string
          side: string
          status?: string
        }
        Update: {
          body_snapshot?: string
          contract_id?: string
          error_message?: string | null
          graph_message_id?: string | null
          hide_commission_on_pdf?: boolean
          id?: string
          is_sandbox?: boolean
          pdf_storage_path?: string | null
          recipients_cc?: Json
          recipients_to?: Json
          sent_at?: string
          sent_by?: string
          side?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_send_log_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_send_log_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_send_log_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_splits: {
        Row: {
          bag_type: string | null
          bag_weight_kg: number | null
          buyer_subcontract_ref: string | null
          contract_id: string
          created_at: string
          created_by: string | null
          destination_port: string | null
          id: string
          notes: string | null
          repasse_contract_id: string | null
          seller_subcontract_ref: string | null
          updated_at: string
          volume_bags: number
        }
        Insert: {
          bag_type?: string | null
          bag_weight_kg?: number | null
          buyer_subcontract_ref?: string | null
          contract_id: string
          created_at?: string
          created_by?: string | null
          destination_port?: string | null
          id?: string
          notes?: string | null
          repasse_contract_id?: string | null
          seller_subcontract_ref?: string | null
          updated_at?: string
          volume_bags: number
        }
        Update: {
          bag_type?: string | null
          bag_weight_kg?: number | null
          buyer_subcontract_ref?: string | null
          contract_id?: string
          created_at?: string
          created_by?: string | null
          destination_port?: string | null
          id?: string
          notes?: string | null
          repasse_contract_id?: string | null
          seller_subcontract_ref?: string | null
          updated_at?: string
          volume_bags?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_splits_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_splits_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_splits_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_splits_repasse_contract_id_fkey"
            columns: ["repasse_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_splits_repasse_contract_id_fkey"
            columns: ["repasse_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_splits_repasse_contract_id_fkey"
            columns: ["repasse_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          approved_at: string | null
          approved_by_document_id: string | null
          arbitration: string | null
          average_fixed_price: number | null
          bag_type: string | null
          bag_weight_kg: number | null
          bags_per_box: number | null
          buyer_contact_id: string | null
          buyer_id: string
          buyer_reference: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cert_options: Json
          certifications: Json | null
          channel: string
          commission_buyer_rate: number | null
          commission_buyer_unit: string | null
          commission_invoicing_entity: string
          commission_invoicing_entity_buyer: string
          commission_invoicing_entity_seller: string
          commission_rate: number | null
          commission_seller_rate: number | null
          commission_seller_unit: string | null
          commission_source: string | null
          commission_splits: Json | null
          commission_unit: string | null
          container_group_id: string | null
          container_leg: string | null
          container_size: string | null
          contract_date: string | null
          contract_number: string
          contract_type: string
          created_at: string
          created_by: string | null
          created_in_new_system: boolean
          crop: string | null
          destination: string | null
          differential_value: number | null
          disclose_buyer_to_parent_seller: boolean
          end_buyer_id: string | null
          end_client_id: string | null
          eudr_compliant: string | null
          exchange: string | null
          exchange_month_default: string | null
          external_visible: boolean
          fixation_deadline: string | null
          fixation_limitation_days: number | null
          fixation_notes: string | null
          fixation_status: string | null
          fixation_type: string | null
          fixation_window_open_date: string | null
          id: string
          inquiry_id: string | null
          internal_notes: Json | null
          is_approved: boolean
          is_finalized: boolean | null
          is_urgent: boolean | null
          last_sent_revision: number | null
          legacy_id: number | null
          legacy_user_id: number | null
          notes: string | null
          outright_price: number | null
          outright_price_unit: string | null
          packaging: string | null
          parent_contract_group_id: string | null
          parent_contract_id: string | null
          payment_terms: string | null
          premiums: Json
          price_description: string | null
          price_type: string
          qc_provider: string | null
          quality_description: string | null
          quality_description_unaccent: string | null
          quality_id: string | null
          report_destination_text: string | null
          report_quantity_text: string | null
          report_type: string | null
          revision: number
          sample_notes: string | null
          seller_contact_id: string | null
          seller_id: string | null
          seller_reference: string | null
          shipment_description: string | null
          shipment_period_end: string | null
          shipment_period_start: string | null
          shipper_id: string | null
          sold_by_ids: string[]
          status: string
          string_id: string | null
          total_lots: number | null
          trader_id: string | null
          updated_at: string
          volume_bags: number
          volume_description: string | null
          wa_qc_approved: boolean
        }
        Insert: {
          approved_at?: string | null
          approved_by_document_id?: string | null
          arbitration?: string | null
          average_fixed_price?: number | null
          bag_type?: string | null
          bag_weight_kg?: number | null
          bags_per_box?: number | null
          buyer_contact_id?: string | null
          buyer_id: string
          buyer_reference?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cert_options?: Json
          certifications?: Json | null
          channel?: string
          commission_buyer_rate?: number | null
          commission_buyer_unit?: string | null
          commission_invoicing_entity?: string
          commission_invoicing_entity_buyer?: string
          commission_invoicing_entity_seller?: string
          commission_rate?: number | null
          commission_seller_rate?: number | null
          commission_seller_unit?: string | null
          commission_source?: string | null
          commission_splits?: Json | null
          commission_unit?: string | null
          container_group_id?: string | null
          container_leg?: string | null
          container_size?: string | null
          contract_date?: string | null
          contract_number: string
          contract_type?: string
          created_at?: string
          created_by?: string | null
          created_in_new_system?: boolean
          crop?: string | null
          destination?: string | null
          differential_value?: number | null
          disclose_buyer_to_parent_seller?: boolean
          end_buyer_id?: string | null
          end_client_id?: string | null
          eudr_compliant?: string | null
          exchange?: string | null
          exchange_month_default?: string | null
          external_visible?: boolean
          fixation_deadline?: string | null
          fixation_limitation_days?: number | null
          fixation_notes?: string | null
          fixation_status?: string | null
          fixation_type?: string | null
          fixation_window_open_date?: string | null
          id?: string
          inquiry_id?: string | null
          internal_notes?: Json | null
          is_approved?: boolean
          is_finalized?: boolean | null
          is_urgent?: boolean | null
          last_sent_revision?: number | null
          legacy_id?: number | null
          legacy_user_id?: number | null
          notes?: string | null
          outright_price?: number | null
          outright_price_unit?: string | null
          packaging?: string | null
          parent_contract_group_id?: string | null
          parent_contract_id?: string | null
          payment_terms?: string | null
          premiums?: Json
          price_description?: string | null
          price_type: string
          qc_provider?: string | null
          quality_description?: string | null
          quality_description_unaccent?: string | null
          quality_id?: string | null
          report_destination_text?: string | null
          report_quantity_text?: string | null
          report_type?: string | null
          revision?: number
          sample_notes?: string | null
          seller_contact_id?: string | null
          seller_id?: string | null
          seller_reference?: string | null
          shipment_description?: string | null
          shipment_period_end?: string | null
          shipment_period_start?: string | null
          shipper_id?: string | null
          sold_by_ids?: string[]
          status?: string
          string_id?: string | null
          total_lots?: number | null
          trader_id?: string | null
          updated_at?: string
          volume_bags: number
          volume_description?: string | null
          wa_qc_approved?: boolean
        }
        Update: {
          approved_at?: string | null
          approved_by_document_id?: string | null
          arbitration?: string | null
          average_fixed_price?: number | null
          bag_type?: string | null
          bag_weight_kg?: number | null
          bags_per_box?: number | null
          buyer_contact_id?: string | null
          buyer_id?: string
          buyer_reference?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cert_options?: Json
          certifications?: Json | null
          channel?: string
          commission_buyer_rate?: number | null
          commission_buyer_unit?: string | null
          commission_invoicing_entity?: string
          commission_invoicing_entity_buyer?: string
          commission_invoicing_entity_seller?: string
          commission_rate?: number | null
          commission_seller_rate?: number | null
          commission_seller_unit?: string | null
          commission_source?: string | null
          commission_splits?: Json | null
          commission_unit?: string | null
          container_group_id?: string | null
          container_leg?: string | null
          container_size?: string | null
          contract_date?: string | null
          contract_number?: string
          contract_type?: string
          created_at?: string
          created_by?: string | null
          created_in_new_system?: boolean
          crop?: string | null
          destination?: string | null
          differential_value?: number | null
          disclose_buyer_to_parent_seller?: boolean
          end_buyer_id?: string | null
          end_client_id?: string | null
          eudr_compliant?: string | null
          exchange?: string | null
          exchange_month_default?: string | null
          external_visible?: boolean
          fixation_deadline?: string | null
          fixation_limitation_days?: number | null
          fixation_notes?: string | null
          fixation_status?: string | null
          fixation_type?: string | null
          fixation_window_open_date?: string | null
          id?: string
          inquiry_id?: string | null
          internal_notes?: Json | null
          is_approved?: boolean
          is_finalized?: boolean | null
          is_urgent?: boolean | null
          last_sent_revision?: number | null
          legacy_id?: number | null
          legacy_user_id?: number | null
          notes?: string | null
          outright_price?: number | null
          outright_price_unit?: string | null
          packaging?: string | null
          parent_contract_group_id?: string | null
          parent_contract_id?: string | null
          payment_terms?: string | null
          premiums?: Json
          price_description?: string | null
          price_type?: string
          qc_provider?: string | null
          quality_description?: string | null
          quality_description_unaccent?: string | null
          quality_id?: string | null
          report_destination_text?: string | null
          report_quantity_text?: string | null
          report_type?: string | null
          revision?: number
          sample_notes?: string | null
          seller_contact_id?: string | null
          seller_id?: string | null
          seller_reference?: string | null
          shipment_description?: string | null
          shipment_period_end?: string | null
          shipment_period_start?: string | null
          shipper_id?: string | null
          sold_by_ids?: string[]
          status?: string
          string_id?: string | null
          total_lots?: number | null
          trader_id?: string | null
          updated_at?: string
          volume_bags?: number
          volume_description?: string | null
          wa_qc_approved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contracts_approved_by_document_id_fkey"
            columns: ["approved_by_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_buyer_contact_id_fkey"
            columns: ["buyer_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contracts_end_buyer_id_fkey"
            columns: ["end_buyer_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_end_buyer_id_fkey"
            columns: ["end_buyer_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_end_buyer_id_fkey"
            columns: ["end_buyer_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contracts_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contracts_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "quality_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_seller_contact_id_fkey"
            columns: ["seller_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contracts_shipper_id_fkey"
            columns: ["shipper_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_shipper_id_fkey"
            columns: ["shipper_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_shipper_id_fkey"
            columns: ["shipper_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "fk_contract_group"
            columns: ["parent_contract_group_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contract_group"
            columns: ["parent_contract_group_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contract_group"
            columns: ["parent_contract_group_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contract_parent"
            columns: ["parent_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contract_parent"
            columns: ["parent_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contract_parent"
            columns: ["parent_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts_fixation_backup_20260428: {
        Row: {
          fixation_status: string | null
          fixation_type: string | null
          id: string | null
          price_type: string | null
          shipment_period_start: string | null
          updated_at: string | null
        }
        Insert: {
          fixation_status?: string | null
          fixation_type?: string | null
          id?: string | null
          price_type?: string | null
          shipment_period_start?: string | null
          updated_at?: string | null
        }
        Update: {
          fixation_status?: string | null
          fixation_type?: string | null
          id?: string | null
          price_type?: string | null
          shipment_period_start?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
      country_codes: {
        Row: {
          country_code: string
          country_name: string
          created_at: string | null
          id: string
        }
        Insert: {
          country_code: string
          country_name: string
          created_at?: string | null
          id?: string
        }
        Update: {
          country_code?: string
          country_name?: string
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      country_phyto_change_log: {
        Row: {
          changed_at: string
          field_changed: string
          id: string
          new_value: string | null
          previous_value: string | null
          requirement_id: string
        }
        Insert: {
          changed_at?: string
          field_changed: string
          id?: string
          new_value?: string | null
          previous_value?: string | null
          requirement_id: string
        }
        Update: {
          changed_at?: string
          field_changed?: string
          id?: string
          new_value?: string | null
          previous_value?: string | null
          requirement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "country_phyto_change_log_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "country_phyto_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      country_phyto_requirements: {
        Row: {
          country_name_en: string | null
          country_name_pt: string
          created_at: string
          declaracoes_adicionais: string | null
          finalidade: string
          id: string
          last_changed_at: string
          last_scraped_at: string
          observacoes: string | null
          parte_exportada: string
          pdf_storage_path: string | null
          produto: string
          raw_html: string | null
          requires_additional_declaration: boolean
          requires_phyto: boolean
          requisitos_gerais: string | null
          scientific_name: string
          source_url: string
          tratamentos: string | null
          updated_at: string
        }
        Insert: {
          country_name_en?: string | null
          country_name_pt: string
          created_at?: string
          declaracoes_adicionais?: string | null
          finalidade?: string
          id?: string
          last_changed_at?: string
          last_scraped_at?: string
          observacoes?: string | null
          parte_exportada?: string
          pdf_storage_path?: string | null
          produto?: string
          raw_html?: string | null
          requires_additional_declaration?: boolean
          requires_phyto?: boolean
          requisitos_gerais?: string | null
          scientific_name?: string
          source_url: string
          tratamentos?: string | null
          updated_at?: string
        }
        Update: {
          country_name_en?: string | null
          country_name_pt?: string
          created_at?: string
          declaracoes_adicionais?: string | null
          finalidade?: string
          id?: string
          last_changed_at?: string
          last_scraped_at?: string
          observacoes?: string | null
          parte_exportada?: string
          pdf_storage_path?: string | null
          produto?: string
          raw_html?: string | null
          requires_additional_declaration?: boolean
          requires_phyto?: boolean
          requisitos_gerais?: string | null
          scientific_name?: string
          source_url?: string
          tratamentos?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      couriers: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          name: string
          tracking_url_template: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          tracking_url_template?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          tracking_url_template?: string | null
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_attribute_definitions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_attribute_definitions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
      cupping_audit_log: {
        Row: {
          action: string
          details: Json | null
          id: string
          laboratory_id: string | null
          performed_at: string | null
          performed_by: string | null
          sample_id: string | null
          session_id: string | null
        }
        Insert: {
          action: string
          details?: Json | null
          id?: string
          laboratory_id?: string | null
          performed_at?: string | null
          performed_by?: string | null
          sample_id?: string | null
          session_id?: string | null
        }
        Update: {
          action?: string
          details?: Json | null
          id?: string
          laboratory_id?: string | null
          performed_at?: string | null
          performed_by?: string | null
          sample_id?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cupping_audit_log_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "cupping_audit_log_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "cupping_audit_log_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_audit_log_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_audit_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cupping_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_audit_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_summary_stats"
            referencedColumns: ["session_id"]
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_scale_configs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_scale_configs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
          cup_defects: Json | null
          cupper_id: string | null
          defects: Json | null
          entry_method: string | null
          id: string
          notes: string | null
          sample_id: string | null
          scores: Json
          session_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          cup_defects?: Json | null
          cupper_id?: string | null
          defects?: Json | null
          entry_method?: string | null
          id?: string
          notes?: string | null
          sample_id?: string | null
          scores?: Json
          session_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          cup_defects?: Json | null
          cupper_id?: string | null
          defects?: Json | null
          entry_method?: string | null
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
          {
            foreignKeyName: "cupping_scores_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_summary_stats"
            referencedColumns: ["session_id"]
          },
        ]
      }
      cupping_sessions: {
        Row: {
          allow_single_cupper: boolean | null
          auto_averaged: boolean | null
          created_at: string | null
          created_by: string | null
          cup_count: number | null
          cup_pattern: string | null
          cupper_completion: Json | null
          cupper_ids: Json | null
          discrepancy_detected: boolean | null
          discrepancy_notes: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          laboratory_id: string | null
          master_cupper_id: string | null
          min_cuppers_required: number | null
          participants: string[]
          review_required: boolean | null
          sample_ids: string[]
          session_date: string | null
          session_type: Database["public"]["Enums"]["session_type"] | null
          status: Database["public"]["Enums"]["session_status"] | null
          updated_at: string | null
          validated_at: string | null
          validated_by: string | null
          validation_notes: string | null
        }
        Insert: {
          allow_single_cupper?: boolean | null
          auto_averaged?: boolean | null
          created_at?: string | null
          created_by?: string | null
          cup_count?: number | null
          cup_pattern?: string | null
          cupper_completion?: Json | null
          cupper_ids?: Json | null
          discrepancy_detected?: boolean | null
          discrepancy_notes?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          laboratory_id?: string | null
          master_cupper_id?: string | null
          min_cuppers_required?: number | null
          participants: string[]
          review_required?: boolean | null
          sample_ids: string[]
          session_date?: string | null
          session_type?: Database["public"]["Enums"]["session_type"] | null
          status?: Database["public"]["Enums"]["session_status"] | null
          updated_at?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_notes?: string | null
        }
        Update: {
          allow_single_cupper?: boolean | null
          auto_averaged?: boolean | null
          created_at?: string | null
          created_by?: string | null
          cup_count?: number | null
          cup_pattern?: string | null
          cupper_completion?: Json | null
          cupper_ids?: Json | null
          discrepancy_detected?: boolean | null
          discrepancy_notes?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          laboratory_id?: string | null
          master_cupper_id?: string | null
          min_cuppers_required?: number | null
          participants?: string[]
          review_required?: boolean | null
          sample_ids?: string[]
          session_date?: string | null
          session_type?: Database["public"]["Enums"]["session_type"] | null
          status?: Database["public"]["Enums"]["session_status"] | null
          updated_at?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cupping_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_sessions_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_sessions_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "cupping_sessions_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "cupping_sessions_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_sessions_master_cupper_id_fkey"
            columns: ["master_cupper_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_sessions_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_summary_send_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          is_friday: boolean
          payload_summary: Json | null
          recipients: Json
          resend_id: string | null
          send_date: string
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          is_friday: boolean
          payload_summary?: Json | null
          recipients: Json
          resend_id?: string | null
          send_date: string
          status: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          is_friday?: boolean
          payload_summary?: Json | null
          recipients?: Json
          resend_id?: string | null
          send_date?: string
          status?: string
        }
        Relationships: []
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_definitions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_definitions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
      departments: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          group_email: string | null
          id: string
          is_active: boolean
          modules: string[]
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          group_email?: string | null
          id?: string
          is_active?: boolean
          modules?: string[]
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          group_email?: string | null
          id?: string
          is_active?: boolean
          modules?: string[]
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      destination_conditions: {
        Row: {
          country: string
          created_at: string | null
          id: string
          is_active: boolean | null
          requires_mapa_phyto: boolean | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          country: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          requires_mapa_phyto?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          country?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          requires_mapa_phyto?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      destinations: {
        Row: {
          country_name: string
          created_at: string
          id: string
          is_active: boolean
          sort_order: number
          trigger_value: string
          updated_at: string
        }
        Insert: {
          country_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          trigger_value: string
          updated_at?: string
        }
        Update: {
          country_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          trigger_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_activity_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          document_id: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          document_id: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          document_id?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "document_activity_log_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_annotations: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: string
          height_pct: number | null
          id: string
          kind: string
          label: string | null
          note: string
          page_number: number
          resolved_at: string | null
          resolved_by: string | null
          width_pct: number | null
          x_pct: number | null
          y_pct: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id: string
          height_pct?: number | null
          id?: string
          kind?: string
          label?: string | null
          note: string
          page_number?: number
          resolved_at?: string | null
          resolved_by?: string | null
          width_pct?: number | null
          x_pct?: number | null
          y_pct?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: string
          height_pct?: number | null
          id?: string
          kind?: string
          label?: string | null
          note?: string
          page_number?: number
          resolved_at?: string | null
          resolved_by?: string | null
          width_pct?: number | null
          x_pct?: number | null
          y_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_annotations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_contracts: {
        Row: {
          contract_id: string
          created_at: string
          document_id: string
          id: string
          is_primary: boolean
          match_confidence: number | null
          match_source: string | null
          matched_column: string | null
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          document_id: string
          id?: string
          is_primary?: boolean
          match_confidence?: number | null
          match_source?: string | null
          matched_column?: string | null
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          document_id?: string
          id?: string
          is_primary?: boolean
          match_confidence?: number | null
          match_source?: string | null
          matched_column?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_contracts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_contracts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_contracts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_contracts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
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
      document_threads: {
        Row: {
          contract_id: string
          conversation_id: string | null
          created_at: string
          id: string
          needs_review: boolean
          topic_cluster_id: string
          topic_label: string
          updated_at: string
        }
        Insert: {
          contract_id: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          needs_review?: boolean
          topic_cluster_id: string
          topic_label: string
          updated_at?: string
        }
        Update: {
          contract_id?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          needs_review?: boolean
          topic_cluster_id?: string
          topic_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_threads_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_threads_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_threads_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_user_created: boolean
          name: string
          scope: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_user_created?: boolean
          name: string
          scope: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_user_created?: boolean
          name?: string
          scope?: string
          sort_order?: number
        }
        Relationships: []
      }
      documents: {
        Row: {
          ai_confidence: number | null
          archived_at: string | null
          classify_log_id: string | null
          contract_id: string | null
          correction_last_reply_at: string | null
          correction_request_email_id: string | null
          correction_requested_at: string | null
          correction_requested_by: string | null
          correction_status: string
          created_at: string
          created_by: string | null
          document_type_id: string | null
          email_conversation_id: string | null
          email_message_id: string | null
          email_message_uuid: string | null
          file_hash: string | null
          file_name: string
          file_size: number | null
          forward_note: string | null
          forwarded_at: string | null
          forwarded_by: string | null
          forwarded_to: string | null
          handled_at: string | null
          handled_by: string | null
          id: string
          ingestion_log_id: string | null
          mime_type: string | null
          pdf_is_image: boolean
          pdf_text: string | null
          possible_duplicate: boolean
          rejected_at: string | null
          rejected_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shipment_id: string | null
          side: string | null
          source: string
          status: string
          storage_path: string
          updated_at: string
          vision_extracted: Json | null
          vision_extracted_at: string | null
        }
        Insert: {
          ai_confidence?: number | null
          archived_at?: string | null
          classify_log_id?: string | null
          contract_id?: string | null
          correction_last_reply_at?: string | null
          correction_request_email_id?: string | null
          correction_requested_at?: string | null
          correction_requested_by?: string | null
          correction_status?: string
          created_at?: string
          created_by?: string | null
          document_type_id?: string | null
          email_conversation_id?: string | null
          email_message_id?: string | null
          email_message_uuid?: string | null
          file_hash?: string | null
          file_name: string
          file_size?: number | null
          forward_note?: string | null
          forwarded_at?: string | null
          forwarded_by?: string | null
          forwarded_to?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          ingestion_log_id?: string | null
          mime_type?: string | null
          pdf_is_image?: boolean
          pdf_text?: string | null
          possible_duplicate?: boolean
          rejected_at?: string | null
          rejected_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shipment_id?: string | null
          side?: string | null
          source?: string
          status?: string
          storage_path: string
          updated_at?: string
          vision_extracted?: Json | null
          vision_extracted_at?: string | null
        }
        Update: {
          ai_confidence?: number | null
          archived_at?: string | null
          classify_log_id?: string | null
          contract_id?: string | null
          correction_last_reply_at?: string | null
          correction_request_email_id?: string | null
          correction_requested_at?: string | null
          correction_requested_by?: string | null
          correction_status?: string
          created_at?: string
          created_by?: string | null
          document_type_id?: string | null
          email_conversation_id?: string | null
          email_message_id?: string | null
          email_message_uuid?: string | null
          file_hash?: string | null
          file_name?: string
          file_size?: number | null
          forward_note?: string | null
          forwarded_at?: string | null
          forwarded_by?: string | null
          forwarded_to?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          ingestion_log_id?: string | null
          mime_type?: string | null
          pdf_is_image?: boolean
          pdf_text?: string | null
          possible_duplicate?: boolean
          rejected_at?: string | null
          rejected_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shipment_id?: string | null
          side?: string | null
          source?: string
          status?: string
          storage_path?: string
          updated_at?: string
          vision_extracted?: Json | null
          vision_extracted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_classify_log_id_fkey"
            columns: ["classify_log_id"]
            isOneToOne: false
            referencedRelation: "ai_learning_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_correction_request_email_id_fkey"
            columns: ["correction_request_email_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_email_message_uuid_fkey"
            columns: ["email_message_uuid"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_ingestion_log_id_fkey"
            columns: ["ingestion_log_id"]
            isOneToOne: false
            referencedRelation: "ai_learning_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
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
      email_log: {
        Row: {
          actions_taken: Json | null
          attachment_names: Json | null
          body_preview: string | null
          cc_addresses: Json | null
          classification: string | null
          classification_confidence: number | null
          created_at: string
          error_message: string | null
          extracted_data: Json | null
          from_address: string | null
          from_name: string | null
          has_attachments: boolean | null
          id: string
          mailbox: string
          match_confidence: number | null
          match_method: string | null
          matched_contract_id: string | null
          message_id: string | null
          processed_at: string | null
          processing_duration_ms: number | null
          processing_status: string
          received_at: string
          review_action: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          subject: string | null
          to_addresses: Json | null
        }
        Insert: {
          actions_taken?: Json | null
          attachment_names?: Json | null
          body_preview?: string | null
          cc_addresses?: Json | null
          classification?: string | null
          classification_confidence?: number | null
          created_at?: string
          error_message?: string | null
          extracted_data?: Json | null
          from_address?: string | null
          from_name?: string | null
          has_attachments?: boolean | null
          id?: string
          mailbox: string
          match_confidence?: number | null
          match_method?: string | null
          matched_contract_id?: string | null
          message_id?: string | null
          processed_at?: string | null
          processing_duration_ms?: number | null
          processing_status?: string
          received_at: string
          review_action?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          subject?: string | null
          to_addresses?: Json | null
        }
        Update: {
          actions_taken?: Json | null
          attachment_names?: Json | null
          body_preview?: string | null
          cc_addresses?: Json | null
          classification?: string | null
          classification_confidence?: number | null
          created_at?: string
          error_message?: string | null
          extracted_data?: Json | null
          from_address?: string | null
          from_name?: string | null
          has_attachments?: boolean | null
          id?: string
          mailbox?: string
          match_confidence?: number | null
          match_method?: string | null
          matched_contract_id?: string | null
          message_id?: string | null
          processed_at?: string | null
          processing_duration_ms?: number | null
          processing_status?: string
          received_at?: string
          review_action?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          subject?: string | null
          to_addresses?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_log_matched_contract_id_fkey"
            columns: ["matched_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_matched_contract_id_fkey"
            columns: ["matched_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_matched_contract_id_fkey"
            columns: ["matched_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bcc_recipients: Json
          body_html: string | null
          body_preview: string | null
          body_purged_at: string | null
          body_text: string | null
          body_truncated: boolean
          buyer_id: string | null
          cc_recipients: Json
          contract_id: string | null
          conversation_id: string | null
          created_at: string
          direction: string
          document_thread_id: string | null
          drafted_by: string | null
          drafted_by_ai: boolean
          from_email: string
          from_name: string | null
          graph_id: string | null
          graph_message_id: string | null
          id: string
          in_reply_to_header: string | null
          in_reply_to_id: string | null
          internet_message_id: string | null
          mailbox: string
          metadata: Json
          received_at: string | null
          references_headers: string[] | null
          scheduled_send_at: string | null
          seller_id: string | null
          send_error: string | null
          sender_email: string | null
          sender_side: string | null
          sent_at: string | null
          sent_by: string | null
          sent_by_ai: boolean
          status: string
          subject: string | null
          to_recipients: Json
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bcc_recipients?: Json
          body_html?: string | null
          body_preview?: string | null
          body_purged_at?: string | null
          body_text?: string | null
          body_truncated?: boolean
          buyer_id?: string | null
          cc_recipients?: Json
          contract_id?: string | null
          conversation_id?: string | null
          created_at?: string
          direction: string
          document_thread_id?: string | null
          drafted_by?: string | null
          drafted_by_ai?: boolean
          from_email: string
          from_name?: string | null
          graph_id?: string | null
          graph_message_id?: string | null
          id?: string
          in_reply_to_header?: string | null
          in_reply_to_id?: string | null
          internet_message_id?: string | null
          mailbox: string
          metadata?: Json
          received_at?: string | null
          references_headers?: string[] | null
          scheduled_send_at?: string | null
          seller_id?: string | null
          send_error?: string | null
          sender_email?: string | null
          sender_side?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_by_ai?: boolean
          status: string
          subject?: string | null
          to_recipients?: Json
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bcc_recipients?: Json
          body_html?: string | null
          body_preview?: string | null
          body_purged_at?: string | null
          body_text?: string | null
          body_truncated?: boolean
          buyer_id?: string | null
          cc_recipients?: Json
          contract_id?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          document_thread_id?: string | null
          drafted_by?: string | null
          drafted_by_ai?: boolean
          from_email?: string
          from_name?: string | null
          graph_id?: string | null
          graph_message_id?: string | null
          id?: string
          in_reply_to_header?: string | null
          in_reply_to_id?: string | null
          internet_message_id?: string | null
          mailbox?: string
          metadata?: Json
          received_at?: string | null
          references_headers?: string[] | null
          scheduled_send_at?: string | null
          seller_id?: string | null
          send_error?: string | null
          sender_email?: string | null
          sender_side?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_by_ai?: boolean
          status?: string
          subject?: string | null
          to_recipients?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "email_messages_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_document_thread_id_fkey"
            columns: ["document_thread_id"]
            isOneToOne: false
            referencedRelation: "document_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          base_currency: string
          fetched_at: string | null
          id: string
          rate: number
          rate_date: string
          source: string | null
          target_currency: string
        }
        Insert: {
          base_currency?: string
          fetched_at?: string | null
          id?: string
          rate: number
          rate_date: string
          source?: string | null
          target_currency?: string
        }
        Update: {
          base_currency?: string
          fetched_at?: string | null
          id?: string
          rate?: number
          rate_date?: string
          source?: string | null
          target_currency?: string
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
      exporter_categories: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      exporter_category_memberships: {
        Row: {
          category_id: string
          company_id: string
          id: string
        }
        Insert: {
          category_id: string
          company_id: string
          id?: string
        }
        Update: {
          category_id?: string
          company_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exporter_category_memberships_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "exporter_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exporter_category_memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exporter_category_memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exporter_category_memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      exporter_template_members: {
        Row: {
          company_id: string
          id: string
          template_id: string
        }
        Insert: {
          company_id: string
          id?: string
          template_id: string
        }
        Update: {
          company_id?: string
          id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exporter_template_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exporter_template_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exporter_template_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "exporter_template_members_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "exporter_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      exporter_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          quality_category: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          quality_category?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          quality_category?: string | null
          updated_at?: string
        }
        Relationships: []
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
      feedback: {
        Row: {
          ai_category: string | null
          ai_priority: string | null
          body: string | null
          created_at: string
          id: string
          resolution: string | null
          status: string
          submitted_by: string
          title: string
          triaged_at: string | null
          triaged_by: string | null
          type: string
          updated_at: string
        }
        Insert: {
          ai_category?: string | null
          ai_priority?: string | null
          body?: string | null
          created_at?: string
          id?: string
          resolution?: string | null
          status?: string
          submitted_by: string
          title: string
          triaged_at?: string | null
          triaged_by?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          ai_category?: string | null
          ai_priority?: string | null
          body?: string | null
          created_at?: string
          id?: string
          resolution?: string | null
          status?: string
          submitted_by?: string
          title?: string
          triaged_at?: string | null
          triaged_by?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
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
          ip_address: unknown
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
          ip_address?: unknown
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
          ip_address?: unknown
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
      fixation_email_queue: {
        Row: {
          applied_fixation_group_id: string | null
          applied_gtc_order_id: string | null
          body_content: string | null
          body_content_type: string | null
          body_preview: string | null
          cc_recipients: Json
          classification_confidence: number | null
          classification_log_id: string | null
          conversation_id: string | null
          created_at: string
          email_message_id: string
          execution_type: string | null
          extracted_fields: Json | null
          forwarded_at: string | null
          forwarded_conversation_id: string | null
          forwarded_message_id: string | null
          forwarded_to_email: string | null
          from_email: string | null
          from_name: string | null
          id: string
          in_reply_to: string | null
          intent: string | null
          internet_message_id: string | null
          mailbox: string
          matched_contract_id: string | null
          matched_ref_value: string | null
          matched_via: string | null
          message_references: string[]
          received_at: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          subject: string | null
          thread_key: string
          thread_key_override: string | null
          thread_key_override_set_at: string | null
          thread_key_override_set_by: string | null
          tie_break_reason: string | null
          to_recipients: Json
          updated_at: string
        }
        Insert: {
          applied_fixation_group_id?: string | null
          applied_gtc_order_id?: string | null
          body_content?: string | null
          body_content_type?: string | null
          body_preview?: string | null
          cc_recipients?: Json
          classification_confidence?: number | null
          classification_log_id?: string | null
          conversation_id?: string | null
          created_at?: string
          email_message_id: string
          execution_type?: string | null
          extracted_fields?: Json | null
          forwarded_at?: string | null
          forwarded_conversation_id?: string | null
          forwarded_message_id?: string | null
          forwarded_to_email?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          in_reply_to?: string | null
          intent?: string | null
          internet_message_id?: string | null
          mailbox: string
          matched_contract_id?: string | null
          matched_ref_value?: string | null
          matched_via?: string | null
          message_references?: string[]
          received_at: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject?: string | null
          thread_key: string
          thread_key_override?: string | null
          thread_key_override_set_at?: string | null
          thread_key_override_set_by?: string | null
          tie_break_reason?: string | null
          to_recipients?: Json
          updated_at?: string
        }
        Update: {
          applied_fixation_group_id?: string | null
          applied_gtc_order_id?: string | null
          body_content?: string | null
          body_content_type?: string | null
          body_preview?: string | null
          cc_recipients?: Json
          classification_confidence?: number | null
          classification_log_id?: string | null
          conversation_id?: string | null
          created_at?: string
          email_message_id?: string
          execution_type?: string | null
          extracted_fields?: Json | null
          forwarded_at?: string | null
          forwarded_conversation_id?: string | null
          forwarded_message_id?: string | null
          forwarded_to_email?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          in_reply_to?: string | null
          intent?: string | null
          internet_message_id?: string | null
          mailbox?: string
          matched_contract_id?: string | null
          matched_ref_value?: string | null
          matched_via?: string | null
          message_references?: string[]
          received_at?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject?: string | null
          thread_key?: string
          thread_key_override?: string | null
          thread_key_override_set_at?: string | null
          thread_key_override_set_by?: string | null
          tie_break_reason?: string | null
          to_recipients?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixation_email_queue_applied_fixation_group_id_fkey"
            columns: ["applied_fixation_group_id"]
            isOneToOne: false
            referencedRelation: "fixation_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixation_email_queue_applied_gtc_order_id_fkey"
            columns: ["applied_gtc_order_id"]
            isOneToOne: false
            referencedRelation: "gtc_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixation_email_queue_classification_log_id_fkey"
            columns: ["classification_log_id"]
            isOneToOne: false
            referencedRelation: "ai_learning_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixation_email_queue_matched_contract_id_fkey"
            columns: ["matched_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixation_email_queue_matched_contract_id_fkey"
            columns: ["matched_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixation_email_queue_matched_contract_id_fkey"
            columns: ["matched_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
        ]
      }
      fixation_groups: {
        Row: {
          buyer_broker_id: string | null
          buyer_pf_sent_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          contract_id: string
          created_at: string
          created_by: string | null
          fixation_date: string
          id: string
          instructed_by: string | null
          instructed_by_party: string | null
          legacy_fix_id: number | null
          notes: string | null
          order_type: string
          pf_document_id: string | null
          pf_letter_generated_at: string | null
          pf_letter_sent_at: string | null
          receiver_contact_id: string | null
          requester_contact_id: string | null
          revision: number
          seller_broker_id: string | null
          seller_pf_sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          buyer_broker_id?: string | null
          buyer_pf_sent_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          contract_id: string
          created_at?: string
          created_by?: string | null
          fixation_date?: string
          id?: string
          instructed_by?: string | null
          instructed_by_party?: string | null
          legacy_fix_id?: number | null
          notes?: string | null
          order_type?: string
          pf_document_id?: string | null
          pf_letter_generated_at?: string | null
          pf_letter_sent_at?: string | null
          receiver_contact_id?: string | null
          requester_contact_id?: string | null
          revision?: number
          seller_broker_id?: string | null
          seller_pf_sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          buyer_broker_id?: string | null
          buyer_pf_sent_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          contract_id?: string
          created_at?: string
          created_by?: string | null
          fixation_date?: string
          id?: string
          instructed_by?: string | null
          instructed_by_party?: string | null
          legacy_fix_id?: number | null
          notes?: string | null
          order_type?: string
          pf_document_id?: string | null
          pf_letter_generated_at?: string | null
          pf_letter_sent_at?: string | null
          receiver_contact_id?: string | null
          requester_contact_id?: string | null
          revision?: number
          seller_broker_id?: string | null
          seller_pf_sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixation_groups_buyer_broker_id_fkey"
            columns: ["buyer_broker_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixation_groups_buyer_broker_id_fkey"
            columns: ["buyer_broker_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixation_groups_buyer_broker_id_fkey"
            columns: ["buyer_broker_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "fixation_groups_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixation_groups_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixation_groups_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixation_groups_pf_document_id_fkey"
            columns: ["pf_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixation_groups_receiver_contact_id_fkey"
            columns: ["receiver_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixation_groups_requester_contact_id_fkey"
            columns: ["requester_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixation_groups_seller_broker_id_fkey"
            columns: ["seller_broker_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixation_groups_seller_broker_id_fkey"
            columns: ["seller_broker_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixation_groups_seller_broker_id_fkey"
            columns: ["seller_broker_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      fixation_order_types: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          label: string
          parameters_schema: Json
          requires_brokers: boolean
          requires_price: boolean
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          label: string
          parameters_schema?: Json
          requires_brokers?: boolean
          requires_price?: boolean
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          label?: string
          parameters_schema?: Json
          requires_brokers?: boolean
          requires_price?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      fixation_revisions: {
        Row: {
          changed_fields: string[]
          created_at: string
          created_by: string | null
          fixation_group_id: string
          id: string
          reason: string | null
          revision: number
          snapshot: Json
        }
        Insert: {
          changed_fields?: string[]
          created_at?: string
          created_by?: string | null
          fixation_group_id: string
          id?: string
          reason?: string | null
          revision: number
          snapshot: Json
        }
        Update: {
          changed_fields?: string[]
          created_at?: string
          created_by?: string | null
          fixation_group_id?: string
          id?: string
          reason?: string | null
          revision?: number
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "fixation_revisions_fixation_group_id_fkey"
            columns: ["fixation_group_id"]
            isOneToOne: false
            referencedRelation: "fixation_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      fixation_thread_messages: {
        Row: {
          attached_at: string
          attached_via: string
          queue_message_id: string
          thread_id: string
        }
        Insert: {
          attached_at?: string
          attached_via?: string
          queue_message_id: string
          thread_id: string
        }
        Update: {
          attached_at?: string
          attached_via?: string
          queue_message_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixation_thread_messages_queue_message_id_fkey"
            columns: ["queue_message_id"]
            isOneToOne: false
            referencedRelation: "fixation_email_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixation_thread_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "fixation_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      fixation_thread_state_log: {
        Row: {
          actor: string | null
          created_at: string
          from_status: string | null
          id: string
          reason: string | null
          thread_id: string
          to_status: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          thread_id: string
          to_status: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          thread_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixation_thread_state_log_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "fixation_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      fixation_threads: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          last_intent: string | null
          last_received_at: string
          status: string
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          last_intent?: string | null
          last_received_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          last_intent?: string | null
          last_received_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixation_threads_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixation_threads_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixation_threads_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
        ]
      }
      fixations: {
        Row: {
          average_price: number | null
          buyer_confirmed_at: string | null
          confirmation_letter_path: string | null
          confirmed_by_trader: string | null
          contract_differential: number | null
          contract_id: string
          created_at: string
          created_by: string | null
          description: string | null
          differential_direction: string | null
          exchange: string | null
          final_price_clb: number | null
          final_price_per_lb: number | null
          fixation_date: string
          fixation_group_id: string | null
          fixing_time: string | null
          gtc_order_id: string | null
          ice_execution_price: number | null
          id: string
          initiated_by_company: string | null
          initiated_by_contact: string | null
          legacy_fix_id: number | null
          legacy_fix_item_id: number | null
          letter_sent_to_buyer_at: string | null
          letter_sent_to_seller_at: string | null
          lots_fixed: number
          notes: string | null
          order_type: string
          seller_confirmed_at: string | null
          source: string | null
          source_email_id: string | null
          terminal_code: string | null
          terminal_month: string | null
          updated_at: string
        }
        Insert: {
          average_price?: number | null
          buyer_confirmed_at?: string | null
          confirmation_letter_path?: string | null
          confirmed_by_trader?: string | null
          contract_differential?: number | null
          contract_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          differential_direction?: string | null
          exchange?: string | null
          final_price_clb?: number | null
          final_price_per_lb?: number | null
          fixation_date: string
          fixation_group_id?: string | null
          fixing_time?: string | null
          gtc_order_id?: string | null
          ice_execution_price?: number | null
          id?: string
          initiated_by_company?: string | null
          initiated_by_contact?: string | null
          legacy_fix_id?: number | null
          legacy_fix_item_id?: number | null
          letter_sent_to_buyer_at?: string | null
          letter_sent_to_seller_at?: string | null
          lots_fixed: number
          notes?: string | null
          order_type?: string
          seller_confirmed_at?: string | null
          source?: string | null
          source_email_id?: string | null
          terminal_code?: string | null
          terminal_month?: string | null
          updated_at?: string
        }
        Update: {
          average_price?: number | null
          buyer_confirmed_at?: string | null
          confirmation_letter_path?: string | null
          confirmed_by_trader?: string | null
          contract_differential?: number | null
          contract_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          differential_direction?: string | null
          exchange?: string | null
          final_price_clb?: number | null
          final_price_per_lb?: number | null
          fixation_date?: string
          fixation_group_id?: string | null
          fixing_time?: string | null
          gtc_order_id?: string | null
          ice_execution_price?: number | null
          id?: string
          initiated_by_company?: string | null
          initiated_by_contact?: string | null
          legacy_fix_id?: number | null
          legacy_fix_item_id?: number | null
          letter_sent_to_buyer_at?: string | null
          letter_sent_to_seller_at?: string | null
          lots_fixed?: number
          notes?: string | null
          order_type?: string
          seller_confirmed_at?: string | null
          source?: string | null
          source_email_id?: string | null
          terminal_code?: string | null
          terminal_month?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixations_fixation_group_id_fkey"
            columns: ["fixation_group_id"]
            isOneToOne: false
            referencedRelation: "fixation_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixings_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixings_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixings_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixings_initiated_by_company_fkey"
            columns: ["initiated_by_company"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixings_initiated_by_company_fkey"
            columns: ["initiated_by_company"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixings_initiated_by_company_fkey"
            columns: ["initiated_by_company"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "fixings_initiated_by_contact_fkey"
            columns: ["initiated_by_contact"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_fixing_email"
            columns: ["source_email_id"]
            isOneToOne: false
            referencedRelation: "email_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_fixing_gtc"
            columns: ["gtc_order_id"]
            isOneToOne: false
            referencedRelation: "gtc_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      gtc_orders: {
        Row: {
          cancel_reason: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_date: string | null
          contract_id: string
          created_at: string
          created_by: string | null
          exchange: string
          filled_at: string | null
          filled_date: string | null
          filled_fixing_id: string | null
          filled_price: number | null
          fixation_group_id: string | null
          id: string
          lots: number
          modification_history: Json | null
          notes: string | null
          placed_by_company: string | null
          placed_by_contact: string | null
          placed_date: string
          status: string
          target_price: number
          terminal_code: string | null
          terminal_month: string | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          cancel_reason?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_date?: string | null
          contract_id: string
          created_at?: string
          created_by?: string | null
          exchange?: string
          filled_at?: string | null
          filled_date?: string | null
          filled_fixing_id?: string | null
          filled_price?: number | null
          fixation_group_id?: string | null
          id?: string
          lots: number
          modification_history?: Json | null
          notes?: string | null
          placed_by_company?: string | null
          placed_by_contact?: string | null
          placed_date?: string
          status?: string
          target_price: number
          terminal_code?: string | null
          terminal_month?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          cancel_reason?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_date?: string | null
          contract_id?: string
          created_at?: string
          created_by?: string | null
          exchange?: string
          filled_at?: string | null
          filled_date?: string | null
          filled_fixing_id?: string | null
          filled_price?: number | null
          fixation_group_id?: string | null
          id?: string
          lots?: number
          modification_history?: Json | null
          notes?: string | null
          placed_by_company?: string | null
          placed_by_contact?: string | null
          placed_date?: string
          status?: string
          target_price?: number
          terminal_code?: string | null
          terminal_month?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gtc_orders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtc_orders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtc_orders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtc_orders_filled_fixing_id_fkey"
            columns: ["filled_fixing_id"]
            isOneToOne: false
            referencedRelation: "fixations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtc_orders_fixation_group_id_fkey"
            columns: ["fixation_group_id"]
            isOneToOne: false
            referencedRelation: "fixation_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtc_orders_placed_by_company_fkey"
            columns: ["placed_by_company"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtc_orders_placed_by_company_fkey"
            columns: ["placed_by_company"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtc_orders_placed_by_company_fkey"
            columns: ["placed_by_company"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "gtc_orders_placed_by_contact_fkey"
            columns: ["placed_by_contact"]
            isOneToOne: false
            referencedRelation: "contacts"
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
      inbox_archive_log: {
        Row: {
          archived_at: string
          archived_to_folder_id: string | null
          archived_to_folder_name: string | null
          conversation_id: string
          document_ids: string[]
          dry_run: boolean
          graph_message_id: string
          id: string
          mailbox: string
          reason: Json
        }
        Insert: {
          archived_at?: string
          archived_to_folder_id?: string | null
          archived_to_folder_name?: string | null
          conversation_id: string
          document_ids?: string[]
          dry_run?: boolean
          graph_message_id: string
          id?: string
          mailbox: string
          reason?: Json
        }
        Update: {
          archived_at?: string
          archived_to_folder_id?: string | null
          archived_to_folder_name?: string | null
          conversation_id?: string
          document_ids?: string[]
          dry_run?: boolean
          graph_message_id?: string
          id?: string
          mailbox?: string
          reason?: Json
        }
        Relationships: []
      }
      inbox_watermark: {
        Row: {
          last_processed_message_id: string | null
          last_processed_received_at: string | null
          last_processed_sent_at: string | null
          last_run_error: string | null
          last_run_finished_at: string | null
          last_run_started_at: string | null
          last_run_status: string | null
          mailbox: string
          messages_processed_total: number
          updated_at: string
        }
        Insert: {
          last_processed_message_id?: string | null
          last_processed_received_at?: string | null
          last_processed_sent_at?: string | null
          last_run_error?: string | null
          last_run_finished_at?: string | null
          last_run_started_at?: string | null
          last_run_status?: string | null
          mailbox: string
          messages_processed_total?: number
          updated_at?: string
        }
        Update: {
          last_processed_message_id?: string | null
          last_processed_received_at?: string | null
          last_processed_sent_at?: string | null
          last_run_error?: string | null
          last_run_finished_at?: string | null
          last_run_started_at?: string | null
          last_run_status?: string | null
          mailbox?: string
          messages_processed_total?: number
          updated_at?: string
        }
        Relationships: []
      }
      inquiries: {
        Row: {
          bags_per_box: number | null
          booked_contract_id: string | null
          boxes_per_month_max: number | null
          boxes_per_month_min: number | null
          buyer_id: string
          certificates: Json | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          destination: string | null
          end_buyer_id: string | null
          exporter_template_id: string | null
          fixation_limitation_days: number | null
          fixation_notes: string | null
          fixation_type: string
          fumigation_required: boolean
          generated_summary_text: string | null
          id: string
          last_offered_at: string | null
          lost_reason: string | null
          notes: string | null
          offered_status: string | null
          packaging: string | null
          priority: string | null
          qualities: Json | null
          quality_description: string | null
          quality_id: string | null
          selected_exporter_categories: Json | null
          shipment_half_end: string | null
          shipment_half_start: string | null
          shipment_period_end: string | null
          shipment_period_start: string | null
          status: string
          trader_id: string
          updated_at: string
          volume_bags_total: number | null
          volume_by_month: Json | null
          volume_description: string | null
          wa_qc_approved: boolean
        }
        Insert: {
          bags_per_box?: number | null
          booked_contract_id?: string | null
          boxes_per_month_max?: number | null
          boxes_per_month_min?: number | null
          buyer_id: string
          certificates?: Json | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          destination?: string | null
          end_buyer_id?: string | null
          exporter_template_id?: string | null
          fixation_limitation_days?: number | null
          fixation_notes?: string | null
          fixation_type: string
          fumigation_required?: boolean
          generated_summary_text?: string | null
          id?: string
          last_offered_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          offered_status?: string | null
          packaging?: string | null
          priority?: string | null
          qualities?: Json | null
          quality_description?: string | null
          quality_id?: string | null
          selected_exporter_categories?: Json | null
          shipment_half_end?: string | null
          shipment_half_start?: string | null
          shipment_period_end?: string | null
          shipment_period_start?: string | null
          status?: string
          trader_id: string
          updated_at?: string
          volume_bags_total?: number | null
          volume_by_month?: Json | null
          volume_description?: string | null
          wa_qc_approved?: boolean
        }
        Update: {
          bags_per_box?: number | null
          booked_contract_id?: string | null
          boxes_per_month_max?: number | null
          boxes_per_month_min?: number | null
          buyer_id?: string
          certificates?: Json | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          destination?: string | null
          end_buyer_id?: string | null
          exporter_template_id?: string | null
          fixation_limitation_days?: number | null
          fixation_notes?: string | null
          fixation_type?: string
          fumigation_required?: boolean
          generated_summary_text?: string | null
          id?: string
          last_offered_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          offered_status?: string | null
          packaging?: string | null
          priority?: string | null
          qualities?: Json | null
          quality_description?: string | null
          quality_id?: string | null
          selected_exporter_categories?: Json | null
          shipment_half_end?: string | null
          shipment_half_start?: string | null
          shipment_period_end?: string | null
          shipment_period_start?: string | null
          status?: string
          trader_id?: string
          updated_at?: string
          volume_bags_total?: number | null
          volume_by_month?: Json | null
          volume_description?: string | null
          wa_qc_approved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fk_inquiry_booked_contract"
            columns: ["booked_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_inquiry_booked_contract"
            columns: ["booked_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_inquiry_booked_contract"
            columns: ["booked_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "inquiries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_end_buyer_id_fkey"
            columns: ["end_buyer_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_end_buyer_id_fkey"
            columns: ["end_buyer_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_end_buyer_id_fkey"
            columns: ["end_buyer_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "inquiries_exporter_template_id_fkey"
            columns: ["exporter_template_id"]
            isOneToOne: false
            referencedRelation: "exporter_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "quality_master"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_contracts: {
        Row: {
          contract_id: string
          id: string
          inquiry_id: string
          shipment_month: string | null
        }
        Insert: {
          contract_id: string
          id?: string
          inquiry_id: string
          shipment_month?: string | null
        }
        Update: {
          contract_id?: string
          id?: string
          inquiry_id?: string
          shipment_month?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_contracts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_contracts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_contracts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_contracts_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_exporter_contacts: {
        Row: {
          company_id: string
          contacted_at: string
          contacted_by: string
          id: string
          inquiry_id: string
        }
        Insert: {
          company_id: string
          contacted_at?: string
          contacted_by: string
          id?: string
          inquiry_id: string
        }
        Update: {
          company_id?: string
          contacted_at?: string
          contacted_by?: string
          id?: string
          inquiry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_exporter_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_exporter_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_exporter_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "inquiry_exporter_contacts_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          due_date: string | null
          exchange_rate_at_issue: number | null
          file_path: string | null
          id: string
          invoice_number: string | null
          issued_date: string | null
          line_items: Json
          nfs_number: string | null
          nfs_required: boolean | null
          notes: string | null
          period_end: string | null
          period_start: string | null
          quickbooks_invoice_id: string | null
          quickbooks_invoice_url: string | null
          sent_at: string | null
          status: string
          subtotal: number
          tax_withholdings: Json | null
          total_amount: number
          type: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          exchange_rate_at_issue?: number | null
          file_path?: string | null
          id?: string
          invoice_number?: string | null
          issued_date?: string | null
          line_items?: Json
          nfs_number?: string | null
          nfs_required?: boolean | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          quickbooks_invoice_id?: string | null
          quickbooks_invoice_url?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax_withholdings?: Json | null
          total_amount?: number
          type: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          exchange_rate_at_issue?: number | null
          file_path?: string | null
          id?: string
          invoice_number?: string | null
          issued_date?: string | null
          line_items?: Json
          nfs_number?: string | null
          nfs_required?: boolean | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          quickbooks_invoice_id?: string | null
          quickbooks_invoice_url?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax_withholdings?: Json | null
          total_amount?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_pricing_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_pricing_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_shelves_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_shelves_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
          address: string | null
          billing_basis: string | null
          city: string | null
          code: string
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string | null
          entrance_x_position: number | null
          entrance_y_position: number | null
          fee_currency: string | null
          fee_per_sample: number | null
          id: string
          is_3rd_party: boolean | null
          is_active: boolean | null
          location: string | null
          micro_origin_config: Json | null
          name: string
          neighborhood: string | null
          state: string | null
          storage_capacity: number | null
          storage_layout: Json | null
          supported_origins: string[] | null
          tax_id: string | null
          tax_region: string | null
          timezone: string | null
          type: string | null
          type_sample_prefix: string | null
          type_sample_sequence_start: number | null
          updated_at: string | null
          vat_number: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          billing_basis?: string | null
          city?: string | null
          code: string
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          entrance_x_position?: number | null
          entrance_y_position?: number | null
          fee_currency?: string | null
          fee_per_sample?: number | null
          id?: string
          is_3rd_party?: boolean | null
          is_active?: boolean | null
          location?: string | null
          micro_origin_config?: Json | null
          name: string
          neighborhood?: string | null
          state?: string | null
          storage_capacity?: number | null
          storage_layout?: Json | null
          supported_origins?: string[] | null
          tax_id?: string | null
          tax_region?: string | null
          timezone?: string | null
          type?: string | null
          type_sample_prefix?: string | null
          type_sample_sequence_start?: number | null
          updated_at?: string | null
          vat_number?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          billing_basis?: string | null
          city?: string | null
          code?: string
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          entrance_x_position?: number | null
          entrance_y_position?: number | null
          fee_currency?: string | null
          fee_per_sample?: number | null
          id?: string
          is_3rd_party?: boolean | null
          is_active?: boolean | null
          location?: string | null
          micro_origin_config?: Json | null
          name?: string
          neighborhood?: string | null
          state?: string | null
          storage_capacity?: number | null
          storage_layout?: Json | null
          supported_origins?: string[] | null
          tax_id?: string | null
          tax_region?: string | null
          timezone?: string | null
          type?: string | null
          type_sample_prefix?: string | null
          type_sample_sequence_start?: number | null
          updated_at?: string | null
          vat_number?: string | null
          zip_code?: string | null
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
      leave_coverage: {
        Row: {
          buyer_id: string
          covered_by_user_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          leave_id: string
          valid_from: string
          valid_until: string
        }
        Insert: {
          buyer_id: string
          covered_by_user_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          leave_id: string
          valid_from: string
          valid_until: string
        }
        Update: {
          buyer_id?: string
          covered_by_user_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          leave_id?: string
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_coverage_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_coverage_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_coverage_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "leave_coverage_leave_id_fkey"
            columns: ["leave_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          department: string
          end_date: string
          id: string
          notes: string | null
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          department: string
          end_date: string
          id?: string
          notes?: string | null
          start_date: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          department?: string
          end_date?: string
          id?: string
          notes?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
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
          ip_address: unknown
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
          ip_address?: unknown
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
          ip_address?: unknown
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
      micro_regions: {
        Row: {
          altitude_max: number | null
          altitude_min: number | null
          created_at: string | null
          description_en: string | null
          description_es: string | null
          description_pt: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          origin: string
          parent_region: string | null
          region_name_en: string
          region_name_es: string | null
          region_name_pt: string | null
          updated_at: string | null
        }
        Insert: {
          altitude_max?: number | null
          altitude_min?: number | null
          created_at?: string | null
          description_en?: string | null
          description_es?: string | null
          description_pt?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          origin: string
          parent_region?: string | null
          region_name_en: string
          region_name_es?: string | null
          region_name_pt?: string | null
          updated_at?: string | null
        }
        Update: {
          altitude_max?: number | null
          altitude_min?: number | null
          created_at?: string | null
          description_en?: string | null
          description_es?: string | null
          description_pt?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          origin?: string
          parent_region?: string | null
          region_name_en?: string
          region_name_es?: string | null
          region_name_pt?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
          client_id: string | null
          created_at: string | null
          id: string
          laboratory_id: string | null
          link: string | null
          message: string
          metadata: Json | null
          read: boolean | null
          title: string
          type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          laboratory_id?: string | null
          link?: string | null
          message: string
          metadata?: Json | null
          read?: boolean | null
          title: string
          type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          laboratory_id?: string | null
          link?: string | null
          message?: string
          metadata?: Json | null
          read?: boolean | null
          title?: string
          type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_notifications_client"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_notifications_client"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_notifications_client"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "fk_notifications_laboratory"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "fk_notifications_laboratory"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "fk_notifications_laboratory"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_claims: {
        Row: {
          created_at: string
          id: string
          inquiry_id: string
          seller_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inquiry_id: string
          seller_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inquiry_id?: string
          seller_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_claims_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_claims_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_claims_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_claims_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      offers: {
        Row: {
          add_to_price_report: boolean | null
          availability_by_month: Json | null
          commission_rate: number | null
          commission_unit: string | null
          conditions: string | null
          created_at: string
          created_by: string | null
          differential_c_per_lb: number | null
          differential_unit: string
          differential_value: number | null
          differentials_by_quality: Json | null
          differentials_by_terminal: Json
          fixation_days_override: number | null
          fixation_type_override: string | null
          full_quantity: boolean
          id: string
          inquiry_id: string
          last_contact_date: string | null
          notes: string | null
          pricing_mode: string
          seller_contact_id: string | null
          seller_id: string
          shipment_window: string | null
          sort_order: number | null
          status: string | null
          updated_at: string
          volume_available: number | null
        }
        Insert: {
          add_to_price_report?: boolean | null
          availability_by_month?: Json | null
          commission_rate?: number | null
          commission_unit?: string | null
          conditions?: string | null
          created_at?: string
          created_by?: string | null
          differential_c_per_lb?: number | null
          differential_unit?: string
          differential_value?: number | null
          differentials_by_quality?: Json | null
          differentials_by_terminal?: Json
          fixation_days_override?: number | null
          fixation_type_override?: string | null
          full_quantity?: boolean
          id?: string
          inquiry_id: string
          last_contact_date?: string | null
          notes?: string | null
          pricing_mode?: string
          seller_contact_id?: string | null
          seller_id: string
          shipment_window?: string | null
          sort_order?: number | null
          status?: string | null
          updated_at?: string
          volume_available?: number | null
        }
        Update: {
          add_to_price_report?: boolean | null
          availability_by_month?: Json | null
          commission_rate?: number | null
          commission_unit?: string | null
          conditions?: string | null
          created_at?: string
          created_by?: string | null
          differential_c_per_lb?: number | null
          differential_unit?: string
          differential_value?: number | null
          differentials_by_quality?: Json | null
          differentials_by_terminal?: Json
          fixation_days_override?: number | null
          fixation_type_override?: string | null
          full_quantity?: boolean
          id?: string
          inquiry_id?: string
          last_contact_date?: string | null
          notes?: string | null
          pricing_mode?: string
          seller_contact_id?: string | null
          seller_id?: string
          shipment_window?: string | null
          sort_order?: number | null
          status?: string | null
          updated_at?: string
          volume_available?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_seller_contact_id_fkey"
            columns: ["seller_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      packaging_bag_sizes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          sort_order: number
          value: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          value: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          value?: string
        }
        Relationships: []
      }
      packaging_liners: {
        Row: {
          compatible_sizes: string[] | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          sort_order: number
          value: string
        }
        Insert: {
          compatible_sizes?: string[] | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          value: string
        }
        Update: {
          compatible_sizes?: string[] | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          value?: string
        }
        Relationships: []
      }
      payment_terms: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_global_default: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_global_default?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_global_default?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          bank_reference: string | null
          created_at: string
          created_by: string | null
          currency: string
          exchange_rate_at_payment: number | null
          id: string
          invoice_id: string
          net_received: number | null
          notes: string | null
          payment_date: string
          payment_method: string | null
          quickbooks_payment_id: string | null
          tax_withheld: Json | null
          updated_at: string
        }
        Insert: {
          amount: number
          bank_reference?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange_rate_at_payment?: number | null
          id?: string
          invoice_id: string
          net_received?: number | null
          notes?: string | null
          payment_date: string
          payment_method?: string | null
          quickbooks_payment_id?: string | null
          tax_withheld?: Json | null
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_reference?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange_rate_at_payment?: number | null
          id?: string
          invoice_id?: string
          net_received?: number | null
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          quickbooks_payment_id?: string | null
          tax_withheld?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
      ports: {
        Row: {
          country: string | null
          created_at: string
          id: string
          is_active: boolean
          legacy_id: number | null
          name: string
          port_code: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          legacy_id?: number | null
          name: string
          port_code?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          legacy_id?: number | null
          name?: string
          port_code?: string | null
        }
        Relationships: []
      }
      price_reports: {
        Row: {
          content: Json | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          published_at: string | null
          published_by: string | null
          report_date: string | null
          status: string
          title: string | null
          updated_at: string
          version: number | null
        }
        Insert: {
          content?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          report_date?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          version?: number | null
        }
        Update: {
          content?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          report_date?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          version?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          client_id: string | null
          created_at: string | null
          email: string
          first_name: string | null
          full_name: string
          id: string
          is_cupper: boolean | null
          is_global_admin: boolean | null
          is_master_cupper: boolean | null
          is_q_grader: boolean | null
          laboratory_id: string | null
          last_login_at: string | null
          last_name: string | null
          qc_enabled: boolean | null
          qc_permissions: Json | null
          qc_role: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          email: string
          first_name?: string | null
          full_name: string
          id: string
          is_cupper?: boolean | null
          is_global_admin?: boolean | null
          is_master_cupper?: boolean | null
          is_q_grader?: boolean | null
          laboratory_id?: string | null
          last_login_at?: string | null
          last_name?: string | null
          qc_enabled?: boolean | null
          qc_permissions?: Json | null
          qc_role?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          full_name?: string
          id?: string
          is_cupper?: boolean | null
          is_global_admin?: boolean | null
          is_master_cupper?: boolean | null
          is_q_grader?: boolean | null
          laboratory_id?: string | null
          last_login_at?: string | null
          last_name?: string | null
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
      project_categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      project_members: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          project_id: string
          role: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          project_id: string
          role?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          project_id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_members_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          category_id: string | null
          column_template: string
          columns: Json
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          name: string
          slug: string
          status: string
          updated_at: string
          visibility: string
        }
        Insert: {
          category_id?: string | null
          column_template?: string
          columns?: Json
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          slug: string
          status?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          category_id?: string | null
          column_template?: string
          columns?: Json
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          slug?: string
          status?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "project_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      pss_requests: {
        Row: {
          contract_id: string
          id: string
          notes: string | null
          request_method: string | null
          requested_at: string
          requested_by: string | null
          sample_id: string
        }
        Insert: {
          contract_id: string
          id?: string
          notes?: string | null
          request_method?: string | null
          requested_at?: string
          requested_by?: string | null
          sample_id: string
        }
        Update: {
          contract_id?: string
          id?: string
          notes?: string | null
          request_method?: string | null
          requested_at?: string
          requested_by?: string | null
          sample_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pss_requests_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pss_requests_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pss_requests_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pss_requests_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "shipment_samples"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh_key: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh_key: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh_key?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
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
      qc_client_settings: {
        Row: {
          bag_weight_kg: number | null
          billing_basis: Database["public"]["Enums"]["billing_basis"] | null
          billing_notes: string | null
          certificate_config: Json | null
          certificate_delivery_timing: string | null
          certificate_pattern: Json | null
          company_id: string
          created_at: string
          currency: string | null
          default_quality_specs: string[] | null
          defect_photos: string[] | null
          fee_payer: Database["public"]["Enums"]["fee_payer"] | null
          has_origin_pricing: boolean | null
          moisture_standard:
            | Database["public"]["Enums"]["moisture_standard"]
            | null
          notification_emails: string[] | null
          payment_terms: string | null
          price_per_pound_cents: number | null
          price_per_sample: number | null
          pricing_model: Database["public"]["Enums"]["pricing_model"] | null
          report_branding_preference: string | null
          sample_size_grams: number | null
          storage_layout: Json | null
          tax_region: string | null
          tracking_number_format: Json | null
          updated_at: string
        }
        Insert: {
          bag_weight_kg?: number | null
          billing_basis?: Database["public"]["Enums"]["billing_basis"] | null
          billing_notes?: string | null
          certificate_config?: Json | null
          certificate_delivery_timing?: string | null
          certificate_pattern?: Json | null
          company_id: string
          created_at?: string
          currency?: string | null
          default_quality_specs?: string[] | null
          defect_photos?: string[] | null
          fee_payer?: Database["public"]["Enums"]["fee_payer"] | null
          has_origin_pricing?: boolean | null
          moisture_standard?:
            | Database["public"]["Enums"]["moisture_standard"]
            | null
          notification_emails?: string[] | null
          payment_terms?: string | null
          price_per_pound_cents?: number | null
          price_per_sample?: number | null
          pricing_model?: Database["public"]["Enums"]["pricing_model"] | null
          report_branding_preference?: string | null
          sample_size_grams?: number | null
          storage_layout?: Json | null
          tax_region?: string | null
          tracking_number_format?: Json | null
          updated_at?: string
        }
        Update: {
          bag_weight_kg?: number | null
          billing_basis?: Database["public"]["Enums"]["billing_basis"] | null
          billing_notes?: string | null
          certificate_config?: Json | null
          certificate_delivery_timing?: string | null
          certificate_pattern?: Json | null
          company_id?: string
          created_at?: string
          currency?: string | null
          default_quality_specs?: string[] | null
          defect_photos?: string[] | null
          fee_payer?: Database["public"]["Enums"]["fee_payer"] | null
          has_origin_pricing?: boolean | null
          moisture_standard?:
            | Database["public"]["Enums"]["moisture_standard"]
            | null
          notification_emails?: string[] | null
          payment_terms?: string | null
          price_per_pound_cents?: number | null
          price_per_sample?: number | null
          pricing_model?: Database["public"]["Enums"]["pricing_model"] | null
          report_branding_preference?: string | null
          sample_size_grams?: number | null
          storage_layout?: Json | null
          tax_region?: string | null
          tracking_number_format?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qc_client_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_client_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_client_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      quality_assessments: {
        Row: {
          assessor_id: string | null
          clean_cup: boolean | null
          clean_cup_auto: boolean | null
          compliance_status:
            | Database["public"]["Enums"]["compliance_status"]
            | null
          created_at: string | null
          cupping_comments: string | null
          cupping_complete: boolean | null
          defect_photos: string[] | null
          grading_comments: string | null
          grading_complete: boolean | null
          green_bean_data: Json | null
          id: string
          moisture_standard:
            | Database["public"]["Enums"]["moisture_standard"]
            | null
          resolved_defects: Json | null
          roast_data: Json | null
          sample_id: string | null
          sample_size_grams: number | null
          uniform_cup: boolean | null
          uniform_cup_auto: boolean | null
          updated_at: string | null
        }
        Insert: {
          assessor_id?: string | null
          clean_cup?: boolean | null
          clean_cup_auto?: boolean | null
          compliance_status?:
            | Database["public"]["Enums"]["compliance_status"]
            | null
          created_at?: string | null
          cupping_comments?: string | null
          cupping_complete?: boolean | null
          defect_photos?: string[] | null
          grading_comments?: string | null
          grading_complete?: boolean | null
          green_bean_data?: Json | null
          id?: string
          moisture_standard?:
            | Database["public"]["Enums"]["moisture_standard"]
            | null
          resolved_defects?: Json | null
          roast_data?: Json | null
          sample_id?: string | null
          sample_size_grams?: number | null
          uniform_cup?: boolean | null
          uniform_cup_auto?: boolean | null
          updated_at?: string | null
        }
        Update: {
          assessor_id?: string | null
          clean_cup?: boolean | null
          clean_cup_auto?: boolean | null
          compliance_status?:
            | Database["public"]["Enums"]["compliance_status"]
            | null
          created_at?: string | null
          cupping_comments?: string | null
          cupping_complete?: boolean | null
          defect_photos?: string[] | null
          grading_comments?: string | null
          grading_complete?: boolean | null
          green_bean_data?: Json | null
          id?: string
          moisture_standard?:
            | Database["public"]["Enums"]["moisture_standard"]
            | null
          resolved_defects?: Json | null
          roast_data?: Json | null
          sample_id?: string | null
          sample_size_grams?: number | null
          uniform_cup?: boolean | null
          uniform_cup_auto?: boolean | null
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
      quality_master: {
        Row: {
          abbreviation: string | null
          buyer_id: string | null
          category: string | null
          certification: string | null
          certifications_default: Json | null
          created_at: string
          default_exporter_template_id: string | null
          description: string | null
          display_name: string | null
          end_client_id: string | null
          id: string
          inquiry_text: string | null
          is_active: boolean
          legacy_id: number | null
          main_spec: string | null
          name: string
          price_report_enabled: boolean
          pss_lead_weeks: number | null
          quality_description: string | null
          short_name: string | null
          updated_at: string
          waqc_quality_profile_id: string | null
        }
        Insert: {
          abbreviation?: string | null
          buyer_id?: string | null
          category?: string | null
          certification?: string | null
          certifications_default?: Json | null
          created_at?: string
          default_exporter_template_id?: string | null
          description?: string | null
          display_name?: string | null
          end_client_id?: string | null
          id?: string
          inquiry_text?: string | null
          is_active?: boolean
          legacy_id?: number | null
          main_spec?: string | null
          name: string
          price_report_enabled?: boolean
          pss_lead_weeks?: number | null
          quality_description?: string | null
          short_name?: string | null
          updated_at?: string
          waqc_quality_profile_id?: string | null
        }
        Update: {
          abbreviation?: string | null
          buyer_id?: string | null
          category?: string | null
          certification?: string | null
          certifications_default?: Json | null
          created_at?: string
          default_exporter_template_id?: string | null
          description?: string | null
          display_name?: string | null
          end_client_id?: string | null
          id?: string
          inquiry_text?: string | null
          is_active?: boolean
          legacy_id?: number | null
          main_spec?: string | null
          name?: string
          price_report_enabled?: boolean
          pss_lead_weeks?: number | null
          quality_description?: string | null
          short_name?: string | null
          updated_at?: string
          waqc_quality_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_quality_exporter_template"
            columns: ["default_exporter_template_id"]
            isOneToOne: false
            referencedRelation: "exporter_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_master_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_master_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_master_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "quality_master_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_master_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_master_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
          assigned_laboratories: string[] | null
          created_at: string | null
          created_by: string | null
          cupping_discrepancy_threshold: number | null
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
          micro_region_requirements: Json | null
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
          assigned_laboratories?: string[] | null
          created_at?: string | null
          created_by?: string | null
          cupping_discrepancy_threshold?: number | null
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
          micro_region_requirements?: Json | null
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
          assigned_laboratories?: string[] | null
          created_at?: string | null
          created_by?: string | null
          cupping_discrepancy_threshold?: number | null
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
          micro_region_requirements?: Json | null
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
      report_recipients: {
        Row: {
          bcc_emails: string[]
          cc_emails: string[]
          client_id: string
          created_at: string | null
          id: string
          last_sent_at: string | null
          last_sent_by: string | null
          report_type: string
          to_emails: string[]
          updated_at: string | null
        }
        Insert: {
          bcc_emails?: string[]
          cc_emails?: string[]
          client_id: string
          created_at?: string | null
          id?: string
          last_sent_at?: string | null
          last_sent_by?: string | null
          report_type: string
          to_emails?: string[]
          updated_at?: string | null
        }
        Update: {
          bcc_emails?: string[]
          cc_emails?: string[]
          client_id?: string
          created_at?: string | null
          id?: string
          last_sent_at?: string | null
          last_sent_by?: string | null
          report_type?: string
          to_emails?: string[]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_recipients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_recipients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_recipients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "report_recipients_last_sent_by_fkey"
            columns: ["last_sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      routing_rules: {
        Row: {
          auto_send_on_complete: boolean | null
          client_id: string
          created_at: string
          created_by: string | null
          document_type: string | null
          email_template_id: string | null
          id: string
          notes: string | null
          recipients: Json
          routing_action: string
          updated_at: string
          verify_before_send: boolean | null
        }
        Insert: {
          auto_send_on_complete?: boolean | null
          client_id: string
          created_at?: string
          created_by?: string | null
          document_type?: string | null
          email_template_id?: string | null
          id?: string
          notes?: string | null
          recipients?: Json
          routing_action?: string
          updated_at?: string
          verify_before_send?: boolean | null
        }
        Update: {
          auto_send_on_complete?: boolean | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          document_type?: string | null
          email_template_id?: string | null
          id?: string
          notes?: string | null
          recipients?: Json
          routing_action?: string
          updated_at?: string
          verify_before_send?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "routing_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routing_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routing_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      sample_contracts: {
        Row: {
          bag_count: number | null
          bag_type: string | null
          bag_weight_kg: number | null
          bags_quantity_mt: number | null
          buyer_contract_nr: string | null
          client_id: string | null
          container_nr: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          end_client_contract_nr: string | null
          end_client_id: string | null
          equivalent_60kg_bags: number | null
          exporter_sample_number: string | null
          ico_number: string | null
          id: string
          importer_id: string | null
          importer_is_qc_client: boolean | null
          qc_client_contract_nr: string | null
          roaster_contract_nr: string | null
          roaster_id: string | null
          sample_id: string
          seller_contract_nr: string | null
          shipment_month: string | null
          shipper_contract_nr: string | null
          sort_order: number
          supplier_contract_nr: string | null
          tracking_number: string
          updated_at: string
          wolthers_contract_nr: string | null
        }
        Insert: {
          bag_count?: number | null
          bag_type?: string | null
          bag_weight_kg?: number | null
          bags_quantity_mt?: number | null
          buyer_contract_nr?: string | null
          client_id?: string | null
          container_nr?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          end_client_contract_nr?: string | null
          end_client_id?: string | null
          equivalent_60kg_bags?: number | null
          exporter_sample_number?: string | null
          ico_number?: string | null
          id?: string
          importer_id?: string | null
          importer_is_qc_client?: boolean | null
          qc_client_contract_nr?: string | null
          roaster_contract_nr?: string | null
          roaster_id?: string | null
          sample_id: string
          seller_contract_nr?: string | null
          shipment_month?: string | null
          shipper_contract_nr?: string | null
          sort_order?: number
          supplier_contract_nr?: string | null
          tracking_number: string
          updated_at?: string
          wolthers_contract_nr?: string | null
        }
        Update: {
          bag_count?: number | null
          bag_type?: string | null
          bag_weight_kg?: number | null
          bags_quantity_mt?: number | null
          buyer_contract_nr?: string | null
          client_id?: string | null
          container_nr?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          end_client_contract_nr?: string | null
          end_client_id?: string | null
          equivalent_60kg_bags?: number | null
          exporter_sample_number?: string | null
          ico_number?: string | null
          id?: string
          importer_id?: string | null
          importer_is_qc_client?: boolean | null
          qc_client_contract_nr?: string | null
          roaster_contract_nr?: string | null
          roaster_id?: string | null
          sample_id?: string
          seller_contract_nr?: string | null
          shipment_month?: string | null
          shipper_contract_nr?: string | null
          sort_order?: number
          supplier_contract_nr?: string | null
          tracking_number?: string
          updated_at?: string
          wolthers_contract_nr?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sample_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "sample_contracts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_contracts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_contracts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_contracts_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_contracts_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_contracts_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "sample_contracts_importer_id_fkey"
            columns: ["importer_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_contracts_importer_id_fkey"
            columns: ["importer_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_contracts_importer_id_fkey"
            columns: ["importer_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "sample_contracts_roaster_id_fkey"
            columns: ["roaster_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_contracts_roaster_id_fkey"
            columns: ["roaster_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_contracts_roaster_id_fkey"
            columns: ["roaster_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "sample_contracts_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_digest_log: {
        Row: {
          buyer_id: string | null
          buyer_name: string | null
          created_at: string
          error: string | null
          id: string
          included_row_ids: string[]
          recipient_emails: string[]
          run_at: string
          sample_count: number
          skipped_reason: string | null
          status: string
          subject: string | null
        }
        Insert: {
          buyer_id?: string | null
          buyer_name?: string | null
          created_at?: string
          error?: string | null
          id?: string
          included_row_ids?: string[]
          recipient_emails?: string[]
          run_at?: string
          sample_count?: number
          skipped_reason?: string | null
          status: string
          subject?: string | null
        }
        Update: {
          buyer_id?: string | null
          buyer_name?: string | null
          created_at?: string
          error?: string | null
          id?: string
          included_row_ids?: string[]
          recipient_emails?: string[]
          run_at?: string
          sample_count?: number
          skipped_reason?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sample_digest_log_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_digest_log_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_digest_log_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      sample_email_queue: {
        Row: {
          applied_sample_id: string | null
          applied_via_autonomous: boolean
          body_content: string | null
          body_content_type: string | null
          body_preview: string | null
          cc_recipients: Json
          classification_confidence: number | null
          classification_log_id: string | null
          conversation_id: string | null
          created_at: string
          digest_sent_at: string | null
          email_message_id: string
          extracted_fields: Json | null
          from_email: string | null
          from_name: string | null
          id: string
          intent: string | null
          internet_message_id: string | null
          matched_contract_id: string | null
          matched_ref_value: string | null
          matched_via: string | null
          received_at: string
          relay_message_id: string | null
          relay_sent_at: string | null
          relay_sent_to: string[] | null
          relay_skipped_reason: string | null
          relay_subject: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          source_mailbox: string
          status: string
          subject: string | null
          to_recipients: Json
          updated_at: string
        }
        Insert: {
          applied_sample_id?: string | null
          applied_via_autonomous?: boolean
          body_content?: string | null
          body_content_type?: string | null
          body_preview?: string | null
          cc_recipients?: Json
          classification_confidence?: number | null
          classification_log_id?: string | null
          conversation_id?: string | null
          created_at?: string
          digest_sent_at?: string | null
          email_message_id: string
          extracted_fields?: Json | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          intent?: string | null
          internet_message_id?: string | null
          matched_contract_id?: string | null
          matched_ref_value?: string | null
          matched_via?: string | null
          received_at: string
          relay_message_id?: string | null
          relay_sent_at?: string | null
          relay_sent_to?: string[] | null
          relay_skipped_reason?: string | null
          relay_subject?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_mailbox: string
          status?: string
          subject?: string | null
          to_recipients?: Json
          updated_at?: string
        }
        Update: {
          applied_sample_id?: string | null
          applied_via_autonomous?: boolean
          body_content?: string | null
          body_content_type?: string | null
          body_preview?: string | null
          cc_recipients?: Json
          classification_confidence?: number | null
          classification_log_id?: string | null
          conversation_id?: string | null
          created_at?: string
          digest_sent_at?: string | null
          email_message_id?: string
          extracted_fields?: Json | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          intent?: string | null
          internet_message_id?: string | null
          matched_contract_id?: string | null
          matched_ref_value?: string | null
          matched_via?: string | null
          received_at?: string
          relay_message_id?: string | null
          relay_sent_at?: string | null
          relay_sent_to?: string[] | null
          relay_skipped_reason?: string | null
          relay_subject?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_mailbox?: string
          status?: string
          subject?: string | null
          to_recipients?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sample_email_queue_classification_log_id_fkey"
            columns: ["classification_log_id"]
            isOneToOne: false
            referencedRelation: "ai_learning_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_email_queue_matched_contract_id_fkey"
            columns: ["matched_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_email_queue_matched_contract_id_fkey"
            columns: ["matched_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_email_queue_matched_contract_id_fkey"
            columns: ["matched_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_recipients: {
        Row: {
          client_id: string
          comments: string | null
          contact_emails: string[]
          created_at: string
          id: string
          responded_at: string | null
          responded_by: string | null
          sample_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["sample_recipient_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          comments?: string | null
          contact_emails?: string[]
          created_at?: string
          id?: string
          responded_at?: string | null
          responded_by?: string | null
          sample_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["sample_recipient_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          comments?: string | null
          contact_emails?: string[]
          created_at?: string
          id?: string
          responded_at?: string | null
          responded_by?: string | null
          sample_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["sample_recipient_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sample_recipients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_recipients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_recipients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "sample_recipients_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_recipients_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
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
          awb_number: string | null
          bag_count: number | null
          bag_type: Database["public"]["Enums"]["bag_type_enum"] | null
          bag_weight_kg: number | null
          bags: number | null
          bags_quantity_mt: number | null
          buyer_contract_nr: string | null
          calculated_client_fee: number | null
          calculated_lab_fee: number | null
          cards_printed_at: string | null
          certificate_generated_at: string | null
          certifications: string[] | null
          client_id: string | null
          container: string | null
          container_nr: string | null
          contract_id: string | null
          contract_number: string | null
          courier_name: string | null
          created_at: string | null
          crop_year: string | null
          deleted_at: string | null
          deleted_by: string | null
          destination: string | null
          end_client_contract_nr: string | null
          end_client_id: string | null
          equivalent_60kg_bags: number | null
          exporter_contract_nr: string | null
          exporter_id: string | null
          exporter_legacy: string | null
          exporter_sample_number: string | null
          hide_exporter_on_label: boolean | null
          ico_marks: string | null
          ico_number: string | null
          id: string
          importer_id: string | null
          importer_is_qc_client: boolean | null
          importer_legacy: string | null
          is_quick_look: boolean
          laboratory_id: string | null
          locked: boolean | null
          micro_origin: string | null
          origin: string
          processing_method: string | null
          qc_client_contract_nr: string | null
          quality_name: string | null
          quality_spec_id: string | null
          roaster_contract_nr: string | null
          roaster_id: string | null
          roaster_legacy: string | null
          same_seller_shipper: boolean | null
          sample_category: Database["public"]["Enums"]["sample_category"]
          sample_type: Database["public"]["Enums"]["sample_type_enum"] | null
          scanned_at: string | null
          seller_contract_nr: string | null
          seller_id: string | null
          shipment_month: string | null
          shipper_contract_nr: string | null
          status: Database["public"]["Enums"]["sample_status"] | null
          storage_position: string | null
          supplier: string | null
          supplier_contract_nr: string | null
          supplier_type: string | null
          tracking_number: string
          updated_at: string | null
          wolthers_contract_nr: string | null
          workflow_stage: string | null
        }
        Insert: {
          assigned_to?: string | null
          awb_number?: string | null
          bag_count?: number | null
          bag_type?: Database["public"]["Enums"]["bag_type_enum"] | null
          bag_weight_kg?: number | null
          bags?: number | null
          bags_quantity_mt?: number | null
          buyer_contract_nr?: string | null
          calculated_client_fee?: number | null
          calculated_lab_fee?: number | null
          cards_printed_at?: string | null
          certificate_generated_at?: string | null
          certifications?: string[] | null
          client_id?: string | null
          container?: string | null
          container_nr?: string | null
          contract_id?: string | null
          contract_number?: string | null
          courier_name?: string | null
          created_at?: string | null
          crop_year?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          destination?: string | null
          end_client_contract_nr?: string | null
          end_client_id?: string | null
          equivalent_60kg_bags?: number | null
          exporter_contract_nr?: string | null
          exporter_id?: string | null
          exporter_legacy?: string | null
          exporter_sample_number?: string | null
          hide_exporter_on_label?: boolean | null
          ico_marks?: string | null
          ico_number?: string | null
          id?: string
          importer_id?: string | null
          importer_is_qc_client?: boolean | null
          importer_legacy?: string | null
          is_quick_look?: boolean
          laboratory_id?: string | null
          locked?: boolean | null
          micro_origin?: string | null
          origin: string
          processing_method?: string | null
          qc_client_contract_nr?: string | null
          quality_name?: string | null
          quality_spec_id?: string | null
          roaster_contract_nr?: string | null
          roaster_id?: string | null
          roaster_legacy?: string | null
          same_seller_shipper?: boolean | null
          sample_category?: Database["public"]["Enums"]["sample_category"]
          sample_type?: Database["public"]["Enums"]["sample_type_enum"] | null
          scanned_at?: string | null
          seller_contract_nr?: string | null
          seller_id?: string | null
          shipment_month?: string | null
          shipper_contract_nr?: string | null
          status?: Database["public"]["Enums"]["sample_status"] | null
          storage_position?: string | null
          supplier?: string | null
          supplier_contract_nr?: string | null
          supplier_type?: string | null
          tracking_number: string
          updated_at?: string | null
          wolthers_contract_nr?: string | null
          workflow_stage?: string | null
        }
        Update: {
          assigned_to?: string | null
          awb_number?: string | null
          bag_count?: number | null
          bag_type?: Database["public"]["Enums"]["bag_type_enum"] | null
          bag_weight_kg?: number | null
          bags?: number | null
          bags_quantity_mt?: number | null
          buyer_contract_nr?: string | null
          calculated_client_fee?: number | null
          calculated_lab_fee?: number | null
          cards_printed_at?: string | null
          certificate_generated_at?: string | null
          certifications?: string[] | null
          client_id?: string | null
          container?: string | null
          container_nr?: string | null
          contract_id?: string | null
          contract_number?: string | null
          courier_name?: string | null
          created_at?: string | null
          crop_year?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          destination?: string | null
          end_client_contract_nr?: string | null
          end_client_id?: string | null
          equivalent_60kg_bags?: number | null
          exporter_contract_nr?: string | null
          exporter_id?: string | null
          exporter_legacy?: string | null
          exporter_sample_number?: string | null
          hide_exporter_on_label?: boolean | null
          ico_marks?: string | null
          ico_number?: string | null
          id?: string
          importer_id?: string | null
          importer_is_qc_client?: boolean | null
          importer_legacy?: string | null
          is_quick_look?: boolean
          laboratory_id?: string | null
          locked?: boolean | null
          micro_origin?: string | null
          origin?: string
          processing_method?: string | null
          qc_client_contract_nr?: string | null
          quality_name?: string | null
          quality_spec_id?: string | null
          roaster_contract_nr?: string | null
          roaster_id?: string | null
          roaster_legacy?: string | null
          same_seller_shipper?: boolean | null
          sample_category?: Database["public"]["Enums"]["sample_category"]
          sample_type?: Database["public"]["Enums"]["sample_type_enum"] | null
          scanned_at?: string | null
          seller_contract_nr?: string | null
          seller_id?: string | null
          shipment_month?: string | null
          shipper_contract_nr?: string | null
          status?: Database["public"]["Enums"]["sample_status"] | null
          storage_position?: string | null
          supplier?: string | null
          supplier_contract_nr?: string | null
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "samples_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "samples_exporter_id_fkey"
            columns: ["exporter_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_exporter_id_fkey"
            columns: ["exporter_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_exporter_id_fkey"
            columns: ["exporter_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "samples_importer_id_fkey"
            columns: ["importer_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_importer_id_fkey"
            columns: ["importer_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_importer_id_fkey"
            columns: ["importer_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
          {
            foreignKeyName: "samples_roaster_id_fkey"
            columns: ["roaster_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_roaster_id_fkey"
            columns: ["roaster_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_roaster_id_fkey"
            columns: ["roaster_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "samples_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      saved_views: {
        Row: {
          columns: string[] | null
          created_at: string | null
          filters: Json
          group_by: string | null
          id: string
          is_default: boolean | null
          name: string
          scope: string
          sort: Json | null
          user_id: string
        }
        Insert: {
          columns?: string[] | null
          created_at?: string | null
          filters: Json
          group_by?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          scope?: string
          sort?: Json | null
          user_id: string
        }
        Update: {
          columns?: string[] | null
          created_at?: string | null
          filters?: Json
          group_by?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          scope?: string
          sort?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      seller_condition_learning: {
        Row: {
          auto_exclude: boolean
          buyer_id: string | null
          condition_template_id: string
          created_at: string
          id: string
          last_removed_at: string | null
          removal_count: number
          seller_id: string
          updated_at: string
        }
        Insert: {
          auto_exclude?: boolean
          buyer_id?: string | null
          condition_template_id: string
          created_at?: string
          id?: string
          last_removed_at?: string | null
          removal_count?: number
          seller_id: string
          updated_at?: string
        }
        Update: {
          auto_exclude?: boolean
          buyer_id?: string | null
          condition_template_id?: string
          created_at?: string
          id?: string
          last_removed_at?: string | null
          removal_count?: number
          seller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_condition_learning_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_condition_learning_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_condition_learning_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "seller_condition_learning_condition_template_id_fkey"
            columns: ["condition_template_id"]
            isOneToOne: false
            referencedRelation: "condition_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_condition_learning_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_condition_learning_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_condition_learning_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      shipment_containers: {
        Row: {
          bags: number | null
          container_id: string
          created_at: string
          gross_weight_kg: number | null
          id: string
          net_weight_kg: number | null
          shipment_id: string
        }
        Insert: {
          bags?: number | null
          container_id: string
          created_at?: string
          gross_weight_kg?: number | null
          id?: string
          net_weight_kg?: number | null
          shipment_id: string
        }
        Update: {
          bags?: number | null
          container_id?: string
          created_at?: string
          gross_weight_kg?: number | null
          id?: string
          net_weight_kg?: number | null
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_containers_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_containers_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_revisions: {
        Row: {
          ai_confidence: number | null
          applied_at: string
          applied_by: string | null
          changes: Json
          document_id: string | null
          id: string
          notes: string | null
          reverted_revision_id: string | null
          revision_number: number
          shipment_id: string
          source: string
        }
        Insert: {
          ai_confidence?: number | null
          applied_at?: string
          applied_by?: string | null
          changes: Json
          document_id?: string | null
          id?: string
          notes?: string | null
          reverted_revision_id?: string | null
          revision_number: number
          shipment_id: string
          source: string
        }
        Update: {
          ai_confidence?: number | null
          applied_at?: string
          applied_by?: string | null
          changes?: Json
          document_id?: string | null
          id?: string
          notes?: string | null
          reverted_revision_id?: string | null
          revision_number?: number
          shipment_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_revisions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_revisions_reverted_revision_id_fkey"
            columns: ["reverted_revision_id"]
            isOneToOne: false
            referencedRelation: "shipment_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_revisions_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_sample_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_status: string
          old_status: string | null
          reason: string | null
          sample_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status: string
          old_status?: string | null
          reason?: string | null
          sample_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status?: string
          old_status?: string | null
          reason?: string | null
          sample_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_sample_status_history_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "shipment_samples"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_samples: {
        Row: {
          approved_by: string | null
          approved_date: string | null
          bags: number | null
          buyer_reference: string | null
          certificate_url: string | null
          composition: string | null
          contract_id: string
          courier_company: string | null
          courier_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          destination: string | null
          id: string
          legacy_pss_id: number | null
          notes: string | null
          received_date: string | null
          rejection_reason: string | null
          sample_code: string | null
          sample_number: number | null
          sample_type: string
          sent_date: string | null
          shipment_id: string | null
          split_id: string | null
          status: string
          tracking_number: string | null
          updated_at: string
          waqc_ref: string | null
        }
        Insert: {
          approved_by?: string | null
          approved_date?: string | null
          bags?: number | null
          buyer_reference?: string | null
          certificate_url?: string | null
          composition?: string | null
          contract_id: string
          courier_company?: string | null
          courier_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          destination?: string | null
          id?: string
          legacy_pss_id?: number | null
          notes?: string | null
          received_date?: string | null
          rejection_reason?: string | null
          sample_code?: string | null
          sample_number?: number | null
          sample_type?: string
          sent_date?: string | null
          shipment_id?: string | null
          split_id?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
          waqc_ref?: string | null
        }
        Update: {
          approved_by?: string | null
          approved_date?: string | null
          bags?: number | null
          buyer_reference?: string | null
          certificate_url?: string | null
          composition?: string | null
          contract_id?: string
          courier_company?: string | null
          courier_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          destination?: string | null
          id?: string
          legacy_pss_id?: number | null
          notes?: string | null
          received_date?: string | null
          rejection_reason?: string | null
          sample_code?: string | null
          sample_number?: number | null
          sample_type?: string
          sent_date?: string | null
          shipment_id?: string | null
          split_id?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
          waqc_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_samples_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_samples_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_samples_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_samples_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_samples_split_id_fkey"
            columns: ["split_id"]
            isOneToOne: false
            referencedRelation: "contract_splits"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_status_log: {
        Row: {
          contract_notes: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          is_approved: boolean | null
          legacy_id: number | null
          logged_at: string
          shipment_id: string
          status_text: string | null
        }
        Insert: {
          contract_notes?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_approved?: boolean | null
          legacy_id?: number | null
          logged_at?: string
          shipment_id: string
          status_text?: string | null
        }
        Update: {
          contract_notes?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_approved?: boolean | null
          legacy_id?: number | null
          logged_at?: string
          shipment_id?: string
          status_text?: string | null
        }
        Relationships: []
      }
      shipment_updates: {
        Row: {
          client_id: string
          content: Json | null
          created_at: string
          created_by: string | null
          file_path: string | null
          html_content: string | null
          id: string
          notes: string | null
          period_end: string | null
          period_start: string | null
          report_type: string
          sent_at: string | null
          sent_to: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          content?: Json | null
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          html_content?: string | null
          id?: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          report_type: string
          sent_at?: string | null
          sent_to?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          content?: Json | null
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          html_content?: string | null
          id?: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          report_type?: string
          sent_at?: string | null
          sent_to?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_updates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_updates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_updates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
        ]
      }
      shipments: {
        Row: {
          bl_date: string | null
          bl_number: string | null
          booking_date: string | null
          booking_number: string | null
          booking_status: string
          buyer_commission_received_at: string | null
          buyer_commission_value: number | null
          carrier_id: string | null
          confirmation_carrier_name: string | null
          confirmation_source: string | null
          container_numbers: Json | null
          contract_id: string
          created_at: string
          created_by: string | null
          destination_port: string | null
          eta: string | null
          eta_actual: string | null
          etd: string | null
          etd_actual: string | null
          ico_number: string | null
          id: string
          isf_date: string | null
          isf_status: string | null
          legacy_id: number | null
          load_status: string
          origin_port: string | null
          pss_approved_at: string | null
          pss_requested_at: string | null
          pss_status: string
          pss_waqc_sample_id: string | null
          seller_commission_received_at: string | null
          seller_commission_value: number | null
          shipping_advice_sent_at: string | null
          shipping_instructions_by: string | null
          si_received_at: string | null
          si_status: string
          split_id: string | null
          ss_approved_at: string | null
          ss_required: boolean
          ss_status: string
          updated_at: string
          vessel_name: string | null
          volume_bags: number | null
          voyage_number: string | null
        }
        Insert: {
          bl_date?: string | null
          bl_number?: string | null
          booking_date?: string | null
          booking_number?: string | null
          booking_status?: string
          buyer_commission_received_at?: string | null
          buyer_commission_value?: number | null
          carrier_id?: string | null
          confirmation_carrier_name?: string | null
          confirmation_source?: string | null
          container_numbers?: Json | null
          contract_id: string
          created_at?: string
          created_by?: string | null
          destination_port?: string | null
          eta?: string | null
          eta_actual?: string | null
          etd?: string | null
          etd_actual?: string | null
          ico_number?: string | null
          id?: string
          isf_date?: string | null
          isf_status?: string | null
          legacy_id?: number | null
          load_status?: string
          origin_port?: string | null
          pss_approved_at?: string | null
          pss_requested_at?: string | null
          pss_status?: string
          pss_waqc_sample_id?: string | null
          seller_commission_received_at?: string | null
          seller_commission_value?: number | null
          shipping_advice_sent_at?: string | null
          shipping_instructions_by?: string | null
          si_received_at?: string | null
          si_status?: string
          split_id?: string | null
          ss_approved_at?: string | null
          ss_required?: boolean
          ss_status?: string
          updated_at?: string
          vessel_name?: string | null
          volume_bags?: number | null
          voyage_number?: string | null
        }
        Update: {
          bl_date?: string | null
          bl_number?: string | null
          booking_date?: string | null
          booking_number?: string | null
          booking_status?: string
          buyer_commission_received_at?: string | null
          buyer_commission_value?: number | null
          carrier_id?: string | null
          confirmation_carrier_name?: string | null
          confirmation_source?: string | null
          container_numbers?: Json | null
          contract_id?: string
          created_at?: string
          created_by?: string | null
          destination_port?: string | null
          eta?: string | null
          eta_actual?: string | null
          etd?: string | null
          etd_actual?: string | null
          ico_number?: string | null
          id?: string
          isf_date?: string | null
          isf_status?: string | null
          legacy_id?: number | null
          load_status?: string
          origin_port?: string | null
          pss_approved_at?: string | null
          pss_requested_at?: string | null
          pss_status?: string
          pss_waqc_sample_id?: string | null
          seller_commission_received_at?: string | null
          seller_commission_value?: number | null
          shipping_advice_sent_at?: string | null
          shipping_instructions_by?: string | null
          si_received_at?: string | null
          si_status?: string
          split_id?: string | null
          ss_approved_at?: string | null
          ss_required?: boolean
          ss_status?: string
          updated_at?: string
          vessel_name?: string | null
          volume_bags?: number | null
          voyage_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "shipments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_split_id_fkey"
            columns: ["split_id"]
            isOneToOne: false
            referencedRelation: "contract_splits"
            referencedColumns: ["id"]
          },
        ]
      }
      si_requests: {
        Row: {
          buyer_contact_name: string | null
          contract_id: string
          id: string
          notes: string | null
          request_method: string | null
          requested_at: string
          requested_by: string | null
          shipment_id: string
        }
        Insert: {
          buyer_contact_name?: string | null
          contract_id: string
          id?: string
          notes?: string | null
          request_method?: string | null
          requested_at?: string
          requested_by?: string | null
          shipment_id: string
        }
        Update: {
          buyer_contact_name?: string | null
          contract_id?: string
          id?: string
          notes?: string | null
          request_method?: string | null
          requested_at?: string
          requested_by?: string | null
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "si_requests_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "si_requests_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "si_requests_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_logos: {
        Row: {
          created_at: string
          created_by: string | null
          file_path: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_path: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_path?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_positions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_positions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
      sync_heartbeat: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          rows_read: number | null
          rows_skipped: number | null
          rows_upserted: number | null
          run_finished_at: string | null
          run_started_at: string
          source: string
          status: string
          table_name: string
          watermark_value: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          rows_read?: number | null
          rows_skipped?: number | null
          rows_upserted?: number | null
          run_finished_at?: string | null
          run_started_at: string
          source: string
          status: string
          table_name: string
          watermark_value?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          rows_read?: number | null
          rows_skipped?: number | null
          rows_upserted?: number | null
          run_finished_at?: string | null
          run_started_at?: string
          source?: string
          status?: string
          table_name?: string
          watermark_value?: string | null
        }
        Relationships: []
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taint_fault_definitions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taint_fault_definitions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
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
      task_activity: {
        Row: {
          content: string | null
          created_at: string
          id: string
          metadata: Json | null
          task_id: string
          type: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          task_id: string
          type: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          task_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string
          file_size: number | null
          id: string
          mime_type: string | null
          name: string
          task_id: string
          type: string
          uploaded_by: string
          url: string
        }
        Insert: {
          created_at?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          name: string
          task_id: string
          type: string
          uploaded_by: string
          url: string
        }
        Update: {
          created_at?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          name?: string
          task_id?: string
          type?: string
          uploaded_by?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          column_key: string
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          priority: string
          project_id: string
          reminder_sent: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          column_key: string
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          project_id: string
          reminder_sent?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          column_key?: string
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          project_id?: string
          reminder_sent?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      terminal_calendar: {
        Row: {
          delivery_month: string
          exchange: string
          first_notice_day: string
          id: string
          is_confirmed: boolean
          last_trading_day: string
          terminal_code: string
          updated_at: string
          updated_by: string | null
          year: number
        }
        Insert: {
          delivery_month: string
          exchange?: string
          first_notice_day: string
          id?: string
          is_confirmed?: boolean
          last_trading_day: string
          terminal_code: string
          updated_at?: string
          updated_by?: string | null
          year: number
        }
        Update: {
          delivery_month?: string
          exchange?: string
          first_notice_day?: string
          id?: string
          is_confirmed?: boolean
          last_trading_day?: string
          terminal_code?: string
          updated_at?: string
          updated_by?: string | null
          year?: number
        }
        Relationships: []
      }
      terminal_month_mapping: {
        Row: {
          id: string
          shipment_month: number
          terminal_code: string
          terminal_name: string
          year_offset: number
        }
        Insert: {
          id?: string
          shipment_month: number
          terminal_code: string
          terminal_name: string
          year_offset?: number
        }
        Update: {
          id?: string
          shipment_month?: number
          terminal_code?: string
          terminal_name?: string
          year_offset?: number
        }
        Relationships: []
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
      trade_documents: {
        Row: {
          contract_id: string
          created_at: string
          created_by: string | null
          document_type: string
          file_name: string | null
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          received_at: string
          received_from: string | null
          sent_to_client_at: string | null
          sent_to_contacts: Json | null
          shipment_id: string | null
          source_email_id: string | null
          verified: boolean | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by?: string | null
          document_type: string
          file_name?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          received_at?: string
          received_from?: string | null
          sent_to_client_at?: string | null
          sent_to_contacts?: Json | null
          shipment_id?: string | null
          source_email_id?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by?: string | null
          document_type?: string
          file_name?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          received_at?: string
          received_from?: string | null
          sent_to_client_at?: string | null
          sent_to_contacts?: Json | null
          shipment_id?: string | null
          source_email_id?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_trade_doc_email"
            columns: ["source_email_id"]
            isOneToOne: false
            referencedRelation: "email_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
        ]
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
          requested_dates: unknown
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
          requested_dates?: unknown
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
          requested_dates?: unknown
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
      user_client_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          buyer_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          buyer_id: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          buyer_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_client_assignments_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_client_assignments_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_client_assignments_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "user_client_assignments_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invitations: {
        Row: {
          accepted_at: string | null
          company_id: string | null
          created_at: string | null
          email: string
          expires_at: string | null
          first_name: string
          id: string
          invitation_token: string | null
          invited_by: string | null
          invited_name: string | null
          invited_whatsapp: string | null
          is_cupper: boolean | null
          is_q_grader: boolean | null
          laboratory_id: string | null
          last_name: string
          qc_enabled: boolean | null
          qc_role: string
          role: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          company_id?: string | null
          created_at?: string | null
          email: string
          expires_at?: string | null
          first_name: string
          id?: string
          invitation_token?: string | null
          invited_by?: string | null
          invited_name?: string | null
          invited_whatsapp?: string | null
          is_cupper?: boolean | null
          is_q_grader?: boolean | null
          laboratory_id?: string | null
          last_name: string
          qc_enabled?: boolean | null
          qc_role: string
          role?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string | null
          first_name?: string
          id?: string
          invitation_token?: string | null
          invited_by?: string | null
          invited_name?: string | null
          invited_whatsapp?: string | null
          is_cupper?: boolean | null
          is_q_grader?: boolean | null
          laboratory_id?: string | null
          last_name?: string
          qc_enabled?: boolean | null
          qc_role?: string
          role?: string | null
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invitations_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "user_invitations_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "user_invitations_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
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
      user_module_seen: {
        Row: {
          last_seen_at: string
          module: string
          updated_at: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          module: string
          updated_at?: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
          module?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          color: string | null
          created_at: string
          department_ids: string[]
          email: string | null
          email_signature_compact_html: string | null
          email_signature_html: string | null
          full_name: string
          group_mailboxes: string[] | null
          id: string
          invited_by: string | null
          is_active: boolean
          landing_path: string | null
          last_sign_in_at: string | null
          linked_company_id: string | null
          notification_prefs: Json | null
          onboarding_completed_at: string | null
          permissions: string[]
          phone: string | null
          short_name: string | null
          signature_logo_id: string | null
          status: string
          teams_email: string | null
          title_id: string | null
          updated_at: string
          user_type: string
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          color?: string | null
          created_at?: string
          department_ids?: string[]
          email?: string | null
          email_signature_compact_html?: string | null
          email_signature_html?: string | null
          full_name: string
          group_mailboxes?: string[] | null
          id: string
          invited_by?: string | null
          is_active?: boolean
          landing_path?: string | null
          last_sign_in_at?: string | null
          linked_company_id?: string | null
          notification_prefs?: Json | null
          onboarding_completed_at?: string | null
          permissions?: string[]
          phone?: string | null
          short_name?: string | null
          signature_logo_id?: string | null
          status?: string
          teams_email?: string | null
          title_id?: string | null
          updated_at?: string
          user_type?: string
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          color?: string | null
          created_at?: string
          department_ids?: string[]
          email?: string | null
          email_signature_compact_html?: string | null
          email_signature_html?: string | null
          full_name?: string
          group_mailboxes?: string[] | null
          id?: string
          invited_by?: string | null
          is_active?: boolean
          landing_path?: string | null
          last_sign_in_at?: string | null
          linked_company_id?: string | null
          notification_prefs?: Json | null
          onboarding_completed_at?: string | null
          permissions?: string[]
          phone?: string | null
          short_name?: string | null
          signature_logo_id?: string | null
          status?: string
          teams_email?: string | null
          title_id?: string | null
          updated_at?: string
          user_type?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_linked_company_id_fkey"
            columns: ["linked_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_linked_company_id_fkey"
            columns: ["linked_company_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_linked_company_id_fkey"
            columns: ["linked_company_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "user_profiles_signature_logo_id_fkey"
            columns: ["signature_logo_id"]
            isOneToOne: false
            referencedRelation: "signature_logos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "user_titles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_titles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
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
      condition_template_usage_timeline: {
        Row: {
          condition_template_id: string | null
          day: string | null
          kept_count: number | null
          removed_count: number | null
          total_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "condition_usage_log_condition_template_id_fkey"
            columns: ["condition_template_id"]
            isOneToOne: false
            referencedRelation: "condition_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_strings_v: {
        Row: {
          contract_ids: string[] | null
          contract_numbers: string[] | null
          diff_avg_weighted: number | null
          diff_max: number | null
          diff_min: number | null
          fixation_summary: string | null
          has_repasse: boolean | null
          inquiry_id: string | null
          leg_count: number | null
          seller_id: string | null
          ship_end: string | null
          ship_start: string | null
          spans_multiple_months: boolean | null
          string_id: string | null
          total_bags: number | null
        }
        Relationships: []
      }
      contracts_display: {
        Row: {
          approved_at: string | null
          approved_by_document_id: string | null
          arbitration: string | null
          average_fixed_price: number | null
          bag_type: string | null
          bag_weight_kg: number | null
          bags_per_box: number | null
          buyer_contact_id: string | null
          buyer_id: string | null
          buyer_reference: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cert_options: Json | null
          certifications: Json | null
          channel: string | null
          commission_buyer_rate: number | null
          commission_buyer_unit: string | null
          commission_invoicing_entity: string | null
          commission_invoicing_entity_buyer: string | null
          commission_invoicing_entity_seller: string | null
          commission_rate: number | null
          commission_seller_rate: number | null
          commission_seller_unit: string | null
          commission_source: string | null
          commission_splits: Json | null
          commission_unit: string | null
          container_group_id: string | null
          container_leg: string | null
          container_size: string | null
          contract_date: string | null
          contract_number: string | null
          contract_number_display: string | null
          contract_type: string | null
          created_at: string | null
          created_by: string | null
          crop: string | null
          destination: string | null
          differential_value: number | null
          disclose_buyer_to_parent_seller: boolean | null
          end_buyer_id: string | null
          end_client_id: string | null
          eudr_compliant: string | null
          exchange: string | null
          exchange_month_default: string | null
          external_visible: boolean | null
          fixation_deadline: string | null
          fixation_limitation_days: number | null
          fixation_notes: string | null
          fixation_status: string | null
          fixation_type: string | null
          fixation_window_open_date: string | null
          id: string | null
          inquiry_id: string | null
          internal_notes: Json | null
          is_approved: boolean | null
          is_finalized: boolean | null
          legacy_id: number | null
          legacy_user_id: number | null
          notes: string | null
          outright_price: number | null
          outright_price_unit: string | null
          packaging: string | null
          parent_contract_group_id: string | null
          parent_contract_id: string | null
          payment_terms: string | null
          premiums: Json | null
          price_description: string | null
          price_type: string | null
          qc_provider: string | null
          quality_description: string | null
          quality_description_unaccent: string | null
          quality_id: string | null
          report_destination_text: string | null
          report_quantity_text: string | null
          report_type: string | null
          revision: number | null
          sample_notes: string | null
          seller_contact_id: string | null
          seller_id: string | null
          seller_reference: string | null
          shipment_description: string | null
          shipment_period_end: string | null
          shipment_period_start: string | null
          shipper_id: string | null
          sold_by_ids: string[] | null
          status: string | null
          string_id: string | null
          total_lots: number | null
          trader_id: string | null
          updated_at: string | null
          volume_bags: number | null
          volume_description: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by_document_id?: string | null
          arbitration?: string | null
          average_fixed_price?: number | null
          bag_type?: string | null
          bag_weight_kg?: number | null
          bags_per_box?: number | null
          buyer_contact_id?: string | null
          buyer_id?: string | null
          buyer_reference?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cert_options?: Json | null
          certifications?: Json | null
          channel?: string | null
          commission_buyer_rate?: number | null
          commission_buyer_unit?: string | null
          commission_invoicing_entity?: string | null
          commission_invoicing_entity_buyer?: string | null
          commission_invoicing_entity_seller?: string | null
          commission_rate?: number | null
          commission_seller_rate?: number | null
          commission_seller_unit?: string | null
          commission_source?: string | null
          commission_splits?: Json | null
          commission_unit?: string | null
          container_group_id?: string | null
          container_leg?: string | null
          container_size?: string | null
          contract_date?: string | null
          contract_number?: string | null
          contract_number_display?: never
          contract_type?: string | null
          created_at?: string | null
          created_by?: string | null
          crop?: string | null
          destination?: string | null
          differential_value?: number | null
          disclose_buyer_to_parent_seller?: boolean | null
          end_buyer_id?: string | null
          end_client_id?: string | null
          eudr_compliant?: string | null
          exchange?: string | null
          exchange_month_default?: string | null
          external_visible?: boolean | null
          fixation_deadline?: string | null
          fixation_limitation_days?: number | null
          fixation_notes?: string | null
          fixation_status?: string | null
          fixation_type?: string | null
          fixation_window_open_date?: string | null
          id?: string | null
          inquiry_id?: string | null
          internal_notes?: Json | null
          is_approved?: boolean | null
          is_finalized?: boolean | null
          legacy_id?: number | null
          legacy_user_id?: number | null
          notes?: string | null
          outright_price?: number | null
          outright_price_unit?: string | null
          packaging?: string | null
          parent_contract_group_id?: string | null
          parent_contract_id?: string | null
          payment_terms?: string | null
          premiums?: Json | null
          price_description?: string | null
          price_type?: string | null
          qc_provider?: string | null
          quality_description?: string | null
          quality_description_unaccent?: string | null
          quality_id?: string | null
          report_destination_text?: string | null
          report_quantity_text?: string | null
          report_type?: string | null
          revision?: number | null
          sample_notes?: string | null
          seller_contact_id?: string | null
          seller_id?: string | null
          seller_reference?: string | null
          shipment_description?: string | null
          shipment_period_end?: string | null
          shipment_period_start?: string | null
          shipper_id?: string | null
          sold_by_ids?: string[] | null
          status?: string | null
          string_id?: string | null
          total_lots?: number | null
          trader_id?: string | null
          updated_at?: string | null
          volume_bags?: number | null
          volume_description?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by_document_id?: string | null
          arbitration?: string | null
          average_fixed_price?: number | null
          bag_type?: string | null
          bag_weight_kg?: number | null
          bags_per_box?: number | null
          buyer_contact_id?: string | null
          buyer_id?: string | null
          buyer_reference?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cert_options?: Json | null
          certifications?: Json | null
          channel?: string | null
          commission_buyer_rate?: number | null
          commission_buyer_unit?: string | null
          commission_invoicing_entity?: string | null
          commission_invoicing_entity_buyer?: string | null
          commission_invoicing_entity_seller?: string | null
          commission_rate?: number | null
          commission_seller_rate?: number | null
          commission_seller_unit?: string | null
          commission_source?: string | null
          commission_splits?: Json | null
          commission_unit?: string | null
          container_group_id?: string | null
          container_leg?: string | null
          container_size?: string | null
          contract_date?: string | null
          contract_number?: string | null
          contract_number_display?: never
          contract_type?: string | null
          created_at?: string | null
          created_by?: string | null
          crop?: string | null
          destination?: string | null
          differential_value?: number | null
          disclose_buyer_to_parent_seller?: boolean | null
          end_buyer_id?: string | null
          end_client_id?: string | null
          eudr_compliant?: string | null
          exchange?: string | null
          exchange_month_default?: string | null
          external_visible?: boolean | null
          fixation_deadline?: string | null
          fixation_limitation_days?: number | null
          fixation_notes?: string | null
          fixation_status?: string | null
          fixation_type?: string | null
          fixation_window_open_date?: string | null
          id?: string | null
          inquiry_id?: string | null
          internal_notes?: Json | null
          is_approved?: boolean | null
          is_finalized?: boolean | null
          legacy_id?: number | null
          legacy_user_id?: number | null
          notes?: string | null
          outright_price?: number | null
          outright_price_unit?: string | null
          packaging?: string | null
          parent_contract_group_id?: string | null
          parent_contract_id?: string | null
          payment_terms?: string | null
          premiums?: Json | null
          price_description?: string | null
          price_type?: string | null
          qc_provider?: string | null
          quality_description?: string | null
          quality_description_unaccent?: string | null
          quality_id?: string | null
          report_destination_text?: string | null
          report_quantity_text?: string | null
          report_type?: string | null
          revision?: number | null
          sample_notes?: string | null
          seller_contact_id?: string | null
          seller_id?: string | null
          seller_reference?: string | null
          shipment_description?: string | null
          shipment_period_end?: string | null
          shipment_period_start?: string | null
          shipper_id?: string | null
          sold_by_ids?: string[] | null
          status?: string | null
          string_id?: string | null
          total_lots?: number | null
          trader_id?: string | null
          updated_at?: string | null
          volume_bags?: number | null
          volume_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_approved_by_document_id_fkey"
            columns: ["approved_by_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_buyer_contact_id_fkey"
            columns: ["buyer_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contracts_end_buyer_id_fkey"
            columns: ["end_buyer_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_end_buyer_id_fkey"
            columns: ["end_buyer_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_end_buyer_id_fkey"
            columns: ["end_buyer_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contracts_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contracts_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "quality_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_seller_contact_id_fkey"
            columns: ["seller_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contracts_shipper_id_fkey"
            columns: ["shipper_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_shipper_id_fkey"
            columns: ["shipper_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_shipper_id_fkey"
            columns: ["shipper_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "fk_contract_group"
            columns: ["parent_contract_group_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contract_group"
            columns: ["parent_contract_group_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contract_group"
            columns: ["parent_contract_group_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contract_parent"
            columns: ["parent_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contract_parent"
            columns: ["parent_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contract_parent"
            columns: ["parent_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts_with_latest_sample_status: {
        Row: {
          approved_at: string | null
          approved_by_document_id: string | null
          arbitration: string | null
          average_fixed_price: number | null
          bag_type: string | null
          bag_weight_kg: number | null
          bags_per_box: number | null
          buyer_contact_id: string | null
          buyer_id: string | null
          buyer_reference: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cert_options: Json | null
          certifications: Json | null
          channel: string | null
          commission_buyer_rate: number | null
          commission_buyer_unit: string | null
          commission_invoicing_entity: string | null
          commission_invoicing_entity_buyer: string | null
          commission_invoicing_entity_seller: string | null
          commission_rate: number | null
          commission_seller_rate: number | null
          commission_seller_unit: string | null
          commission_source: string | null
          commission_splits: Json | null
          commission_unit: string | null
          container_group_id: string | null
          container_leg: string | null
          container_size: string | null
          contract_date: string | null
          contract_number: string | null
          contract_number_display: string | null
          contract_type: string | null
          created_at: string | null
          created_by: string | null
          crop: string | null
          destination: string | null
          differential_value: number | null
          disclose_buyer_to_parent_seller: boolean | null
          end_buyer_id: string | null
          end_client_id: string | null
          eudr_compliant: string | null
          exchange: string | null
          exchange_month_default: string | null
          external_visible: boolean | null
          fixation_deadline: string | null
          fixation_limitation_days: number | null
          fixation_notes: string | null
          fixation_status: string | null
          fixation_type: string | null
          fixation_window_open_date: string | null
          id: string | null
          inquiry_id: string | null
          internal_notes: Json | null
          is_approved: boolean | null
          is_finalized: boolean | null
          latest_sample_approved_date: string | null
          latest_sample_rejection_reason: string | null
          latest_sample_status: string | null
          latest_sample_type: string | null
          legacy_id: number | null
          legacy_user_id: number | null
          notes: string | null
          outright_price: number | null
          outright_price_unit: string | null
          packaging: string | null
          parent_contract_group_id: string | null
          parent_contract_id: string | null
          payment_terms: string | null
          premiums: Json | null
          price_description: string | null
          price_type: string | null
          qc_provider: string | null
          quality_description: string | null
          quality_description_unaccent: string | null
          quality_id: string | null
          report_destination_text: string | null
          report_quantity_text: string | null
          report_type: string | null
          revision: number | null
          sample_notes: string | null
          seller_contact_id: string | null
          seller_id: string | null
          seller_reference: string | null
          shipment_description: string | null
          shipment_period_end: string | null
          shipment_period_start: string | null
          shipper_id: string | null
          sold_by_ids: string[] | null
          status: string | null
          string_id: string | null
          total_lots: number | null
          trader_id: string | null
          updated_at: string | null
          volume_bags: number | null
          volume_description: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_approved_by_document_id_fkey"
            columns: ["approved_by_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_buyer_contact_id_fkey"
            columns: ["buyer_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contracts_end_buyer_id_fkey"
            columns: ["end_buyer_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_end_buyer_id_fkey"
            columns: ["end_buyer_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_end_buyer_id_fkey"
            columns: ["end_buyer_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contracts_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_end_client_id_fkey"
            columns: ["end_client_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contracts_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "quality_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_seller_contact_id_fkey"
            columns: ["seller_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contracts_shipper_id_fkey"
            columns: ["shipper_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_shipper_id_fkey"
            columns: ["shipper_id"]
            isOneToOne: false
            referencedRelation: "companies_with_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_shipper_id_fkey"
            columns: ["shipper_id"]
            isOneToOne: false
            referencedRelation: "company_file_summaries"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "fk_contract_group"
            columns: ["parent_contract_group_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contract_group"
            columns: ["parent_contract_group_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contract_group"
            columns: ["parent_contract_group_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contract_parent"
            columns: ["parent_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contract_parent"
            columns: ["parent_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_display"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contract_parent"
            columns: ["parent_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_with_latest_sample_status"
            referencedColumns: ["id"]
          },
        ]
      }
      cupper_performance_stats: {
        Row: {
          avg_total_score: number | null
          cupper_id: string | null
          cupper_name: string | null
          laboratory_id: string | null
          samples_scored: number | null
          samples_with_defects: number | null
          score_stddev: number | null
          session_date: string | null
          session_id: string | null
          session_status: Database["public"]["Enums"]["session_status"] | null
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
            foreignKeyName: "cupping_scores_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cupping_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupping_scores_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_summary_stats"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "cupping_sessions_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "cupping_sessions_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "cupping_sessions_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
        ]
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
      origin_performance_analysis: {
        Row: {
          avg_score: number | null
          high_quality_samples: number | null
          lab_name: string | null
          laboratory_id: string | null
          max_score: number | null
          min_score: number | null
          origin: string | null
          sample_count: number | null
          samples_with_defects: number | null
          score_stddev: number | null
        }
        Relationships: [
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
        ]
      }
      session_summary_stats: {
        Row: {
          auto_averaged: boolean | null
          avg_session_score: number | null
          created_at: string | null
          cupper_count: number | null
          discrepancy_detected: boolean | null
          finalized_at: string | null
          lab_name: string | null
          laboratory_id: string | null
          sample_count: number | null
          session_date: string | null
          session_id: string | null
          session_score_stddev: number | null
          session_type: Database["public"]["Enums"]["session_type"] | null
          status: Database["public"]["Enums"]["session_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "cupping_sessions_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_payment_summary"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "cupping_sessions_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "lab_sample_breakdown"
            referencedColumns: ["laboratory_id"]
          },
          {
            foreignKeyName: "cupping_sessions_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
        ]
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
      _company_fk_columns: {
        Args: never
        Returns: {
          column_name: string
          schema_name: string
          table_name: string
        }[]
      }
      auto_apply_shipment_fields: {
        Args: {
          p_bl_date?: string
          p_bl_number?: string
          p_booking_number?: string
          p_confidence: number
          p_confirmation_source?: string
          p_destination_port?: string
          p_document_id: string
          p_eta?: string
          p_etd?: string
          p_origin_port?: string
          p_pss_approved_at?: string
          p_pss_status?: string
          p_shipment_id: string
          p_shipping_advice_sent_at?: string
          p_si_received_at?: string
          p_si_status?: string
          p_source?: string
          p_vessel_name?: string
          p_voyage_number?: string
        }
        Returns: string
      }
      buyer_bags_median: {
        Args: { p_buyer_id: string; p_months?: number }
        Returns: number
      }
      calculate_certificate_validity: {
        Args: { issue_date: string }
        Returns: {
          valid_from: string
          valid_until: string
        }[]
      }
      calculate_client_fee: {
        Args: { client_id_param: string; sample_id_param: string }
        Returns: number
      }
      calculate_equivalent_60kg_bags: {
        Args: {
          p_bag_count: number
          p_bag_type: Database["public"]["Enums"]["bag_type_enum"]
          p_bag_weight_kg: number
        }
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
      calculate_score_discrepancy: {
        Args: { p_sample_id: string; p_session_id: string }
        Returns: number
      }
      can_access_file: {
        Args: { p_file_id: string; p_user_id: string }
        Returns: boolean
      }
      can_create_laboratories: { Args: { user_id: string }; Returns: boolean }
      can_update_profile: {
        Args: {
          profile_user_id: string
          target_lab_id: string
          target_role: string
        }
        Returns: boolean
      }
      can_validate_cupping_session: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: boolean
      }
      can_view_profile: { Args: { profile_user_id: string }; Returns: boolean }
      check_session_completion: {
        Args: { p_session_id: string }
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
      claim_contract_draft: {
        Args: { draft_id: string }
        Returns: {
          buyer_id: string | null
          buyer_name: string | null
          created_at: string
          created_by: string
          id: string
          issued_contract_id: string | null
          owner_changed_at: string | null
          owner_id: string
          payload: Json
          previous_owner_id: string | null
          quality_summary: string | null
          seller_id: string | null
          seller_name: string | null
          updated_at: string
          updated_by: string
        }
        SetofOptions: {
          from: "*"
          to: "contract_drafts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cleanup_old_defect_photos: { Args: never; Returns: Json }
      cleanup_old_drafts: { Args: never; Returns: number }
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
      convert_contact_kind: {
        Args: { p_contact_id: string; p_to_group: boolean }
        Returns: string
      }
      convert_legacy_tracking_format: {
        Args: { p_client_id: string }
        Returns: Json
      }
      current_user_company_id: { Args: never; Returns: string }
      current_user_is_external: { Args: never; Returns: boolean }
      default_first_notice_day: {
        Args: { delivery_month_num: number; delivery_year: number }
        Returns: string
      }
      ensure_terminal_calendar_for_contracts: { Args: never; Returns: number }
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
      exec_stats_autonomy_watch: { Args: never; Returns: number }
      exec_stats_highlighted_contracts: {
        Args: never
        Returns: {
          contract_id: string
        }[]
      }
      exec_stats_main: {
        Args: never
        Returns: {
          avg_conf_today: number
          backlog: number
          forwarded_today: number
          last_week: number
          mtd: number
          oldest_pending_days: number
          rejected_today: number
          this_week: number
          today_count: number
          today_pending: number
        }[]
      }
      exec_stats_types_today: {
        Args: never
        Returns: {
          other_count: number
          top5: Json
        }[]
      }
      expire_leave_coverage: { Args: never; Returns: number }
      find_archivable_conversations: {
        Args: never
        Returns: {
          conversation_id: string
          document_ids: string[]
          graph_message_ids: string[]
        }[]
      }
      generate_certificate_number: {
        Args: {
          p_client_id: string
          p_is_rejected?: boolean
          p_origin?: string
          p_quality_spec_id?: string
        }
        Returns: string
      }
      generate_client_slug: { Args: { input_text: string }; Returns: string }
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
          p_is_rejected?: boolean
          p_laboratory_id?: string
          p_origin?: string
          p_quality_template_id?: string
          p_sample_type?: string
        }
        Returns: string
      }
      generate_trip_access_token: { Args: never; Returns: string }
      generate_unique_trip_slug: {
        Args: { base_slug: string; creator_user_id: string }
        Returns: string
      }
      get_active_micro_regions: {
        Args: { p_origin?: string }
        Returns: {
          altitude_max: number | null
          altitude_min: number | null
          created_at: string | null
          description_en: string | null
          description_es: string | null
          description_pt: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          origin: string
          parent_region: string | null
          region_name_en: string
          region_name_es: string | null
          region_name_pt: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "micro_regions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_activity_duration_days: {
        Args: { activity_date: string; end_date: string }
        Returns: number
      }
      get_certificate_quality_name: {
        Args: { p_client_quality_id: string }
        Returns: string
      }
      get_client_quality_display_name: {
        Args: { p_client_quality_id: string; p_language?: string }
        Returns: string
      }
      get_client_quality_display_name_with_code: {
        Args: { p_client_quality_id: string; p_language?: string }
        Returns: string
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
        Args: never
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
      get_contracts_sales_dashboard: {
        Args: { p_doughnut_mode?: string }
        Returns: Json
      }
      get_cupper_assigned_samples: {
        Args: { p_cupper_id: string }
        Returns: {
          has_submitted_score: boolean
          sample_id: string
          session_id: string
          session_status: string
        }[]
      }
      get_cupping_attribute_name: {
        Args: { p_attribute_id: string; p_language?: string }
        Returns: string
      }
      get_daily_summary_payload: {
        Args: { p_send_date?: string }
        Returns: Json
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
      get_legacy_client_stats: { Args: never; Returns: Json }
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
        Args: never
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
      get_user_auth_context: {
        Args: { target_user_id: string }
        Returns: {
          is_global_admin: boolean
          is_lab_manager: boolean
          user_lab_id: string
          user_role: string
        }[]
      }
      get_user_company_id: { Args: { user_id: string }; Returns: string }
      get_user_id_by_email: { Args: { p_email: string }; Returns: string }
      get_user_lab_id: { Args: { user_id: string }; Returns: string }
      get_user_laboratory: { Args: never; Returns: string }
      get_user_qc_laboratory: { Args: { user_id: string }; Returns: string }
      get_user_qc_role: {
        Args: { user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_user_role: { Args: { user_id: string }; Returns: string }
      has_global_qc_access: { Args: { user_id: string }; Returns: boolean }
      has_user_type: {
        Args: { user_id: string; user_types: string[] }
        Returns: boolean
      }
      immutable_unaccent: { Args: { "": string }; Returns: string }
      increment_fixation_broker_usage: {
        Args: { p_broker_id: string; p_company_id: string; p_now: string }
        Returns: undefined
      }
      insert_contracts_atomic: {
        Args: { payloads: Json }
        Returns: {
          contract_number: string
          id: string
          quality_description: string
          shipment_period_end: string
          shipment_period_start: string
          volume_bags: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_certificate_valid: { Args: { cert_id: string }; Returns: boolean }
      is_fixation_autonomous: {
        Args: { p_action_type: string; p_client_id: string }
        Returns: boolean
      }
      is_global_admin:
        | { Args: never; Returns: boolean }
        | { Args: { user_id: string }; Returns: boolean }
      is_global_admin_user: { Args: { user_id: string }; Returns: boolean }
      is_lab_manager: { Args: never; Returns: boolean }
      is_lab_quality_manager_user: {
        Args: { user_id: string }
        Returns: boolean
      }
      is_logistics_staff: { Args: { p_user_id: string }; Returns: boolean }
      is_on_approved_leave: {
        Args: { p_date?: string; p_user_id: string }
        Returns: boolean
      }
      is_project_member: {
        Args: { p_project_id: string; p_user_id: string }
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
      log_cupping_action: {
        Args: {
          p_action: string
          p_details?: Json
          p_performed_by: string
          p_sample_id: string
          p_session_id: string
        }
        Returns: string
      }
      mark_expired_invitations: { Args: never; Returns: undefined }
      match_contracts_by_haystack: {
        Args: { p_haystack: string; p_tokens: string[] }
        Returns: {
          buyer_id: string
          buyer_name: string
          buyer_reference: string
          contract_id: string
          contract_number: string
          destination: string
          direction: string
          matched_column: string
          matched_ref: string
          seller_id: string
          seller_name: string
          seller_reference: string
        }[]
      }
      merge_companies: {
        Args: {
          p_loser_ids: string[]
          p_performed_by: string
          p_survivor_id: string
        }
        Returns: Json
      }
      merge_legacy_addresses_into_companies: {
        Args: { payload: Json }
        Returns: number
      }
      ny_terminal_month_num: { Args: { m: string }; Returns: number }
      parse_terminal_string: {
        Args: { s: string }
        Returns: {
          delivery_month: string
          terminal_code: string
          year: number
        }[]
      }
      preview_merge_companies: {
        Args: { p_loser_ids: string[]; p_survivor_id: string }
        Returns: Json
      }
      purge_old_email_bodies: { Args: never; Returns: undefined }
      recompute_contract_fixation_status: {
        Args: { p_contract_id: string }
        Returns: undefined
      }
      record_human_action: {
        Args: {
          p_action_type: string
          p_actual_value: Json
          p_client_id: string
          p_email_message_id?: string
          p_metadata?: Json
          p_predicted_value: Json
          p_user_id: string
        }
        Returns: string
      }
      reserve_contract_numbers: {
        Args: { count: number }
        Returns: {
          contract_number: string
          sequence_index: number
        }[]
      }
      resolve_ai_prediction: {
        Args: {
          p_actual_value: Json
          p_log_id: string
          p_resolved_by: string
          p_was_correct: boolean
        }
        Returns: undefined
      }
      resolve_buyer_owner: { Args: { p_buyer_id: string }; Returns: string }
      revert_shipment_revision: {
        Args: { p_revision_id: string }
        Returns: string
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
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_sample: { Args: { sample_id: string }; Returns: undefined }
      subtract_business_days: {
        Args: { d: string; n: number }
        Returns: string
      }
      sync_activities_from_existing_data: { Args: never; Returns: string }
      unaccent: { Args: { "": string }; Returns: string }
      update_user_password: {
        Args: { new_password: string; user_email: string }
        Returns: {
          email: string
          id: string
          success: boolean
        }[]
      }
      upsert_group_inbox_contact: {
        Args: {
          p_company_id: string
          p_email: string
          p_name: string
          p_routing_purpose: string
          p_user_id: string
        }
        Returns: string
      }
      upsert_recipient_contacts: {
        Args: {
          p_contract_id: string
          p_default_role: string
          p_recipients: Json
          p_routing_purpose: string
          p_sender_user_id: string
        }
        Returns: Json
      }
      upsert_recipient_memory: {
        Args: {
          p_company_id: string
          p_purpose: string
          p_recipients: Json
          p_sender_user_id: string
        }
        Returns: Json
      }
      user_has_module: {
        Args: { p_module: string; p_user_id: string }
        Returns: boolean
      }
      user_laboratory_id: { Args: never; Returns: string }
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
      bag_type_enum: "jute_bag" | "pp_bag" | "big_bag" | "bulk"
      billing_basis: "approved_only" | "approved_and_rejected" | "all_samples"
      certificate_status: "draft" | "issued" | "revoked"
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
      sample_category: "qc" | "other"
      sample_recipient_status:
        | "pending"
        | "approved"
        | "rejected"
        | "no_response"
      sample_status:
        | "received"
        | "in_progress"
        | "under_review"
        | "approved"
        | "rejected"
        | "sent_to_clients"
      sample_type_enum: "pss" | "ss" | "type" | "specialty" | "stocklot"
      session_status: "setup" | "active" | "completed" | "review"
      session_type:
        | "digital"
        | "handwritten"
        | "q_grading"
        | "regular"
        | "calibration"
        | "type_sample"
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
      bag_type_enum: ["jute_bag", "pp_bag", "big_bag", "bulk"],
      billing_basis: ["approved_only", "approved_and_rejected", "all_samples"],
      certificate_status: ["draft", "issued", "revoked"],
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
      sample_category: ["qc", "other"],
      sample_recipient_status: [
        "pending",
        "approved",
        "rejected",
        "no_response",
      ],
      sample_status: [
        "received",
        "in_progress",
        "under_review",
        "approved",
        "rejected",
        "sent_to_clients",
      ],
      sample_type_enum: ["pss", "ss", "type", "specialty", "stocklot"],
      session_status: ["setup", "active", "completed", "review"],
      session_type: [
        "digital",
        "handwritten",
        "q_grading",
        "regular",
        "calibration",
        "type_sample",
      ],
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
