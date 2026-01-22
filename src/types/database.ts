export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          // NOTE: Production DB uses `logo_base64` (HTML-era schema). Keep both for compatibility.
          logo_base64?: string | null
          logo_url?: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          logo_base64?: string | null
          logo_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          logo_base64?: string | null
          logo_url?: string | null
          created_at?: string
        }
      }
      users: {
        Row: {
          id: string
          name: string
          email: string
          phone: string | null
          organization_id: string | null
          title: string | null
          department: string | null
          manager_id?: string | null
          position_level: 'executive' | 'manager' | 'peer' | 'subordinate'
          role: 'super_admin' | 'org_admin' | 'user'
          status: 'active' | 'inactive'
          preferred_language: 'tr' | 'en' | 'fr'
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          phone?: string | null
          organization_id?: string | null
          title?: string | null
          department?: string | null
          manager_id?: string | null
          position_level?: 'executive' | 'manager' | 'peer' | 'subordinate'
          role?: 'super_admin' | 'org_admin' | 'user'
          status?: 'active' | 'inactive'
          preferred_language?: 'tr' | 'en' | 'fr'
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          phone?: string | null
          organization_id?: string | null
          title?: string | null
          department?: string | null
          manager_id?: string | null
          position_level?: 'executive' | 'manager' | 'peer' | 'subordinate'
          role?: 'super_admin' | 'org_admin' | 'user'
          status?: 'active' | 'inactive'
          preferred_language?: 'tr' | 'en' | 'fr'
          created_at?: string
        }
      }
      evaluation_periods: {
        Row: {
          id: string
          name: string
          name_en?: string | null
          name_fr?: string | null
          organization_id: string
          start_date: string
          end_date: string
          status: 'active' | 'inactive' | 'completed'
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          name_en?: string | null
          name_fr?: string | null
          organization_id: string
          start_date: string
          end_date: string
          status?: 'active' | 'inactive' | 'completed'
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          name_en?: string | null
          name_fr?: string | null
          organization_id?: string
          start_date?: string
          end_date?: string
          status?: 'active' | 'inactive' | 'completed'
          created_at?: string
        }
      }
      evaluation_assignments: {
        Row: {
          id: string
          period_id: string
          evaluator_id: string
          target_id: string
          status: 'pending' | 'completed'
          slug: string | null
          token: string | null
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          period_id: string
          evaluator_id: string
          target_id: string
          status?: 'pending' | 'completed'
          slug?: string | null
          token?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          period_id?: string
          evaluator_id?: string
          target_id?: string
          status?: 'pending' | 'completed'
          slug?: string | null
          token?: string | null
          completed_at?: string | null
          created_at?: string
        }
      }
      main_categories: {
        Row: {
          id: string
          name: string
          name_en: string | null
          name_fr: string | null
          description: string | null
          status: 'active' | 'inactive'
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          name_en?: string | null
          name_fr?: string | null
          description?: string | null
          status?: 'active' | 'inactive'
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          name_en?: string | null
          name_fr?: string | null
          description?: string | null
          status?: 'active' | 'inactive'
          created_at?: string
        }
      }
      categories: {
        Row: {
          id: string
          main_category_id: string
          name: string
          name_en: string | null
          name_fr: string | null
          created_at: string
        }
        Insert: {
          id?: string
          main_category_id: string
          name: string
          name_en?: string | null
          name_fr?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          main_category_id?: string
          name?: string
          name_en?: string | null
          name_fr?: string | null
          created_at?: string
        }
      }
      questions: {
        Row: {
          id: string
          category_id: string
          text: string
          text_en: string | null
          text_fr: string | null
          order_num: number
          created_at: string
        }
        Insert: {
          id?: string
          category_id: string
          text: string
          text_en?: string | null
          text_fr?: string | null
          order_num?: number
          created_at?: string
        }
        Update: {
          id?: string
          category_id?: string
          text?: string
          text_en?: string | null
          text_fr?: string | null
          order_num?: number
          created_at?: string
        }
      }
      answers: {
        Row: {
          id: string
          question_id: string
          text: string
          text_en: string | null
          text_fr: string | null
          std_score: number
          reel_score: number
          order_num: number
          created_at: string
        }
        Insert: {
          id?: string
          question_id: string
          text: string
          text_en?: string | null
          text_fr?: string | null
          std_score?: number
          reel_score?: number
          order_num?: number
          created_at?: string
        }
        Update: {
          id?: string
          question_id?: string
          text?: string
          text_en?: string | null
          text_fr?: string | null
          std_score?: number
          reel_score?: number
          order_num?: number
          created_at?: string
        }
      }
      evaluation_responses: {
        Row: {
          id: string
          assignment_id: string
          question_id: string
          answer_ids: string[]
          std_score: number
          reel_score: number
          category_name: string | null
          created_at: string
        }
        Insert: {
          id?: string
          assignment_id: string
          question_id: string
          answer_ids: string[]
          std_score?: number
          reel_score?: number
          category_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          assignment_id?: string
          question_id?: string
          answer_ids?: string[]
          std_score?: number
          reel_score?: number
          category_name?: string | null
          created_at?: string
        }
      }
      international_standards: {
        Row: {
          id: string
          organization_id: string
          code: string | null
          title: string
          description: string | null
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          code?: string | null
          title: string
          description?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          code?: string | null
          title?: string
          description?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      international_standard_scores: {
        Row: {
          id: string
          assignment_id: string
          standard_id: string
          score: number
          justification: string | null
          created_at: string
        }
        Insert: {
          id?: string
          assignment_id: string
          standard_id: string
          score: number
          justification?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          assignment_id?: string
          standard_id?: string
          score?: number
          justification?: string | null
          created_at?: string
        }
      }
      confidence_settings: {
        Row: {
          id: string
          organization_id: string
          min_high_confidence_evaluator_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          min_high_confidence_evaluator_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          min_high_confidence_evaluator_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      deviation_settings: {
        Row: {
          id: string
          organization_id: string
          lenient_diff_threshold: number
          harsh_diff_threshold: number
          lenient_multiplier: number
          harsh_multiplier: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          lenient_diff_threshold?: number
          harsh_diff_threshold?: number
          lenient_multiplier?: number
          harsh_multiplier?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          lenient_diff_threshold?: number
          harsh_diff_threshold?: number
          lenient_multiplier?: number
          harsh_multiplier?: number
          created_at?: string
          updated_at?: string
        }
      }
      otp_codes: {
        Row: {
          id: string
          email: string
          code: string
          code_hash?: string | null
          expires_at: string
          used: boolean
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          code: string
          code_hash?: string | null
          expires_at: string
          used?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          code?: string
          code_hash?: string | null
          expires_at?: string
          used?: boolean
          created_at?: string
        }
      }
    }
  }
}

// Convenience types
export type Organization = Database['public']['Tables']['organizations']['Row']
export type User = Database['public']['Tables']['users']['Row']
export type EvaluationPeriod = Database['public']['Tables']['evaluation_periods']['Row']
export type EvaluationAssignment = Database['public']['Tables']['evaluation_assignments']['Row']
export type MainCategory = Database['public']['Tables']['main_categories']['Row']
export type Category = Database['public']['Tables']['categories']['Row']
export type Question = Database['public']['Tables']['questions']['Row']
export type Answer = Database['public']['Tables']['answers']['Row']
export type EvaluationResponse = Database['public']['Tables']['evaluation_responses']['Row']
export type InternationalStandard = Database['public']['Tables']['international_standards']['Row']
export type InternationalStandardScore = Database['public']['Tables']['international_standard_scores']['Row']
export type ConfidenceSettings = Database['public']['Tables']['confidence_settings']['Row']
export type DeviationSettings = Database['public']['Tables']['deviation_settings']['Row']

// Extended types with relations
export type AssignmentWithRelations = EvaluationAssignment & {
  evaluator: User
  target: User
  evaluation_periods: EvaluationPeriod
}

export type UserWithOrganization = User & {
  organizations: Organization | null
}
