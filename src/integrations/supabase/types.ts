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
      accounting_integrity_findings: {
        Row: {
          check_code: string
          detail: string
          detected_at: string
          entity_id: string | null
          entity_type: string
          id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          tenant_id: string
        }
        Insert: {
          check_code: string
          detail: string
          detected_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          tenant_id: string
        }
        Update: {
          check_code?: string
          detail?: string
          detected_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_integrity_findings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          period_end: string
          period_name: string
          period_start: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          period_end: string
          period_name: string
          period_start: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          period_end?: string
          period_name?: string
          period_start?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_actions: {
        Row: {
          acted_at: string
          acted_by: string
          action: string
          id: string
          note: string | null
          request_id: string
          tenant_id: string
          workflow_step_id: string
        }
        Insert: {
          acted_at?: string
          acted_by: string
          action: string
          id?: string
          note?: string | null
          request_id: string
          tenant_id: string
          workflow_step_id: string
        }
        Update: {
          acted_at?: string
          acted_by?: string
          action?: string
          id?: string
          note?: string | null
          request_id?: string
          tenant_id?: string
          workflow_step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_actions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_actions_workflow_step_id_fkey"
            columns: ["workflow_step_id"]
            isOneToOne: false
            referencedRelation: "approval_workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          amount: number | null
          completed_at: string | null
          created_at: string
          current_step: number
          entity_id: string
          entity_type: string
          id: string
          idempotency_key: string | null
          payload: Json
          requested_by: string
          status: string
          submitted_at: string
          tenant_id: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          amount?: number | null
          completed_at?: string | null
          created_at?: string
          current_step?: number
          entity_id: string
          entity_type: string
          id?: string
          idempotency_key?: string | null
          payload?: Json
          requested_by: string
          status?: string
          submitted_at?: string
          tenant_id: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          amount?: number | null
          completed_at?: string | null
          created_at?: string
          current_step?: number
          entity_id?: string
          entity_type?: string
          id?: string
          idempotency_key?: string | null
          payload?: Json
          requested_by?: string
          status?: string
          submitted_at?: string
          tenant_id?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "approval_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_workflow_steps: {
        Row: {
          approver_role: string | null
          approver_type: string
          approver_user_id: string | null
          created_at: string
          id: string
          minimum_approvals: number
          name: string
          step_order: number
          workflow_id: string
        }
        Insert: {
          approver_role?: string | null
          approver_type: string
          approver_user_id?: string | null
          created_at?: string
          id?: string
          minimum_approvals?: number
          name: string
          step_order: number
          workflow_id: string
        }
        Update: {
          approver_role?: string | null
          approver_type?: string
          approver_user_id?: string | null
          created_at?: string
          id?: string
          minimum_approvals?: number
          name?: string
          step_order?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "approval_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_workflows: {
        Row: {
          code: string
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          entity_type: string
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_type: string
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_type?: string
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_workflows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          deleted_at: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          tenant_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          deleted_at?: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          tenant_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          deleted_at?: string | null
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          tenant_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          balance: number | null
          bank: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          deleted_at: string | null
          gl_account_id: string | null
          id: string
          is_default_cash: boolean
          name: string
          notes: string | null
          opening_balance: number
          opening_date: string | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          balance?: number | null
          bank?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          gl_account_id?: string | null
          id?: string
          is_default_cash?: boolean
          name: string
          notes?: string | null
          opening_balance?: number
          opening_date?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          balance?: number | null
          bank?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          gl_account_id?: string | null
          id?: string
          is_default_cash?: boolean
          name?: string
          notes?: string | null
          opening_balance?: number
          opening_date?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_reconciliations: {
        Row: {
          bank_account_id: string
          created_at: string
          created_by: string | null
          difference: number | null
          gl_balance: number
          id: string
          matched_total: number
          notes: string | null
          opening_balance: number
          period_name: string
          reconciled_at: string | null
          reconciled_by: string | null
          statement_balance: number
          statement_date: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          created_by?: string | null
          difference?: number | null
          gl_balance?: number
          id?: string
          matched_total?: number
          notes?: string | null
          opening_balance?: number
          period_name: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          statement_balance?: number
          statement_date: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          created_by?: string | null
          difference?: number | null
          gl_balance?: number
          id?: string
          matched_total?: number
          notes?: string | null
          opening_balance?: number
          period_name?: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          statement_balance?: number
          statement_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliations_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_lines: {
        Row: {
          bank_account_id: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          id: string
          is_matched: boolean
          matched_txn_id: string | null
          reconciliation_id: string | null
          reference: string | null
          running_balance: number | null
          statement_date: string
          tenant_id: string
          updated_at: string
          value_date: string | null
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          is_matched?: boolean
          matched_txn_id?: string | null
          reconciliation_id?: string | null
          reference?: string | null
          running_balance?: number | null
          statement_date: string
          tenant_id: string
          updated_at?: string
          value_date?: string | null
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          is_matched?: boolean
          matched_txn_id?: string | null
          reconciliation_id?: string | null
          reference?: string | null
          running_balance?: number | null
          statement_date?: string
          tenant_id?: string
          updated_at?: string
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_lines_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_matched_txn_id_fkey"
            columns: ["matched_txn_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          contra_account_id: string | null
          created_at: string
          created_by: string | null
          date: string
          deleted_at: string | null
          description: string | null
          id: string
          number: string | null
          payee: string | null
          posted_at: string | null
          reconciliation_id: string | null
          reference: string | null
          reversal_id: string | null
          source_ref_id: string | null
          source_ref_type: string | null
          status: string
          tenant_id: string
          transfer_to_account_id: string | null
          type: string
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          bank_account_id: string
          contra_account_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          number?: string | null
          payee?: string | null
          posted_at?: string | null
          reconciliation_id?: string | null
          reference?: string | null
          reversal_id?: string | null
          source_ref_id?: string | null
          source_ref_type?: string | null
          status?: string
          tenant_id: string
          transfer_to_account_id?: string | null
          type?: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string
          contra_account_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          number?: string | null
          payee?: string | null
          posted_at?: string | null
          reconciliation_id?: string | null
          reference?: string | null
          reversal_id?: string | null
          source_ref_id?: string | null
          source_ref_type?: string | null
          status?: string
          tenant_id?: string
          transfer_to_account_id?: string | null
          type?: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_contra_account_id_fkey"
            columns: ["contra_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_transfer_to_account_id_fkey"
            columns: ["transfer_to_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_lines: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          discount_pct: number
          document_id: string
          id: string
          item_id: string | null
          line_no: number
          line_total: number
          quantity: number
          tax_pct: number
          tenant_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          discount_pct?: number
          document_id: string
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          quantity?: number
          tax_pct?: number
          tenant_id: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          discount_pct?: number
          document_id?: string
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          quantity?: number
          tax_pct?: number
          tenant_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          amount: number | null
          amount_paid: number
          balance: number | null
          balance_due: number
          created_at: string
          created_by: string | null
          currency: string
          date: string | null
          deleted_at: string | null
          discount_total: number
          due_date: string | null
          grand_total: number
          id: string
          notes: string | null
          number: string | null
          posted_at: string | null
          reversal_id: string | null
          search_vec: unknown
          source_po_id: string | null
          status: string | null
          subtotal: number
          supplier_id: string | null
          tax_total: number
          tenant_id: string
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount?: number | null
          amount_paid?: number
          balance?: number | null
          balance_due?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          date?: string | null
          deleted_at?: string | null
          discount_total?: number
          due_date?: string | null
          grand_total?: number
          id?: string
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          reversal_id?: string | null
          search_vec?: unknown
          source_po_id?: string | null
          status?: string | null
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          tenant_id: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number | null
          amount_paid?: number
          balance?: number | null
          balance_due?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          date?: string | null
          deleted_at?: string | null
          discount_total?: number
          due_date?: string | null
          grand_total?: number
          id?: string
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          reversal_id?: string | null
          search_vec?: unknown
          source_po_id?: string | null
          status?: string | null
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          tenant_id?: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_headers: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          notes: string | null
          product_id: string | null
          status: string | null
          tenant_id: string
          updated_at: string
          version: string | null
          yield_qty: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
          version?: string | null
          yield_qty?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
          version?: string | null
          yield_qty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bom_headers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_headers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_lines: {
        Row: {
          bom_id: string
          created_at: string
          deleted_at: string | null
          id: string
          item_id: string | null
          line_no: number
          line_total: number
          quantity: number
          tenant_id: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          bom_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          quantity?: number
          tenant_id: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          bom_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          quantity?: number
          tenant_id?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bom_lines_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bom_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      business_events: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          metadata: Json
          new_values: Json | null
          occurred_at: string
          old_values: Json | null
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          new_values?: Json | null
          occurred_at?: string
          old_values?: Json | null
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          new_values?: Json | null
          occurred_at?: string
          old_values?: Json | null
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          allow_manual_posting: boolean
          balance: number | null
          code: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          normal_balance: string
          opening_balance: number
          parent_id: string | null
          tenant_id: string
          type: string | null
          updated_at: string
        }
        Insert: {
          allow_manual_posting?: boolean
          balance?: number | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          normal_balance?: string
          opening_balance?: number
          parent_id?: string | null
          tenant_id: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          allow_manual_posting?: boolean
          balance?: number | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          normal_balance?: string
          opening_balance?: number
          parent_id?: string | null
          tenant_id?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_note_lines: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string
          discount_pct: number
          document_id: string
          id: string
          item_id: string | null
          line_no: number
          line_total: number
          quantity: number
          tax_pct: number
          tenant_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          discount_pct?: number
          document_id: string
          id?: string
          item_id?: string | null
          line_no: number
          line_total?: number
          quantity?: number
          tax_pct?: number
          tenant_id: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          discount_pct?: number
          document_id?: string
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          quantity?: number
          tax_pct?: number
          tenant_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_note_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "credit_note_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          date: string | null
          deleted_at: string | null
          discount_total: number
          grand_total: number
          id: string
          invoice_id: string | null
          notes: string | null
          number: string | null
          posted_at: string | null
          reason: string | null
          reversal_id: string | null
          status: string | null
          subtotal: number
          tax_total: number
          tenant_id: string
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          discount_total?: number
          grand_total?: number
          id?: string
          invoice_id?: string | null
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          reason?: string | null
          reversal_id?: string | null
          status?: string | null
          subtotal?: number
          tax_total?: number
          tenant_id: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          discount_total?: number
          grand_total?: number
          id?: string
          invoice_id?: string | null
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          reason?: string | null
          reversal_id?: string | null
          status?: string | null
          subtotal?: number
          tax_total?: number
          tenant_id?: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          balance: number | null
          billing_address: string | null
          code: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          credit_limit: number | null
          currency: string | null
          deleted_at: string | null
          email: string | null
          id: string
          industry: string | null
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          salesperson_id: string | null
          search_vec: unknown
          shipping_address: string | null
          status: string | null
          tax_id: string | null
          tenant_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          balance?: number | null
          billing_address?: string | null
          code?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          currency?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          salesperson_id?: string | null
          search_vec?: unknown
          shipping_address?: string | null
          status?: string | null
          tax_id?: string | null
          tenant_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          balance?: number | null
          billing_address?: string | null
          code?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          currency?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          salesperson_id?: string | null
          search_vec?: unknown
          shipping_address?: string | null
          status?: string | null
          tax_id?: string | null
          tenant_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_events: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          note: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          note?: string | null
          status: string
          tenant_id: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          note?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_reversals: {
        Row: {
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          reason: string
          reversal_journal_id: string | null
          tenant_id: string
          voided_at: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          reason: string
          reversal_journal_id?: string | null
          tenant_id: string
          voided_at?: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          reason?: string
          reversal_journal_id?: string | null
          tenant_id?: string
          voided_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_reversals_reversal_journal_id_fkey"
            columns: ["reversal_journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_reversals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          accent_color: string
          applies_to: string[]
          company_address: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          footer_text: string | null
          id: string
          is_default: boolean
          logo_url: string | null
          name: string
          show_logo: boolean
          tenant_id: string
          terms: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string
          applies_to?: string[]
          company_address?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          footer_text?: string | null
          id?: string
          is_default?: boolean
          logo_url?: string | null
          name: string
          show_logo?: boolean
          tenant_id: string
          terms?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string
          applies_to?: string[]
          company_address?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          footer_text?: string | null
          id?: string
          is_default?: boolean
          logo_url?: string | null
          name?: string
          show_logo?: boolean
          tenant_id?: string
          terms?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_jobs: {
        Row: {
          attempts: number
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          filename: string | null
          id: string
          last_error: string | null
          max_attempts: number
          message: string
          pdf_base64: string | null
          sent_at: string | null
          status: string
          subject: string
          tenant_id: string
          to_email: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          filename?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          message?: string
          pdf_base64?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          tenant_id: string
          to_email: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          filename?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          message?: string
          pdf_base64?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          tenant_id?: string
          to_email?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          account_id: string | null
          amount: number
          bank_account_id: string | null
          billable: boolean
          category: string | null
          created_at: string
          created_by: string | null
          currency: string
          date: string
          deleted_at: string | null
          id: string
          mode: string | null
          notes: string | null
          number: string | null
          posted_at: string | null
          reference: string | null
          reversal_id: string | null
          status: string
          supplier_id: string | null
          tax_amount: number
          tenant_id: string
          total: number
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          account_id?: string | null
          amount?: number
          bank_account_id?: string | null
          billable?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          date?: string
          deleted_at?: string | null
          id?: string
          mode?: string | null
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          reference?: string | null
          reversal_id?: string | null
          status?: string
          supplier_id?: string | null
          tax_amount?: number
          tenant_id: string
          total?: number
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          bank_account_id?: string | null
          billable?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          date?: string
          deleted_at?: string | null
          id?: string
          mode?: string | null
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          reference?: string | null
          reversal_id?: string | null
          status?: string
          supplier_id?: string | null
          tax_amount?: number
          tenant_id?: string
          total?: number
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustments: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          deleted_at: string | null
          id: string
          item_id: string | null
          number: string
          posted_at: string | null
          quantity: number
          reason: string | null
          reversal_id: string | null
          status: string | null
          tenant_id: string
          updated_at: string
          voided_at: string | null
          voided_by: string | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date?: string
          deleted_at?: string | null
          id?: string
          item_id?: string | null
          number: string
          posted_at?: string | null
          quantity?: number
          reason?: string | null
          reversal_id?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          deleted_at?: string | null
          id?: string
          item_id?: string | null
          number?: string
          posted_at?: string | null
          quantity?: number
          reason?: string | null
          reversal_id?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inventory_adjustments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfers: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          deleted_at: string | null
          from_warehouse_id: string | null
          id: string
          item_id: string | null
          notes: string | null
          number: string
          posted_at: string | null
          quantity: number
          reversal_id: string | null
          status: string | null
          tenant_id: string
          to_warehouse_id: string | null
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date?: string
          deleted_at?: string | null
          from_warehouse_id?: string | null
          id?: string
          item_id?: string | null
          notes?: string | null
          number: string
          posted_at?: string | null
          quantity?: number
          reversal_id?: string | null
          status?: string | null
          tenant_id: string
          to_warehouse_id?: string | null
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          deleted_at?: string | null
          from_warehouse_id?: string | null
          id?: string
          item_id?: string | null
          notes?: string | null
          number?: string
          posted_at?: string | null
          quantity?: number
          reversal_id?: string | null
          status?: string | null
          tenant_id?: string
          to_warehouse_id?: string | null
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inventory_transfers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string
          discount_pct: number
          document_id: string
          id: string
          item_id: string | null
          line_no: number
          line_total: number
          quantity: number
          tax_pct: number
          tenant_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          discount_pct?: number
          document_id: string
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          quantity?: number
          tax_pct?: number
          tenant_id: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          discount_pct?: number
          document_id?: string
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          quantity?: number
          tax_pct?: number
          tenant_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "invoice_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number | null
          amount_paid: number
          balance: number | null
          balance_due: number
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          date: string | null
          deleted_at: string | null
          discount_total: number
          due_date: string | null
          grand_total: number
          id: string
          notes: string | null
          number: string | null
          posted_at: string | null
          reversal_id: string | null
          search_vec: unknown
          source_order_id: string | null
          status: string | null
          subtotal: number
          tax_total: number
          tenant_id: string
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount?: number | null
          amount_paid?: number
          balance?: number | null
          balance_due?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          discount_total?: number
          due_date?: string | null
          grand_total?: number
          id?: string
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          reversal_id?: string | null
          search_vec?: unknown
          source_order_id?: string | null
          status?: string | null
          subtotal?: number
          tax_total?: number
          tenant_id: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number | null
          amount_paid?: number
          balance?: number | null
          balance_due?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          discount_total?: number
          due_date?: string | null
          grand_total?: number
          id?: string
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          reversal_id?: string | null
          search_vec?: unknown
          source_order_id?: string | null
          status?: string | null
          subtotal?: number
          tax_total?: number
          tenant_id?: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          cost: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          price: number | null
          reorder: number | null
          search_vec: unknown
          sku: string | null
          stock: number | null
          tenant_id: string
          type: string | null
          uom: string | null
          updated_at: string
        }
        Insert: {
          cost?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          price?: number | null
          reorder?: number | null
          search_vec?: unknown
          sku?: string | null
          stock?: number | null
          tenant_id: string
          type?: string | null
          uom?: string | null
          updated_at?: string
        }
        Update: {
          cost?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          price?: number | null
          reorder?: number | null
          search_vec?: unknown
          sku?: string | null
          stock?: number | null
          tenant_id?: string
          type?: string | null
          uom?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          credit: number | null
          debit: number | null
          deleted_at: string | null
          entry_date: string
          id: string
          memo: string | null
          number: string | null
          posted_at: string | null
          source_ref_id: string | null
          source_ref_type: string | null
          status: string | null
          tenant_id: string
          total_credit: number
          total_debit: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credit?: number | null
          debit?: number | null
          deleted_at?: string | null
          entry_date?: string
          id?: string
          memo?: string | null
          number?: string | null
          posted_at?: string | null
          source_ref_id?: string | null
          source_ref_type?: string | null
          status?: string | null
          tenant_id: string
          total_credit?: number
          total_debit?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credit?: number | null
          debit?: number | null
          deleted_at?: string | null
          entry_date?: string
          id?: string
          memo?: string | null
          number?: string | null
          posted_at?: string | null
          source_ref_id?: string | null
          source_ref_type?: string | null
          status?: string | null
          tenant_id?: string
          total_credit?: number
          total_debit?: number
          updated_at?: string
        }
        Relationships: []
      }
      journal_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          id: string
          journal_id: string
          memo: string | null
          tenant_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          journal_id: string
          memo?: string | null
          tenant_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          journal_id?: string
          memo?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          message: string
          read_at: string | null
          severity: string
          tenant_id: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message: string
          read_at?: string | null
          severity?: string
          tenant_id: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string
          read_at?: string | null
          severity?: string
          tenant_id?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      package_lines: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          document_id: string
          id: string
          item_id: string | null
          line_no: number
          quantity: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          document_id: string
          id?: string
          item_id?: string | null
          line_no?: number
          quantity?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          document_id?: string
          id?: string
          item_id?: string | null
          line_no?: number
          quantity?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "package_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          carrier: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          date: string | null
          deleted_at: string | null
          id: string
          notes: string | null
          number: string | null
          posted_at: string | null
          reversal_id: string | null
          sales_order_id: string | null
          status: string | null
          tenant_id: string
          tracking: string | null
          updated_at: string
          voided_at: string | null
          voided_by: string | null
          warehouse_id: string | null
          weight: number | null
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          reversal_id?: string | null
          sales_order_id?: string | null
          status?: string | null
          tenant_id: string
          tracking?: string | null
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id?: string | null
          weight?: number | null
        }
        Update: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          reversal_id?: string | null
          sales_order_id?: string | null
          status?: string | null
          tenant_id?: string
          tracking?: string | null
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "packages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_applications: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          payment_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          payment_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          payment_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_applications_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_applications_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments_received"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_applications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_made_applications: {
        Row: {
          amount: number
          bill_id: string
          created_at: string
          id: string
          payment_id: string
          tenant_id: string
        }
        Insert: {
          amount?: number
          bill_id: string
          created_at?: string
          id?: string
          payment_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          bill_id?: string
          created_at?: string
          id?: string
          payment_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_made_applications_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_made_applications_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments_made"
            referencedColumns: ["id"]
          },
        ]
      }
      payments_made: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string | null
          date: string | null
          deleted_at: string | null
          id: string
          mode: string | null
          number: string | null
          posted_at: string | null
          reference: string | null
          reversal_id: string | null
          supplier_id: string | null
          tenant_id: string
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          id?: string
          mode?: string | null
          number?: string | null
          posted_at?: string | null
          reference?: string | null
          reversal_id?: string | null
          supplier_id?: string | null
          tenant_id: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          id?: string
          mode?: string | null
          number?: string | null
          posted_at?: string | null
          reference?: string | null
          reversal_id?: string | null
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_made_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_made_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments_received: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          date: string | null
          deleted_at: string | null
          id: string
          mode: string | null
          number: string | null
          posted_at: string | null
          reference: string | null
          reversal_id: string | null
          tenant_id: string
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          id?: string
          mode?: string | null
          number?: string | null
          posted_at?: string | null
          reference?: string | null
          reversal_id?: string | null
          tenant_id: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          id?: string
          mode?: string | null
          number?: string | null
          posted_at?: string | null
          reference?: string | null
          reversal_id?: string | null
          tenant_id?: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_received_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_received_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          code: string
          created_at: string
          description: string | null
          module: string
        }
        Insert: {
          action: string
          code: string
          created_at?: string
          description?: string | null
          module: string
        }
        Update: {
          action?: string
          code?: string
          created_at?: string
          description?: string | null
          module?: string
        }
        Relationships: []
      }
      plan_features: {
        Row: {
          feature: string
          plan_id: string
        }
        Insert: {
          feature: string
          plan_id: string
        }
        Update: {
          feature?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_public: boolean
          max_storage_gb: number | null
          max_users: number | null
          name: string
          price_usd: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          max_storage_gb?: number | null
          max_users?: number | null
          name: string
          price_usd?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          max_storage_gb?: number | null
          max_users?: number | null
          name?: string
          price_usd?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          granted_at: string
          granted_by: string | null
          is_active: boolean
          last_seen_at: string | null
          notes: string | null
          platform_role: string
          revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          granted_at?: string
          granted_by?: string | null
          is_active?: boolean
          last_seen_at?: string | null
          notes?: string | null
          platform_role?: string
          revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          granted_at?: string
          granted_by?: string | null
          is_active?: boolean
          last_seen_at?: string | null
          notes?: string | null
          platform_role?: string
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_platform_role_fkey"
            columns: ["platform_role"]
            isOneToOne: false
            referencedRelation: "platform_roles"
            referencedColumns: ["name"]
          },
        ]
      }
      platform_audit_log: {
        Row: {
          acting_as_tenant_id: string | null
          action: string
          actor_email: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          detail: Json
          id: string
          ip_address: unknown
          support_session_id: string | null
          target_id: string | null
          target_label: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          acting_as_tenant_id?: string | null
          action: string
          actor_email: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          detail?: Json
          id?: string
          ip_address?: unknown
          support_session_id?: string | null
          target_id?: string | null
          target_label?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          acting_as_tenant_id?: string | null
          action?: string
          actor_email?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          detail?: Json
          id?: string
          ip_address?: unknown
          support_session_id?: string | null
          target_id?: string | null
          target_label?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_log_acting_as_tenant_id_fkey"
            columns: ["acting_as_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_audit_log_session_fkey"
            columns: ["support_session_id"]
            isOneToOne: false
            referencedRelation: "platform_support_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_permissions: {
        Row: {
          action: string
          code: string
          description: string | null
          module: string
        }
        Insert: {
          action: string
          code: string
          description?: string | null
          module: string
        }
        Update: {
          action?: string
          code?: string
          description?: string | null
          module?: string
        }
        Relationships: []
      }
      platform_role_permissions: {
        Row: {
          permission_code: string
          role_name: string
        }
        Insert: {
          permission_code: string
          role_name: string
        }
        Update: {
          permission_code?: string
          role_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_role_permissions_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "platform_permissions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "platform_role_permissions_role_name_fkey"
            columns: ["role_name"]
            isOneToOne: false
            referencedRelation: "platform_roles"
            referencedColumns: ["name"]
          },
        ]
      }
      platform_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
        }
        Relationships: []
      }
      platform_security_events: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          created_at: string
          detail: Json
          event_type: string
          id: string
          ip_address: unknown
          resolution_note: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event_type: string
          id?: string
          ip_address?: unknown
          resolution_note?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event_type?: string
          id?: string
          ip_address?: unknown
          resolution_note?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_security_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_support_sessions: {
        Row: {
          admin_email: string
          admin_id: string
          authorised_by: string | null
          created_at: string
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          expires_at: string
          id: string
          reason: string
          started_at: string
          status: string
          target_tenant_id: string
          target_tenant_name: string
          tenant_snapshot: Json
          updated_at: string
        }
        Insert: {
          admin_email: string
          admin_id: string
          authorised_by?: string | null
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          expires_at?: string
          id?: string
          reason: string
          started_at?: string
          status?: string
          target_tenant_id: string
          target_tenant_name: string
          tenant_snapshot?: Json
          updated_at?: string
        }
        Update: {
          admin_email?: string
          admin_id?: string
          authorised_by?: string | null
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          expires_at?: string
          id?: string
          reason?: string
          started_at?: string
          status?: string
          target_tenant_id?: string
          target_tenant_name?: string
          tenant_snapshot?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_support_sessions_target_tenant_id_fkey"
            columns: ["target_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      posting_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          permission_code: string
          posted_at: string
          result: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          permission_code: string
          posted_at?: string
          result?: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          permission_code?: string
          posted_at?: string
          result?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posting_audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      posting_config: {
        Row: {
          account_id: string | null
          id: string
          purpose: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id?: string | null
          id?: string
          purpose: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string | null
          id?: string
          purpose?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posting_config_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posting_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          bom_id: string | null
          created_at: string
          created_by: string | null
          date: string
          deleted_at: string | null
          id: string
          notes: string | null
          number: string
          posted_at: string | null
          quantity: number
          reversal_id: string | null
          status: string | null
          tenant_id: string
          updated_at: string
          voided_at: string | null
          voided_by: string | null
          warehouse_id: string | null
        }
        Insert: {
          bom_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          number: string
          posted_at?: string | null
          quantity?: number
          reversal_id?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id?: string | null
        }
        Update: {
          bom_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          number?: string
          posted_at?: string | null
          quantity?: number
          reversal_id?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bom_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
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
          id: string
          phone: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          discount_pct: number
          document_id: string
          id: string
          item_id: string | null
          line_no: number
          line_total: number
          quantity: number
          tax_pct: number
          tenant_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          discount_pct?: number
          document_id: string
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          quantity?: number
          tax_pct?: number
          tenant_id: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          discount_pct?: number
          document_id?: string
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          quantity?: number
          tax_pct?: number
          tenant_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          amount: number | null
          converted_bill_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          date: string | null
          deleted_at: string | null
          discount_total: number
          expected_date: string | null
          grand_total: number
          id: string
          notes: string | null
          number: string | null
          search_vec: unknown
          status: string | null
          subtotal: number
          supplier_id: string | null
          tax_total: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          converted_bill_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          date?: string | null
          deleted_at?: string | null
          discount_total?: number
          expected_date?: string | null
          grand_total?: number
          id?: string
          notes?: string | null
          number?: string | null
          search_vec?: unknown
          status?: string | null
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          converted_bill_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          date?: string | null
          deleted_at?: string | null
          discount_total?: number
          expected_date?: string | null
          grand_total?: number
          id?: string
          notes?: string | null
          number?: string | null
          search_vec?: unknown
          status?: string | null
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requisition_lines: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          discount_pct: number
          document_id: string
          id: string
          item_id: string | null
          line_no: number
          line_total: number
          quantity: number
          tax_pct: number
          tenant_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          discount_pct?: number
          document_id: string
          id?: string
          item_id?: string | null
          line_no: number
          line_total?: number
          quantity?: number
          tax_pct?: number
          tenant_id: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          discount_pct?: number
          document_id?: string
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          quantity?: number
          tax_pct?: number
          tenant_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisition_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisition_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "purchase_requisition_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisition_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requisitions: {
        Row: {
          amount: number | null
          converted_po_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          date: string | null
          deleted_at: string | null
          department: string | null
          discount_total: number
          grand_total: number
          id: string
          notes: string | null
          number: string | null
          requested_by: string | null
          required_date: string | null
          status: string | null
          subtotal: number
          supplier_id: string | null
          tax_total: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          converted_po_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          date?: string | null
          deleted_at?: string | null
          department?: string | null
          discount_total?: number
          grand_total?: number
          id?: string
          notes?: string | null
          number?: string | null
          requested_by?: string | null
          required_date?: string | null
          status?: string | null
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          converted_po_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          date?: string | null
          deleted_at?: string | null
          department?: string | null
          discount_total?: number
          grand_total?: number
          id?: string
          notes?: string | null
          number?: string | null
          requested_by?: string | null
          required_date?: string | null
          status?: string | null
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisitions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_code: string
          role: string
        }
        Insert: {
          created_at?: string
          permission_code: string
          role: string
        }
        Update: {
          created_at?: string
          permission_code?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
        ]
      }
      sales_order_lines: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string
          discount_pct: number
          document_id: string
          id: string
          item_id: string | null
          line_no: number
          line_total: number
          quantity: number
          tax_pct: number
          tenant_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          discount_pct?: number
          document_id: string
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          quantity?: number
          tax_pct?: number
          tenant_id: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          discount_pct?: number
          document_id?: string
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          quantity?: number
          tax_pct?: number
          tenant_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "sales_order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          amount: number | null
          converted_invoice_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          date: string | null
          deleted_at: string | null
          discount_total: number
          grand_total: number
          id: string
          items_count: number | null
          notes: string | null
          number: string | null
          search_vec: unknown
          source_quote_id: string | null
          status: string | null
          subtotal: number
          tax_total: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          converted_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          discount_total?: number
          grand_total?: number
          id?: string
          items_count?: number | null
          notes?: string | null
          number?: string | null
          search_vec?: unknown
          source_quote_id?: string | null
          status?: string | null
          subtotal?: number
          tax_total?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          converted_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          discount_total?: number
          grand_total?: number
          id?: string
          items_count?: number | null
          notes?: string | null
          number?: string | null
          search_vec?: unknown
          source_quote_id?: string | null
          status?: string | null
          subtotal?: number
          tax_total?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_quote_lines: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string
          discount_pct: number
          document_id: string
          id: string
          item_id: string | null
          line_no: number
          line_total: number
          quantity: number
          tax_pct: number
          tenant_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          discount_pct?: number
          document_id: string
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          quantity?: number
          tax_pct?: number
          tenant_id: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          discount_pct?: number
          document_id?: string
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          quantity?: number
          tax_pct?: number
          tenant_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_quote_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "sales_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quote_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "sales_quote_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quote_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_quotes: {
        Row: {
          amount: number | null
          converted_order_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          date: string | null
          deleted_at: string | null
          discount_total: number
          expiry: string | null
          grand_total: number
          id: string
          notes: string | null
          number: string | null
          search_vec: unknown
          status: string | null
          subtotal: number
          tax_total: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          converted_order_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          discount_total?: number
          expiry?: string | null
          grand_total?: number
          id?: string
          notes?: string | null
          number?: string | null
          search_vec?: unknown
          status?: string | null
          subtotal?: number
          tax_total?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          converted_order_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          discount_total?: number
          expiry?: string | null
          grand_total?: number
          id?: string
          notes?: string | null
          number?: string | null
          search_vec?: unknown
          status?: string | null
          subtotal?: number
          tax_total?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier: string | null
          cost: number | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          delivery_date: string | null
          id: string
          notes: string | null
          number: string | null
          package_id: string | null
          posted_at: string | null
          reversal_id: string | null
          sales_order_id: string | null
          service_level: string | null
          ship_date: string | null
          status: string | null
          tenant_id: string
          tracking: string | null
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          carrier?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          delivery_date?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          package_id?: string | null
          posted_at?: string | null
          reversal_id?: string | null
          sales_order_id?: string | null
          service_level?: string | null
          ship_date?: string | null
          status?: string | null
          tenant_id: string
          tracking?: string | null
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          carrier?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          delivery_date?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          package_id?: string | null
          posted_at?: string | null
          reversal_id?: string | null
          sales_order_id?: string | null
          service_level?: string | null
          ship_date?: string | null
          status?: string | null
          tenant_id?: string
          tracking?: string | null
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          note: string | null
          quantity: number
          ref_id: string | null
          ref_type: string
          tenant_id: string
          unit_cost: number
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          note?: string | null
          quantity: number
          ref_id?: string | null
          ref_type: string
          tenant_id: string
          unit_cost?: number
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          note?: string | null
          quantity?: number
          ref_id?: string | null
          ref_type?: string
          tenant_id?: string
          unit_cost?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          balance: number | null
          category: string | null
          code: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          deleted_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          search_vec: unknown
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          balance?: number | null
          category?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          search_vec?: unknown
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          balance?: number | null
          category?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          search_vec?: unknown
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_account_mappings: {
        Row: {
          created_at: string
          default_code: string
          description: string | null
          id: string
          is_required: boolean
          label: string
          module: string
          purpose: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          default_code: string
          description?: string | null
          id?: string
          is_required?: boolean
          label: string
          module?: string
          purpose: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          default_code?: string
          description?: string | null
          id?: string
          is_required?: boolean
          label?: string
          module?: string
          purpose?: string
          sort_order?: number
        }
        Relationships: []
      }
      tax_rates: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          input_account_id: string | null
          is_active: boolean
          is_default: boolean
          is_inclusive: boolean
          name: string
          output_account_id: string | null
          rate: number
          tax_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          input_account_id?: string | null
          is_active?: boolean
          is_default?: boolean
          is_inclusive?: boolean
          name: string
          output_account_id?: string | null
          rate?: number
          tax_type?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          input_account_id?: string | null
          is_active?: boolean
          is_default?: boolean
          is_inclusive?: boolean
          name?: string
          output_account_id?: string | null
          rate?: number
          tax_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_rates_input_account_id_fkey"
            columns: ["input_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_rates_output_account_id_fkey"
            columns: ["output_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_features: {
        Row: {
          enabled: boolean
          feature: string
          source: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          feature: string
          source?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          feature?: string
          source?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_features_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscriptions: {
        Row: {
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          current_period_end: string | null
          current_period_start: string
          external_id: string | null
          external_meta: Json
          id: string
          notes: string | null
          override_max_storage: number | null
          override_max_users: number | null
          plan_id: string
          status: string
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          current_period_start?: string
          external_id?: string | null
          external_meta?: Json
          id?: string
          notes?: string | null
          override_max_storage?: number | null
          override_max_users?: number | null
          plan_id: string
          status?: string
          tenant_id: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          current_period_start?: string
          external_id?: string | null
          external_meta?: Json
          id?: string
          notes?: string | null
          override_max_storage?: number | null
          override_max_users?: number | null
          plan_id?: string
          status?: string
          tenant_id?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          currency: string
          deleted_at: string | null
          id: string
          name: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          name: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          name?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          location: string | null
          name: string
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          location?: string | null
          name: string
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          location?: string | null
          name?: string
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      inventory_item_stock: {
        Row: {
          item_id: string | null
          name: string | null
          on_hand: number | null
          reorder: number | null
          sku: string | null
          tenant_id: string | null
          uom: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_warehouse_stock: {
        Row: {
          item_id: string | null
          on_hand: number | null
          tenant_id: string | null
          warehouse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _account_id: { Args: { _code: string; _tenant: string }; Returns: string }
      _cfg_account: {
        Args: { _purpose: string; _tenant_id: string }
        Returns: string
      }
      _emit_journal: {
        Args: {
          _entry_date: string
          _lines: Json
          _memo: string
          _source_id: string
          _source_type: string
          _tenant_id: string
        }
        Returns: string
      }
      _vat_accounts: {
        Args: { _tenant_id: string }
        Returns: {
          input_vat: string
          output_vat: string
        }[]
      }
      acknowledge_integrity_finding: {
        Args: { _finding_id: string; _note?: string }
        Returns: undefined
      }
      act_on_approval_request: {
        Args: { _action: string; _note?: string; _request_id: string }
        Returns: {
          amount: number | null
          completed_at: string | null
          created_at: string
          current_step: number
          entity_id: string
          entity_type: string
          id: string
          idempotency_key: string | null
          payload: Json
          requested_by: string
          status: string
          submitted_at: string
          tenant_id: string
          updated_at: string
          workflow_id: string
        }
        SetofOptions: {
          from: "*"
          to: "approval_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_approval_workflow_step: {
        Args: {
          _approver_role?: string
          _approver_type: string
          _approver_user_id?: string
          _minimum_approvals?: number
          _name: string
          _step_order: number
          _workflow_id: string
        }
        Returns: string
      }
      admin_grant_platform_access: {
        Args: { _notes?: string; _platform_role?: string; _user_id: string }
        Returns: undefined
      }
      admin_ping: { Args: never; Returns: boolean }
      admin_revoke_platform_access: {
        Args: { _reason?: string; _user_id: string }
        Returns: undefined
      }
      admin_set_feature_flag: {
        Args: {
          _enabled: boolean
          _feature: string
          _reason?: string
          _tenant_id: string
        }
        Returns: undefined
      }
      admin_set_tenant_plan: {
        Args: { _notes?: string; _plan_id: string; _tenant_id: string }
        Returns: string
      }
      admin_set_tenant_status: {
        Args: { _new_status: string; _reason?: string; _tenant_id: string }
        Returns: undefined
      }
      admin_set_user_roles: {
        Args: {
          new_roles: Database["public"]["Enums"]["app_role"][]
          target_user: string
        }
        Returns: undefined
      }
      apply_payment: {
        Args: { _allocations: Json; _payment_id: string }
        Returns: undefined
      }
      apply_payment_made: {
        Args: { _allocations: Json; _payment_id: string }
        Returns: undefined
      }
      approval_actor_can_act: {
        Args: {
          _request: Database["public"]["Tables"]["approval_requests"]["Row"]
          _step: Database["public"]["Tables"]["approval_workflow_steps"]["Row"]
        }
        Returns: boolean
      }
      approval_condition_matches: {
        Args: { _amount: number; _conditions: Json }
        Returns: boolean
      }
      assert_period_open: {
        Args: { _date: string; _tenant_id: string }
        Returns: undefined
      }
      audit_request_ip: { Args: never; Returns: unknown }
      audit_request_user_agent: { Args: never; Returns: string }
      begin_support_session: {
        Args: {
          _reason: string
          _target_tenant_id: string
          _ttl_minutes?: number
        }
        Returns: string
      }
      check_inventory_stock_integrity: {
        Args: { _item_id?: string }
        Returns: {
          difference: number
          is_valid: boolean
          item_id: string
          item_name: string
          ledger_on_hand: number
          projected_stock: number
          sku: string
        }[]
      }
      complete_posting: {
        Args: {
          _action: string
          _entity_id: string
          _entity_type: string
          _permission: string
          _require_journal?: boolean
        }
        Returns: string
      }
      convert_order_to_invoice: { Args: { _order_id: string }; Returns: string }
      convert_po_to_bill: { Args: { _po_id: string }; Returns: string }
      convert_quote_to_order: { Args: { _quote_id: string }; Returns: string }
      create_approval_request: {
        Args: {
          _amount?: number
          _entity_id: string
          _entity_type: string
          _idempotency_key?: string
          _payload?: Json
          _workflow_code?: string
        }
        Returns: string
      }
      create_approval_workflow: {
        Args: {
          _code: string
          _conditions?: Json
          _description?: string
          _entity_type: string
          _name: string
        }
        Returns: string
      }
      create_notification: {
        Args: {
          _entity_id?: string
          _entity_type?: string
          _message: string
          _severity?: string
          _title: string
          _type: string
          _user_id: string
        }
        Returns: string
      }
      create_reversal_journal: {
        Args: { _entity_id: string; _entity_type: string; _reason: string }
        Returns: string
      }
      create_reversal_movements: {
        Args: { _entity_id: string; _entity_type: string; _reversal_id: string }
        Returns: number
      }
      current_tenant_id: { Args: never; Returns: string }
      end_support_session: {
        Args: { _reason?: string; _session_id?: string }
        Returns: undefined
      }
      get_accounting_dashboard: { Args: never; Returns: Json }
      get_active_support_session: {
        Args: never
        Returns: {
          expires_at: string
          minutes_remaining: number
          reason: string
          session_id: string
          started_at: string
          target_tenant_id: string
          target_tenant_name: string
        }[]
      }
      get_business_events: {
        Args: {
          _action?: string
          _entity_id?: string
          _entity_type?: string
          _from?: string
          _limit?: number
          _to?: string
        }
        Returns: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          metadata: Json
          new_values: Json | null
          occurred_at: string
          old_values: Json | null
          tenant_id: string
          user_agent: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "business_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_approval_inbox: {
        Args: never
        Returns: {
          amount: number
          current_step: number
          entity_id: string
          entity_type: string
          id: string
          requested_by: string
          status: string
          step_name: string
          submitted_at: string
          workflow_name: string
        }[]
      }
      get_my_features: {
        Args: never
        Returns: {
          feature: string
        }[]
      }
      get_my_notification_unread_count: { Args: never; Returns: number }
      get_my_notifications: {
        Args: { _limit?: number }
        Returns: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          message: string
          read_at: string
          severity: string
          tenant_id: string
          title: string
          type: string
          user_id: string
        }[]
      }
      get_my_permissions: { Args: never; Returns: string[] }
      get_my_platform_permissions: {
        Args: never
        Returns: {
          permission_code: string
        }[]
      }
      get_platform_audit_log: {
        Args: {
          _action?: string
          _actor_id?: string
          _from?: string
          _limit?: number
          _target_id?: string
          _target_type?: string
          _tenant_id?: string
          _to?: string
        }
        Returns: {
          acting_as_tenant_id: string | null
          action: string
          actor_email: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          detail: Json
          id: string
          ip_address: unknown
          support_session_id: string | null
          target_id: string | null
          target_label: string | null
          target_type: string | null
          user_agent: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "platform_audit_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_platform_dashboard_stats: { Args: never; Returns: Json }
      get_sales_dashboard: { Args: never; Returns: Json }
      global_search: {
        Args: {
          date_from?: string
          date_to?: string
          max_per_module?: number
          modules?: string[]
          q: string
        }
        Returns: {
          created_at: string
          id: string
          module: string
          subtitle: string
          title: string
        }[]
      }
      has_feature: { Args: { p_feature: string }; Returns: boolean }
      has_permission: {
        Args: { _permission: string; _user_id?: string }
        Returns: boolean
      }
      has_platform_permission: {
        Args: { _code: string; _user_id?: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id?: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      manage_accounting_period: {
        Args: {
          _month: number
          _new_status: string
          _notes?: string
          _year: number
        }
        Returns: string
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notification_read: {
        Args: { _notification_id: string }
        Returns: undefined
      }
      next_journal_number: { Args: { _tenant_id: string }; Returns: string }
      platform_audit: {
        Args: {
          _action: string
          _detail?: Json
          _target_id?: string
          _target_label?: string
          _target_type?: string
        }
        Returns: string
      }
      post_adjustment: { Args: { _adjustment_id: string }; Returns: string }
      post_adjustment_unchecked: {
        Args: { _adjustment_id: string }
        Returns: string
      }
      post_bank_transaction: { Args: { _txn_id: string }; Returns: string }
      post_bill: { Args: { _bill_id: string }; Returns: string }
      post_bill_unchecked: { Args: { _bill_id: string }; Returns: string }
      post_credit_note: { Args: { _credit_note_id: string }; Returns: string }
      post_credit_note_unchecked: {
        Args: { _credit_note_id: string }
        Returns: string
      }
      post_expense: { Args: { _expense_id: string }; Returns: string }
      post_expense_unchecked: { Args: { _expense_id: string }; Returns: string }
      post_invoice: { Args: { _invoice_id: string }; Returns: string }
      post_invoice_unchecked: { Args: { _invoice_id: string }; Returns: string }
      post_manual_journal: { Args: { _journal_id: string }; Returns: string }
      post_package: { Args: { _package_id: string }; Returns: string }
      post_package_unchecked: { Args: { _package_id: string }; Returns: string }
      post_payment_made: { Args: { _payment_id: string }; Returns: string }
      post_payment_made_unchecked: {
        Args: { _payment_id: string }
        Returns: string
      }
      post_payment_received: { Args: { _payment_id: string }; Returns: string }
      post_payment_received_unchecked: {
        Args: { _payment_id: string }
        Returns: string
      }
      post_production_order: { Args: { _order_id: string }; Returns: string }
      post_production_order_unchecked: {
        Args: { _order_id: string }
        Returns: string
      }
      post_shipment: { Args: { _shipment_id: string }; Returns: string }
      post_shipment_unchecked: {
        Args: { _shipment_id: string }
        Returns: string
      }
      post_transfer: { Args: { _transfer_id: string }; Returns: string }
      post_transfer_unchecked: {
        Args: { _transfer_id: string }
        Returns: string
      }
      recalculate_item_stock_projection: {
        Args: { _item_id?: string }
        Returns: number
      }
      record_business_event: {
        Args: {
          _action: string
          _entity_id?: string
          _entity_type: string
          _metadata?: Json
          _new_values?: Json
          _old_values?: Json
        }
        Returns: string
      }
      run_accounting_integrity_checks: { Args: never; Returns: Json }
      set_item_opening_stock: {
        Args: {
          _item_id: string
          _quantity: number
          _unit_cost?: number
          _warehouse_id?: string
        }
        Returns: string
      }
      switch_tenant: { Args: { target_tenant: string }; Returns: string }
      tenant_write_ok: {
        Args: { _roles: Database["public"]["Enums"]["app_role"][] }
        Returns: boolean
      }
      upsert_posting_config: {
        Args: { _account_id: string; _purpose: string }
        Returns: string
      }
      validate_posting_inventory: {
        Args: { _entity_id: string }
        Returns: number
      }
      validate_posting_journals: {
        Args: {
          _entity_id: string
          _entity_type: string
          _require_journal?: boolean
        }
        Returns: number
      }
      validate_posting_target: {
        Args: { _document_id: string; _permission: string; _table_name: string }
        Returns: boolean
      }
      void_journal_entry: {
        Args: { _journal_id: string; _permission?: string; _reason?: string }
        Returns: string
      }
      void_manual_journal: {
        Args: { _journal_id: string; _reason?: string }
        Returns: string
      }
      void_posted_document: {
        Args: {
          _entity_id: string
          _entity_type: string
          _permission: string
          _reason?: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "tenant_admin"
        | "sales"
        | "purchasing"
        | "inventory"
        | "accounting"
        | "manufacturing"
        | "viewer"
        | "cashier"
        | "accountant"
        | "finance_clerk"
        | "auditor"
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
      app_role: [
        "super_admin",
        "tenant_admin",
        "sales",
        "purchasing",
        "inventory",
        "accounting",
        "manufacturing",
        "viewer",
        "cashier",
        "accountant",
        "finance_clerk",
        "auditor",
      ],
    },
  },
} as const
