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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      accounting_entries: {
        Row: {
          business_id: string | null
          category: string | null
          created_at: string | null
          created_by_method: string | null
          deleted_at: string | null
          description: string | null
          document_metadata: Json | null
          due_date: string | null
          exchange_rate: number | null
          exchange_rate_date: string | null
          home_amount: number | null
          home_currency: string | null
          home_currency_amount: number | null
          id: string
          notes: string | null
          original_amount: number
          original_currency: string
          payment_date: string | null
          payment_method: string | null
          processing_metadata: Json | null
          reference_number: string | null
          source_document_type: string | null
          source_record_id: string | null
          status: string | null
          subcategory: string | null
          transaction_date: string
          transaction_type: string
          updated_at: string | null
          user_id: string
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          business_id?: string | null
          category?: string | null
          created_at?: string | null
          created_by_method?: string | null
          deleted_at?: string | null
          description?: string | null
          document_metadata?: Json | null
          due_date?: string | null
          exchange_rate?: number | null
          exchange_rate_date?: string | null
          home_amount?: number | null
          home_currency?: string | null
          home_currency_amount?: number | null
          id?: string
          notes?: string | null
          original_amount: number
          original_currency: string
          payment_date?: string | null
          payment_method?: string | null
          processing_metadata?: Json | null
          reference_number?: string | null
          source_document_type?: string | null
          source_record_id?: string | null
          status?: string | null
          subcategory?: string | null
          transaction_date: string
          transaction_type: string
          updated_at?: string | null
          user_id: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          business_id?: string | null
          category?: string | null
          created_at?: string | null
          created_by_method?: string | null
          deleted_at?: string | null
          description?: string | null
          document_metadata?: Json | null
          due_date?: string | null
          exchange_rate?: number | null
          exchange_rate_date?: string | null
          home_amount?: number | null
          home_currency?: string | null
          home_currency_amount?: number | null
          id?: string
          notes?: string | null
          original_amount?: number
          original_currency?: string
          payment_date?: string | null
          payment_method?: string | null
          processing_metadata?: Json | null
          reference_number?: string | null
          source_document_type?: string | null
          source_record_id?: string | null
          status?: string | null
          subcategory?: string | null
          transaction_date?: string
          transaction_type?: string
          updated_at?: string | null
          user_id?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_user_id: string | null
          business_id: string
          created_at: string
          details: Json | null
          event_type: string
          id: number
          target_entity_id: string
          target_entity_type: string
        }
        Insert: {
          actor_user_id?: string | null
          business_id: string
          created_at?: string
          details?: Json | null
          event_type: string
          id?: number
          target_entity_id: string
          target_entity_type: string
        }
        Update: {
          actor_user_id?: string | null
          business_id?: string
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: number
          target_entity_id?: string
          target_entity_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_memberships: {
        Row: {
          business_id: string
          created_at: string
          id: string
          invited_at: string | null
          joined_at: string | null
          last_accessed_at: string | null
          manager_id: string | null
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          last_accessed_at?: string | null
          manager_id?: string | null
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          last_accessed_at?: string | null
          manager_id?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_memberships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_memberships_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          allowed_currencies: string[] | null
          business_type: string | null
          country_code: string | null
          created_at: string | null
          custom_cogs_categories: Json | null
          custom_expense_categories: Json | null
          home_currency: string | null
          id: string
          logo_fallback_color: string | null
          logo_url: string | null
          name: string
          onboarding_completed_at: string | null
          owner_id: string
          plan_name: string | null
          slug: string
          stripe_customer_id: string | null
          stripe_product_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          trial_end_date: string | null
          trial_start_date: string | null
          updated_at: string | null
        }
        Insert: {
          allowed_currencies?: string[] | null
          business_type?: string | null
          country_code?: string | null
          created_at?: string | null
          custom_cogs_categories?: Json | null
          custom_expense_categories?: Json | null
          home_currency?: string | null
          id?: string
          logo_fallback_color?: string | null
          logo_url?: string | null
          name: string
          onboarding_completed_at?: string | null
          owner_id: string
          plan_name?: string | null
          slug: string
          stripe_customer_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          trial_end_date?: string | null
          trial_start_date?: string | null
          updated_at?: string | null
        }
        Update: {
          allowed_currencies?: string[] | null
          business_type?: string | null
          country_code?: string | null
          created_at?: string | null
          custom_cogs_categories?: Json | null
          custom_expense_categories?: Json | null
          home_currency?: string | null
          id?: string
          logo_fallback_color?: string | null
          logo_url?: string | null
          name?: string
          onboarding_completed_at?: string | null
          owner_id?: string
          plan_name?: string | null
          slug?: string
          stripe_customer_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          trial_end_date?: string | null
          trial_start_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "businesses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          business_id: string | null
          created_at: string | null
          deleted_at: string | null
          id: string
          is_active: boolean | null
          language: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_claims: {
        Row: {
          accounting_entry_id: string | null
          approved_at: string | null
          approved_by: string | null
          business_id: string
          business_purpose: string
          confidence_score: number | null
          converted_image_path: string | null
          created_at: string
          currency: string | null
          deleted_at: string | null
          description: string | null
          error_message: Json | null
          exchange_rate: number | null
          expense_category: string | null
          failed_at: string | null
          file_name: string | null
          file_size: number | null
          file_type: string | null
          home_currency: string | null
          home_currency_amount: number | null
          id: string
          internal_notes: string | null
          paid_at: string | null
          processed_at: string | null
          processing_metadata: Json | null
          processing_started_at: string | null
          reference_number: string | null
          rejected_at: string | null
          rejection_reason: string | null
          reviewed_by: string | null
          status: string
          storage_path: string | null
          submitted_at: string | null
          total_amount: number | null
          transaction_date: string | null
          updated_at: string
          user_id: string
          vendor_name: string | null
        }
        Insert: {
          accounting_entry_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_id: string
          business_purpose: string
          confidence_score?: number | null
          converted_image_path?: string | null
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          error_message?: Json | null
          exchange_rate?: number | null
          expense_category?: string | null
          failed_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          home_currency?: string | null
          home_currency_amount?: number | null
          id?: string
          internal_notes?: string | null
          paid_at?: string | null
          processed_at?: string | null
          processing_metadata?: Json | null
          processing_started_at?: string | null
          reference_number?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          reviewed_by?: string | null
          status: string
          storage_path?: string | null
          submitted_at?: string | null
          total_amount?: number | null
          transaction_date?: string | null
          updated_at?: string
          user_id: string
          vendor_name?: string | null
        }
        Update: {
          accounting_entry_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string
          business_purpose?: string
          confidence_score?: number | null
          converted_image_path?: string | null
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          error_message?: Json | null
          exchange_rate?: number | null
          expense_category?: string | null
          failed_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          home_currency?: string | null
          home_currency_amount?: number | null
          id?: string
          internal_notes?: string | null
          paid_at?: string | null
          processed_at?: string | null
          processing_metadata?: Json | null
          processing_started_at?: string | null
          reference_number?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string | null
          submitted_at?: string | null
          total_amount?: number | null
          transaction_date?: string | null
          updated_at?: string
          user_id?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_claims_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_claims_transaction_id_fkey"
            columns: ["accounting_entry_id"]
            isOneToOne: true
            referencedRelation: "accounting_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          business_id: string | null
          classification_method: string | null
          classification_task_id: string | null
          confidence_score: number | null
          converted_image_height: number | null
          converted_image_path: string | null
          converted_image_width: number | null
          created_at: string | null
          deleted_at: string | null
          document_classification_confidence: number | null
          document_metadata: Json | null
          error_message: Json | null
          extracted_data: Json | null
          extraction_task_id: string | null
          failed_at: string | null
          file_name: string
          file_size: number
          file_type: string
          id: string
          processed_at: string | null
          processing_metadata: Json | null
          processing_method: string | null
          processing_started_at: string | null
          processing_tier: number | null
          requires_review: boolean | null
          status: string
          storage_path: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          business_id?: string | null
          classification_method?: string | null
          classification_task_id?: string | null
          confidence_score?: number | null
          converted_image_height?: number | null
          converted_image_path?: string | null
          converted_image_width?: number | null
          created_at?: string | null
          deleted_at?: string | null
          document_classification_confidence?: number | null
          document_metadata?: Json | null
          error_message?: Json | null
          extracted_data?: Json | null
          extraction_task_id?: string | null
          failed_at?: string | null
          file_name: string
          file_size: number
          file_type: string
          id?: string
          processed_at?: string | null
          processing_metadata?: Json | null
          processing_method?: string | null
          processing_started_at?: string | null
          processing_tier?: number | null
          requires_review?: boolean | null
          status?: string
          storage_path: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          business_id?: string | null
          classification_method?: string | null
          classification_task_id?: string | null
          confidence_score?: number | null
          converted_image_height?: number | null
          converted_image_path?: string | null
          converted_image_width?: number | null
          created_at?: string | null
          deleted_at?: string | null
          document_classification_confidence?: number | null
          document_metadata?: Json | null
          error_message?: Json | null
          extracted_data?: Json | null
          extraction_task_id?: string | null
          failed_at?: string | null
          file_name?: string
          file_size?: number
          file_type?: string
          id?: string
          processed_at?: string | null
          processing_metadata?: Json | null
          processing_method?: string | null
          processing_started_at?: string | null
          processing_tier?: number | null
          requires_review?: boolean | null
          status?: string
          storage_path?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      line_items: {
        Row: {
          accounting_entry_id: string
          created_at: string | null
          currency: string
          deleted_at: string | null
          discount_amount: number | null
          id: string
          item_code: string | null
          item_description: string
          line_order: number | null
          quantity: number | null
          tax_amount: number | null
          tax_rate: number | null
          total_amount: number
          unit_measurement: string | null
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          accounting_entry_id: string
          created_at?: string | null
          currency: string
          deleted_at?: string | null
          discount_amount?: number | null
          id?: string
          item_code?: string | null
          item_description: string
          line_order?: number | null
          quantity?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          total_amount: number
          unit_measurement?: string | null
          unit_price: number
          updated_at?: string | null
        }
        Update: {
          accounting_entry_id?: string
          created_at?: string | null
          currency?: string
          deleted_at?: string | null
          discount_amount?: number | null
          id?: string
          item_code?: string | null
          item_description?: string
          line_order?: number | null
          quantity?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          total_amount?: number
          unit_measurement?: string | null
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "line_items_transaction_id_fkey"
            columns: ["accounting_entry_id"]
            isOneToOne: false
            referencedRelation: "accounting_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          deleted_at: string | null
          id: string
          metadata: Json | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          metadata?: Json | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_usage: {
        Row: {
          business_id: string
          completion_tokens: number | null
          created_at: string | null
          credits_used: number
          document_id: string | null
          id: string
          model_used: string | null
          period_start: string
          prompt_tokens: number | null
          tokens_used: number | null
        }
        Insert: {
          business_id: string
          completion_tokens?: number | null
          created_at?: string | null
          credits_used?: number
          document_id?: string | null
          id?: string
          model_used?: string | null
          period_start: string
          prompt_tokens?: number | null
          tokens_used?: number | null
        }
        Update: {
          business_id?: string
          completion_tokens?: number | null
          created_at?: string | null
          credits_used?: number
          document_id?: string | null
          id?: string
          model_used?: string | null
          period_start?: string
          prompt_tokens?: number | null
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ocr_usage_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          event_id: string
          event_type: string
          processed_at: string | null
        }
        Insert: {
          event_id: string
          event_type: string
          processed_at?: string | null
        }
        Update: {
          event_id?: string
          event_type?: string
          processed_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          business_id: string | null
          clerk_user_id: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          invited_by: string | null
          invited_role: string | null
          joined_at: string | null
          language_preference: string | null
          preferred_currency: string
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          business_id?: string | null
          clerk_user_id?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          invited_role?: string | null
          joined_at?: string | null
          language_preference?: string | null
          preferred_currency?: string
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string | null
          clerk_user_id?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          invited_role?: string | null
          joined_at?: string | null
          language_preference?: string | null
          preferred_currency?: string
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          business_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      price_history: {
        Row: {
          business_id: string | null
          currency: string | null
          invoice_id: string | null
          item_description: string | null
          line_item_id: string | null
          transaction_date: string | null
          unit_price: number | null
          vendor_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_accounting_entry_from_approved_claim: {
        Args: { p_approver_id?: string; p_claim_id: string }
        Returns: string
      }
      get_dashboard_analytics: {
        Args: { p_end_date: string; p_start_date: string; p_user_id: string }
        Returns: {
          aged_payables: Json
          aged_receivables: Json
          category_breakdown: Json
          currency_breakdown: Json
          id: number
          net_profit: number
          total_expenses: number
          total_income: number
          transaction_count: number
        }[]
      }
      get_expense_claims_summary: {
        Args: {
          p_business_id: string
          p_is_admin?: boolean
          p_is_manager?: boolean
          p_user_id: string
        }
        Returns: {
          approved_amount: number
          pending_approval: number
          rejected_count: number
          total_claims: number
        }[]
      }
      get_invoices_with_linked_transactions: {
        Args: {
          p_cursor?: string
          p_date_from?: string
          p_date_to?: string
          p_file_type?: string
          p_limit?: number
          p_search?: string
          p_status?: string
          p_user_id: string
        }
        Returns: Json
      }
      get_jwt_claim: { Args: { claim_name: string }; Returns: string }
      get_manager_team_employees: {
        Args: { business_id_param: string; manager_user_id: string }
        Returns: {
          business_id: string
          clerk_user_id: string
          created_at: string
          email: string
          employee_id: string
          full_name: string
          home_currency: string
          manager_id: string
          manager_name: string
          manager_user_id_field: string
          role_permissions: Json
          updated_at: string
          user_id: string
        }[]
      }
      get_monthly_ocr_usage: {
        Args: { p_business_id: string }
        Returns: number
      }
      get_user_business_id: { Args: never; Returns: string }
      get_vendor_spend_analysis: {
        Args: { p_business_id: string; p_months?: number; p_vendor_id: string }
        Returns: {
          avg_transaction_amount: number
          first_transaction_date: string
          last_transaction_date: string
          price_trend_percentage: number
          total_spend: number
          total_transactions: number
          transactions_by_month: Json
          vendor_id: string
          vendor_name: string
        }[]
      }
      list_conversations_optimized: {
        Args: { p_business_id: string; p_limit?: number; p_user_id: string }
        Returns: {
          context_summary: string
          created_at: string
          id: string
          is_active: boolean
          language: string
          latest_message: Json
          message_count: number
          title: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      user_role: "owner" | "admin" | "member" | "viewer"
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
      user_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const

// ============================================================================
// CONVEX TYPES: Double-Entry Accounting (001-accounting-double-entry)
// ============================================================================

/**
 * Journal Entry (Header) - Double-entry bookkeeping transaction
 * Replaces AccountingEntry in the new accounting system
 */
export interface JournalEntry {
  _id: string
  businessId: string
  entryNumber: string              // "JE-2026-00001"

  // Dates
  transactionDate: string          // YYYY-MM-DD (business date)
  postingDate: string              // YYYY-MM-DD (system date)

  // Description
  description: string
  memo?: string

  // Status
  status: 'draft' | 'posted' | 'reversed' | 'voided'

  // Source tracking
  sourceType: 'manual' | 'sales_invoice' | 'expense_claim' | 'ar_reconciliation' | 'migrated'
  sourceId?: string

  // Fiscal period
  fiscalYear: number
  fiscalPeriod: string             // "2026-01"

  // Currency
  homeCurrency: string

  // Balancing validation (denormalized)
  totalDebit: number
  totalCredit: number
  lineCount: number

  // Reversal tracking
  reversedBy?: string              // ID of reversing entry
  reversalOf?: string              // ID of original entry being reversed

  // Audit trail
  createdBy: string
  createdAt: number
  postedBy?: string
  postedAt?: number

  // Locking
  accountingPeriodId?: string
  isPeriodLocked: boolean

  // Convex system fields
  _creationTime: number
}

/**
 * Journal Entry Line - Individual debit/credit line in a journal entry
 */
export interface JournalEntryLine {
  _id: string
  journalEntryId: string
  businessId: string

  // Line ordering
  lineOrder: number

  // Account reference (denormalized)
  accountId: string
  accountCode: string
  accountName: string
  accountType: string

  // Amounts (one must be 0, the other non-zero)
  debitAmount: number              // Must be 0 if creditAmount > 0
  creditAmount: number             // Must be 0 if debitAmount > 0
  homeCurrencyAmount: number

  // Foreign currency support
  foreignCurrency?: string
  foreignAmount?: number
  exchangeRate?: number
  rateSource?: 'api' | 'manual' | 'fallback'

  // Line description
  lineDescription?: string

  // Entity tracking
  entityType?: 'customer' | 'vendor' | 'employee'
  entityId?: string
  entityName?: string

  // "Against Account" (ERPNext pattern)
  againstAccountCode?: string
  againstAccountName?: string

  // Tax tracking
  taxCode?: string
  taxRate?: number
  taxAmount?: number

  // Bank reconciliation
  bankReconciled: boolean
  bankReconciledDate?: string

  // Audit
  createdAt: number

  // Convex system fields
  _creationTime: number
}

/**
 * @deprecated Use JournalEntry instead. AccountingEntry is being phased out in favor of double-entry bookkeeping.
 * This interface is maintained for backward compatibility during migration.
 * @see JournalEntry for the new double-entry accounting system
 */
export interface AccountingEntry {
  id: string
  user_id: string
  business_id: string | null

  // Source tracking
  source_record_id?: string
  source_document_type?: 'invoice' | 'expense_claim'

  // Classification
  transaction_type: string
  category: string | null
  subcategory?: string | null
  description: string | null
  reference_number?: string | null

  // Multi-currency amounts
  original_currency: string
  original_amount: number
  home_currency: string | null
  home_currency_amount: number | null
  exchange_rate: number | null
  exchange_rate_date: string | null

  // Business context
  transaction_date: string
  vendor_name?: string | null
  vendor_id?: string | null

  // Transaction status
  status?: string | null
  due_date?: string | null
  payment_date?: string | null
  payment_method?: string | null
  notes?: string | null

  // Metadata
  document_metadata?: Json | null
  processing_metadata?: Json | null

  // Audit
  created_at: string | null
  updated_at: string | null
  created_by_method: string | null
  deleted_at?: string | null
}
