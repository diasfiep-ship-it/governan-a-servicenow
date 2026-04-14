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
      areas: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_email: string
          user_id: string
          user_name: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_email: string
          user_id: string
          user_name: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_email?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      base_updates: {
        Row: {
          file_name: string
          id: string
          records_count: number | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          file_name: string
          id?: string
          records_count?: number | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          file_name?: string
          id?: string
          records_count?: number | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: []
      }
      chamados: {
        Row: {
          aguardando_cliente: boolean | null
          area: string | null
          area_demandante: string
          area_modificada_por_admin: boolean | null
          atribuido_a: string | null
          cancelado: boolean | null
          cancelado_em: string | null
          cancelado_por: string | null
          catalogo: string | null
          cliente: string | null
          comentarios: string | null
          contagem_reabertura: number | null
          created_at: string
          data_abertura: string | null
          data_conclusao: string | null
          data_encerramento: string | null
          data_fechamento: string | null
          data_previsto: string | null
          data_resolvido: string | null
          descricao: string | null
          encerrado_por: string | null
          esforco: number | null
          estado: string | null
          evidencia_cancelamento_url: string | null
          gravidade: number | null
          grupo_atribuicao: string | null
          id: string
          item: string | null
          mes_priorizacao: string | null
          motivo_cancelamento: string | null
          motivo_pendencia: string | null
          numero: string
          oculto: boolean | null
          oferta: string | null
          pontuacao_gut: number | null
          prioridade_calculada: number | null
          selecionado_mes: boolean | null
          sla: string | null
          spec_ativo: boolean | null
          spec_dias_acumulados: number | null
          spec_inicio: string | null
          sprint_id: string | null
          status: string | null
          status_anterior: string | null
          tendencia: number | null
          updated_at: string
          urgencia: number | null
        }
        Insert: {
          aguardando_cliente?: boolean | null
          area?: string | null
          area_demandante: string
          area_modificada_por_admin?: boolean | null
          atribuido_a?: string | null
          cancelado?: boolean | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          catalogo?: string | null
          cliente?: string | null
          comentarios?: string | null
          contagem_reabertura?: number | null
          created_at?: string
          data_abertura?: string | null
          data_conclusao?: string | null
          data_encerramento?: string | null
          data_fechamento?: string | null
          data_previsto?: string | null
          data_resolvido?: string | null
          descricao?: string | null
          encerrado_por?: string | null
          esforco?: number | null
          estado?: string | null
          evidencia_cancelamento_url?: string | null
          gravidade?: number | null
          grupo_atribuicao?: string | null
          id?: string
          item?: string | null
          mes_priorizacao?: string | null
          motivo_cancelamento?: string | null
          motivo_pendencia?: string | null
          numero: string
          oculto?: boolean | null
          oferta?: string | null
          pontuacao_gut?: number | null
          prioridade_calculada?: number | null
          selecionado_mes?: boolean | null
          sla?: string | null
          spec_ativo?: boolean | null
          spec_dias_acumulados?: number | null
          spec_inicio?: string | null
          sprint_id?: string | null
          status?: string | null
          status_anterior?: string | null
          tendencia?: number | null
          updated_at?: string
          urgencia?: number | null
        }
        Update: {
          aguardando_cliente?: boolean | null
          area?: string | null
          area_demandante?: string
          area_modificada_por_admin?: boolean | null
          atribuido_a?: string | null
          cancelado?: boolean | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          catalogo?: string | null
          cliente?: string | null
          comentarios?: string | null
          contagem_reabertura?: number | null
          created_at?: string
          data_abertura?: string | null
          data_conclusao?: string | null
          data_encerramento?: string | null
          data_fechamento?: string | null
          data_previsto?: string | null
          data_resolvido?: string | null
          descricao?: string | null
          encerrado_por?: string | null
          esforco?: number | null
          estado?: string | null
          evidencia_cancelamento_url?: string | null
          gravidade?: number | null
          grupo_atribuicao?: string | null
          id?: string
          item?: string | null
          mes_priorizacao?: string | null
          motivo_cancelamento?: string | null
          motivo_pendencia?: string | null
          numero?: string
          oculto?: boolean | null
          oferta?: string | null
          pontuacao_gut?: number | null
          prioridade_calculada?: number | null
          selecionado_mes?: boolean | null
          sla?: string | null
          spec_ativo?: boolean | null
          spec_dias_acumulados?: number | null
          spec_inicio?: string | null
          sprint_id?: string | null
          status?: string | null
          status_anterior?: string | null
          tendencia?: number | null
          updated_at?: string
          urgencia?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chamados_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      chamados_backup: {
        Row: {
          backup_by: string
          backup_count: number
          backup_date: string
          chamado_data: Json
          id: string
        }
        Insert: {
          backup_by: string
          backup_count?: number
          backup_date?: string
          chamado_data: Json
          id?: string
        }
        Update: {
          backup_by?: string
          backup_count?: number
          backup_date?: string
          chamado_data?: Json
          id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          area_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          must_change_password: boolean
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          must_change_password?: boolean
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          must_change_password?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      sprints: {
        Row: {
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          horas_totais: number
          id: string
          nome: string
          numero: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          horas_totais?: number
          id?: string
          nome: string
          numero: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          horas_totais?: number
          id?: string
          nome?: string
          numero?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          role: string
          user_id: string
        }
        Update: {
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_area_id: { Args: { _user_id: string }; Returns: string }
      get_user_area_name: { Args: { _user_id: string }; Returns: string }
      get_user_role: { Args: { _user_id: string }; Returns: string }
      get_user_roles: { Args: { _user_id: string }; Returns: string[] }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      unaccent: { Args: { "": string }; Returns: string }
      user_has_area_access: {
        Args: { _area_demandante: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "ADM"
        | "ADM_TI"
        | "TI"
        | "CENTRO_CIVICO_ENGENHARIA"
        | "CENTRO_CIVICO_GPOG"
        | "GERENCIA_CENTRO_EVENTOS"
        | "GERENCIA_COMPRAS_LOGISTICA"
        | "GERENCIA_CONTABILIDADE_PATRIMONIO_FINANCEIRO"
        | "GERENCIA_FACILITIES"
        | "GERENCIA_PERFORMANCE_CANAIS_VENDAS"
        | "GERENCIA_PLANEJAMENTO_ORCAMENTO"
        | "GERENCIA_PROJETOS_PROCESSOS_MELHORIA"
        | "GERENCIA_RECURSOS_HUMANOS"
        | "GERENCIA_RELACIONAMENTO_IEL"
        | "GERENCIA_RISCOS_COMPLIANCE"
        | "GERENCIA_TECNOLOGIA_INFORMACAO"
        | "RECURSOS_HUMANOS"
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
        "ADM",
        "ADM_TI",
        "TI",
        "CENTRO_CIVICO_ENGENHARIA",
        "CENTRO_CIVICO_GPOG",
        "GERENCIA_CENTRO_EVENTOS",
        "GERENCIA_COMPRAS_LOGISTICA",
        "GERENCIA_CONTABILIDADE_PATRIMONIO_FINANCEIRO",
        "GERENCIA_FACILITIES",
        "GERENCIA_PERFORMANCE_CANAIS_VENDAS",
        "GERENCIA_PLANEJAMENTO_ORCAMENTO",
        "GERENCIA_PROJETOS_PROCESSOS_MELHORIA",
        "GERENCIA_RECURSOS_HUMANOS",
        "GERENCIA_RELACIONAMENTO_IEL",
        "GERENCIA_RISCOS_COMPLIANCE",
        "GERENCIA_TECNOLOGIA_INFORMACAO",
        "RECURSOS_HUMANOS",
      ],
    },
  },
} as const
