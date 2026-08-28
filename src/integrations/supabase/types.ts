export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  public: {
    Tables: {
      approval_actions: {
        Row: {
          acted_at: string;
          acted_by: string;
          action: string;
          id: string;
          note: string | null;
          request_id: string;
          tenant_id: string;
          workflow_step_id: string;
        };
        Insert: {
          acted_at?: string;
          acted_by: string;
          action: string;
          id?: string;
          note?: string | null;
          request_id: string;
          tenant_id: string;
          workflow_step_id: string;
        };
        Update: {
          acted_at?: string;
          acted_by?: string;
          action?: string;
          id?: string;
          note?: string | null;
          request_id?: string;
          tenant_id?: string;
          workflow_step_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "approval_actions_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "approval_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approval_actions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approval_actions_workflow_step_id_fkey";
            columns: ["workflow_step_id"];
            isOneToOne: false;
            referencedRelation: "approval_workflow_steps";
            referencedColumns: ["id"];
          },
        ];
      };
      approval_requests: {
        Row: {
          amount: number | null;
          completed_at: string | null;
          created_at: string;
          current_step: number;
          entity_id: string;
          entity_type: string;
          id: string;
          idempotency_key: string | null;
          payload: Json;
          requested_by: string;
          status: string;
          submitted_at: string;
          tenant_id: string;
          updated_at: string;
          workflow_id: string;
        };
        Insert: {
          amount?: number | null;
          completed_at?: string | null;
          created_at?: string;
          current_step?: number;
          entity_id: string;
          entity_type: string;
          id?: string;
          idempotency_key?: string | null;
          payload?: Json;
          requested_by: string;
          status?: string;
          submitted_at?: string;
          tenant_id: string;
          updated_at?: string;
          workflow_id: string;
        };
        Update: {
          amount?: number | null;
          completed_at?: string | null;
          created_at?: string;
          current_step?: number;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          idempotency_key?: string | null;
          payload?: Json;
          requested_by?: string;
          status?: string;
          submitted_at?: string;
          tenant_id?: string;
          updated_at?: string;
          workflow_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "approval_requests_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approval_requests_workflow_id_fkey";
            columns: ["workflow_id"];
            isOneToOne: false;
            referencedRelation: "approval_workflows";
            referencedColumns: ["id"];
          },
        ];
      };
      approval_workflow_steps: {
        Row: {
          approver_role: string | null;
          approver_type: string;
          approver_user_id: string | null;
          created_at: string;
          id: string;
          minimum_approvals: number;
          name: string;
          step_order: number;
          workflow_id: string;
        };
        Insert: {
          approver_role?: string | null;
          approver_type: string;
          approver_user_id?: string | null;
          created_at?: string;
          id?: string;
          minimum_approvals?: number;
          name: string;
          step_order: number;
          workflow_id: string;
        };
        Update: {
          approver_role?: string | null;
          approver_type?: string;
          approver_user_id?: string | null;
          created_at?: string;
          id?: string;
          minimum_approvals?: number;
          name?: string;
          step_order?: number;
          workflow_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "approval_workflow_steps_workflow_id_fkey";
            columns: ["workflow_id"];
            isOneToOne: false;
            referencedRelation: "approval_workflows";
            referencedColumns: ["id"];
          },
        ];
      };
      approval_workflows: {
        Row: {
          code: string;
          conditions: Json;
          created_at: string;
          created_by: string | null;
          description: string | null;
          entity_type: string;
          id: string;
          is_active: boolean;
          name: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          conditions?: Json;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          entity_type: string;
          id?: string;
          is_active?: boolean;
          name: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          conditions?: Json;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          entity_type?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "approval_workflows_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      attachments: {
        Row: {
          deleted_at: string | null;
          entity_id: string;
          entity_type: string;
          file_name: string;
          file_path: string;
          id: string;
          mime_type: string | null;
          size_bytes: number | null;
          tenant_id: string;
          uploaded_at: string;
          uploaded_by: string | null;
        };
        Insert: {
          deleted_at?: string | null;
          entity_id: string;
          entity_type: string;
          file_name: string;
          file_path: string;
          id?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          tenant_id: string;
          uploaded_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          deleted_at?: string | null;
          entity_id?: string;
          entity_type?: string;
          file_name?: string;
          file_path?: string;
          id?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          tenant_id?: string;
          uploaded_at?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "attachments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_email: string | null;
          actor_id: string | null;
          created_at: string;
          id: string;
          new_data: Json | null;
          old_data: Json | null;
          record_id: string | null;
          table_name: string;
          tenant_id: string | null;
        };
        Insert: {
          action: string;
          actor_email?: string | null;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          new_data?: Json | null;
          old_data?: Json | null;
          record_id?: string | null;
          table_name: string;
          tenant_id?: string | null;
        };
        Update: {
          action?: string;
          actor_email?: string | null;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          new_data?: Json | null;
          old_data?: Json | null;
          record_id?: string | null;
          table_name?: string;
          tenant_id?: string | null;
        };
        Relationships: [];
      };
      bank_accounts: {
        Row: {
          account_number: string | null;
          balance: number | null;
          bank: string | null;
          created_at: string;
          created_by: string | null;
          currency: string | null;
          deleted_at: string | null;
          id: string;
          name: string;
          notes: string | null;
          status: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          account_number?: string | null;
          balance?: number | null;
          bank?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          deleted_at?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          status?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          account_number?: string | null;
          balance?: number | null;
          bank?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          deleted_at?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          status?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      bill_lines: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          discount_pct: number;
          document_id: string;
          id: string;
          item_id: string | null;
          line_no: number;
          line_total: number;
          quantity: number;
          tax_pct: number;
          tenant_id: string;
          unit_price: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          discount_pct?: number;
          document_id: string;
          id?: string;
          item_id?: string | null;
          line_no?: number;
          line_total?: number;
          quantity?: number;
          tax_pct?: number;
          tenant_id: string;
          unit_price?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          discount_pct?: number;
          document_id?: string;
          id?: string;
          item_id?: string | null;
          line_no?: number;
          line_total?: number;
          quantity?: number;
          tax_pct?: number;
          tenant_id?: string;
          unit_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bill_lines_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "bills";
            referencedColumns: ["id"];
          },
        ];
      };
      bills: {
        Row: {
          amount: number | null;
          amount_paid: number;
          balance: number | null;
          balance_due: number;
          created_at: string;
          created_by: string | null;
          currency: string;
          date: string | null;
          deleted_at: string | null;
          discount_total: number;
          due_date: string | null;
          grand_total: number;
          id: string;
          notes: string | null;
          number: string | null;
          posted_at: string | null;
          reversal_id: string | null;
          search_vec: unknown;
          source_po_id: string | null;
          status: string | null;
          subtotal: number;
          supplier_id: string | null;
          tax_total: number;
          tenant_id: string;
          updated_at: string;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          amount?: number | null;
          amount_paid?: number;
          balance?: number | null;
          balance_due?: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          date?: string | null;
          deleted_at?: string | null;
          discount_total?: number;
          due_date?: string | null;
          grand_total?: number;
          id?: string;
          notes?: string | null;
          number?: string | null;
          posted_at?: string | null;
          reversal_id?: string | null;
          search_vec?: unknown;
          source_po_id?: string | null;
          status?: string | null;
          subtotal?: number;
          supplier_id?: string | null;
          tax_total?: number;
          tenant_id: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          amount?: number | null;
          amount_paid?: number;
          balance?: number | null;
          balance_due?: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          date?: string | null;
          deleted_at?: string | null;
          discount_total?: number;
          due_date?: string | null;
          grand_total?: number;
          id?: string;
          notes?: string | null;
          number?: string | null;
          posted_at?: string | null;
          reversal_id?: string | null;
          search_vec?: unknown;
          source_po_id?: string | null;
          status?: string | null;
          subtotal?: number;
          supplier_id?: string | null;
          tax_total?: number;
          tenant_id?: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bills_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bills_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      bom_headers: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          id: string;
          notes: string | null;
          product_id: string | null;
          status: string | null;
          tenant_id: string;
          updated_at: string;
          version: string | null;
          yield_qty: number | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          id?: string;
          notes?: string | null;
          product_id?: string | null;
          status?: string | null;
          tenant_id: string;
          updated_at?: string;
          version?: string | null;
          yield_qty?: number | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          id?: string;
          notes?: string | null;
          product_id?: string | null;
          status?: string | null;
          tenant_id?: string;
          updated_at?: string;
          version?: string | null;
          yield_qty?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "bom_headers_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "inventory_item_stock";
            referencedColumns: ["item_id"];
          },
          {
            foreignKeyName: "bom_headers_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
        ];
      };
      bom_lines: {
        Row: {
          bom_id: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          item_id: string | null;
          line_no: number;
          line_total: number;
          quantity: number;
          tenant_id: string;
          unit_cost: number;
          updated_at: string;
        };
        Insert: {
          bom_id: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          item_id?: string | null;
          line_no?: number;
          line_total?: number;
          quantity?: number;
          tenant_id: string;
          unit_cost?: number;
          updated_at?: string;
        };
        Update: {
          bom_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          item_id?: string | null;
          line_no?: number;
          line_total?: number;
          quantity?: number;
          tenant_id?: string;
          unit_cost?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bom_lines_bom_id_fkey";
            columns: ["bom_id"];
            isOneToOne: false;
            referencedRelation: "bom_headers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bom_lines_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_item_stock";
            referencedColumns: ["item_id"];
          },
          {
            foreignKeyName: "bom_lines_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bom_lines_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      business_events: {
        Row: {
          action: string;
          actor_email: string | null;
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          ip_address: unknown;
          metadata: Json;
          new_values: Json | null;
          occurred_at: string;
          old_values: Json | null;
          tenant_id: string;
          user_agent: string | null;
        };
        Insert: {
          action: string;
          actor_email?: string | null;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          ip_address?: unknown;
          metadata?: Json;
          new_values?: Json | null;
          occurred_at?: string;
          old_values?: Json | null;
          tenant_id: string;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_email?: string | null;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          ip_address?: unknown;
          metadata?: Json;
          new_values?: Json | null;
          occurred_at?: string;
          old_values?: Json | null;
          tenant_id?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "business_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      chart_of_accounts: {
        Row: {
          allow_manual_posting: boolean;
          balance: number | null;
          code: string | null;
          created_at: string;
          created_by: string | null;
          currency: string | null;
          deleted_at: string | null;
          description: string | null;
          id: string;
          is_active: boolean;
          is_system: boolean;
          name: string;
          normal_balance: string;
          opening_balance: number;
          parent_id: string | null;
          tenant_id: string;
          type: string | null;
          updated_at: string;
        };
        Insert: {
          allow_manual_posting?: boolean;
          balance?: number | null;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_system?: boolean;
          name: string;
          normal_balance?: string;
          opening_balance?: number;
          parent_id?: string | null;
          tenant_id: string;
          type?: string | null;
          updated_at?: string;
        };
        Update: {
          allow_manual_posting?: boolean;
          balance?: number | null;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_system?: boolean;
          name?: string;
          normal_balance?: string;
          opening_balance?: number;
          parent_id?: string | null;
          tenant_id?: string;
          type?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "chart_of_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      credit_note_lines: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          description: string;
          discount_pct: number;
          document_id: string;
          id: string;
          item_id: string | null;
          line_no: number;
          line_total: number;
          quantity: number;
          tax_pct: number;
          tenant_id: string;
          unit_price: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          discount_pct?: number;
          document_id: string;
          id?: string;
          item_id?: string | null;
          line_no: number;
          line_total?: number;
          quantity?: number;
          tax_pct?: number;
          tenant_id: string;
          unit_price?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          discount_pct?: number;
          document_id?: string;
          id?: string;
          item_id?: string | null;
          line_no?: number;
          line_total?: number;
          quantity?: number;
          tax_pct?: number;
          tenant_id?: string;
          unit_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credit_note_lines_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "credit_notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_note_lines_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_item_stock";
            referencedColumns: ["item_id"];
          },
          {
            foreignKeyName: "credit_note_lines_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_note_lines_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      credit_notes: {
        Row: {
          amount: number | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          customer_id: string | null;
          date: string | null;
          deleted_at: string | null;
          discount_total: number;
          grand_total: number;
          id: string;
          invoice_id: string | null;
          notes: string | null;
          number: string | null;
          posted_at: string | null;
          reason: string | null;
          reversal_id: string | null;
          status: string | null;
          subtotal: number;
          tax_total: number;
          tenant_id: string;
          updated_at: string;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          amount?: number | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id?: string | null;
          date?: string | null;
          deleted_at?: string | null;
          discount_total?: number;
          grand_total?: number;
          id?: string;
          invoice_id?: string | null;
          notes?: string | null;
          number?: string | null;
          posted_at?: string | null;
          reason?: string | null;
          reversal_id?: string | null;
          status?: string | null;
          subtotal?: number;
          tax_total?: number;
          tenant_id: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          amount?: number | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id?: string | null;
          date?: string | null;
          deleted_at?: string | null;
          discount_total?: number;
          grand_total?: number;
          id?: string;
          invoice_id?: string | null;
          notes?: string | null;
          number?: string | null;
          posted_at?: string | null;
          reason?: string | null;
          reversal_id?: string | null;
          status?: string | null;
          subtotal?: number;
          tax_total?: number;
          tenant_id?: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "credit_notes_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_notes_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_notes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          balance: number | null;
          billing_address: string | null;
          code: string | null;
          contact_person: string | null;
          created_at: string;
          created_by: string | null;
          credit_limit: number | null;
          currency: string | null;
          deleted_at: string | null;
          email: string | null;
          id: string;
          industry: string | null;
          name: string;
          notes: string | null;
          payment_terms: string | null;
          phone: string | null;
          salesperson_id: string | null;
          search_vec: unknown;
          shipping_address: string | null;
          status: string | null;
          tax_id: string | null;
          tenant_id: string;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          balance?: number | null;
          billing_address?: string | null;
          code?: string | null;
          contact_person?: string | null;
          created_at?: string;
          created_by?: string | null;
          credit_limit?: number | null;
          currency?: string | null;
          deleted_at?: string | null;
          email?: string | null;
          id?: string;
          industry?: string | null;
          name: string;
          notes?: string | null;
          payment_terms?: string | null;
          phone?: string | null;
          salesperson_id?: string | null;
          search_vec?: unknown;
          shipping_address?: string | null;
          status?: string | null;
          tax_id?: string | null;
          tenant_id: string;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          balance?: number | null;
          billing_address?: string | null;
          code?: string | null;
          contact_person?: string | null;
          created_at?: string;
          created_by?: string | null;
          credit_limit?: number | null;
          currency?: string | null;
          deleted_at?: string | null;
          email?: string | null;
          id?: string;
          industry?: string | null;
          name?: string;
          notes?: string | null;
          payment_terms?: string | null;
          phone?: string | null;
          salesperson_id?: string | null;
          search_vec?: unknown;
          shipping_address?: string | null;
          status?: string | null;
          tax_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customers_salesperson_id_fkey";
            columns: ["salesperson_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      document_events: {
        Row: {
          actor_email: string | null;
          actor_id: string | null;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          note: string | null;
          status: string;
          tenant_id: string;
        };
        Insert: {
          actor_email?: string | null;
          actor_id?: string | null;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          note?: string | null;
          status: string;
          tenant_id: string;
        };
        Update: {
          actor_email?: string | null;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          note?: string | null;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      document_reversals: {
        Row: {
          actor_id: string | null;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          metadata: Json;
          reason: string;
          reversal_journal_id: string | null;
          tenant_id: string;
          voided_at: string;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          metadata?: Json;
          reason: string;
          reversal_journal_id?: string | null;
          tenant_id: string;
          voided_at?: string;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          metadata?: Json;
          reason?: string;
          reversal_journal_id?: string | null;
          tenant_id?: string;
          voided_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_reversals_reversal_journal_id_fkey";
            columns: ["reversal_journal_id"];
            isOneToOne: false;
            referencedRelation: "journal_entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_reversals_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      document_templates: {
        Row: {
          accent_color: string;
          applies_to: string[];
          company_address: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          footer_text: string | null;
          id: string;
          is_default: boolean;
          logo_url: string | null;
          name: string;
          show_logo: boolean;
          tenant_id: string;
          terms: string | null;
          updated_at: string;
        };
        Insert: {
          accent_color?: string;
          applies_to?: string[];
          company_address?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          footer_text?: string | null;
          id?: string;
          is_default?: boolean;
          logo_url?: string | null;
          name: string;
          show_logo?: boolean;
          tenant_id: string;
          terms?: string | null;
          updated_at?: string;
        };
        Update: {
          accent_color?: string;
          applies_to?: string[];
          company_address?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          footer_text?: string | null;
          id?: string;
          is_default?: boolean;
          logo_url?: string | null;
          name?: string;
          show_logo?: boolean;
          tenant_id?: string;
          terms?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      email_jobs: {
        Row: {
          attempts: number;
          created_at: string;
          created_by: string | null;
          entity_id: string | null;
          entity_type: string | null;
          filename: string | null;
          id: string;
          last_error: string | null;
          max_attempts: number;
          message: string;
          pdf_base64: string | null;
          sent_at: string | null;
          status: string;
          subject: string;
          tenant_id: string;
          to_email: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          created_by?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          filename?: string | null;
          id?: string;
          last_error?: string | null;
          max_attempts?: number;
          message?: string;
          pdf_base64?: string | null;
          sent_at?: string | null;
          status?: string;
          subject: string;
          tenant_id: string;
          to_email: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          created_by?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          filename?: string | null;
          id?: string;
          last_error?: string | null;
          max_attempts?: number;
          message?: string;
          pdf_base64?: string | null;
          sent_at?: string | null;
          status?: string;
          subject?: string;
          tenant_id?: string;
          to_email?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_jobs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          account_id: string | null;
          amount: number;
          bank_account_id: string | null;
          billable: boolean;
          category: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          date: string;
          deleted_at: string | null;
          id: string;
          mode: string | null;
          notes: string | null;
          number: string | null;
          posted_at: string | null;
          reference: string | null;
          reversal_id: string | null;
          status: string;
          supplier_id: string | null;
          tax_amount: number;
          tenant_id: string;
          total: number;
          updated_at: string;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          account_id?: string | null;
          amount?: number;
          bank_account_id?: string | null;
          billable?: boolean;
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          date?: string;
          deleted_at?: string | null;
          id?: string;
          mode?: string | null;
          notes?: string | null;
          number?: string | null;
          posted_at?: string | null;
          reference?: string | null;
          reversal_id?: string | null;
          status?: string;
          supplier_id?: string | null;
          tax_amount?: number;
          tenant_id: string;
          total?: number;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          account_id?: string | null;
          amount?: number;
          bank_account_id?: string | null;
          billable?: boolean;
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          date?: string;
          deleted_at?: string | null;
          id?: string;
          mode?: string | null;
          notes?: string | null;
          number?: string | null;
          posted_at?: string | null;
          reference?: string | null;
          reversal_id?: string | null;
          status?: string;
          supplier_id?: string | null;
          tax_amount?: number;
          tenant_id?: string;
          total?: number;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "chart_of_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_bank_account_id_fkey";
            columns: ["bank_account_id"];
            isOneToOne: false;
            referencedRelation: "bank_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_adjustments: {
        Row: {
          created_at: string;
          created_by: string | null;
          date: string;
          deleted_at: string | null;
          id: string;
          item_id: string | null;
          number: string;
          posted_at: string | null;
          quantity: number;
          reason: string | null;
          reversal_id: string | null;
          status: string | null;
          tenant_id: string;
          updated_at: string;
          voided_at: string | null;
          voided_by: string | null;
          warehouse_id: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          date?: string;
          deleted_at?: string | null;
          id?: string;
          item_id?: string | null;
          number: string;
          posted_at?: string | null;
          quantity?: number;
          reason?: string | null;
          reversal_id?: string | null;
          status?: string | null;
          tenant_id: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          warehouse_id?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          date?: string;
          deleted_at?: string | null;
          id?: string;
          item_id?: string | null;
          number?: string;
          posted_at?: string | null;
          quantity?: number;
          reason?: string | null;
          reversal_id?: string | null;
          status?: string | null;
          tenant_id?: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          warehouse_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_item_stock";
            referencedColumns: ["item_id"];
          },
          {
            foreignKeyName: "inventory_adjustments_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_adjustments_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_transfers: {
        Row: {
          created_at: string;
          created_by: string | null;
          date: string;
          deleted_at: string | null;
          from_warehouse_id: string | null;
          id: string;
          item_id: string | null;
          notes: string | null;
          number: string;
          posted_at: string | null;
          quantity: number;
          reversal_id: string | null;
          status: string | null;
          tenant_id: string;
          to_warehouse_id: string | null;
          updated_at: string;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          date?: string;
          deleted_at?: string | null;
          from_warehouse_id?: string | null;
          id?: string;
          item_id?: string | null;
          notes?: string | null;
          number: string;
          posted_at?: string | null;
          quantity?: number;
          reversal_id?: string | null;
          status?: string | null;
          tenant_id: string;
          to_warehouse_id?: string | null;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          date?: string;
          deleted_at?: string | null;
          from_warehouse_id?: string | null;
          id?: string;
          item_id?: string | null;
          notes?: string | null;
          number?: string;
          posted_at?: string | null;
          quantity?: number;
          reversal_id?: string | null;
          status?: string | null;
          tenant_id?: string;
          to_warehouse_id?: string | null;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_transfers_from_warehouse_id_fkey";
            columns: ["from_warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_transfers_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_item_stock";
            referencedColumns: ["item_id"];
          },
          {
            foreignKeyName: "inventory_transfers_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_transfers_to_warehouse_id_fkey";
            columns: ["to_warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      invoice_lines: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          description: string;
          discount_pct: number;
          document_id: string;
          id: string;
          item_id: string | null;
          line_no: number;
          line_total: number;
          quantity: number;
          tax_pct: number;
          tenant_id: string;
          unit_price: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          discount_pct?: number;
          document_id: string;
          id?: string;
          item_id?: string | null;
          line_no?: number;
          line_total?: number;
          quantity?: number;
          tax_pct?: number;
          tenant_id: string;
          unit_price?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          discount_pct?: number;
          document_id?: string;
          id?: string;
          item_id?: string | null;
          line_no?: number;
          line_total?: number;
          quantity?: number;
          tax_pct?: number;
          tenant_id?: string;
          unit_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_lines_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoice_lines_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_item_stock";
            referencedColumns: ["item_id"];
          },
          {
            foreignKeyName: "invoice_lines_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoice_lines_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          amount: number | null;
          amount_paid: number;
          balance: number | null;
          balance_due: number;
          created_at: string;
          created_by: string | null;
          currency: string;
          customer_id: string | null;
          date: string | null;
          deleted_at: string | null;
          discount_total: number;
          due_date: string | null;
          grand_total: number;
          id: string;
          notes: string | null;
          number: string | null;
          posted_at: string | null;
          reversal_id: string | null;
          search_vec: unknown;
          source_order_id: string | null;
          status: string | null;
          subtotal: number;
          tax_total: number;
          tenant_id: string;
          updated_at: string;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          amount?: number | null;
          amount_paid?: number;
          balance?: number | null;
          balance_due?: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id?: string | null;
          date?: string | null;
          deleted_at?: string | null;
          discount_total?: number;
          due_date?: string | null;
          grand_total?: number;
          id?: string;
          notes?: string | null;
          number?: string | null;
          posted_at?: string | null;
          reversal_id?: string | null;
          search_vec?: unknown;
          source_order_id?: string | null;
          status?: string | null;
          subtotal?: number;
          tax_total?: number;
          tenant_id: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          amount?: number | null;
          amount_paid?: number;
          balance?: number | null;
          balance_due?: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id?: string | null;
          date?: string | null;
          deleted_at?: string | null;
          discount_total?: number;
          due_date?: string | null;
          grand_total?: number;
          id?: string;
          notes?: string | null;
          number?: string | null;
          posted_at?: string | null;
          reversal_id?: string | null;
          search_vec?: unknown;
          source_order_id?: string | null;
          status?: string | null;
          subtotal?: number;
          tax_total?: number;
          tenant_id?: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      items: {
        Row: {
          cost: number | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          description: string | null;
          id: string;
          name: string;
          price: number | null;
          reorder: number | null;
          search_vec: unknown;
          sku: string | null;
          stock: number | null;
          tenant_id: string;
          type: string | null;
          uom: string | null;
          updated_at: string;
        };
        Insert: {
          cost?: number | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          price?: number | null;
          reorder?: number | null;
          search_vec?: unknown;
          sku?: string | null;
          stock?: number | null;
          tenant_id: string;
          type?: string | null;
          uom?: string | null;
          updated_at?: string;
        };
        Update: {
          cost?: number | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          price?: number | null;
          reorder?: number | null;
          search_vec?: unknown;
          sku?: string | null;
          stock?: number | null;
          tenant_id?: string;
          type?: string | null;
          uom?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      journal_entries: {
        Row: {
          created_at: string;
          created_by: string | null;
          credit: number | null;
          debit: number | null;
          deleted_at: string | null;
          entry_date: string;
          id: string;
          memo: string | null;
          number: string | null;
          source_ref_id: string | null;
          source_ref_type: string | null;
          status: string | null;
          tenant_id: string;
          total_credit: number;
          total_debit: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          credit?: number | null;
          debit?: number | null;
          deleted_at?: string | null;
          entry_date?: string;
          id?: string;
          memo?: string | null;
          number?: string | null;
          source_ref_id?: string | null;
          source_ref_type?: string | null;
          status?: string | null;
          tenant_id: string;
          total_credit?: number;
          total_debit?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          credit?: number | null;
          debit?: number | null;
          deleted_at?: string | null;
          entry_date?: string;
          id?: string;
          memo?: string | null;
          number?: string | null;
          source_ref_id?: string | null;
          source_ref_type?: string | null;
          status?: string | null;
          tenant_id?: string;
          total_credit?: number;
          total_debit?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      journal_lines: {
        Row: {
          account_id: string;
          created_at: string;
          credit: number;
          debit: number;
          id: string;
          journal_id: string;
          memo: string | null;
          tenant_id: string;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          credit?: number;
          debit?: number;
          id?: string;
          journal_id: string;
          memo?: string | null;
          tenant_id: string;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          credit?: number;
          debit?: number;
          id?: string;
          journal_id?: string;
          memo?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "chart_of_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journal_lines_journal_id_fkey";
            columns: ["journal_id"];
            isOneToOne: false;
            referencedRelation: "journal_entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journal_lines_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          message: string;
          read_at: string | null;
          severity: string;
          tenant_id: string;
          title: string;
          type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          message: string;
          read_at?: string | null;
          severity?: string;
          tenant_id: string;
          title: string;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          message?: string;
          read_at?: string | null;
          severity?: string;
          tenant_id?: string;
          title?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      package_lines: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          document_id: string;
          id: string;
          item_id: string | null;
          line_no: number;
          quantity: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          document_id: string;
          id?: string;
          item_id?: string | null;
          line_no?: number;
          quantity?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          document_id?: string;
          id?: string;
          item_id?: string | null;
          line_no?: number;
          quantity?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "package_lines_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "packages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "package_lines_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_item_stock";
            referencedColumns: ["item_id"];
          },
          {
            foreignKeyName: "package_lines_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "package_lines_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      packages: {
        Row: {
          carrier: string | null;
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          date: string | null;
          deleted_at: string | null;
          id: string;
          notes: string | null;
          number: string | null;
          posted_at: string | null;
          reversal_id: string | null;
          sales_order_id: string | null;
          status: string | null;
          tenant_id: string;
          tracking: string | null;
          updated_at: string;
          voided_at: string | null;
          voided_by: string | null;
          warehouse_id: string | null;
          weight: number | null;
        };
        Insert: {
          carrier?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          date?: string | null;
          deleted_at?: string | null;
          id?: string;
          notes?: string | null;
          number?: string | null;
          posted_at?: string | null;
          reversal_id?: string | null;
          sales_order_id?: string | null;
          status?: string | null;
          tenant_id: string;
          tracking?: string | null;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          warehouse_id?: string | null;
          weight?: number | null;
        };
        Update: {
          carrier?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          date?: string | null;
          deleted_at?: string | null;
          id?: string;
          notes?: string | null;
          number?: string | null;
          posted_at?: string | null;
          reversal_id?: string | null;
          sales_order_id?: string | null;
          status?: string | null;
          tenant_id?: string;
          tracking?: string | null;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          warehouse_id?: string | null;
          weight?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "packages_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "packages_sales_order_id_fkey";
            columns: ["sales_order_id"];
            isOneToOne: false;
            referencedRelation: "sales_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "packages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "packages_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_applications: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          invoice_id: string;
          payment_id: string;
          tenant_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          invoice_id: string;
          payment_id: string;
          tenant_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          invoice_id?: string;
          payment_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_applications_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_applications_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments_received";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_applications_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_made_applications: {
        Row: {
          amount: number;
          bill_id: string;
          created_at: string;
          id: string;
          payment_id: string;
          tenant_id: string;
        };
        Insert: {
          amount?: number;
          bill_id: string;
          created_at?: string;
          id?: string;
          payment_id: string;
          tenant_id: string;
        };
        Update: {
          amount?: number;
          bill_id?: string;
          created_at?: string;
          id?: string;
          payment_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_made_applications_bill_id_fkey";
            columns: ["bill_id"];
            isOneToOne: false;
            referencedRelation: "bills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_made_applications_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments_made";
            referencedColumns: ["id"];
          },
        ];
      };
      payments_made: {
        Row: {
          amount: number | null;
          created_at: string;
          created_by: string | null;
          date: string | null;
          deleted_at: string | null;
          id: string;
          mode: string | null;
          number: string | null;
          posted_at: string | null;
          reference: string | null;
          reversal_id: string | null;
          supplier_id: string | null;
          tenant_id: string;
          updated_at: string;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          amount?: number | null;
          created_at?: string;
          created_by?: string | null;
          date?: string | null;
          deleted_at?: string | null;
          id?: string;
          mode?: string | null;
          number?: string | null;
          posted_at?: string | null;
          reference?: string | null;
          reversal_id?: string | null;
          supplier_id?: string | null;
          tenant_id: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          amount?: number | null;
          created_at?: string;
          created_by?: string | null;
          date?: string | null;
          deleted_at?: string | null;
          id?: string;
          mode?: string | null;
          number?: string | null;
          posted_at?: string | null;
          reference?: string | null;
          reversal_id?: string | null;
          supplier_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_made_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_made_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      payments_received: {
        Row: {
          amount: number | null;
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          date: string | null;
          deleted_at: string | null;
          id: string;
          mode: string | null;
          number: string | null;
          posted_at: string | null;
          reference: string | null;
          reversal_id: string | null;
          tenant_id: string;
          updated_at: string;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          amount?: number | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          date?: string | null;
          deleted_at?: string | null;
          id?: string;
          mode?: string | null;
          number?: string | null;
          posted_at?: string | null;
          reference?: string | null;
          reversal_id?: string | null;
          tenant_id: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          amount?: number | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          date?: string | null;
          deleted_at?: string | null;
          id?: string;
          mode?: string | null;
          number?: string | null;
          posted_at?: string | null;
          reference?: string | null;
          reversal_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_received_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_received_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      permissions: {
        Row: {
          action: string;
          code: string;
          created_at: string;
          description: string | null;
          module: string;
        };
        Insert: {
          action: string;
          code: string;
          created_at?: string;
          description?: string | null;
          module: string;
        };
        Update: {
          action?: string;
          code?: string;
          created_at?: string;
          description?: string | null;
          module?: string;
        };
        Relationships: [];
      };
      posting_audit_events: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          metadata: Json;
          permission_code: string;
          posted_at: string;
          result: string;
          tenant_id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          metadata?: Json;
          permission_code: string;
          posted_at?: string;
          result?: string;
          tenant_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          metadata?: Json;
          permission_code?: string;
          posted_at?: string;
          result?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "posting_audit_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      production_orders: {
        Row: {
          bom_id: string | null;
          created_at: string;
          created_by: string | null;
          date: string;
          deleted_at: string | null;
          id: string;
          notes: string | null;
          number: string;
          posted_at: string | null;
          quantity: number;
          reversal_id: string | null;
          status: string | null;
          tenant_id: string;
          updated_at: string;
          voided_at: string | null;
          voided_by: string | null;
          warehouse_id: string | null;
        };
        Insert: {
          bom_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          date?: string;
          deleted_at?: string | null;
          id?: string;
          notes?: string | null;
          number: string;
          posted_at?: string | null;
          quantity?: number;
          reversal_id?: string | null;
          status?: string | null;
          tenant_id: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          warehouse_id?: string | null;
        };
        Update: {
          bom_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          date?: string;
          deleted_at?: string | null;
          id?: string;
          notes?: string | null;
          number?: string;
          posted_at?: string | null;
          quantity?: number;
          reversal_id?: string | null;
          status?: string | null;
          tenant_id?: string;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          warehouse_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "production_orders_bom_id_fkey";
            columns: ["bom_id"];
            isOneToOne: false;
            referencedRelation: "bom_headers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_orders_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          phone: string | null;
          tenant_id: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_order_lines: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          discount_pct: number;
          document_id: string;
          id: string;
          item_id: string | null;
          line_no: number;
          line_total: number;
          quantity: number;
          tax_pct: number;
          tenant_id: string;
          unit_price: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          discount_pct?: number;
          document_id: string;
          id?: string;
          item_id?: string | null;
          line_no?: number;
          line_total?: number;
          quantity?: number;
          tax_pct?: number;
          tenant_id: string;
          unit_price?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          discount_pct?: number;
          document_id?: string;
          id?: string;
          item_id?: string | null;
          line_no?: number;
          line_total?: number;
          quantity?: number;
          tax_pct?: number;
          tenant_id?: string;
          unit_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_orders: {
        Row: {
          amount: number | null;
          converted_bill_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          date: string | null;
          deleted_at: string | null;
          discount_total: number;
          expected_date: string | null;
          grand_total: number;
          id: string;
          notes: string | null;
          number: string | null;
          search_vec: unknown;
          status: string | null;
          subtotal: number;
          supplier_id: string | null;
          tax_total: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          amount?: number | null;
          converted_bill_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          date?: string | null;
          deleted_at?: string | null;
          discount_total?: number;
          expected_date?: string | null;
          grand_total?: number;
          id?: string;
          notes?: string | null;
          number?: string | null;
          search_vec?: unknown;
          status?: string | null;
          subtotal?: number;
          supplier_id?: string | null;
          tax_total?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number | null;
          converted_bill_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          date?: string | null;
          deleted_at?: string | null;
          discount_total?: number;
          expected_date?: string | null;
          grand_total?: number;
          id?: string;
          notes?: string | null;
          number?: string | null;
          search_vec?: unknown;
          status?: string | null;
          subtotal?: number;
          supplier_id?: string | null;
          tax_total?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_requisition_lines: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          discount_pct: number;
          document_id: string;
          id: string;
          item_id: string | null;
          line_no: number;
          line_total: number;
          quantity: number;
          tax_pct: number;
          tenant_id: string;
          unit_price: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          discount_pct?: number;
          document_id: string;
          id?: string;
          item_id?: string | null;
          line_no: number;
          line_total?: number;
          quantity?: number;
          tax_pct?: number;
          tenant_id: string;
          unit_price?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          discount_pct?: number;
          document_id?: string;
          id?: string;
          item_id?: string | null;
          line_no?: number;
          line_total?: number;
          quantity?: number;
          tax_pct?: number;
          tenant_id?: string;
          unit_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_requisition_lines_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "purchase_requisitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_requisition_lines_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_item_stock";
            referencedColumns: ["item_id"];
          },
          {
            foreignKeyName: "purchase_requisition_lines_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_requisition_lines_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_requisitions: {
        Row: {
          amount: number | null;
          converted_po_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          date: string | null;
          deleted_at: string | null;
          department: string | null;
          discount_total: number;
          grand_total: number;
          id: string;
          notes: string | null;
          number: string | null;
          requested_by: string | null;
          required_date: string | null;
          status: string | null;
          subtotal: number;
          supplier_id: string | null;
          tax_total: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          amount?: number | null;
          converted_po_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          date?: string | null;
          deleted_at?: string | null;
          department?: string | null;
          discount_total?: number;
          grand_total?: number;
          id?: string;
          notes?: string | null;
          number?: string | null;
          requested_by?: string | null;
          required_date?: string | null;
          status?: string | null;
          subtotal?: number;
          supplier_id?: string | null;
          tax_total?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number | null;
          converted_po_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          date?: string | null;
          deleted_at?: string | null;
          department?: string | null;
          discount_total?: number;
          grand_total?: number;
          id?: string;
          notes?: string | null;
          number?: string | null;
          requested_by?: string | null;
          required_date?: string | null;
          status?: string | null;
          subtotal?: number;
          supplier_id?: string | null;
          tax_total?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_requisitions_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_requisitions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          created_at: string;
          permission_code: string;
          role: string;
        };
        Insert: {
          created_at?: string;
          permission_code: string;
          role: string;
        };
        Update: {
          created_at?: string;
          permission_code?: string;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_code_fkey";
            columns: ["permission_code"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["code"];
          },
        ];
      };
      sales_order_lines: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          description: string;
          discount_pct: number;
          document_id: string;
          id: string;
          item_id: string | null;
          line_no: number;
          line_total: number;
          quantity: number;
          tax_pct: number;
          tenant_id: string;
          unit_price: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          discount_pct?: number;
          document_id: string;
          id?: string;
          item_id?: string | null;
          line_no?: number;
          line_total?: number;
          quantity?: number;
          tax_pct?: number;
          tenant_id: string;
          unit_price?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          discount_pct?: number;
          document_id?: string;
          id?: string;
          item_id?: string | null;
          line_no?: number;
          line_total?: number;
          quantity?: number;
          tax_pct?: number;
          tenant_id?: string;
          unit_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_order_lines_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "sales_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_order_lines_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_item_stock";
            referencedColumns: ["item_id"];
          },
          {
            foreignKeyName: "sales_order_lines_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_order_lines_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_orders: {
        Row: {
          amount: number | null;
          converted_invoice_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          customer_id: string | null;
          date: string | null;
          deleted_at: string | null;
          discount_total: number;
          grand_total: number;
          id: string;
          items_count: number | null;
          notes: string | null;
          number: string | null;
          search_vec: unknown;
          source_quote_id: string | null;
          status: string | null;
          subtotal: number;
          tax_total: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          amount?: number | null;
          converted_invoice_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id?: string | null;
          date?: string | null;
          deleted_at?: string | null;
          discount_total?: number;
          grand_total?: number;
          id?: string;
          items_count?: number | null;
          notes?: string | null;
          number?: string | null;
          search_vec?: unknown;
          source_quote_id?: string | null;
          status?: string | null;
          subtotal?: number;
          tax_total?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number | null;
          converted_invoice_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id?: string | null;
          date?: string | null;
          deleted_at?: string | null;
          discount_total?: number;
          grand_total?: number;
          id?: string;
          items_count?: number | null;
          notes?: string | null;
          number?: string | null;
          search_vec?: unknown;
          source_quote_id?: string | null;
          status?: string | null;
          subtotal?: number;
          tax_total?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_orders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_quote_lines: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          description: string;
          discount_pct: number;
          document_id: string;
          id: string;
          item_id: string | null;
          line_no: number;
          line_total: number;
          quantity: number;
          tax_pct: number;
          tenant_id: string;
          unit_price: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          discount_pct?: number;
          document_id: string;
          id?: string;
          item_id?: string | null;
          line_no?: number;
          line_total?: number;
          quantity?: number;
          tax_pct?: number;
          tenant_id: string;
          unit_price?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          discount_pct?: number;
          document_id?: string;
          id?: string;
          item_id?: string | null;
          line_no?: number;
          line_total?: number;
          quantity?: number;
          tax_pct?: number;
          tenant_id?: string;
          unit_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_quote_lines_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "sales_quotes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_quote_lines_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_item_stock";
            referencedColumns: ["item_id"];
          },
          {
            foreignKeyName: "sales_quote_lines_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_quote_lines_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_quotes: {
        Row: {
          amount: number | null;
          converted_order_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          customer_id: string | null;
          date: string | null;
          deleted_at: string | null;
          discount_total: number;
          expiry: string | null;
          grand_total: number;
          id: string;
          notes: string | null;
          number: string | null;
          search_vec: unknown;
          status: string | null;
          subtotal: number;
          tax_total: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          amount?: number | null;
          converted_order_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id?: string | null;
          date?: string | null;
          deleted_at?: string | null;
          discount_total?: number;
          expiry?: string | null;
          grand_total?: number;
          id?: string;
          notes?: string | null;
          number?: string | null;
          search_vec?: unknown;
          status?: string | null;
          subtotal?: number;
          tax_total?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number | null;
          converted_order_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id?: string | null;
          date?: string | null;
          deleted_at?: string | null;
          discount_total?: number;
          expiry?: string | null;
          grand_total?: number;
          id?: string;
          notes?: string | null;
          number?: string | null;
          search_vec?: unknown;
          status?: string | null;
          subtotal?: number;
          tax_total?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_quotes_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_quotes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      shipments: {
        Row: {
          carrier: string | null;
          cost: number | null;
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          deleted_at: string | null;
          delivery_date: string | null;
          id: string;
          notes: string | null;
          number: string | null;
          package_id: string | null;
          posted_at: string | null;
          reversal_id: string | null;
          sales_order_id: string | null;
          service_level: string | null;
          ship_date: string | null;
          status: string | null;
          tenant_id: string;
          tracking: string | null;
          updated_at: string;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          carrier?: string | null;
          cost?: number | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          deleted_at?: string | null;
          delivery_date?: string | null;
          id?: string;
          notes?: string | null;
          number?: string | null;
          package_id?: string | null;
          posted_at?: string | null;
          reversal_id?: string | null;
          sales_order_id?: string | null;
          service_level?: string | null;
          ship_date?: string | null;
          status?: string | null;
          tenant_id: string;
          tracking?: string | null;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          carrier?: string | null;
          cost?: number | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          deleted_at?: string | null;
          delivery_date?: string | null;
          id?: string;
          notes?: string | null;
          number?: string | null;
          package_id?: string | null;
          posted_at?: string | null;
          reversal_id?: string | null;
          sales_order_id?: string | null;
          service_level?: string | null;
          ship_date?: string | null;
          status?: string | null;
          tenant_id?: string;
          tracking?: string | null;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "shipments_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shipments_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "packages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shipments_sales_order_id_fkey";
            columns: ["sales_order_id"];
            isOneToOne: false;
            referencedRelation: "sales_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shipments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_movements: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          item_id: string;
          note: string | null;
          quantity: number;
          ref_id: string | null;
          ref_type: string;
          tenant_id: string;
          unit_cost: number;
          warehouse_id: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          item_id: string;
          note?: string | null;
          quantity: number;
          ref_id?: string | null;
          ref_type: string;
          tenant_id: string;
          unit_cost?: number;
          warehouse_id?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          item_id?: string;
          note?: string | null;
          quantity?: number;
          ref_id?: string | null;
          ref_type?: string;
          tenant_id?: string;
          unit_cost?: number;
          warehouse_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_item_stock";
            referencedColumns: ["item_id"];
          },
          {
            foreignKeyName: "stock_movements_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      suppliers: {
        Row: {
          balance: number | null;
          category: string | null;
          code: string | null;
          created_at: string;
          created_by: string | null;
          currency: string | null;
          deleted_at: string | null;
          email: string | null;
          id: string;
          name: string;
          notes: string | null;
          phone: string | null;
          search_vec: unknown;
          status: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          balance?: number | null;
          category?: string | null;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          deleted_at?: string | null;
          email?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          phone?: string | null;
          search_vec?: unknown;
          status?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          balance?: number | null;
          category?: string | null;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          deleted_at?: string | null;
          email?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          search_vec?: unknown;
          status?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_features: {
        Row: {
          enabled: boolean;
          feature: string;
          source: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          enabled?: boolean;
          feature: string;
          source?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          enabled?: boolean;
          feature?: string;
          source?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_features_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          created_at: string;
          currency: string;
          deleted_at: string | null;
          id: string;
          name: string;
          slug: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          deleted_at?: string | null;
          id?: string;
          name: string;
          slug: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          deleted_at?: string | null;
          id?: string;
          name?: string;
          slug?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          tenant_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          tenant_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          tenant_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      warehouses: {
        Row: {
          code: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          id: string;
          location: string | null;
          name: string;
          status: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          id?: string;
          location?: string | null;
          name: string;
          status?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          id?: string;
          location?: string | null;
          name?: string;
          status?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "warehouses_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      inventory_item_stock: {
        Row: {
          item_id: string | null;
          name: string | null;
          on_hand: number | null;
          reorder: number | null;
          sku: string | null;
          tenant_id: string | null;
          uom: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_warehouse_stock: {
        Row: {
          item_id: string | null;
          on_hand: number | null;
          tenant_id: string | null;
          warehouse_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_item_stock";
            referencedColumns: ["item_id"];
          },
          {
            foreignKeyName: "stock_movements_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      _account_id: { Args: { _code: string; _tenant: string }; Returns: string };
      act_on_approval_request: {
        Args: { _action: string; _note?: string; _request_id: string };
        Returns: {
          amount: number | null;
          completed_at: string | null;
          created_at: string;
          current_step: number;
          entity_id: string;
          entity_type: string;
          id: string;
          idempotency_key: string | null;
          payload: Json;
          requested_by: string;
          status: string;
          submitted_at: string;
          tenant_id: string;
          updated_at: string;
          workflow_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "approval_requests";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      add_approval_workflow_step: {
        Args: {
          _approver_role?: string;
          _approver_type: string;
          _approver_user_id?: string;
          _minimum_approvals?: number;
          _name: string;
          _step_order: number;
          _workflow_id: string;
        };
        Returns: string;
      };
      admin_set_user_roles: {
        Args: {
          new_roles: Database["public"]["Enums"]["app_role"][];
          target_user: string;
        };
        Returns: undefined;
      };
      apply_payment: {
        Args: { _allocations: Json; _payment_id: string };
        Returns: undefined;
      };
      apply_payment_made: {
        Args: { _allocations: Json; _payment_id: string };
        Returns: undefined;
      };
      approval_actor_can_act: {
        Args: {
          _request: Database["public"]["Tables"]["approval_requests"]["Row"];
          _step: Database["public"]["Tables"]["approval_workflow_steps"]["Row"];
        };
        Returns: boolean;
      };
      approval_condition_matches: {
        Args: { _amount: number; _conditions: Json };
        Returns: boolean;
      };
      audit_request_ip: { Args: never; Returns: unknown };
      audit_request_user_agent: { Args: never; Returns: string };
      check_inventory_stock_integrity: {
        Args: { _item_id?: string };
        Returns: {
          difference: number;
          is_valid: boolean;
          item_id: string;
          item_name: string;
          ledger_on_hand: number;
          projected_stock: number;
          sku: string;
        }[];
      };
      complete_posting: {
        Args: {
          _action: string;
          _entity_id: string;
          _entity_type: string;
          _permission: string;
          _require_journal?: boolean;
        };
        Returns: string;
      };
      convert_order_to_invoice: { Args: { _order_id: string }; Returns: string };
      convert_po_to_bill: { Args: { _po_id: string }; Returns: string };
      convert_quote_to_order: { Args: { _quote_id: string }; Returns: string };
      create_approval_request: {
        Args: {
          _amount?: number;
          _entity_id: string;
          _entity_type: string;
          _idempotency_key?: string;
          _payload?: Json;
          _workflow_code?: string;
        };
        Returns: string;
      };
      create_approval_workflow: {
        Args: {
          _code: string;
          _conditions?: Json;
          _description?: string;
          _entity_type: string;
          _name: string;
        };
        Returns: string;
      };
      create_notification: {
        Args: {
          _entity_id?: string;
          _entity_type?: string;
          _message: string;
          _severity?: string;
          _title: string;
          _type: string;
          _user_id: string;
        };
        Returns: string;
      };
      create_reversal_journal: {
        Args: { _entity_id: string; _entity_type: string; _reason: string };
        Returns: string;
      };
      create_reversal_movements: {
        Args: { _entity_id: string; _entity_type: string; _reversal_id: string };
        Returns: number;
      };
      current_tenant_id: { Args: never; Returns: string };
      get_business_events: {
        Args: {
          _action?: string;
          _entity_id?: string;
          _entity_type?: string;
          _from?: string;
          _limit?: number;
          _to?: string;
        };
        Returns: {
          action: string;
          actor_email: string | null;
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          ip_address: unknown;
          metadata: Json;
          new_values: Json | null;
          occurred_at: string;
          old_values: Json | null;
          tenant_id: string;
          user_agent: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "business_events";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_my_approval_inbox: {
        Args: never;
        Returns: {
          amount: number;
          current_step: number;
          entity_id: string;
          entity_type: string;
          id: string;
          requested_by: string;
          status: string;
          step_name: string;
          submitted_at: string;
          workflow_name: string;
        }[];
      };
      get_my_features: {
        Args: never;
        Returns: {
          feature: string;
        }[];
      };
      get_my_notification_unread_count: { Args: never; Returns: number };
      get_my_notifications: {
        Args: { _limit?: number };
        Returns: {
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          message: string;
          read_at: string;
          severity: string;
          tenant_id: string;
          title: string;
          type: string;
          user_id: string;
        }[];
      };
      get_my_permissions: { Args: never; Returns: string[] };
      get_sales_dashboard: { Args: never; Returns: Json };
      global_search: {
        Args: {
          date_from?: string;
          date_to?: string;
          max_per_module?: number;
          modules?: string[];
          q: string;
        };
        Returns: {
          created_at: string;
          id: string;
          module: string;
          subtitle: string;
          title: string;
        }[];
      };
      has_feature: { Args: { p_feature: string }; Returns: boolean };
      has_permission: {
        Args: { _permission: string; _user_id?: string };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_super_admin: { Args: never; Returns: boolean };
      mark_all_notifications_read: { Args: never; Returns: number };
      mark_notification_read: {
        Args: { _notification_id: string };
        Returns: undefined;
      };
      post_adjustment: { Args: { _adjustment_id: string }; Returns: string };
      post_adjustment_unchecked: {
        Args: { _adjustment_id: string };
        Returns: string;
      };
      post_bill: { Args: { _bill_id: string }; Returns: string };
      post_bill_unchecked: { Args: { _bill_id: string }; Returns: string };
      post_credit_note: { Args: { _credit_note_id: string }; Returns: string };
      post_credit_note_unchecked: {
        Args: { _credit_note_id: string };
        Returns: string;
      };
      post_invoice: { Args: { _invoice_id: string }; Returns: string };
      post_invoice_unchecked: { Args: { _invoice_id: string }; Returns: string };
      post_package: { Args: { _package_id: string }; Returns: string };
      post_package_unchecked: { Args: { _package_id: string }; Returns: string };
      post_production_order: { Args: { _order_id: string }; Returns: string };
      post_production_order_unchecked: {
        Args: { _order_id: string };
        Returns: string;
      };
      post_shipment: { Args: { _shipment_id: string }; Returns: string };
      post_shipment_unchecked: {
        Args: { _shipment_id: string };
        Returns: string;
      };
      post_transfer: { Args: { _transfer_id: string }; Returns: string };
      post_transfer_unchecked: {
        Args: { _transfer_id: string };
        Returns: string;
      };
      recalculate_item_stock_projection: {
        Args: { _item_id?: string };
        Returns: number;
      };
      record_business_event: {
        Args: {
          _action: string;
          _entity_id?: string;
          _entity_type: string;
          _metadata?: Json;
          _new_values?: Json;
          _old_values?: Json;
        };
        Returns: string;
      };
      set_item_opening_stock: {
        Args: {
          _item_id: string;
          _quantity: number;
          _unit_cost?: number;
          _warehouse_id?: string;
        };
        Returns: string;
      };
      switch_tenant: { Args: { target_tenant: string }; Returns: string };
      tenant_write_ok: {
        Args: { _roles: Database["public"]["Enums"]["app_role"][] };
        Returns: boolean;
      };
      validate_posting_inventory: {
        Args: { _entity_id: string };
        Returns: number;
      };
      validate_posting_journals: {
        Args: {
          _entity_id: string;
          _entity_type: string;
          _require_journal?: boolean;
        };
        Returns: number;
      };
      validate_posting_target: {
        Args: { _document_id: string; _permission: string; _table_name: string };
        Returns: boolean;
      };
      void_posted_document: {
        Args: {
          _entity_id: string;
          _entity_type: string;
          _permission: string;
          _reason?: string;
        };
        Returns: string;
      };
    };
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
        | "cashier";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

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
      ],
    },
  },
} as const;
