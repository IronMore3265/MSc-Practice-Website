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
        Row: { created_at: string; id: string; name: string; semester_id: string; short_name: string | null; sort_order: number };
        Insert: { created_at?: string; id?: string; name: string; semester_id: string; short_name?: string | null; sort_order?: number };
        Update: { created_at?: string; id?: string; name?: string; semester_id?: string; short_name?: string | null; sort_order?: number };
        Relationships: [
          {
            foreignKeyName: "course_semester_id_fkey";
            columns: ["semester_id"];
            isOneToOne: false;
            referencedRelation: "semester";
            referencedColumns: ["id"];
          },
        ];
      };
      app_setting: {
        Row: { id: number; leaderboard_on: boolean; updated_at: string };
        Insert: { id?: number; leaderboard_on?: boolean; updated_at?: string };
        Update: { id?: number; leaderboard_on?: boolean; updated_at?: string };
        Relationships: [];
      };
      notification: {
        Row: { created_at: string; id: string; kind: string; read_at: string | null; session_run_id: string; updated_at: string; user_id: string };
        Insert: { created_at?: string; id?: string; kind: string; read_at?: string | null; session_run_id: string; updated_at?: string; user_id: string };
        Update: { created_at?: string; id?: string; kind?: string; read_at?: string | null; session_run_id?: string; updated_at?: string; user_id?: string };
        Relationships: [
          {
            foreignKeyName: "notification_session_run_id_fkey";
            columns: ["session_run_id"];
            isOneToOne: false;
            referencedRelation: "session_run";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profile";
            referencedColumns: ["id"];
          },
        ];
      };
      semester: {
        Row: { created_at: string; id: string; is_open: boolean; name: string; sort_order: number };
        Insert: { created_at?: string; id?: string; is_open?: boolean; name: string; sort_order?: number };
        Update: { created_at?: string; id?: string; is_open?: boolean; name?: string; sort_order?: number };
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
      figure: {
        Row: {
          bbox: number[];
          blob_path: string;
          caption: string | null;
          chapter_id: string;
          created_at: string;
          height: number;
          id: string;
          import_key: string;
          kind: string;
          label: string | null;
          mime_type: string;
          page: number;
          pdf_id: string;
          sha256: string;
          source: string;
          width: number;
        };
        Insert: {
          bbox: number[];
          blob_path: string;
          caption?: string | null;
          chapter_id: string;
          created_at?: string;
          height: number;
          id?: string;
          import_key: string;
          kind: string;
          label?: string | null;
          mime_type: string;
          page: number;
          pdf_id: string;
          sha256: string;
          source: string;
          width: number;
        };
        Update: {
          bbox?: number[];
          blob_path?: string;
          caption?: string | null;
          chapter_id?: string;
          created_at?: string;
          height?: number;
          id?: string;
          import_key?: string;
          kind?: string;
          label?: string | null;
          mime_type?: string;
          page?: number;
          pdf_id?: string;
          sha256?: string;
          source?: string;
          width?: number;
        };
        Relationships: [
          {
            foreignKeyName: "figure_chapter_id_fkey";
            columns: ["chapter_id"];
            isOneToOne: false;
            referencedRelation: "chapter";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "figure_pdf_id_fkey";
            columns: ["pdf_id"];
            isOneToOne: false;
            referencedRelation: "source_pdf";
            referencedColumns: ["id"];
          },
        ];
      };
      page_text: {
        Row: { page: number; pdf_id: string; text: string };
        Insert: { page: number; pdf_id: string; text: string };
        Update: { page?: number; pdf_id?: string; text?: string };
        Relationships: [
          {
            foreignKeyName: "page_text_pdf_id_fkey";
            columns: ["pdf_id"];
            isOneToOne: false;
            referencedRelation: "source_pdf";
            referencedColumns: ["id"];
          },
        ];
      };
      source_pdf: {
        Row: {
          chapter_id: string;
          figures_pending: number;
          filename: string;
          id: string;
          imported_at: string;
          page_count: number;
          pages_without_text: number;
          review_status: string;
          sha256: string;
        };
        Insert: {
          chapter_id: string;
          figures_pending?: number;
          filename: string;
          id?: string;
          imported_at?: string;
          page_count: number;
          pages_without_text?: number;
          review_status?: string;
          sha256: string;
        };
        Update: {
          chapter_id?: string;
          figures_pending?: number;
          filename?: string;
          id?: string;
          imported_at?: string;
          page_count?: number;
          pages_without_text?: number;
          review_status?: string;
          sha256?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_pdf_chapter_id_fkey";
            columns: ["chapter_id"];
            isOneToOne: true;
            referencedRelation: "chapter";
            referencedColumns: ["id"];
          },
        ];
      };
      api_slot: {
        Row: {
          cooldown_until: string | null;
          enabled: boolean;
          id: string;
          key_name: string;
          last_error: string | null;
          last_error_at: string | null;
          last_used_at: string | null;
          model: string;
          next_allowed_at: string;
          pace_seconds: number;
          priority: number;
          tier: string;
        };
        Insert: {
          cooldown_until?: string | null;
          enabled?: boolean;
          id?: string;
          key_name: string;
          last_error?: string | null;
          last_error_at?: string | null;
          last_used_at?: string | null;
          model: string;
          next_allowed_at?: string;
          pace_seconds?: number;
          priority: number;
          tier: string;
        };
        Update: {
          cooldown_until?: string | null;
          enabled?: boolean;
          id?: string;
          key_name?: string;
          last_error?: string | null;
          last_error_at?: string | null;
          last_used_at?: string | null;
          model?: string;
          next_allowed_at?: string;
          pace_seconds?: number;
          priority?: number;
          tier?: string;
        };
        Relationships: [];
      };
      job: {
        Row: {
          attempts: number;
          created_at: string;
          error: string | null;
          finished_at: string | null;
          id: string;
          kind: string;
          payload: Json;
          priority: number;
          result: Json | null;
          slot_id: string | null;
          started_at: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          kind: string;
          payload?: Json;
          priority?: number;
          result?: Json | null;
          slot_id?: string | null;
          started_at?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          kind?: string;
          payload?: Json;
          priority?: number;
          result?: Json | null;
          slot_id?: string | null;
          started_at?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_slot_id_fkey";
            columns: ["slot_id"];
            isOneToOne: false;
            referencedRelation: "api_slot";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profile";
            referencedColumns: ["id"];
          },
        ];
      };
      mcq_option: {
        Row: {
          explanation: string | null;
          id: string;
          is_correct: boolean;
          label: string;
          question_id: string;
          text: string;
        };
        Insert: {
          explanation?: string | null;
          id?: string;
          is_correct?: boolean;
          label: string;
          question_id: string;
          text: string;
        };
        Update: {
          explanation?: string | null;
          id?: string;
          is_correct?: boolean;
          label?: string;
          question_id?: string;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mcq_option_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "question";
            referencedColumns: ["id"];
          },
        ];
      };
      question: {
        Row: {
          answer_notes: string | null;
          chapter_id: string;
          course_id: string;
          created_at: string;
          created_by: string | null;
          figure_id: string | null;
          id: string;
          job_id: string | null;
          kind: Database["public"]["Enums"]["question_kind"];
          marks: number;
          origin: Database["public"]["Enums"]["question_origin"];
          source_page: number | null;
          status: Database["public"]["Enums"]["question_status"];
          text: string;
          updated_at: string;
        };
        Insert: {
          answer_notes?: string | null;
          chapter_id: string;
          course_id: string;
          created_at?: string;
          created_by?: string | null;
          figure_id?: string | null;
          id?: string;
          job_id?: string | null;
          kind: Database["public"]["Enums"]["question_kind"];
          marks?: number;
          origin?: Database["public"]["Enums"]["question_origin"];
          source_page?: number | null;
          status?: Database["public"]["Enums"]["question_status"];
          text: string;
          updated_at?: string;
        };
        Update: {
          answer_notes?: string | null;
          chapter_id?: string;
          course_id?: string;
          created_at?: string;
          created_by?: string | null;
          figure_id?: string | null;
          id?: string;
          job_id?: string | null;
          kind?: Database["public"]["Enums"]["question_kind"];
          marks?: number;
          origin?: Database["public"]["Enums"]["question_origin"];
          source_page?: number | null;
          status?: Database["public"]["Enums"]["question_status"];
          text?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_chapter_id_course_id_fkey";
            columns: ["chapter_id", "course_id"];
            isOneToOne: false;
            referencedRelation: "chapter";
            referencedColumns: ["id", "course_id"];
          },
          {
            foreignKeyName: "question_figure_id_fkey";
            columns: ["figure_id"];
            isOneToOne: false;
            referencedRelation: "figure";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "job";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profile";
            referencedColumns: ["id"];
          },
        ];
      };
      question_set: {
        Row: {
          chapter_id: string | null;
          created_at: string;
          created_by: string | null;
          exam_id: string;
          id: string;
          name: string;
          origin: string;
        };
        Insert: {
          chapter_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          exam_id: string;
          id?: string;
          name: string;
          origin: string;
        };
        Update: {
          chapter_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          exam_id?: string;
          id?: string;
          name?: string;
          origin?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_set_chapter_id_fkey";
            columns: ["chapter_id"];
            isOneToOne: false;
            referencedRelation: "chapter";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_set_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exam";
            referencedColumns: ["id"];
          },
        ];
      };
      question_set_item: {
        Row: {
          position: number;
          question_id: string;
          set_id: string;
        };
        Insert: {
          position: number;
          question_id: string;
          set_id: string;
        };
        Update: {
          position?: number;
          question_id?: string;
          set_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_set_item_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "question";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_set_item_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "question_set";
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
          leaderboard_since: string | null;
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
          leaderboard_since?: string | null;
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
          leaderboard_since?: string | null;
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
      session_run: {
        Row: {
          chapter_ids: string[];
          exam_id: string;
          finished_at: string | null;
          id: string;
          max_score: number | null;
          mcq_deadline_at: string | null;
          retry_of: string | null;
          score: number | null;
          sections: string[];
          set_id: string | null;
          started_at: string;
          timed_out: boolean;
          user_id: string;
        };
        Insert: {
          chapter_ids?: string[];
          exam_id: string;
          finished_at?: string | null;
          id?: string;
          max_score?: number | null;
          mcq_deadline_at?: string | null;
          retry_of?: string | null;
          score?: number | null;
          sections?: string[];
          set_id?: string | null;
          started_at?: string;
          timed_out?: boolean;
          user_id: string;
        };
        Update: {
          chapter_ids?: string[];
          exam_id?: string;
          finished_at?: string | null;
          id?: string;
          max_score?: number | null;
          mcq_deadline_at?: string | null;
          retry_of?: string | null;
          score?: number | null;
          sections?: string[];
          set_id?: string | null;
          started_at?: string;
          timed_out?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_run_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exam";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_run_retry_of_fkey";
            columns: ["retry_of"];
            isOneToOne: false;
            referencedRelation: "session_run";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_run_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "question_set";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_run_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profile";
            referencedColumns: ["id"];
          },
        ];
      };
      attempt: {
        Row: {
          answer_source: string;
          answer_text: string | null;
          photo_paths: string[];
          photos_added_at: string | null;
          transcribe_job_id: string | null;
          transcription: string | null;
          transcription_unsure: Json | null;
          answered_at: string | null;
          feedback: Json | null;
          graded_at: string | null;
          job_id: string | null;
          id: string;
          is_correct: boolean | null;
          position: number;
          question_id: string;
          score: number;
          seconds_spent: number | null;
          selected_option_id: string | null;
          session_run_id: string;
          user_id: string;
        };
        Insert: {
          answer_source?: string;
          answer_text?: string | null;
          photo_paths?: string[];
          photos_added_at?: string | null;
          transcribe_job_id?: string | null;
          transcription?: string | null;
          transcription_unsure?: Json | null;
          answered_at?: string | null;
          feedback?: Json | null;
          graded_at?: string | null;
          job_id?: string | null;
          id?: string;
          is_correct?: boolean | null;
          position: number;
          question_id: string;
          score?: number;
          seconds_spent?: number | null;
          selected_option_id?: string | null;
          session_run_id: string;
          user_id: string;
        };
        Update: {
          answer_source?: string;
          answer_text?: string | null;
          photo_paths?: string[];
          photos_added_at?: string | null;
          transcribe_job_id?: string | null;
          transcription?: string | null;
          transcription_unsure?: Json | null;
          answered_at?: string | null;
          feedback?: Json | null;
          graded_at?: string | null;
          job_id?: string | null;
          id?: string;
          is_correct?: boolean | null;
          position?: number;
          question_id?: string;
          score?: number;
          seconds_spent?: number | null;
          selected_option_id?: string | null;
          session_run_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attempt_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "job";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempt_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "question";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempt_selected_option_id_fkey";
            columns: ["selected_option_id"];
            isOneToOne: false;
            referencedRelation: "mcq_option";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempt_session_run_id_fkey";
            columns: ["session_run_id"];
            isOneToOne: false;
            referencedRelation: "session_run";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempt_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profile";
            referencedColumns: ["id"];
          },
        ];
      };
      question_report: {
        Row: { created_at: string; id: string; note: string | null; question_id: string; user_id: string };
        Insert: { created_at?: string; id?: string; note?: string | null; question_id: string; user_id: string };
        Update: { created_at?: string; id?: string; note?: string | null; question_id?: string; user_id?: string };
        Relationships: [
          {
            foreignKeyName: "question_report_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "question";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_report_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profile";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      exam_leaderboard: {
        Args: { p_exam_id: string };
        Returns: { rank: number; name: string; avg_percent: number; sessions: number; is_me: boolean }[];
      };
      set_leaderboard_opt_in: {
        Args: { p_on: boolean };
        Returns: string | null;
      };
      claim_next_job: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      create_auto_set: {
        Args: { p_chapter_id?: string; p_exam_id: string; p_user: string };
        Returns: string;
      };
      save_question: {
        Args: { p_options: Json; p_question: Json };
        Returns: string;
      };
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
      start_mcq_session: {
        Args: { p_set_id: string; p_chapter_ids?: string[]; p_retry_of?: string };
        Returns: string;
      };
      get_session: { Args: { p_session: string }; Returns: Json };
      answer_mcq: { Args: { p_option: string; p_question: string; p_session: string }; Returns: Json };
      finish_mcq_session: { Args: { p_session: string }; Returns: Json };
      start_cq_session: { Args: { p_set_id: string; p_chapter_ids?: string[] }; Returns: string };
      get_cq_session: { Args: { p_session: string }; Returns: Json };
      submit_cq_answer: { Args: { p_session: string; p_question: string; p_answer: string; p_seconds?: number }; Returns: Json };
      add_cq_photo: { Args: { p_session: string; p_question: string; p_path: string }; Returns: Json };
      remove_cq_photo: { Args: { p_session: string; p_question: string; p_file: string }; Returns: string };
      reset_cq_photos: { Args: { p_session: string; p_question: string }; Returns: string[] };
      start_cq_transcription: { Args: { p_session: string; p_question: string }; Returns: Json };
      record_cq_transcription: { Args: { p_attempt: string; p_job: string; p_text: string; p_unsure: Json }; Returns: boolean };
      record_cq_grade: { Args: { p_attempt: string; p_score: number; p_feedback: Json }; Returns: undefined };
    };
    Enums: {
      exam_format: "mcq" | "cq" | "both";
      question_kind: "mcq" | "cq" | "problem";
      question_origin: "manual" | "ai";
      question_status: "draft" | "approved";
      user_role: "student" | "admin";
      user_status: "pending" | "active" | "disabled";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = Database["public"]["Tables"]["profile"]["Row"];
export type Invite = Database["public"]["Tables"]["invite"]["Row"];
export type Course = Database["public"]["Tables"]["course"]["Row"];
export type Semester = Database["public"]["Tables"]["semester"]["Row"];
export type Chapter = Database["public"]["Tables"]["chapter"]["Row"];
export type Exam = Database["public"]["Tables"]["exam"]["Row"];
export type ExamSetSettings = Database["public"]["Tables"]["exam_set_settings"]["Row"];
export type ExamFormat = Database["public"]["Enums"]["exam_format"];
export type SourcePdf = Database["public"]["Tables"]["source_pdf"]["Row"];
export type Figure = Database["public"]["Tables"]["figure"]["Row"];
export type Question = Database["public"]["Tables"]["question"]["Row"];
export type McqOption = Database["public"]["Tables"]["mcq_option"]["Row"];
export type QuestionSet = Database["public"]["Tables"]["question_set"]["Row"];
export type QuestionKind = Database["public"]["Enums"]["question_kind"];
export type QuestionStatus = Database["public"]["Enums"]["question_status"];
export type ApiSlot = Database["public"]["Tables"]["api_slot"]["Row"];
export type Job = Database["public"]["Tables"]["job"]["Row"];
