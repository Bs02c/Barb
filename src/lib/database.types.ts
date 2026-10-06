
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "appointments": {
                  Row: {
                    "barber_id": string,"barbershop_id": string,"cancel_token_hash": string | null,"cancelled_at": string | null,"created_at": string,"customer_email": string,"customer_name": string,"customer_phone": string,"data_consent_at": string,"ends_at": string,"id": string,"service_duration_minutes": number,"service_id": string,"service_price": number,"starts_at": string,"status": Database["public"]['Enums']["appointment_status"]
                  }
                  Insert: {
                    "barber_id": string,"barbershop_id": string,"cancel_token_hash"?: string | null,"cancelled_at"?: string | null,"created_at"?: string,"customer_email": string,"customer_name": string,"customer_phone": string,"data_consent_at": string,"ends_at": string,"id"?: string,"service_duration_minutes": number,"service_id": string,"service_price": number,"starts_at": string,"status"?: Database["public"]['Enums']["appointment_status"]
                  }
                  Update: {
                    "barber_id"?: string,"barbershop_id"?: string,"cancel_token_hash"?: string | null,"cancelled_at"?: string | null,"created_at"?: string,"customer_email"?: string,"customer_name"?: string,"customer_phone"?: string,"data_consent_at"?: string,"ends_at"?: string,"id"?: string,"service_duration_minutes"?: number,"service_id"?: string,"service_price"?: number,"starts_at"?: string,"status"?: Database["public"]['Enums']["appointment_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointments_barber_fkey"
      columns: ["barber_id","barbershop_id"]
isOneToOne: false
      referencedRelation: "barbers"
      referencedColumns: ["id","barbershop_id"]
    },{
      foreignKeyName: "appointments_barbershop_id_fkey"
      columns: ["barbershop_id"]
isOneToOne: false
      referencedRelation: "barbershops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_service_fkey"
      columns: ["service_id","barbershop_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id","barbershop_id"]
    }
                  ]
                },"barber_blocks": {
                  Row: {
                    "barber_id": string,"barbershop_id": string,"created_at": string,"ends_at": string,"id": string,"reason": string | null,"starts_at": string
                  }
                  Insert: {
                    "barber_id": string,"barbershop_id": string,"created_at"?: string,"ends_at": string,"id"?: string,"reason"?: string | null,"starts_at": string
                  }
                  Update: {
                    "barber_id"?: string,"barbershop_id"?: string,"created_at"?: string,"ends_at"?: string,"id"?: string,"reason"?: string | null,"starts_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "barber_blocks_barber_fkey"
      columns: ["barber_id","barbershop_id"]
isOneToOne: false
      referencedRelation: "barbers"
      referencedColumns: ["id","barbershop_id"]
    },{
      foreignKeyName: "barber_blocks_barbershop_id_fkey"
      columns: ["barbershop_id"]
isOneToOne: false
      referencedRelation: "barbershops"
      referencedColumns: ["id"]
    }
                  ]
                },"barber_schedules": {
                  Row: {
                    "barber_id": string,"barbershop_id": string,"created_at": string,"end_time": string,"id": string,"start_time": string,"weekday": number
                  }
                  Insert: {
                    "barber_id": string,"barbershop_id": string,"created_at"?: string,"end_time": string,"id"?: string,"start_time": string,"weekday": number
                  }
                  Update: {
                    "barber_id"?: string,"barbershop_id"?: string,"created_at"?: string,"end_time"?: string,"id"?: string,"start_time"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "barber_schedules_barber_fkey"
      columns: ["barber_id","barbershop_id"]
isOneToOne: false
      referencedRelation: "barbers"
      referencedColumns: ["id","barbershop_id"]
    },{
      foreignKeyName: "barber_schedules_barbershop_id_fkey"
      columns: ["barbershop_id"]
isOneToOne: false
      referencedRelation: "barbershops"
      referencedColumns: ["id"]
    }
                  ]
                },"barbers": {
                  Row: {
                    "barbershop_id": string,"created_at": string,"id": string,"is_active": boolean,"name": string
                  }
                  Insert: {
                    "barbershop_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string
                  }
                  Update: {
                    "barbershop_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "barbers_barbershop_id_fkey"
      columns: ["barbershop_id"]
isOneToOne: false
      referencedRelation: "barbershops"
      referencedColumns: ["id"]
    }
                  ]
                },"barbershops": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"name": string,"subdomain": string,"timezone": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"subdomain": string,"timezone"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"subdomain"?: string,"timezone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "barbershop_id": string | null,"created_at": string,"role": Database["public"]['Enums']["user_role"],"user_id": string
                  }
                  Insert: {
                    "barbershop_id"?: string | null,"created_at"?: string,"role": Database["public"]['Enums']["user_role"],"user_id": string
                  }
                  Update: {
                    "barbershop_id"?: string | null,"created_at"?: string,"role"?: Database["public"]['Enums']["user_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_barbershop_id_fkey"
      columns: ["barbershop_id"]
isOneToOne: false
      referencedRelation: "barbershops"
      referencedColumns: ["id"]
    }
                  ]
                },"services": {
                  Row: {
                    "barbershop_id": string,"created_at": string,"duration_minutes": number,"id": string,"is_active": boolean,"name": string,"price": number
                  }
                  Insert: {
                    "barbershop_id": string,"created_at"?: string,"duration_minutes": number,"id"?: string,"is_active"?: boolean,"name": string,"price": number
                  }
                  Update: {
                    "barbershop_id"?: string,"created_at"?: string,"duration_minutes"?: number,"id"?: string,"is_active"?: boolean,"name"?: string,"price"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "services_barbershop_id_fkey"
      columns: ["barbershop_id"]
isOneToOne: false
      referencedRelation: "barbershops"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            "appointment_status": "active"|"cancelled","user_role": "super_admin"|"admin"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "appointment_status": ["active", "cancelled"],"user_role": ["super_admin", "admin"]
          }
        }
} as const
