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
          posted_by: string | null
          reconciliation_id: string | null
          reference: string | null
          reversal_id: string | null
          reversal_reference: string | null
          reversed_at: string | null
          reversed_by: string | null
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
          posted_by?: string | null
          reconciliation_id?: string | null
          reference?: string | null
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
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
          posted_by?: string | null
          reconciliation_id?: string | null
          reference?: string | null
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
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
          duplicate_override_at: string | null
          duplicate_override_by: string | null
          duplicate_override_reason: string | null
          grand_total: number
          id: string
          match_override_at: string | null
          match_override_by: string | null
          match_override_reason: string | null
          notes: string | null
          number: string | null
          posted_at: string | null
          posted_by: string | null
          reversal_id: string | null
          reversal_reference: string | null
          reversed_at: string | null
          reversed_by: string | null
          search_vec: unknown
          source_po_id: string | null
          source_receipt_id: string | null
          status: string | null
          subtotal: number
          supplier_id: string | null
          supplier_invoice_number: string | null
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
          duplicate_override_at?: string | null
          duplicate_override_by?: string | null
          duplicate_override_reason?: string | null
          grand_total?: number
          id?: string
          match_override_at?: string | null
          match_override_by?: string | null
          match_override_reason?: string | null
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          search_vec?: unknown
          source_po_id?: string | null
          source_receipt_id?: string | null
          status?: string | null
          subtotal?: number
          supplier_id?: string | null
          supplier_invoice_number?: string | null
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
          duplicate_override_at?: string | null
          duplicate_override_by?: string | null
          duplicate_override_reason?: string | null
          grand_total?: number
          id?: string
          match_override_at?: string | null
          match_override_by?: string | null
          match_override_reason?: string | null
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          search_vec?: unknown
          source_po_id?: string | null
          source_receipt_id?: string | null
          status?: string | null
          subtotal?: number
          supplier_id?: string | null
          supplier_invoice_number?: string | null
          tax_total?: number
          tenant_id?: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_source_receipt_fk"
            columns: ["source_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
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
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          notes: string | null
          product_id: string | null
          revision_notes: string | null
          status: string | null
          tenant_id: string
          uom: string | null
          updated_at: string
          used_in_production: boolean
          version: string | null
          yield_qty: number | null
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          revision_notes?: string | null
          status?: string | null
          tenant_id: string
          uom?: string | null
          updated_at?: string
          used_in_production?: boolean
          version?: string | null
          yield_qty?: number | null
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          revision_notes?: string | null
          status?: string | null
          tenant_id?: string
          uom?: string | null
          updated_at?: string
          used_in_production?: boolean
          version?: string | null
          yield_qty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bom_headers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          description: string | null
          id: string
          item_id: string | null
          line_no: number
          line_total: number
          quantity: number
          scrap_pct: number
          tenant_id: string
          unit_cost: number
          uom: string | null
          uom_factor: number | null
          updated_at: string
        }
        Insert: {
          bom_id: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          quantity?: number
          scrap_pct?: number
          tenant_id: string
          unit_cost?: number
          uom?: string | null
          uom_factor?: number | null
          updated_at?: string
        }
        Update: {
          bom_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          quantity?: number
          scrap_pct?: number
          tenant_id?: string
          unit_cost?: number
          uom?: string | null
          uom_factor?: number | null
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
          posted_by: string | null
          reason: string | null
          reversal_id: string | null
          reversal_reference: string | null
          reversed_at: string | null
          reversed_by: string | null
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
          posted_by?: string | null
          reason?: string | null
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
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
          posted_by?: string | null
          reason?: string | null
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
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
      doc_number_sequences: {
        Row: {
          id: string
          next_value: number
          prefix: string
          tenant_id: string
        }
        Insert: {
          id?: string
          next_value?: number
          prefix: string
          tenant_id: string
        }
        Update: {
          id?: string
          next_value?: number
          prefix?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_number_sequences_tenant_id_fkey"
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
          reversal_reference: string | null
          reversed_at: string | null
          reversed_by: string | null
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
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
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
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
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
      employee_reimbursements: {
        Row: {
          bank_account_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          date: string
          deleted_at: string | null
          employee_id: string
          id: string
          notes: string | null
          number: string | null
          posted_at: string | null
          reference: string | null
          status: string
          tenant_id: string
          total: number
          voided_at: string | null
        }
        Insert: {
          bank_account_id?: string | null
          created_at?: string
          created_by?: string | null
          currency: string
          date?: string
          deleted_at?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          reference?: string | null
          status?: string
          tenant_id: string
          total?: number
          voided_at?: string | null
        }
        Update: {
          bank_account_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          date?: string
          deleted_at?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          reference?: string | null
          status?: string
          tenant_id?: string
          total?: number
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_reimbursements_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_reimbursements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          account_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          receipt_required: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          receipt_required?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          receipt_required?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_reimbursement_allocations: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expense_id: string
          id: string
          reimbursement_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expense_id: string
          id?: string
          reimbursement_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expense_id?: string
          id?: string
          reimbursement_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_reimbursement_allocations_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_reimbursement_allocations_reimbursement_id_fkey"
            columns: ["reimbursement_id"]
            isOneToOne: false
            referencedRelation: "employee_reimbursements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_reimbursement_allocations_tenant_id_fkey"
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
          accounting_status: string
          amount: number
          bank_account_id: string | null
          billable: boolean
          business_purpose: string | null
          category: string | null
          cost_center: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_job: string | null
          date: string
          deleted_at: string | null
          department: string | null
          duplicate_override_at: string | null
          duplicate_override_by: string | null
          duplicate_override_reason: string | null
          employee_id: string | null
          id: string
          merchant: string | null
          mode: string | null
          notes: string | null
          number: string | null
          posted_at: string | null
          posted_by: string | null
          project: string | null
          receipt_required: boolean
          receipt_status: string
          reference: string | null
          reimbursement_status: string
          reversal_id: string | null
          reversal_reference: string | null
          reversed_at: string | null
          reversed_by: string | null
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
          accounting_status?: string
          amount?: number
          bank_account_id?: string | null
          billable?: boolean
          business_purpose?: string | null
          category?: string | null
          cost_center?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_job?: string | null
          date?: string
          deleted_at?: string | null
          department?: string | null
          duplicate_override_at?: string | null
          duplicate_override_by?: string | null
          duplicate_override_reason?: string | null
          employee_id?: string | null
          id?: string
          merchant?: string | null
          mode?: string | null
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          posted_by?: string | null
          project?: string | null
          receipt_required?: boolean
          receipt_status?: string
          reference?: string | null
          reimbursement_status?: string
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
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
          accounting_status?: string
          amount?: number
          bank_account_id?: string | null
          billable?: boolean
          business_purpose?: string | null
          category?: string | null
          cost_center?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_job?: string | null
          date?: string
          deleted_at?: string | null
          department?: string | null
          duplicate_override_at?: string | null
          duplicate_override_by?: string | null
          duplicate_override_reason?: string | null
          employee_id?: string | null
          id?: string
          merchant?: string | null
          mode?: string | null
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          posted_by?: string | null
          project?: string | null
          receipt_required?: boolean
          receipt_status?: string
          reference?: string | null
          reimbursement_status?: string
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
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
      feature_flags: {
        Row: {
          code: string
          created_at: string
          description: string | null
          enabled: boolean
          environment: string
          id: string
          name: string
          rollout_percentage: number
          target_plans: string[]
          target_tenants: string[]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          environment?: string
          id?: string
          name: string
          rollout_percentage?: number
          target_plans?: string[]
          target_tenants?: string[]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          environment?: string
          id?: string
          name?: string
          rollout_percentage?: number
          target_plans?: string[]
          target_tenants?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      features: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          type: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          type?: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          type?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      goods_receipt_lines: {
        Row: {
          accepted_quantity: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          location_id: string | null
          lot_id: string | null
          purchase_order_line_id: string
          quantity: number
          receipt_id: string
          rejected_quantity: number
          serial_id: string | null
          service_amount: number | null
          tenant_id: string
          unit: string | null
          unit_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accepted_quantity?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          location_id?: string | null
          lot_id?: string | null
          purchase_order_line_id: string
          quantity: number
          receipt_id: string
          rejected_quantity?: number
          serial_id?: string | null
          service_amount?: number | null
          tenant_id: string
          unit?: string | null
          unit_price: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accepted_quantity?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          location_id?: string | null
          lot_id?: string | null
          purchase_order_line_id?: string
          quantity?: number
          receipt_id?: string
          rejected_quantity?: number
          serial_id?: string | null
          service_amount?: number | null
          tenant_id?: string
          unit?: string | null
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_lines_location_fk"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_lines_lot_fk"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "item_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_lines_purchase_order_line_id_fkey"
            columns: ["purchase_order_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_lines_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_lines_serial_fk"
            columns: ["serial_id"]
            isOneToOne: false
            referencedRelation: "item_serials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          notes: string | null
          posted_at: string | null
          posted_by: string | null
          purchase_order_id: string
          receipt_date: string
          receipt_number: string | null
          receipt_type: string
          receiving_status: string
          service_period_end: string | null
          service_period_start: string | null
          status: string
          supplier_id: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          warehouse_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          purchase_order_id: string
          receipt_date?: string
          receipt_number?: string | null
          receipt_type?: string
          receiving_status?: string
          service_period_end?: string | null
          service_period_start?: string | null
          status?: string
          supplier_id?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          purchase_order_id?: string
          receipt_date?: string
          receipt_number?: string | null
          receipt_type?: string
          receiving_status?: string
          service_period_end?: string | null
          service_period_start?: string | null
          status?: string
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_supplier_fk"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_warehouse_fk"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
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
          posted_by: string | null
          quantity: number
          reason: string | null
          reversal_id: string | null
          reversal_reference: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string | null
          tenant_id: string
          uom: string | null
          uom_factor: number | null
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
          posted_by?: string | null
          quantity?: number
          reason?: string | null
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string | null
          tenant_id: string
          uom?: string | null
          uom_factor?: number | null
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
          posted_by?: string | null
          quantity?: number
          reason?: string | null
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string | null
          tenant_id?: string
          uom?: string | null
          uom_factor?: number | null
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
      inventory_config: {
        Row: {
          created_at: string
          id: string
          key: string
          tenant_id: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          tenant_id: string
          updated_at?: string
          value?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          tenant_id?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          posted_by: string | null
          quantity: number
          reversal_id: string | null
          reversal_reference: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string | null
          tenant_id: string
          to_warehouse_id: string | null
          uom: string | null
          uom_factor: number | null
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
          posted_by?: string | null
          quantity?: number
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string | null
          tenant_id: string
          to_warehouse_id?: string | null
          uom?: string | null
          uom_factor?: number | null
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
          posted_by?: string | null
          quantity?: number
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string | null
          tenant_id?: string
          to_warehouse_id?: string | null
          uom?: string | null
          uom_factor?: number | null
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
          posted_by: string | null
          reversal_id: string | null
          reversal_reference: string | null
          reversed_at: string | null
          reversed_by: string | null
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
          posted_by?: string | null
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
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
          posted_by?: string | null
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
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
      item_categories: {
        Row: {
          code: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          parent_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "item_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      item_lots: {
        Row: {
          certificate_ref: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expiry_date: string | null
          id: string
          initial_qty: number
          item_id: string
          location_id: string | null
          lot_number: string
          manufactured_date: string | null
          notes: string | null
          received_date: string | null
          source_ref_id: string | null
          source_ref_type: string | null
          status: string
          supplier_lot_ref: string | null
          tenant_id: string
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          certificate_ref?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expiry_date?: string | null
          id?: string
          initial_qty?: number
          item_id: string
          location_id?: string | null
          lot_number: string
          manufactured_date?: string | null
          notes?: string | null
          received_date?: string | null
          source_ref_id?: string | null
          source_ref_type?: string | null
          status?: string
          supplier_lot_ref?: string | null
          tenant_id: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          certificate_ref?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expiry_date?: string | null
          id?: string
          initial_qty?: number
          item_id?: string
          location_id?: string | null
          lot_number?: string
          manufactured_date?: string | null
          notes?: string | null
          received_date?: string | null
          source_ref_id?: string | null
          source_ref_type?: string | null
          status?: string
          supplier_lot_ref?: string | null
          tenant_id?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_lots_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_lots_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_lots_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_lots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_lots_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      item_serials: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          id: string
          issued_to_ref_id: string | null
          issued_to_ref_type: string | null
          item_id: string
          location_id: string | null
          lot_id: string | null
          manufactured_date: string | null
          notes: string | null
          production_order_id: string | null
          received_date: string | null
          received_from_ref_id: string | null
          received_from_ref_type: string | null
          serial_number: string
          status: string
          tenant_id: string
          updated_at: string
          warehouse_id: string | null
          warranty_end: string | null
          warranty_months: number | null
          warranty_start: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          id?: string
          issued_to_ref_id?: string | null
          issued_to_ref_type?: string | null
          item_id: string
          location_id?: string | null
          lot_id?: string | null
          manufactured_date?: string | null
          notes?: string | null
          production_order_id?: string | null
          received_date?: string | null
          received_from_ref_id?: string | null
          received_from_ref_type?: string | null
          serial_number: string
          status?: string
          tenant_id: string
          updated_at?: string
          warehouse_id?: string | null
          warranty_end?: string | null
          warranty_months?: number | null
          warranty_start?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          id?: string
          issued_to_ref_id?: string | null
          issued_to_ref_type?: string | null
          item_id?: string
          location_id?: string | null
          lot_id?: string | null
          manufactured_date?: string | null
          notes?: string | null
          production_order_id?: string | null
          received_date?: string | null
          received_from_ref_id?: string | null
          received_from_ref_type?: string | null
          serial_number?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          warehouse_id?: string | null
          warranty_end?: string | null
          warranty_months?: number | null
          warranty_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_serials_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_serials_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_serials_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_serials_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_serials_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "item_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_serials_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_serials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_serials_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          barcode: string | null
          brand: string | null
          category_id: string | null
          cogs_account_id: string | null
          cost: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          image_url: string | null
          inventory_account_id: string | null
          inventory_tracking: string
          manufacturer: string | null
          manufacturing_uom: string | null
          max_stock: number | null
          min_stock: number | null
          model: string | null
          name: string
          preferred_supplier_id: string | null
          price: number | null
          purchase_account_id: string | null
          purchase_description: string | null
          purchase_uom: string | null
          reorder: number | null
          reorder_qty: number | null
          safety_stock: number | null
          sales_account_id: string | null
          sales_description: string | null
          sales_uom: string | null
          search_vec: unknown
          sku: string | null
          standard_cost: number | null
          status: string
          stock: number | null
          supplier_lead_time_days: number | null
          tenant_id: string
          track_batches: boolean
          track_expiry: boolean
          track_inventory: boolean
          track_serials: boolean
          type: string | null
          uom: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          cogs_account_id?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          inventory_account_id?: string | null
          inventory_tracking?: string
          manufacturer?: string | null
          manufacturing_uom?: string | null
          max_stock?: number | null
          min_stock?: number | null
          model?: string | null
          name: string
          preferred_supplier_id?: string | null
          price?: number | null
          purchase_account_id?: string | null
          purchase_description?: string | null
          purchase_uom?: string | null
          reorder?: number | null
          reorder_qty?: number | null
          safety_stock?: number | null
          sales_account_id?: string | null
          sales_description?: string | null
          sales_uom?: string | null
          search_vec?: unknown
          sku?: string | null
          standard_cost?: number | null
          status?: string
          stock?: number | null
          supplier_lead_time_days?: number | null
          tenant_id: string
          track_batches?: boolean
          track_expiry?: boolean
          track_inventory?: boolean
          track_serials?: boolean
          type?: string | null
          uom?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          cogs_account_id?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          inventory_account_id?: string | null
          inventory_tracking?: string
          manufacturer?: string | null
          manufacturing_uom?: string | null
          max_stock?: number | null
          min_stock?: number | null
          model?: string | null
          name?: string
          preferred_supplier_id?: string | null
          price?: number | null
          purchase_account_id?: string | null
          purchase_description?: string | null
          purchase_uom?: string | null
          reorder?: number | null
          reorder_qty?: number | null
          safety_stock?: number | null
          sales_account_id?: string | null
          sales_description?: string | null
          sales_uom?: string | null
          search_vec?: unknown
          sku?: string | null
          standard_cost?: number | null
          status?: string
          stock?: number | null
          supplier_lead_time_days?: number | null
          tenant_id?: string
          track_batches?: boolean
          track_expiry?: boolean
          track_inventory?: boolean
          track_serials?: boolean
          type?: string | null
          uom?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "item_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_cogs_account_id_fkey"
            columns: ["cogs_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_inventory_account_id_fkey"
            columns: ["inventory_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_preferred_supplier_id_fkey"
            columns: ["preferred_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_purchase_account_id_fkey"
            columns: ["purchase_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_sales_account_id_fkey"
            columns: ["sales_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
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
          posted_by: string | null
          reversal_reference: string | null
          reversed_at: string | null
          reversed_by: string | null
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
          posted_by?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
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
          posted_by?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
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
          location_id: string | null
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
          location_id?: string | null
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
          location_id?: string | null
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
            foreignKeyName: "package_lines_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
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
          delivered_at: string | null
          delivery_notes: string | null
          expected_delivery_date: string | null
          fulfillment_id: string | null
          height: number | null
          id: string
          length: number | null
          notes: string | null
          number: string | null
          packing_status: string
          posted_at: string | null
          received_by: string | null
          reversal_id: string | null
          sales_order_id: string | null
          shipment_status: string
          status: string | null
          tenant_id: string
          tracking: string | null
          updated_at: string
          voided_at: string | null
          voided_by: string | null
          warehouse_id: string | null
          weight: number | null
          width: number | null
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          delivered_at?: string | null
          delivery_notes?: string | null
          expected_delivery_date?: string | null
          fulfillment_id?: string | null
          height?: number | null
          id?: string
          length?: number | null
          notes?: string | null
          number?: string | null
          packing_status?: string
          posted_at?: string | null
          received_by?: string | null
          reversal_id?: string | null
          sales_order_id?: string | null
          shipment_status?: string
          status?: string | null
          tenant_id: string
          tracking?: string | null
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id?: string | null
          weight?: number | null
          width?: number | null
        }
        Update: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          delivered_at?: string | null
          delivery_notes?: string | null
          expected_delivery_date?: string | null
          fulfillment_id?: string | null
          height?: number | null
          id?: string
          length?: number | null
          notes?: string | null
          number?: string | null
          packing_status?: string
          posted_at?: string | null
          received_by?: string | null
          reversal_id?: string | null
          sales_order_id?: string | null
          shipment_status?: string
          status?: string | null
          tenant_id?: string
          tracking?: string | null
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id?: string | null
          weight?: number | null
          width?: number | null
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
            foreignKeyName: "packages_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: false
            referencedRelation: "sales_fulfillments"
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
      payment_allocations: {
        Row: {
          allocation_date: string
          amount: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          invoice_id: string
          payment_id: string
          tenant_id: string
        }
        Insert: {
          allocation_date?: string
          amount: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id: string
          payment_id: string
          tenant_id: string
        }
        Update: {
          allocation_date?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id?: string
          payment_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments_received"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          allocation_status: string
          amount: number | null
          bank_account_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          date: string | null
          deleted_at: string | null
          id: string
          mode: string | null
          notes: string | null
          number: string | null
          posted_at: string | null
          posted_by: string | null
          reference: string | null
          reversal_id: string | null
          reversal_reference: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
          supplier_id: string | null
          tenant_id: string
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          allocation_status?: string
          amount?: number | null
          bank_account_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          date?: string | null
          deleted_at?: string | null
          id?: string
          mode?: string | null
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reference?: string | null
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          supplier_id?: string | null
          tenant_id: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          allocation_status?: string
          amount?: number | null
          bank_account_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          date?: string | null
          deleted_at?: string | null
          id?: string
          mode?: string | null
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reference?: string | null
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_made_bank_account_fk"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
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
          currency: string | null
          customer_id: string | null
          date: string | null
          deleted_at: string | null
          id: string
          invoice_id: string | null
          mode: string | null
          notes: string | null
          number: string | null
          posted_at: string | null
          posted_by: string | null
          reference: string | null
          reversal_id: string | null
          reversal_reference: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
          tenant_id: string
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id?: string | null
          mode?: string | null
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reference?: string | null
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id?: string | null
          mode?: string | null
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reference?: string | null
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
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
            foreignKeyName: "payments_received_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
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
      plan_entitlements: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          feature_id: string
          id: string
          limit_value: number | null
          plan_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          feature_id: string
          id?: string
          limit_value?: number | null
          plan_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          feature_id?: string
          id?: string
          limit_value?: number | null
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_entitlements_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
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
          billing_interval: string
          code: string
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          is_public: boolean
          max_storage_gb: number | null
          max_users: number | null
          name: string
          price_usd: number
          sort_order: number
          trial_days: number
          updated_at: string
        }
        Insert: {
          billing_interval?: string
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          max_storage_gb?: number | null
          max_users?: number | null
          name: string
          price_usd?: number
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          max_storage_gb?: number | null
          max_users?: number | null
          name?: string
          price_usd?: number
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_active_sessions: {
        Row: {
          admin_email: string
          admin_role: string
          browser: string | null
          client_ip: unknown
          created_at: string
          device_type: string | null
          expires_at: string
          id: string
          last_active_at: string
          location_hint: string | null
          os: string | null
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          admin_email: string
          admin_role: string
          browser?: string | null
          client_ip?: unknown
          created_at?: string
          device_type?: string | null
          expires_at?: string
          id?: string
          last_active_at?: string
          location_hint?: string | null
          os?: string | null
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          admin_email?: string
          admin_role?: string
          browser?: string | null
          client_ip?: unknown
          created_at?: string
          device_type?: string | null
          expires_at?: string
          id?: string
          last_active_at?: string
          location_hint?: string | null
          os?: string | null
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          email: string
          failed_login_count: number
          full_name: string | null
          granted_at: string
          granted_by: string | null
          is_active: boolean
          last_failed_login_at: string | null
          last_seen_at: string | null
          locked_until: string | null
          mfa_enforced: boolean
          mfa_enrolled: boolean
          notes: string | null
          platform_role: string
          revoked_at: string | null
          session_revocation_nonce: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          failed_login_count?: number
          full_name?: string | null
          granted_at?: string
          granted_by?: string | null
          is_active?: boolean
          last_failed_login_at?: string | null
          last_seen_at?: string | null
          locked_until?: string | null
          mfa_enforced?: boolean
          mfa_enrolled?: boolean
          notes?: string | null
          platform_role?: string
          revoked_at?: string | null
          session_revocation_nonce?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          failed_login_count?: number
          full_name?: string | null
          granted_at?: string
          granted_by?: string | null
          is_active?: boolean
          last_failed_login_at?: string | null
          last_seen_at?: string | null
          locked_until?: string | null
          mfa_enforced?: boolean
          mfa_enrolled?: boolean
          notes?: string | null
          platform_role?: string
          revoked_at?: string | null
          session_revocation_nonce?: number
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
      platform_announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          starts_at: string | null
          target_plans: string[]
          title: string
          type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          starts_at?: string | null
          target_plans?: string[]
          title: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          starts_at?: string | null
          target_plans?: string[]
          title?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_api_metrics: {
        Row: {
          avg_latency_ms: number
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          method: string
          p95_latency_ms: number
          p99_latency_ms: number
          request_volume: number
          status_2xx: number
          status_4xx: number
          status_5xx: number
          window_end: string
          window_start: string
        }
        Insert: {
          avg_latency_ms?: number
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          method?: string
          p95_latency_ms?: number
          p99_latency_ms?: number
          request_volume?: number
          status_2xx?: number
          status_4xx?: number
          status_5xx?: number
          window_end?: string
          window_start?: string
        }
        Update: {
          avg_latency_ms?: number
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          method?: string
          p95_latency_ms?: number
          p99_latency_ms?: number
          request_volume?: number
          status_2xx?: number
          status_4xx?: number
          status_5xx?: number
          window_end?: string
          window_start?: string
        }
        Relationships: []
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
          severity: string
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
          severity?: string
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
          severity?: string
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
      platform_background_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          job_name: string
          max_retries: number
          payload: Json
          queue_name: string
          retry_count: number
          scheduled_at: string
          started_at: string | null
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          job_name: string
          max_retries?: number
          payload?: Json
          queue_name?: string
          retry_count?: number
          scheduled_at?: string
          started_at?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          job_name?: string
          max_retries?: number
          payload?: Json
          queue_name?: string
          retry_count?: number
          scheduled_at?: string
          started_at?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_background_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_error_logs: {
        Row: {
          client_ip: string | null
          created_at: string
          endpoint: string
          error_code: string | null
          error_message: string
          first_seen_at: string
          frequency_count: number
          id: string
          last_seen_at: string
          method: string
          resolution_note: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          stack_trace: string | null
          tenant_id: string | null
        }
        Insert: {
          client_ip?: string | null
          created_at?: string
          endpoint?: string
          error_code?: string | null
          error_message: string
          first_seen_at?: string
          frequency_count?: number
          id?: string
          last_seen_at?: string
          method?: string
          resolution_note?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          stack_trace?: string | null
          tenant_id?: string | null
        }
        Update: {
          client_ip?: string | null
          created_at?: string
          endpoint?: string
          error_code?: string | null
          error_message?: string
          first_seen_at?: string
          frequency_count?: number
          id?: string
          last_seen_at?: string
          method?: string
          resolution_note?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          stack_trace?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_error_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_gap_findings: {
        Row: {
          category: string
          code: string
          component: string | null
          created_at: string
          id: string
          imported_at: string
          observed_behavior: string | null
          owner: string | null
          priority: string
          route: string | null
          section: string
          source_document: string
          status: string
          title: string
          updated_at: string
          verification_notes: string | null
        }
        Insert: {
          category: string
          code: string
          component?: string | null
          created_at?: string
          id?: string
          imported_at?: string
          observed_behavior?: string | null
          owner?: string | null
          priority?: string
          route?: string | null
          section: string
          source_document?: string
          status?: string
          title: string
          updated_at?: string
          verification_notes?: string | null
        }
        Update: {
          category?: string
          code?: string
          component?: string | null
          created_at?: string
          id?: string
          imported_at?: string
          observed_behavior?: string | null
          owner?: string | null
          priority?: string
          route?: string | null
          section?: string
          source_document?: string
          status?: string
          title?: string
          updated_at?: string
          verification_notes?: string | null
        }
        Relationships: []
      }
      platform_login_activity: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          email: string
          failure_reason: string | null
          id: string
          ip_address: unknown
          risk_score: number | null
          status: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          email: string
          failure_reason?: string | null
          id?: string
          ip_address?: unknown
          risk_score?: number | null
          status: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string
          failure_reason?: string | null
          id?: string
          ip_address?: unknown
          risk_score?: number | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
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
      platform_settings: {
        Row: {
          category: string
          description: string | null
          is_secret: boolean
          key: string
          label: string
          type: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          category?: string
          description?: string | null
          is_secret?: boolean
          key: string
          label: string
          type?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          category?: string
          description?: string | null
          is_secret?: boolean
          key?: string
          label?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      platform_support_sessions: {
        Row: {
          admin_email: string
          admin_id: string
          authorised_by: string | null
          client_ip: string | null
          created_at: string
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          expires_at: string
          id: string
          is_revoked: boolean
          reason: string
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          started_at: string
          status: string
          target_tenant_id: string
          target_tenant_name: string
          target_user_email: string | null
          target_user_id: string | null
          target_user_name: string | null
          tenant_snapshot: Json
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          admin_email: string
          admin_id: string
          authorised_by?: string | null
          client_ip?: string | null
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          expires_at?: string
          id?: string
          is_revoked?: boolean
          reason: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          started_at?: string
          status?: string
          target_tenant_id: string
          target_tenant_name: string
          target_user_email?: string | null
          target_user_id?: string | null
          target_user_name?: string | null
          tenant_snapshot?: Json
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          admin_email?: string
          admin_id?: string
          authorised_by?: string | null
          client_ip?: string | null
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          expires_at?: string
          id?: string
          is_revoked?: boolean
          reason?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          started_at?: string
          status?: string
          target_tenant_id?: string
          target_tenant_name?: string
          target_user_email?: string | null
          target_user_id?: string | null
          target_user_name?: string | null
          tenant_snapshot?: Json
          updated_at?: string
          user_agent?: string | null
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
      platform_system_health: {
        Row: {
          component: string
          created_at: string
          id: string
          incident_message: string | null
          last_checked_at: string
          latency_ms: number | null
          metrics: Json
          status: string
          uptime_pct: number
        }
        Insert: {
          component: string
          created_at?: string
          id?: string
          incident_message?: string | null
          last_checked_at?: string
          latency_ms?: number | null
          metrics?: Json
          status?: string
          uptime_pct?: number
        }
        Update: {
          component?: string
          created_at?: string
          id?: string
          incident_message?: string | null
          last_checked_at?: string
          latency_ms?: number | null
          metrics?: Json
          status?: string
          uptime_pct?: number
        }
        Relationships: []
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
      procurement_match_tolerances: {
        Row: {
          amount_tolerance_pct: number
          created_at: string
          price_tolerance_pct: number
          quantity_tolerance_pct: number
          tax_tolerance_pct: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_tolerance_pct?: number
          created_at?: string
          price_tolerance_pct?: number
          quantity_tolerance_pct?: number
          tax_tolerance_pct?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_tolerance_pct?: number
          created_at?: string
          price_tolerance_pct?: number
          quantity_tolerance_pct?: number
          tax_tolerance_pct?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_match_tolerances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_entries: {
        Row: {
          created_at: string
          created_by: string | null
          entry_date: string
          entry_number: number
          id: string
          location_id: string | null
          lot_id: string | null
          lot_number: string | null
          movement_ids: Json | null
          notes: string | null
          operator_id: string | null
          production_order_id: string
          qty_produced: number
          qty_rework: number
          qty_scrap: number
          qty_waste: number
          status: string
          tenant_id: string
          total_cost: number
          unit_cost: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          entry_number?: number
          id?: string
          location_id?: string | null
          lot_id?: string | null
          lot_number?: string | null
          movement_ids?: Json | null
          notes?: string | null
          operator_id?: string | null
          production_order_id: string
          qty_produced: number
          qty_rework?: number
          qty_scrap?: number
          qty_waste?: number
          status?: string
          tenant_id: string
          total_cost?: number
          unit_cost?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          entry_number?: number
          id?: string
          location_id?: string | null
          lot_id?: string | null
          lot_number?: string | null
          movement_ids?: Json | null
          notes?: string | null
          operator_id?: string | null
          production_order_id?: string
          qty_produced?: number
          qty_rework?: number
          qty_scrap?: number
          qty_waste?: number
          status?: string
          tenant_id?: string
          total_cost?: number
          unit_cost?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_entries_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "item_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      production_order_costs: {
        Row: {
          actual_amount: number
          cost_type: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          planned_amount: number
          production_order_id: string
          source_ref_id: string | null
          source_ref_type: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          actual_amount?: number
          cost_type: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          planned_amount?: number
          production_order_id: string
          source_ref_id?: string | null
          source_ref_type?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          actual_amount?: number
          cost_type?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          planned_amount?: number
          production_order_id?: string
          source_ref_id?: string | null
          source_ref_type?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_order_costs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_costs_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_costs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          allow_overproduction: boolean
          approved_at: string | null
          approved_by: string | null
          bom_id: string | null
          bom_version_snapshot: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          closed_at: string | null
          closed_by: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          date: string
          deleted_at: string | null
          id: string
          location_id: string | null
          manufacturing_type: string
          notes: string | null
          number: string
          pause_reason: string | null
          paused_at: string | null
          paused_by: string | null
          planned_end: string | null
          planned_start: string | null
          posted_at: string | null
          posted_by: string | null
          priority: number
          product_id: string | null
          qty_produced: number
          qty_remaining: number
          quality_check_at: string | null
          quality_check_by: string | null
          quality_notes: string | null
          quantity: number
          quantity_uom: string | null
          released_at: string | null
          released_by: string | null
          reserved_at: string | null
          reserved_by: string | null
          reversal_id: string | null
          reversal_reference: string | null
          reversed_at: string | null
          reversed_by: string | null
          source_id: string | null
          source_type: string
          status: string | null
          tenant_id: string
          uom_factor: number | null
          updated_at: string
          voided_at: string | null
          voided_by: string | null
          warehouse_id: string | null
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          allow_overproduction?: boolean
          approved_at?: string | null
          approved_by?: string | null
          bom_id?: string | null
          bom_version_snapshot?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          closed_at?: string | null
          closed_by?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          date?: string
          deleted_at?: string | null
          id?: string
          location_id?: string | null
          manufacturing_type?: string
          notes?: string | null
          number: string
          pause_reason?: string | null
          paused_at?: string | null
          paused_by?: string | null
          planned_end?: string | null
          planned_start?: string | null
          posted_at?: string | null
          posted_by?: string | null
          priority?: number
          product_id?: string | null
          qty_produced?: number
          qty_remaining?: number
          quality_check_at?: string | null
          quality_check_by?: string | null
          quality_notes?: string | null
          quantity?: number
          quantity_uom?: string | null
          released_at?: string | null
          released_by?: string | null
          reserved_at?: string | null
          reserved_by?: string | null
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          source_id?: string | null
          source_type?: string
          status?: string | null
          tenant_id: string
          uom_factor?: number | null
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id?: string | null
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          allow_overproduction?: boolean
          approved_at?: string | null
          approved_by?: string | null
          bom_id?: string | null
          bom_version_snapshot?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          closed_at?: string | null
          closed_by?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          date?: string
          deleted_at?: string | null
          id?: string
          location_id?: string | null
          manufacturing_type?: string
          notes?: string | null
          number?: string
          pause_reason?: string | null
          paused_at?: string | null
          paused_by?: string | null
          planned_end?: string | null
          planned_start?: string | null
          posted_at?: string | null
          posted_by?: string | null
          priority?: number
          product_id?: string | null
          qty_produced?: number
          qty_remaining?: number
          quality_check_at?: string | null
          quality_check_by?: string | null
          quality_notes?: string | null
          quantity?: number
          quantity_uom?: string | null
          released_at?: string | null
          released_by?: string | null
          reserved_at?: string | null
          reserved_by?: string | null
          reversal_id?: string | null
          reversal_reference?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          source_id?: string | null
          source_type?: string
          status?: string | null
          tenant_id?: string
          uom_factor?: number | null
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bom_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_paused_by_fkey"
            columns: ["paused_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "production_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_quality_check_by_fkey"
            columns: ["quality_check_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_reserved_by_fkey"
            columns: ["reserved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          is_active: boolean
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
          is_active?: boolean
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
          is_active?: boolean
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
          billing_status: string
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
          payment_status: string
          receiving_status: string
          search_vec: unknown
          source_requisition_id: string | null
          status: string | null
          subtotal: number
          supplier_id: string | null
          tax_total: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          billing_status?: string
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
          payment_status?: string
          receiving_status?: string
          search_vec?: unknown
          source_requisition_id?: string | null
          status?: string | null
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          billing_status?: string
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
          payment_status?: string
          receiving_status?: string
          search_vec?: unknown
          source_requisition_id?: string | null
          status?: string | null
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_source_requisition_fk"
            columns: ["source_requisition_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
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
          approved_at: string | null
          approved_by: string | null
          converted_adjustment_ids: string[]
          converted_po_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          date: string | null
          deleted_at: string | null
          department: string | null
          discount_total: number
          from_warehouse_id: string | null
          grand_total: number
          id: string
          notes: string | null
          number: string | null
          requested_by: string | null
          required_date: string | null
          requisition_type: string
          status: string | null
          subtotal: number
          supplier_id: string | null
          tax_total: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          converted_adjustment_ids?: string[]
          converted_po_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          date?: string | null
          deleted_at?: string | null
          department?: string | null
          discount_total?: number
          from_warehouse_id?: string | null
          grand_total?: number
          id?: string
          notes?: string | null
          number?: string | null
          requested_by?: string | null
          required_date?: string | null
          requisition_type?: string
          status?: string | null
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          converted_adjustment_ids?: string[]
          converted_po_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          date?: string | null
          deleted_at?: string | null
          department?: string | null
          discount_total?: number
          from_warehouse_id?: string | null
          grand_total?: number
          id?: string
          notes?: string | null
          number?: string | null
          requested_by?: string | null
          required_date?: string | null
          requisition_type?: string
          status?: string | null
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisitions_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
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
      sales_fulfillment_lines: {
        Row: {
          backordered_quantity: number
          created_at: string
          deleted_at: string | null
          delivered_quantity: number
          fulfillment_id: string
          fulfillment_quantity: number
          id: string
          location_id: string | null
          ordered_quantity: number
          packed_quantity: number
          picked_quantity: number
          product_id: string | null
          rejected_quantity: number
          sales_order_line_id: string
          shipped_quantity: number
          tenant_id: string
          unit: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          backordered_quantity?: number
          created_at?: string
          deleted_at?: string | null
          delivered_quantity?: number
          fulfillment_id: string
          fulfillment_quantity: number
          id?: string
          location_id?: string | null
          ordered_quantity?: number
          packed_quantity?: number
          picked_quantity?: number
          product_id?: string | null
          rejected_quantity?: number
          sales_order_line_id: string
          shipped_quantity?: number
          tenant_id: string
          unit?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          backordered_quantity?: number
          created_at?: string
          deleted_at?: string | null
          delivered_quantity?: number
          fulfillment_id?: string
          fulfillment_quantity?: number
          id?: string
          location_id?: string | null
          ordered_quantity?: number
          packed_quantity?: number
          picked_quantity?: number
          product_id?: string | null
          rejected_quantity?: number
          sales_order_line_id?: string
          shipped_quantity?: number
          tenant_id?: string
          unit?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_fulfillment_lines_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: false
            referencedRelation: "sales_fulfillments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fulfillment_lines_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fulfillment_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "sales_fulfillment_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fulfillment_lines_sales_order_line_id_fkey"
            columns: ["sales_order_line_id"]
            isOneToOne: false
            referencedRelation: "sales_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fulfillment_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fulfillment_lines_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_fulfillments: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          fulfillment_number: string
          id: string
          notes: string | null
          promised_date: string | null
          requested_date: string | null
          sales_order_id: string
          started_at: string | null
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          warehouse_id: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          fulfillment_number: string
          id?: string
          notes?: string | null
          promised_date?: string | null
          requested_date?: string | null
          sales_order_id: string
          started_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          fulfillment_number?: string
          id?: string
          notes?: string | null
          promised_date?: string | null
          requested_date?: string | null
          sales_order_id?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_fulfillments_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fulfillments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fulfillments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
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
          fulfillment_status: string
          grand_total: number
          id: string
          invoice_status: string
          items_count: number | null
          notes: string | null
          number: string | null
          payment_status: string
          promised_date: string | null
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
          fulfillment_status?: string
          grand_total?: number
          id?: string
          invoice_status?: string
          items_count?: number | null
          notes?: string | null
          number?: string | null
          payment_status?: string
          promised_date?: string | null
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
          fulfillment_status?: string
          grand_total?: number
          id?: string
          invoice_status?: string
          items_count?: number | null
          notes?: string | null
          number?: string | null
          payment_status?: string
          promised_date?: string | null
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
          payment_terms: string | null
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
          payment_terms?: string | null
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
          payment_terms?: string | null
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
      shipment_sales_orders: {
        Row: {
          created_at: string
          id: string
          sales_order_id: string
          shipment_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          sales_order_id: string
          shipment_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          sales_order_id?: string
          shipment_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_sales_orders_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_sales_orders_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_sales_orders_tenant_id_fkey"
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
          delivery_notes: string | null
          estimated_delivery_date: string | null
          fulfillment_id: string | null
          id: string
          notes: string | null
          number: string | null
          package_id: string | null
          posted_at: string | null
          received_by: string | null
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
          delivery_notes?: string | null
          estimated_delivery_date?: string | null
          fulfillment_id?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          package_id?: string | null
          posted_at?: string | null
          received_by?: string | null
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
          delivery_notes?: string | null
          estimated_delivery_date?: string | null
          fulfillment_id?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          package_id?: string | null
          posted_at?: string | null
          received_by?: string | null
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
            foreignKeyName: "shipments_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: false
            referencedRelation: "sales_fulfillments"
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
          location_id: string | null
          lot_id: string | null
          note: string | null
          quantity: number
          ref_id: string | null
          ref_type: string
          serial_id: string | null
          source_quantity: number | null
          source_uom: string | null
          tenant_id: string
          unit_cost: number
          uom: string | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          location_id?: string | null
          lot_id?: string | null
          note?: string | null
          quantity: number
          ref_id?: string | null
          ref_type: string
          serial_id?: string | null
          source_quantity?: number | null
          source_uom?: string | null
          tenant_id: string
          unit_cost?: number
          uom?: string | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          location_id?: string | null
          lot_id?: string | null
          note?: string | null
          quantity?: number
          ref_id?: string | null
          ref_type?: string
          serial_id?: string | null
          source_quantity?: number | null
          source_uom?: string | null
          tenant_id?: string
          unit_cost?: number
          uom?: string | null
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
            foreignKeyName: "stock_movements_location_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "item_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_serial_id_fkey"
            columns: ["serial_id"]
            isOneToOne: false
            referencedRelation: "item_serials"
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
      stock_reservations: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          item_id: string
          location_id: string | null
          quantity: number
          ref_id: string | null
          ref_type: string | null
          status: string
          tenant_id: string
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          item_id: string
          location_id?: string | null
          quantity?: number
          ref_id?: string | null
          ref_type?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          item_id?: string
          location_id?: string | null
          quantity?: number
          ref_id?: string | null
          ref_type?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_reservations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_reservations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_credit_note_applications: {
        Row: {
          amount: number
          application_date: string
          bill_id: string
          created_at: string
          created_by: string | null
          credit_note_id: string
          deleted_at: string | null
          id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          application_date?: string
          bill_id: string
          created_at?: string
          created_by?: string | null
          credit_note_id: string
          deleted_at?: string | null
          id?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          application_date?: string
          bill_id?: string
          created_at?: string
          created_by?: string | null
          credit_note_id?: string
          deleted_at?: string | null
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_credit_note_applications_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credit_note_applications_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "supplier_credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credit_note_applications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_credit_notes: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          date: string
          deleted_at: string | null
          id: string
          notes: string | null
          number: string | null
          posted_at: string | null
          status: string
          supplier_id: string
          tenant_id: string
          total: number
          voided_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency: string
          date?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          status?: string
          supplier_id: string
          tenant_id: string
          total: number
          voided_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          date?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          posted_at?: string | null
          status?: string
          supplier_id?: string
          tenant_id?: string
          total?: number
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_credit_notes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credit_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payment_allocations: {
        Row: {
          allocation_date: string
          amount: number
          bill_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          payment_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allocation_date?: string
          amount: number
          bill_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          payment_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allocation_date?: string
          amount?: number
          bill_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          payment_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payment_allocations_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments_made"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payment_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payment_reconciliation_queue: {
        Row: {
          created_at: string
          id: string
          payment_id: string
          reason: string
          resolved_at: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payment_id: string
          reason: string
          resolved_at?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payment_id?: string
          reason?: string
          resolved_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payment_reconciliation_queue_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments_made"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payment_reconciliation_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      tenant_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          revoked_by: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_currencies: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          exchange_rate: number
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          exchange_rate?: number
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          exchange_rate?: number
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_currencies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_document_numbering: {
        Row: {
          created_at: string
          deleted_at: string | null
          document_type: string
          id: string
          is_active: boolean
          next_number: number
          prefix: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          document_type: string
          id?: string
          is_active?: boolean
          next_number?: number
          prefix?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          document_type?: string
          id?: string
          is_active?: boolean
          next_number?: number
          prefix?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_document_numbering_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          feature: string
          reason: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature: string
          reason?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature?: string
          reason?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_feature_flags_tenant_id_fkey"
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
      tenant_invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          expires_at: string
          id: string
          invited_by: string
          invited_email: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          expires_at: string
          id?: string
          invited_by: string
          invited_email: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_email?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_notification_preferences: {
        Row: {
          audience: string
          channels: string[]
          created_at: string
          deleted_at: string | null
          event: string
          id: string
          is_active: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          audience: string
          channels?: string[]
          created_at?: string
          deleted_at?: string | null
          event: string
          id?: string
          is_active?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          audience?: string
          channels?: string[]
          created_at?: string
          deleted_at?: string | null
          event?: string
          id?: string
          is_active?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_notification_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_payment_terms: {
        Row: {
          created_at: string
          days_due: number
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          days_due: number
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          days_due?: number
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_payment_terms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_role_permission_overrides: {
        Row: {
          enabled: boolean
          permission_code: string
          role: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled: boolean
          permission_code: string
          role: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          permission_code?: string
          role?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_role_permission_overrides_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "tenant_role_permission_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_role_record_restrictions: {
        Row: {
          allowed: boolean
          record_id: string
          record_type: string
          role: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed?: boolean
          record_id: string
          record_type: string
          role: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed?: boolean
          record_id?: string
          record_type?: string
          role?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_role_record_restrictions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscriptions: {
        Row: {
          amount: number | null
          billing_interval: string
          cancel_at_period_end: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          current_period_end: string | null
          current_period_start: string
          external_id: string | null
          external_meta: Json
          id: string
          notes: string | null
          override_max_storage: number | null
          override_max_users: number | null
          payment_status: string
          plan_id: string
          status: string
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          billing_interval?: string
          cancel_at_period_end?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          current_period_end?: string | null
          current_period_start?: string
          external_id?: string | null
          external_meta?: Json
          id?: string
          notes?: string | null
          override_max_storage?: number | null
          override_max_users?: number | null
          payment_status?: string
          plan_id: string
          status?: string
          tenant_id: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          billing_interval?: string
          cancel_at_period_end?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          current_period_end?: string | null
          current_period_start?: string
          external_id?: string | null
          external_meta?: Json
          id?: string
          notes?: string | null
          override_max_storage?: number | null
          override_max_users?: number | null
          payment_status?: string
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
          address_line1: string | null
          address_line2: string | null
          business_type: string | null
          city: string | null
          country: string | null
          created_at: string
          currency: string
          currency_symbol: string | null
          date_format: string | null
          deleted_at: string | null
          description: string | null
          email: string | null
          fiscal_year_end: string | null
          fiscal_year_start: string | null
          id: string
          industry: string | null
          legal_name: string | null
          logo_url: string | null
          name: string
          number_format: string | null
          phone: string | null
          postal_code: string | null
          registration_number: string | null
          signature_url: string | null
          slug: string
          stamp_url: string | null
          state_province: string | null
          status: string
          tax_authority: string | null
          tax_id: string | null
          tax_inclusive_pricing: boolean | null
          tax_regime: string | null
          timezone: string | null
          trading_name: string | null
          updated_at: string
          vat_number: string | null
          website: string | null
          year_established: number | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          business_type?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          currency_symbol?: string | null
          date_format?: string | null
          deleted_at?: string | null
          description?: string | null
          email?: string | null
          fiscal_year_end?: string | null
          fiscal_year_start?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          logo_url?: string | null
          name: string
          number_format?: string | null
          phone?: string | null
          postal_code?: string | null
          registration_number?: string | null
          signature_url?: string | null
          slug: string
          stamp_url?: string | null
          state_province?: string | null
          status?: string
          tax_authority?: string | null
          tax_id?: string | null
          tax_inclusive_pricing?: boolean | null
          tax_regime?: string | null
          timezone?: string | null
          trading_name?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
          year_established?: number | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          business_type?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          currency_symbol?: string | null
          date_format?: string | null
          deleted_at?: string | null
          description?: string | null
          email?: string | null
          fiscal_year_end?: string | null
          fiscal_year_start?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          number_format?: string | null
          phone?: string | null
          postal_code?: string | null
          registration_number?: string | null
          signature_url?: string | null
          slug?: string
          stamp_url?: string | null
          state_province?: string | null
          status?: string
          tax_authority?: string | null
          tax_id?: string | null
          tax_inclusive_pricing?: boolean | null
          tax_regime?: string | null
          timezone?: string | null
          trading_name?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
          year_established?: number | null
        }
        Relationships: []
      }
      units_of_measure: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          decimal_places: number
          deleted_at: string | null
          id: string
          is_active: boolean
          is_base_unit: boolean
          name: string
          notes: string | null
          symbol: string | null
          tenant_id: string
          uom_class: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          decimal_places?: number
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_base_unit?: boolean
          name: string
          notes?: string | null
          symbol?: string | null
          tenant_id: string
          uom_class?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          decimal_places?: number
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_base_unit?: boolean
          name?: string
          notes?: string | null
          symbol?: string | null
          tenant_id?: string
          uom_class?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_of_measure_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      uom_conversions: {
        Row: {
          created_at: string
          deleted_at: string | null
          factor: number
          from_uom: string
          id: string
          item_id: string | null
          tenant_id: string
          to_uom: string
          uom_class: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          factor: number
          from_uom: string
          id?: string
          item_id?: string | null
          tenant_id: string
          to_uom: string
          uom_class?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          factor?: number
          from_uom?: string
          id?: string
          item_id?: string | null
          tenant_id?: string
          to_uom?: string
          uom_class?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uom_conversions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "uom_conversions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uom_conversions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      warehouse_locations: {
        Row: {
          aisle: string | null
          bin: string | null
          code: string
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          level: string | null
          name: string | null
          rack: string | null
          tenant_id: string
          updated_at: string
          warehouse_id: string
          zone_id: string | null
        }
        Insert: {
          aisle?: string | null
          bin?: string | null
          code: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          level?: string | null
          name?: string | null
          rack?: string | null
          tenant_id: string
          updated_at?: string
          warehouse_id: string
          zone_id?: string | null
        }
        Update: {
          aisle?: string | null
          bin?: string | null
          code?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          level?: string | null
          name?: string | null
          rack?: string | null
          tenant_id?: string
          updated_at?: string
          warehouse_id?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_locations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_locations_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "warehouse_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_zones: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          tenant_id: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_zones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_zones_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          capacity_sqm: number | null
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
          capacity_sqm?: number | null
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
          capacity_sqm?: number | null
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
          brand: string | null
          category_id: string | null
          cost: number | null
          item_id: string | null
          manufacturer: string | null
          max_stock: number | null
          min_stock: number | null
          name: string | null
          on_hand: number | null
          price: number | null
          reorder: number | null
          reorder_qty: number | null
          safety_stock: number | null
          sku: string | null
          standard_cost: number | null
          status: string | null
          tenant_id: string | null
          type: string | null
          uom: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "item_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_location_stock: {
        Row: {
          aisle: string | null
          bin: string | null
          item_id: string | null
          level: string | null
          location_code: string | null
          location_id: string | null
          on_hand: number | null
          rack: string | null
          tenant_id: string | null
          warehouse_id: string | null
          zone_name: string | null
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
            foreignKeyName: "stock_movements_location_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
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
      _resolve_stock_qty: {
        Args: {
          _doc_uom: string
          _item_id: string
          _qty: number
          _tenant_id: string
        }
        Returns: number
      }
      _vat_accounts: {
        Args: { _tenant_id: string }
        Returns: {
          input_vat: string
          output_vat: string
        }[]
      }
      accept_tenant_invitation: { Args: { _token: string }; Returns: string }
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
      activate_bom: { Args: { _bom_id: string }; Returns: undefined }
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
      admin_cancel_background_job: {
        Args: { _job_id: string }
        Returns: undefined
      }
      admin_cancel_subscription: {
        Args: {
          _cancellation_reason?: string
          _immediate?: boolean
          _reason?: string
          _subscription_id: string
        }
        Returns: Json
      }
      admin_change_subscription_plan: {
        Args: {
          _new_plan_id: string
          _notes?: string
          _reason?: string
          _subscription_id: string
        }
        Returns: Json
      }
      admin_create_announcement: {
        Args: {
          _body: string
          _ends_at?: string
          _is_active?: boolean
          _starts_at?: string
          _target_plans?: string[]
          _title: string
          _type?: string
        }
        Returns: string
      }
      admin_delete_announcement: { Args: { _id: string }; Returns: undefined }
      admin_extend_subscription_trial: {
        Args: {
          _days?: number
          _new_trial_end?: string
          _reason?: string
          _subscription_id: string
        }
        Returns: Json
      }
      admin_get_api_monitoring_metrics: {
        Args: { _timeframe?: string }
        Returns: {
          avg_latency_ms: number
          endpoint: string
          error_rate_pct: number
          failure_count: number
          method: string
          p95_latency_ms: number
          p99_latency_ms: number
          request_volume: number
          status_2xx: number
          status_4xx: number
          status_5xx: number
        }[]
      }
      admin_get_flag_history: { Args: { _flag_code: string }; Returns: Json }
      admin_get_platform_audit_stats: {
        Args: never
        Returns: {
          active_admins_24h: number
          critical_events: number
          events_24h: number
          high_events: number
          support_sessions: number
          total_events: number
        }[]
      }
      admin_get_security_center_overview: {
        Args: never
        Returns: {
          active_admins: number
          active_sessions_count: number
          active_support_sessions: number
          critical_events_count: number
          disabled_admins: number
          failed_logins_24h: number
          high_risk_logins_24h: number
          mfa_compliance_rate: number
          mfa_enrolled_admins: number
          system_security_posture: string
          total_admins: number
          unresolved_security_events: number
        }[]
      }
      admin_get_sessions: {
        Args: { _limit?: number }
        Returns: {
          aal: string
          created_at: string
          factor_id: string
          id: string
          ip: unknown
          not_after: string
          refreshed_at: string
          tag: string
          updated_at: string
          user_agent: string
          user_id: string
        }[]
      }
      admin_get_subscription_detail: {
        Args: { _subscription_id: string }
        Returns: Json
      }
      admin_get_support_session_actions: {
        Args: { _session_id: string }
        Returns: {
          action: string
          actor_email: string
          created_at: string
          detail: Json
          id: string
          ip_address: unknown
          target_id: string
          target_label: string
          target_type: string
          user_agent: string
        }[]
      }
      admin_get_system_health: {
        Args: never
        Returns: {
          component: string
          incident_message: string
          last_checked_at: string
          latency_ms: number
          metrics: Json
          status: string
          uptime_pct: number
        }[]
      }
      admin_get_user_activity: {
        Args: { _limit?: number; _tenant_id: string; _user_id: string }
        Returns: {
          created_at: string
          details: Json
          entity_id: string
          entity_type: string
          event_type: string
          source: string
        }[]
      }
      admin_grant_platform_access: {
        Args: { _notes?: string; _platform_role?: string; _user_id: string }
        Returns: undefined
      }
      admin_list_background_jobs: {
        Args: {
          _limit?: number
          _offset?: number
          _queue?: string
          _search?: string
          _status?: string
        }
        Returns: {
          completed_at: string
          created_at: string
          duration_ms: number
          error_message: string
          id: string
          job_name: string
          max_retries: number
          payload: Json
          queue_name: string
          retry_count: number
          scheduled_at: string
          started_at: string
          status: string
          tenant_id: string
          tenant_name: string
          total_count: number
        }[]
      }
      admin_list_error_logs: {
        Args: {
          _limit?: number
          _offset?: number
          _resolved?: boolean
          _search?: string
          _severity?: string
          _tenant_id?: string
        }
        Returns: {
          client_ip: string
          endpoint: string
          error_code: string
          error_message: string
          first_seen_at: string
          frequency_count: number
          id: string
          last_seen_at: string
          method: string
          resolution_note: string
          resolved: boolean
          resolved_at: string
          severity: string
          stack_trace: string
          tenant_id: string
          tenant_name: string
          total_count: number
        }[]
      }
      admin_list_feature_flags: { Args: never; Returns: Json }
      admin_list_login_activity: {
        Args: {
          _from?: string
          _limit?: number
          _offset?: number
          _risk_only?: boolean
          _search?: string
          _status?: string
          _to?: string
        }
        Returns: {
          city: string
          country: string
          created_at: string
          email: string
          failure_reason: string
          id: string
          ip_address: unknown
          risk_score: number
          status: string
          total_count: number
          user_agent: string
          user_id: string
        }[]
      }
      admin_list_plans_and_features: { Args: never; Returns: Json }
      admin_list_platform_admins: {
        Args: {
          _limit?: number
          _offset?: number
          _role?: string
          _search?: string
          _status?: string
        }
        Returns: {
          active_sessions: number
          email: string
          failed_logins: number
          full_name: string
          granted_at: string
          is_active: boolean
          last_seen_at: string
          mfa_enforced: boolean
          mfa_enrolled: boolean
          notes: string
          platform_role: string
          total_count: number
          user_id: string
        }[]
      }
      admin_list_platform_audit_logs: {
        Args: {
          _action?: string
          _actor_email?: string
          _from?: string
          _limit?: number
          _offset?: number
          _search?: string
          _severity?: string
          _tenant_id?: string
          _to?: string
        }
        Returns: {
          acting_as_tenant_id: string
          action: string
          actor_email: string
          actor_id: string
          actor_role: string
          created_at: string
          detail: Json
          id: string
          ip_address: unknown
          severity: string
          support_session_id: string
          target_id: string
          target_label: string
          target_type: string
          tenant_name: string
          total_count: number
          user_agent: string
        }[]
      }
      admin_list_platform_sessions: {
        Args: {
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
          _user_id?: string
        }
        Returns: {
          admin_email: string
          admin_role: string
          browser: string
          client_ip: unknown
          created_at: string
          device_type: string
          expires_at: string
          id: string
          last_active_at: string
          location_hint: string
          minutes_remaining: number
          os: string
          revocation_reason: string
          revoked_at: string
          status: string
          total_count: number
          user_agent: string
          user_id: string
        }[]
      }
      admin_list_security_events: {
        Args: {
          _limit?: number
          _offset?: number
          _resolved?: boolean
          _search?: string
          _severity?: string
        }
        Returns: {
          actor_email: string
          actor_id: string
          created_at: string
          detail: Json
          event_type: string
          id: string
          ip_address: unknown
          resolution_note: string
          resolved: boolean
          resolved_at: string
          resolved_by: string
          severity: string
          tenant_id: string
          tenant_name: string
          total_count: number
          user_agent: string
        }[]
      }
      admin_list_support_sessions: {
        Args: {
          _admin_id?: string
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
          _tenant_id?: string
        }
        Returns: {
          actions_count: number
          admin_email: string
          admin_id: string
          admin_name: string
          client_ip: string
          end_reason: string
          ended_at: string
          expires_at: string
          id: string
          is_revoked: boolean
          minutes_remaining: number
          reason: string
          revoked_at: string
          started_at: string
          status: string
          target_tenant_id: string
          target_tenant_name: string
          target_user_email: string
          target_user_id: string
          target_user_name: string
          total_count: number
          user_agent: string
        }[]
      }
      admin_list_tenant_permission_matrices: { Args: never; Returns: Json }
      admin_list_tenant_subscriptions: {
        Args: {
          _limit?: number
          _offset?: number
          _payment_status?: string
          _plan_id?: string
          _search?: string
          _status?: string
        }
        Returns: {
          amount: number
          billing_interval: string
          cancel_at_period_end: boolean
          cancellation_reason: string
          cancelled_at: string
          created_at: string
          currency: string
          current_period_end: string
          current_period_start: string
          id: string
          is_trialing: boolean
          notes: string
          payment_status: string
          plan_code: string
          plan_id: string
          plan_name: string
          plan_price: number
          status: string
          tenant_id: string
          tenant_name: string
          tenant_slug: string
          total_count: number
          trial_days_remaining: number
          trial_ends_at: string
          updated_at: string
        }[]
      }
      admin_ping: { Args: never; Returns: boolean }
      admin_ping_system_component: {
        Args: { _component: string }
        Returns: Json
      }
      admin_reactivate_subscription: {
        Args: { _reason?: string; _subscription_id: string }
        Returns: Json
      }
      admin_remove_tenant_user: {
        Args: { _reason?: string; _tenant_id: string; _user_id: string }
        Returns: Json
      }
      admin_resolve_error_log: {
        Args: { _error_id: string; _resolution_note?: string }
        Returns: undefined
      }
      admin_resolve_security_event: {
        Args: { _event_id: string; _resolution_note?: string }
        Returns: undefined
      }
      admin_retry_background_job: {
        Args: { _job_id: string }
        Returns: undefined
      }
      admin_revoke_all_admin_sessions: {
        Args: { _reason?: string; _user_id: string }
        Returns: number
      }
      admin_revoke_platform_access: {
        Args: { _reason?: string; _user_id: string }
        Returns: undefined
      }
      admin_revoke_platform_session: {
        Args: { _reason?: string; _session_id: string }
        Returns: undefined
      }
      admin_revoke_session: {
        Args: { _reason?: string; _session_id: string }
        Returns: undefined
      }
      admin_revoke_tenant_user_sessions: {
        Args: { _reason?: string; _tenant_id: string; _user_id: string }
        Returns: Json
      }
      admin_save_feature: { Args: { _payload: Json }; Returns: Json }
      admin_save_feature_flag: {
        Args: { _payload: Json; _reason?: string }
        Returns: Json
      }
      admin_save_plan: { Args: { _payload: Json }; Returns: Json }
      admin_save_plan_entitlements: {
        Args: { _entitlements: Json; _plan_id: string; _reason?: string }
        Returns: Json
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
      admin_set_plan_status: {
        Args: { _is_active: boolean; _plan_id: string; _reason?: string }
        Returns: Json
      }
      admin_set_platform_admin_role: {
        Args: { _admin_id: string; _new_role: string; _reason?: string }
        Returns: undefined
      }
      admin_set_platform_admin_status: {
        Args: { _admin_id: string; _is_active: boolean; _reason?: string }
        Returns: undefined
      }
      admin_set_platform_setting: {
        Args: { _key: string; _value: string }
        Returns: undefined
      }
      admin_set_tenant_flag_override: {
        Args: {
          _enabled: boolean
          _flag_code: string
          _reason?: string
          _tenant_id: string
        }
        Returns: Json
      }
      admin_set_tenant_plan: {
        Args: { _notes?: string; _plan_id: string; _tenant_id: string }
        Returns: string
      }
      admin_set_tenant_role_permission_override: {
        Args: {
          _enabled: boolean
          _permission_code: string
          _role: string
          _tenant_id: string
        }
        Returns: undefined
      }
      admin_set_tenant_status: {
        Args: { _new_status: string; _reason?: string; _tenant_id: string }
        Returns: undefined
      }
      admin_set_tenant_user_roles: {
        Args: {
          _reason?: string
          _roles: string[]
          _tenant_id: string
          _user_id: string
        }
        Returns: Json
      }
      admin_set_tenant_user_status: {
        Args: {
          _is_active: boolean
          _reason?: string
          _tenant_id: string
          _user_id: string
        }
        Returns: Json
      }
      admin_set_user_roles: {
        Args: {
          new_roles: Database["public"]["Enums"]["app_role"][]
          target_user: string
        }
        Returns: undefined
      }
      admin_suspend_subscription: {
        Args: { _reason?: string; _subscription_id: string }
        Returns: Json
      }
      admin_toggle_feature_flag: {
        Args: { _enabled: boolean; _flag_id: string; _reason?: string }
        Returns: Json
      }
      admin_update_announcement: {
        Args: {
          _body: string
          _ends_at?: string
          _id: string
          _is_active: boolean
          _starts_at?: string
          _target_plans?: string[]
          _title: string
          _type: string
        }
        Returns: undefined
      }
      allocate_customer_payment: {
        Args: { _allocations: Json; _payment_id: string }
        Returns: number
      }
      allocate_supplier_payment:
        | { Args: { _allocations: Json; _payment_id: string }; Returns: number }
        | {
            Args: { _amount: number; _bill_id: string; _payment_id: string }
            Returns: number
          }
      apply_payment: {
        Args: { _allocations: Json; _payment_id: string }
        Returns: undefined
      }
      apply_payment_made: {
        Args: { _allocations: Json; _payment_id: string }
        Returns: undefined
      }
      apply_supplier_credit_note: {
        Args: { _amount: number; _bill_id: string; _credit_note_id: string }
        Returns: string
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
      approve_bom: { Args: { _bom_id: string }; Returns: undefined }
      approve_expense: {
        Args: { _expense_id: string; _reason?: string }
        Returns: string
      }
      approve_production_order: {
        Args: { _order_id: string }
        Returns: undefined
      }
      approve_reimbursement: {
        Args: { _reimbursement_id: string }
        Returns: string
      }
      approve_stock_requisition: {
        Args: { _req_id: string }
        Returns: string[]
      }
      archive_bom: { Args: { _bom_id: string }; Returns: string }
      assert_period_open: {
        Args: { _date: string; _tenant_id: string }
        Returns: undefined
      }
      audit_request_ip: { Args: never; Returns: unknown }
      audit_request_user_agent: { Args: never; Returns: string }
      begin_support_session: {
        Args: {
          _client_ip?: string
          _reason: string
          _target_tenant_id: string
          _target_user_id?: string
          _ttl_minutes?: number
          _user_agent?: string
        }
        Returns: string
      }
      bom_refresh_uom_factors: { Args: { _bom_id: string }; Returns: number }
      can_access_record: {
        Args: { _record_id: string; _record_type: string }
        Returns: boolean
      }
      can_tenant_use_feature: {
        Args: { _feature_code: string; _tenant_id: string }
        Returns: boolean
      }
      cancel_approval_request: {
        Args: { _reason?: string; _request_id: string }
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
      cancel_production_order: {
        Args: { _order_id: string }
        Returns: undefined
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
      check_material_availability: {
        Args: { _order_id: string }
        Returns: {
          available: number
          is_subassembly: boolean
          item_id: string
          item_name: string
          on_hand: number
          required_qty: number
          reserved: number
          reserved_this_order: number
          shortage: number
          sku: string
          uom: string
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      check_reservation_integrity: {
        Args: { _item_id?: string }
        Returns: {
          available_qty: number
          is_overreserved: boolean
          item_id: string
          item_name: string
          on_hand: number
          orphan_count: number
          reserved_qty: number
          sku: string
        }[]
      }
      check_tenant_limit_enforcement: {
        Args: {
          _current_count: number
          _feature_code: string
          _tenant_id: string
        }
        Returns: Json
      }
      claim_tenant_invitation: {
        Args: {
          _email: string
          _full_name?: string
          _token: string
          _user_id: string
        }
        Returns: string
      }
      close_production_order: {
        Args: { _order_id: string }
        Returns: undefined
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
      complete_production_quality_check: {
        Args: { _notes?: string; _order_id: string }
        Returns: undefined
      }
      confirm_production_order: {
        Args: { _order_id: string }
        Returns: undefined
      }
      convert_order_to_invoice: { Args: { _order_id: string }; Returns: string }
      convert_po_to_bill: { Args: { _po_id: string }; Returns: string }
      convert_quote_to_order: { Args: { _quote_id: string }; Returns: string }
      convert_requisition_to_purchase_order: {
        Args: {
          _currency?: string
          _expected_date?: string
          _notes?: string
          _po_date?: string
          _requisition_id: string
          _supplier_id: string
          _unit_prices?: Json
        }
        Returns: string
      }
      create_and_post_customer_payment: {
        Args: {
          _allocations?: Json
          _amount: number
          _currency?: string
          _customer_id: string
          _date: string
          _notes?: string
          _payment_method: string
          _reference?: string
        }
        Returns: string
      }
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
      create_customer_payment: {
        Args: {
          _amount: number
          _currency?: string
          _customer_id: string
          _date: string
          _notes?: string
          _payment_method: string
          _reference?: string
        }
        Returns: string
      }
      create_expense: {
        Args: {
          _account_id: string
          _amount: number
          _bank_account_id?: string
          _business_purpose?: string
          _category: string
          _cost_center?: string
          _currency: string
          _customer_job?: string
          _date: string
          _department?: string
          _duplicate_override_reason?: string
          _employee_id?: string
          _merchant?: string
          _mode?: string
          _notes?: string
          _project?: string
          _receipt_required?: boolean
          _receipt_status?: string
          _reference?: string
          _tax_amount: number
          _total: number
        }
        Returns: string
      }
      create_invoice_from_sales_order: {
        Args: { _lines: Json; _order_id: string }
        Returns: string
      }
      create_mts_manufacturing_order: {
        Args: {
          _bom_id: string
          _item_id: string
          _planned_end?: string
          _planned_start?: string
          _quantity: number
          _warehouse_id: string
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
      create_package_from_sales_order: {
        Args: {
          _height?: number
          _length?: number
          _lines: Json
          _notes?: string
          _sales_order_id: string
          _warehouse_id: string
          _weight?: number
          _width?: number
        }
        Returns: string
      }
      create_production_reservations: {
        Args: { _order_id: string }
        Returns: {
          available: number
          is_subassembly: boolean
          item_id: string
          item_name: string
          on_hand: number
          required_qty: number
          reserved: number
          reserved_this_order: number
          shortage: number
          sku: string
          uom: string
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      create_purchase_receipt: {
        Args: {
          _allow_overreceipt?: boolean
          _description?: string
          _lines?: Json
          _purchase_order_id: string
          _receipt_date?: string
          _receipt_type?: string
          _service_period_end?: string
          _service_period_start?: string
          _warehouse_id?: string
        }
        Returns: string
      }
      create_reimbursement: {
        Args: {
          _allocations: Json
          _bank_account_id?: string
          _currency: string
          _date?: string
          _employee_id: string
          _notes?: string
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
      create_sales_fulfillment: {
        Args: {
          _notes?: string
          _promised_date?: string
          _quantities: Json
          _sales_order_id: string
          _warehouse_id: string
        }
        Returns: string
      }
      create_sales_order_mto_orders: {
        Args: { _lines: Json; _sales_order_id: string }
        Returns: {
          production_order_id: string
          quantity: number
          sales_order_line_id: string
        }[]
      }
      create_supplier_bill: {
        Args: {
          _currency: string
          _date: string
          _due_date: string
          _duplicate_override_reason?: string
          _lines?: Json
          _notes?: string
          _source_po_id?: string
          _source_receipt_id?: string
          _supplier_id: string
          _supplier_invoice_number?: string
        }
        Returns: string
      }
      create_supplier_payment: {
        Args: {
          _amount: number
          _bank_account_id?: string
          _currency: string
          _date: string
          _notes?: string
          _payment_method?: string
          _reference?: string
          _supplier_id: string
        }
        Returns: string
      }
      create_tenant_api_key: {
        Args: { _expires_at?: string; _name: string }
        Returns: Json
      }
      create_tenant_invitation: {
        Args: {
          _email: string
          _expires_in_hours?: number
          _role?: Database["public"]["Enums"]["app_role"]
        }
        Returns: {
          expires_at: string
          invitation_id: string
          invitation_token: string
        }[]
      }
      current_tenant_id: { Args: never; Returns: string }
      delete_approval_workflow: {
        Args: { _workflow_id: string }
        Returns: boolean
      }
      delete_approval_workflow_step: {
        Args: { _step_id: string }
        Returns: boolean
      }
      delete_invoice: { Args: { _invoice_id: string }; Returns: string }
      delete_sales_fulfillment: {
        Args: { _fulfillment_id: string }
        Returns: undefined
      }
      end_support_session: {
        Args: { _reason?: string; _session_id?: string }
        Returns: undefined
      }
      evaluate_feature_flag: {
        Args: {
          _env?: string
          _flag_code: string
          _tenant_id?: string
          _user_id?: string
        }
        Returns: boolean
      }
      explode_bom: {
        Args: { _bom_id: string; _max_depth?: number; _qty?: number }
        Returns: {
          bom_id: string
          effective_qty: number
          is_subassembly: boolean
          item_id: string
          item_name: string
          level: number
          line_cost: number
          line_no: number
          path: string
          qty_per: number
          scrap_pct: number
          sku: string
          total_qty: number
          unit_cost: number
          uom: string
        }[]
      }
      generate_doc_number: {
        Args: { _pad_width?: number; _prefix: string; _tenant_id: string }
        Returns: string
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
          target_user_email: string
          target_user_id: string
          target_user_name: string
        }[]
      }
      get_all_evaluated_feature_flags: {
        Args: { _env?: string; _tenant_id?: string; _user_id?: string }
        Returns: Json
      }
      get_approval_request_audit: {
        Args: { _request_id: string }
        Returns: {
          actions_history: Json
          amount: number
          completed_at: string
          current_step: number
          entity_id: string
          entity_type: string
          request_id: string
          requested_by_email: string
          requested_by_id: string
          requested_by_name: string
          status: string
          submitted_at: string
          workflow_code: string
          workflow_id: string
          workflow_name: string
          workflow_steps: Json
        }[]
      }
      get_ar_aging: {
        Args: {
          _customer_id?: string
          _date_from: string
          _date_to: string
          _salesperson_id?: string
        }
        Returns: Json
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
      get_collections_report: {
        Args: { _customer_id?: string; _date_from: string; _date_to: string }
        Returns: Json
      }
      get_customer_ar_summary: { Args: { _customer_id: string }; Returns: Json }
      get_customer_statement: {
        Args: { _customer_id: string; _date_from: string; _date_to: string }
        Returns: Json
      }
      get_employee_reimbursement_summary: {
        Args: { _employee_id: string }
        Returns: {
          approved: number
          outstanding_expenses: number
          paid: number
          pending: number
        }[]
      }
      get_expense_report: {
        Args: {
          _currency?: string
          _date_from?: string
          _date_to?: string
          _department?: string
          _employee_id?: string
          _report?: string
          _status?: string
        }
        Returns: Json
      }
      get_expense_summary: {
        Args: { _expense_id: string }
        Returns: {
          accounting_status: string
          amount: number
          duplicate_warning: boolean
          employee_id: string
          receipt_status: string
          reimbursement_status: string
          tax_amount: number
          total: number
        }[]
      }
      get_fulfillment_summary: {
        Args: { _fulfillment_id: string }
        Returns: {
          delivered_quantity: number
          fulfillment_quantity: number
          fulfillment_status: string
          order_id: string
          ordered_quantity: number
          packed_quantity: number
          picked_quantity: number
          remaining_quantity: number
          shipped_quantity: number
        }[]
      }
      get_inventory_dashboard: { Args: never; Returns: Json }
      get_invoice_payment_summary: {
        Args: { _invoice_id: string }
        Returns: {
          allocated_amount: number
          balance_due: number
          credit_notes_applied: number
          invoice_total: number
          payment_status: string
        }[]
      }
      get_item_availability: {
        Args: { _item_id: string }
        Returns: {
          available: number
          on_hand: number
          on_order: number
          projected: number
          reserved: number
          warehouse_id: string
        }[]
      }
      get_manufacturing_dashboard: { Args: never; Returns: Json }
      get_manufacturing_performance_report: {
        Args: { _date_from?: string; _date_to?: string; _report: string }
        Returns: Json
      }
      get_mts_production_planning: {
        Args: { _warehouse_id?: string }
        Returns: {
          active_bom_id: string
          active_bom_version: string
          available: number
          current_stock: number
          item_id: string
          item_name: string
          maximum_stock: number
          minimum_stock: number
          open_manufacturing: number
          open_sales_orders: number
          projected_available: number
          reserved: number
          sku: string
          suggested_production: number
          uom: string
          warehouse_id: string
          warehouse_name: string
        }[]
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
      get_order_fulfillment_report: {
        Args: {
          _currency?: string
          _customer_id?: string
          _date_from: string
          _date_to: string
          _limit?: number
          _offset?: number
        }
        Returns: Json
      }
      get_payment_allocation_summary: {
        Args: { _payment_id: string }
        Returns: {
          allocated_amount: number
          allocation_status: string
          payment_amount: number
          unallocated_amount: number
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
          severity: string
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
      get_procurement_report: {
        Args: {
          _as_of?: string
          _currency?: string
          _date_from?: string
          _date_to?: string
          _report?: string
          _status?: string
          _supplier_id?: string
        }
        Returns: Json
      }
      get_production_order_costing: {
        Args: { _order_id: string }
        Returns: Json
      }
      get_production_summary: {
        Args: { _order_id: string }
        Returns: {
          completion_pct: number
          first_run_at: string
          last_run_at: string
          number: string
          order_id: string
          qty_produced: number
          qty_remaining: number
          qty_scrap_total: number
          quantity: number
          run_count: number
          status: string
          total_cost: number
        }[]
      }
      get_purchase_order_financial_summary: {
        Args: { _order_id: string }
        Returns: {
          billed_value: number
          billing_status: string
          fulfillment_status: string
          order_total: number
          outstanding_bill_value: number
          paid_value: number
          payment_status: string
          received_value: number
          remaining_to_bill: number
          remaining_to_receive: number
        }[]
      }
      get_purchase_order_receiving_status: {
        Args: { _order_id: string }
        Returns: {
          item_id: string
          line_id: string
          ordered_quantity: number
          previously_received: number
          rejected_quantity: number
          remaining_quantity: number
        }[]
      }
      get_purchase_receipt_status: {
        Args: { _receipt_id: string }
        Returns: {
          accepted_quantity: number
          receipt_status: string
          received_value: number
          receiving_status: string
          rejected_quantity: number
        }[]
      }
      get_purchase_three_way_match: {
        Args: { _bill_id: string }
        Returns: {
          amount_variance: number
          bill_amount: number
          bill_line_id: string
          bill_quantity: number
          bill_unit_price: number
          expected_amount: number
          match_status: string
          matched: boolean
          po_line_id: string
          po_unit_price: number
          price_variance: number
          quantity_variance: number
          received_quantity: number
          tax_variance: number
        }[]
      }
      get_purchases_dashboard: {
        Args: { _currency?: string; _date_from?: string; _date_to?: string }
        Returns: Json
      }
      get_quote_conversion_report: {
        Args: {
          _currency?: string
          _customer_id?: string
          _date_from: string
          _date_to: string
          _salesperson_id?: string
        }
        Returns: Json
      }
      get_sales_by_customer: {
        Args: {
          _currency?: string
          _customer_id?: string
          _date_from: string
          _date_to: string
          _limit?: number
          _offset?: number
          _salesperson_id?: string
        }
        Returns: Json
      }
      get_sales_by_product: {
        Args: {
          _currency?: string
          _customer_id?: string
          _date_from: string
          _date_to: string
          _limit?: number
          _offset?: number
          _product_id?: string
          _salesperson_id?: string
        }
        Returns: Json
      }
      get_sales_by_salesperson: {
        Args: {
          _currency?: string
          _date_from: string
          _date_to: string
          _limit?: number
          _offset?: number
        }
        Returns: Json
      }
      get_sales_dashboard: { Args: never; Returns: Json }
      get_sales_lifecycle_dashboard: { Args: never; Returns: Json }
      get_sales_order_financial_summary: {
        Args: { _order_id: string }
        Returns: {
          fulfillment_percentage: number
          invoice_percentage: number
          invoiced_amount: number
          order_total: number
          outstanding_amount: number
          paid_amount: number
          payment_percentage: number
          uninvoiced_amount: number
        }[]
      }
      get_sales_order_invoicing_status: {
        Args: { _order_id: string }
        Returns: Json
      }
      get_sales_order_manufacturing_requirements: {
        Args: { _sales_order_id: string }
        Returns: {
          active_bom_id: string
          active_bom_version: string
          available_qty: number
          fulfilled_qty: number
          in_production_qty: number
          item_id: string
          item_name: string
          manufacturing_required: number
          ordered_qty: number
          sales_order_line_id: string
          sku: string
          uom: string
        }[]
      }
      get_sales_overview: {
        Args: { _currency?: string; _date_from: string; _date_to: string }
        Returns: Json
      }
      get_sales_profitability: {
        Args: {
          _currency?: string
          _customer_id?: string
          _date_from: string
          _date_to: string
          _group_by?: string
          _limit?: number
          _offset?: number
        }
        Returns: Json
      }
      get_supplier_ap_summary: {
        Args: { _supplier_id: string }
        Returns: {
          "1_30": number
          "31_60": number
          "61_90": number
          available_credits: number
          current: number
          outstanding: number
          over_90: number
          overdue: number
          unallocated_payments: number
        }[]
      }
      get_supplier_bill_ap_detail: {
        Args: { _bill_id: string }
        Returns: {
          amount_paid: number
          bill_total: number
          credit_applied: number
          days_overdue: number
          match_status: string
          outstanding: number
          overdue_amount: number
          payment_status: string
        }[]
      }
      get_supplier_bill_payment_summary: {
        Args: { _bill_id: string }
        Returns: {
          amount_paid: number
          bill_total: number
          credit_applied: number
          days_overdue: number
          outstanding: number
          overdue_amount: number
          payment_status: string
        }[]
      }
      get_supplier_payment_allocation_summary: {
        Args: { _payment_id: string }
        Returns: {
          allocated_amount: number
          allocation_status: string
          currency: string
          payment_amount: number
          supplier_id: string
          unallocated_amount: number
        }[]
      }
      get_tenant_detail: { Args: { _tenant_id: string }; Returns: Json }
      get_tenant_entitlements: { Args: { _tenant_id: string }; Returns: Json }
      get_tenant_limit: {
        Args: { _feature_code: string; _tenant_id: string }
        Returns: number
      }
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
      has_platform_permission:
        | { Args: { _code: string; _user_id?: string }; Returns: boolean }
        | { Args: { _code: string; _user_id: string }; Returns: boolean }
      has_platform_role:
        | { Args: { _role: string; _user_id?: string }; Returns: boolean }
        | { Args: { _role: string; _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id?: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      list_platform_tenants: {
        Args: {
          _limit?: number
          _offset?: number
          _plan_code?: string
          _search?: string
          _status?: string
        }
        Returns: {
          created_at: string
          currency: string
          id: string
          name: string
          plan_code: string
          plan_id: string
          plan_name: string
          plan_price: number
          slug: string
          status: string
          sub_status: string
          total_count: number
          trial_ends_at: string
          updated_at: string
          user_count: number
        }[]
      }
      list_tenant_users: {
        Args: {
          _limit?: number
          _offset?: number
          _role?: string
          _search?: string
          _status?: string
          _tenant_id: string
        }
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          last_sign_in_at: string
          phone: string
          platform_role: string
          roles: string[]
          total_count: number
          updated_at: string
        }[]
      }
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
      override_supplier_bill_match: {
        Args: { _bill_id: string; _reason: string }
        Returns: string
      }
      pause_production_order: {
        Args: { _order_id: string; _reason?: string }
        Returns: undefined
      }
      platform_audit:
        | {
            Args: {
              _action: string
              _detail?: Json
              _target_id?: string
              _target_label?: string
              _target_type?: string
            }
            Returns: string
          }
        | {
            Args: {
              _action: string
              _detail?: Json
              _severity?: string
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
      post_purchase_receipt: { Args: { _receipt_id: string }; Returns: string }
      post_reimbursement: {
        Args: { _reimbursement_id: string }
        Returns: string
      }
      post_shipment: { Args: { _shipment_id: string }; Returns: string }
      post_shipment_unchecked: {
        Args: { _shipment_id: string }
        Returns: string
      }
      post_supplier_payment: { Args: { _payment_id: string }; Returns: string }
      post_transfer: { Args: { _transfer_id: string }; Returns: string }
      post_transfer_unchecked: {
        Args: { _transfer_id: string }
        Returns: string
      }
      procurement_status_event: {
        Args: {
          _entity_id: string
          _entity_type: string
          _new_status: string
          _old_status: string
          _reason: string
        }
        Returns: undefined
      }
      procurement_status_transition_allowed: {
        Args: { _entity_type: string; _new_status: string; _old_status: string }
        Returns: boolean
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
      record_production_order_cost: {
        Args: {
          _actual_amount?: number
          _cost_type: string
          _description?: string
          _order_id: string
          _planned_amount?: number
          _source_ref_id?: string
          _source_ref_type?: string
        }
        Returns: string
      }
      record_production_run:
        | {
            Args: {
              _location_id?: string
              _lot_number?: string
              _notes?: string
              _order_id: string
              _qty_produced: number
              _qty_rework?: number
              _qty_scrap?: number
              _qty_waste?: number
              _warehouse_id?: string
            }
            Returns: string
          }
        | {
            Args: {
              _location_id?: string
              _lot_number?: string
              _notes?: string
              _order_id: string
              _qty_produced: number
              _qty_scrap?: number
              _warehouse_id?: string
            }
            Returns: string
          }
      record_production_run_legacy: {
        Args: {
          _location_id?: string
          _lot_number?: string
          _notes?: string
          _order_id: string
          _qty_produced: number
          _qty_scrap?: number
          _warehouse_id?: string
        }
        Returns: string
      }
      refresh_customer_ar_summary: {
        Args: { _customer_id: string }
        Returns: undefined
      }
      refresh_expense_status: {
        Args: { _expense_id: string }
        Returns: undefined
      }
      refresh_invoice_payment_status: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      refresh_purchase_order_status: {
        Args: { _order_id: string }
        Returns: undefined
      }
      refresh_sales_order_status: {
        Args: { _order_id: string }
        Returns: undefined
      }
      refresh_supplier_bill_status: {
        Args: { _bill_id: string }
        Returns: undefined
      }
      refresh_supplier_payment_status: {
        Args: { _payment_id: string }
        Returns: undefined
      }
      reject_expense: {
        Args: { _expense_id: string; _reason?: string }
        Returns: string
      }
      release_production_order: {
        Args: { _order_id: string }
        Returns: undefined
      }
      release_production_reservations: {
        Args: { _order_id: string }
        Returns: number
      }
      replace_shipment_sales_orders: {
        Args: { _sales_order_ids: string[]; _shipment_id: string }
        Returns: undefined
      }
      resume_production_order: {
        Args: { _order_id: string }
        Returns: undefined
      }
      revoke_support_session: {
        Args: { _reason?: string; _session_id: string }
        Returns: undefined
      }
      revoke_tenant_api_key: { Args: { _key_id: string }; Returns: undefined }
      run_accounting_integrity_checks: { Args: never; Returns: Json }
      sales_order_transition_allowed: {
        Args: { _new: string; _old: string }
        Returns: boolean
      }
      sales_quote_transition_allowed: {
        Args: { _new: string; _old: string }
        Returns: boolean
      }
      set_item_opening_stock: {
        Args: {
          _item_id: string
          _quantity: number
          _unit_cost?: number
          _warehouse_id?: string
        }
        Returns: string
      }
      set_role_permission_override: {
        Args: { _enabled: boolean; _permission_code: string; _role: string }
        Returns: undefined
      }
      set_role_record_restriction: {
        Args: {
          _allowed: boolean
          _record_id: string
          _record_type: string
          _role: string
        }
        Returns: undefined
      }
      start_production_order: {
        Args: { _order_id: string }
        Returns: undefined
      }
      submit_expense: { Args: { _expense_id: string }; Returns: string }
      switch_tenant:
        | {
            Args: { target_tenant: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.switch_tenant(target_tenant => text), public.switch_tenant(target_tenant => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { target_tenant: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.switch_tenant(target_tenant => text), public.switch_tenant(target_tenant => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      tenant_write_ok: {
        Args: { _roles: Database["public"]["Enums"]["app_role"][] }
        Returns: boolean
      }
      transition_expense: {
        Args: { _expense_id: string; _new_status: string; _reason?: string }
        Returns: string
      }
      transition_package: {
        Args: { _new_status: string; _package_id: string; _reason?: string }
        Returns: string
      }
      transition_purchase_order: {
        Args: {
          _force_close?: boolean
          _new_status: string
          _order_id: string
          _reason?: string
        }
        Returns: string
      }
      transition_purchase_requisition: {
        Args: { _new_status: string; _reason?: string; _requisition_id: string }
        Returns: string
      }
      transition_quote: {
        Args: { _new_status: string; _quote_id: string; _reason?: string }
        Returns: string
      }
      transition_sales_fulfillment: {
        Args: { _fulfillment_id: string; _new_status: string; _reason?: string }
        Returns: string
      }
      transition_sales_order: {
        Args: { _new_status: string; _order_id: string; _reason?: string }
        Returns: string
      }
      transition_supplier_bill: {
        Args: { _bill_id: string; _new_status: string; _reason?: string }
        Returns: string
      }
      transition_supplier_payment: {
        Args: { _new_status: string; _payment_id: string; _reason?: string }
        Returns: string
      }
      unallocate_customer_payment: {
        Args: { _allocation_id: string }
        Returns: string
      }
      unallocate_supplier_payment: {
        Args: { _allocation_id: string }
        Returns: string
      }
      uom_convert: {
        Args: {
          _from: string
          _item_id?: string
          _qty: number
          _tenant_id?: string
          _to: string
        }
        Returns: number
      }
      uom_convert_safe: {
        Args: {
          _from: string
          _item_id?: string
          _qty: number
          _tenant_id?: string
          _to: string
        }
        Returns: number
      }
      uom_has_path: {
        Args: {
          _from: string
          _item_id?: string
          _tenant_id?: string
          _to: string
        }
        Returns: boolean
      }
      update_approval_workflow: {
        Args: {
          _conditions?: Json
          _description?: string
          _is_active?: boolean
          _name: string
          _workflow_id: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "approval_workflows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_approval_workflow_step: {
        Args: {
          _approver_role?: string
          _approver_type: string
          _approver_user_id?: string
          _minimum_approvals?: number
          _name: string
          _step_id: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "approval_workflow_steps"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_tenant_api_key: {
        Args: { _expires_at?: string; _key_id: string; _name: string }
        Returns: undefined
      }
      upsert_inventory_config: {
        Args: { _key: string; _value: string }
        Returns: undefined
      }
      upsert_posting_config: {
        Args: { _account_id: string; _purpose: string }
        Returns: string
      }
      validate_bom: { Args: { _bom_id: string }; Returns: Json }
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
      validate_schema_contract: {
        Args: never
        Returns: {
          category: string
          detail: string
          object_name: string
        }[]
      }
      validate_supplier_bill_against_po: {
        Args: { _bill_id: string }
        Returns: {
          amount_variance: number
          match_status: string
          matched: boolean
          price_variance: number
          quantity_variance: number
          tax_variance: number
        }[]
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
      void_posted_document_base: {
        Args: {
          _entity_id: string
          _entity_type: string
          _permission: string
          _reason?: string
        }
        Returns: string
      }
      void_supplier_payment: {
        Args: { _payment_id: string; _reason?: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
        "accountant",
        "finance_clerk",
        "auditor",
      ],
    },
  },
} as const
