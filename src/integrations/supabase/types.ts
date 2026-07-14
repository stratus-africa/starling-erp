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
      bills: {
        Row: {
          amount: number | null
          balance: number | null
          created_at: string
          created_by: string | null
          date: string | null
          deleted_at: string | null
          due_date: string | null
          id: string
          notes: string | null
          number: string | null
          status: string | null
          supplier_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          balance?: number | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          status?: string | null
          supplier_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          balance?: number | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          status?: string | null
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
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
      chart_of_accounts: {
        Row: {
          balance: number | null
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          tenant_id: string
          type: string | null
          updated_at: string
        }
        Insert: {
          balance?: number | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          tenant_id: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          balance?: number | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          tenant_id?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_tenant_id_fkey"
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
          code: string | null
          created_at: string
          created_by: string | null
          credit_limit: number | null
          currency: string | null
          deleted_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          balance?: number | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          currency?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          balance?: number | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          currency?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
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
          balance: number | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          date: string | null
          deleted_at: string | null
          due_date: string | null
          id: string
          notes: string | null
          number: string | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          balance?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          balance?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
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
          supplier_id: string | null
          tenant_id: string
          updated_at: string
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
          supplier_id?: string | null
          tenant_id: string
          updated_at?: string
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
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
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
          reference: string | null
          tenant_id: string
          updated_at: string
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
          reference?: string | null
          tenant_id: string
          updated_at?: string
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
          reference?: string | null
          tenant_id?: string
          updated_at?: string
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
      purchase_orders: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string | null
          date: string | null
          deleted_at: string | null
          expected_date: string | null
          id: string
          notes: string | null
          number: string | null
          status: string | null
          supplier_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          status?: string | null
          supplier_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          status?: string | null
          supplier_id?: string | null
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
      sales_orders: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          date: string | null
          deleted_at: string | null
          id: string
          items_count: number | null
          notes: string | null
          number: string | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          id?: string
          items_count?: number | null
          notes?: string | null
          number?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          id?: string
          items_count?: number | null
          notes?: string | null
          number?: string | null
          status?: string | null
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
      sales_quotes: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          date: string | null
          deleted_at: string | null
          expiry: string | null
          id: string
          notes: string | null
          number: string | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          expiry?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          date?: string | null
          deleted_at?: string | null
          expiry?: string | null
          id?: string
          notes?: string | null
          number?: string | null
          status?: string | null
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
      [_ in never]: never
    }
    Functions: {
      current_tenant_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
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
      ],
    },
  },
} as const
