// Generated from the Supabase project (generate_typescript_types). Regenerate after schema migrations.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      chapter: {
        Row: { course_id: string; created_at: string; id: string; number: number; title: string };
        Insert: { course_id: string; created_at?: string; id?: string; number: number; title: string };
        Update: { course_id?: string; created_at?: string; id?: string; number?: number; title?: string };
        Relationships: [
          {
            foreignKeyName: "chapter_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "course";
            referencedColumns: ["id"];
          },
        ];
      };
      course: {
        Row: { created_at: string; id: string; name: string; short_name: string | null; sort_order: number };
        Insert: { created_at?: string; id?: string; name: string; short_name?: string | null; sort_order?: number };
        Update: { created_at?: string; id?: string; name?: string; short_name?: string | null; sort_order?: number };
        Relationships: [];
      };
      exam: {
        Row: {
          course_id: string;
          cq_marks: number;
          created_at: string;
          format: Database["public"]["Enums"]["exam_format"];
          id: string;
          mcq_marks: number;
          mcq_seconds: number;
          name: string;
          sort_order: number;
          weight: number;
        };
        Insert: {
          course_id: string;
          cq_marks?: number;
          created_at?: string;
          format?: Database["public"]["Enums"]["exam_format"];
          id?: string;
          mcq_marks?: number;
          mcq_seconds?: number;
          name: string;
          sort_order?: number;
          weight?: number;
        };
        Update: {
          course_id?: string;
          cq_marks?: number;
          created_at?: string;
          format?: Database["public"]["Enums"]["exam_format"];
          id?: string;
          mcq_marks?: number;
          mcq_seconds?: number;
          name?: string;
          sort_order?: number;
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: "exam_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "course";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_chapter: {
        Row: { chapter_id: string; exam_id: string };
        Insert: { chapter_id: string; exam_id: string };
        Update: { chapter_id?: string; exam_id?: string };
        Relationships: [
          {
            foreignKeyName: "exam_chapter_chapter_id_fkey";
            columns: ["chapter_id"];
            isOneToOne: false;
            referencedRelation: "chapter";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_chapter_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exam";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_set_settings: {
        Row: { cq_count: number; cq_marks: number; exam_id: string; mcq_count: number };
        Insert: { cq_count?: number; cq_marks?: number; exam_id: string; mcq_count?: number };
        Update: { cq_count?: number; cq_marks?: number; exam_id?: string; mcq_count?: number };
        Relationships: [
          {
            foreignKeyName: "exam_set_settings_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: true;
            referencedRelation: "exam";
            referencedColumns: ["id"];
          },
        ];
      };
      invite: {
        Row: {
          code: string;
          created_at: string;
          created_by: string;
          expires_at: string;
          id: string;
          used_at: string | null;
          used_by: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by: string;
          expires_at?: string;
          id?: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          id?: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invite_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profile";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invite_used_by_fkey";
            columns: ["used_by"];
            isOneToOne: false;
            referencedRelation: "profile";
            referencedColumns: ["id"];
          },
        ];
      };
      profile: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          daily_cap: number;
          email: string;
          id: string;
          invite_limit: number;
          invited_by: string | null;
          name: string;
          role: Database["public"]["Enums"]["user_role"];
          status: Database["public"]["Enums"]["user_status"];
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          daily_cap?: number;
          email: string;
          id: string;
          invite_limit?: number;
          invited_by?: string | null;
          name: string;
          role?: Database["public"]["Enums"]["user_role"];
          status?: Database["public"]["Enums"]["user_status"];
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          daily_cap?: number;
          email?: string;
          id?: string;
          invite_limit?: number;
          invited_by?: string | null;
          name?: string;
          role?: Database["public"]["Enums"]["user_role"];
          status?: Database["public"]["Enums"]["user_status"];
        };
        Relationships: [
          {
            foreignKeyName: "profile_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profile";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profile";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_invite: {
        Args: never;
        Returns: {
          code: string;
          created_at: string;
          created_by: string;
          expires_at: string;
          id: string;
          used_at: string | null;
          used_by: string | null;
        };
        SetofOptions: { from: "*"; to: "invite"; isOneToOne: true; isSetofReturn: false };
      };
      redeem_invite: {
        Args: { p_code: string; p_email: string; p_name: string; p_user_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      exam_format: "mcq" | "cq" | "both";
      user_role: "student" | "admin";
      user_status: "pending" | "active" | "disabled";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = Database["public"]["Tables"]["profile"]["Row"];
export type Invite = Database["public"]["Tables"]["invite"]["Row"];
export type Course = Database["public"]["Tables"]["course"]["Row"];
export type Chapter = Database["public"]["Tables"]["chapter"]["Row"];
export type Exam = Database["public"]["Tables"]["exam"]["Row"];
export type ExamSetSettings = Database["public"]["Tables"]["exam_set_settings"]["Row"];
export type ExamFormat = Database["public"]["Enums"]["exam_format"];
