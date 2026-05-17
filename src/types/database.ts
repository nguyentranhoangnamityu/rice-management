export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      attachments: {
        Row: {
          id: string;
          farmer_id: string | null;
          authorization_letter_id: string | null;
          purchase_slip_id: string | null;
          transport_trip_id: string | null;
          processing_record_id: string | null;
          payment_id: string | null;
          debt_id: string | null;
          file_name: string;
          file_path: string;
          file_type: string | null;
          file_size: number | null;
          type: Database["public"]["Enums"]["attachment_type"];
          uploaded_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          farmer_id?: string | null;
          authorization_letter_id?: string | null;
          purchase_slip_id?: string | null;
          transport_trip_id?: string | null;
          processing_record_id?: string | null;
          payment_id?: string | null;
          debt_id?: string | null;
          file_name: string;
          file_path: string;
          file_type?: string | null;
          file_size?: number | null;
          type?: Database["public"]["Enums"]["attachment_type"];
          uploaded_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["attachments"]["Insert"]>;
        Relationships: [];
      };
      authorization_letters: {
        Row: {
          id: string;
          code: string | null;
          farmer_id: string | null;
          broker_id: string | null;
          authorized_receiver_broker_id: string | null;
          signed_date: string | null;
          valid_from: string | null;
          valid_to: string | null;
          status: Database["public"]["Enums"]["authorization_letter_status"];
          pdf_attachment_id: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code?: string | null;
          farmer_id?: string | null;
          broker_id?: string | null;
          authorized_receiver_broker_id?: string | null;
          signed_date?: string | null;
          valid_from?: string | null;
          valid_to?: string | null;
          status?: Database["public"]["Enums"]["authorization_letter_status"];
          pdf_attachment_id?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["authorization_letters"]["Insert"]>;
        Relationships: [];
      };
      authorization_letter_purchase_slips: {
        Row: {
          authorization_letter_id: string;
          purchase_slip_id: string;
          created_at: string;
        };
        Insert: {
          authorization_letter_id: string;
          purchase_slip_id: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["authorization_letter_purchase_slips"]["Insert"]
        >;
        Relationships: [];
      };
      brokers: {
        Row: {
          id: string;
          name: string;
          phone: string | null;
          citizen_id: string | null;
          bank_name: string | null;
          bank_account_number: string | null;
          bank_account_name: string | null;
          default_commission_per_kg: number | null;
          address: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string | null;
          citizen_id?: string | null;
          bank_name?: string | null;
          bank_account_number?: string | null;
          bank_account_name?: string | null;
          default_commission_per_kg?: number | null;
          address?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["brokers"]["Insert"]>;
        Relationships: [];
      };
      debts: {
        Row: {
          id: string;
          debt_type: Database["public"]["Enums"]["debt_type"];
          party_type: Database["public"]["Enums"]["debt_party_type"];
          party_id: string;
          source_type: Database["public"]["Enums"]["debt_source_type"];
          source_id: string;
          season_id: string | null;
          amount: number;
          paid_amount: number;
          remaining_amount: number;
          status: Database["public"]["Enums"]["payment_status"];
          due_date: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          debt_type: Database["public"]["Enums"]["debt_type"];
          party_type: Database["public"]["Enums"]["debt_party_type"];
          party_id: string;
          source_type: Database["public"]["Enums"]["debt_source_type"];
          source_id: string;
          season_id?: string | null;
          amount: number;
          paid_amount?: number;
          remaining_amount?: number;
          status?: Database["public"]["Enums"]["payment_status"];
          due_date?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["debts"]["Insert"]>;
        Relationships: [];
      };
      factories: {
        Row: {
          id: string;
          name: string;
          type: Database["public"]["Enums"]["factory_type"];
          phone: string | null;
          tax_code: string | null;
          bank_name: string | null;
          bank_account_number: string | null;
          bank_account_name: string | null;
          address: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          type: Database["public"]["Enums"]["factory_type"];
          phone?: string | null;
          tax_code?: string | null;
          bank_name?: string | null;
          bank_account_number?: string | null;
          bank_account_name?: string | null;
          address?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["factories"]["Insert"]>;
        Relationships: [];
      };
      farmers: {
        Row: {
          id: string;
          name: string;
          phone: string | null;
          citizen_id: string | null;
          gender: string | null;
          date_of_birth: string | null;
          permanent_address: string | null;
          citizen_id_issued_date: string | null;
          citizen_id_qr_raw_text: string | null;
          bank_name: string | null;
          bank_account_number: string | null;
          bank_account_name: string | null;
          address: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string | null;
          citizen_id?: string | null;
          gender?: string | null;
          date_of_birth?: string | null;
          permanent_address?: string | null;
          citizen_id_issued_date?: string | null;
          citizen_id_qr_raw_text?: string | null;
          bank_name?: string | null;
          bank_account_number?: string | null;
          bank_account_name?: string | null;
          address?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["farmers"]["Insert"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          payment_type: Database["public"]["Enums"]["payment_type"];
          farmer_id: string | null;
          broker_id: string | null;
          transporter_boat_id: string | null;
          factory_id: string | null;
          debt_id: string | null;
          purchase_slip_id: string | null;
          amount: number;
          paid_date: string;
          method: Database["public"]["Enums"]["payment_method"];
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          payment_type: Database["public"]["Enums"]["payment_type"];
          farmer_id?: string | null;
          broker_id?: string | null;
          transporter_boat_id?: string | null;
          factory_id?: string | null;
          debt_id?: string | null;
          purchase_slip_id?: string | null;
          amount: number;
          paid_date: string;
          method: Database["public"]["Enums"]["payment_method"];
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [];
      };
      processing_price_books: {
        Row: {
          id: string;
          factory_id: string;
          season_id: string;
          service_type: Database["public"]["Enums"]["processing_service_type"];
          rice_type_id: string;
          unit_price: number;
          effective_from: string | null;
          effective_to: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          factory_id: string;
          season_id: string;
          service_type: Database["public"]["Enums"]["processing_service_type"];
          rice_type_id: string;
          unit_price: number;
          effective_from?: string | null;
          effective_to?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["processing_price_books"]["Insert"]>;
        Relationships: [];
      };
      processing_records: {
        Row: {
          id: string;
          transport_trip_id: string;
          factory_id: string;
          season_id: string | null;
          service_type: Database["public"]["Enums"]["processing_service_type"];
          rice_type_id: string;
          input_weight_kg: number;
          output_weight_kg: number;
          loss_weight_kg: number;
          loss_percent: number;
          unit_price: number;
          total_cost: number;
          payment_status: Database["public"]["Enums"]["payment_status"];
          processed_date: string;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          transport_trip_id: string;
          factory_id: string;
          season_id?: string | null;
          service_type: Database["public"]["Enums"]["processing_service_type"];
          rice_type_id: string;
          input_weight_kg?: number;
          output_weight_kg?: number;
          loss_weight_kg?: number;
          loss_percent?: number;
          unit_price?: number;
          total_cost?: number;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          processed_date: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["processing_records"]["Insert"]>;
        Relationships: [];
      };
      purchase_slip_attachments: {
        Row: {
          id: string;
          purchase_slip_id: string;
          file_name: string;
          file_path: string;
          file_type: string | null;
          file_size: number | null;
          type: Database["public"]["Enums"]["attachment_type"];
          uploaded_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          purchase_slip_id: string;
          file_name: string;
          file_path: string;
          file_type?: string | null;
          file_size?: number | null;
          type?: Database["public"]["Enums"]["attachment_type"];
          uploaded_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["purchase_slip_attachments"]["Insert"]>;
        Relationships: [];
      };
      purchase_slips: {
        Row: {
          id: string;
          season_id: string;
          farmer_id: string;
          broker_id: string;
          transport_trip_id: string | null;
          rice_type_id: string;
          authorization_letter_id: string | null;
          authorized_receiver_broker_id: string | null;
          purchase_date: string;
          weight_kg: number;
          unit_price: number;
          total_amount: number;
          broker_commission_per_kg: number;
          broker_commission_total: number;
          payment_status: Database["public"]["Enums"]["payment_status"];
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          season_id: string;
          farmer_id: string;
          broker_id: string;
          transport_trip_id?: string | null;
          rice_type_id: string;
          authorization_letter_id?: string | null;
          authorized_receiver_broker_id?: string | null;
          purchase_date: string;
          weight_kg: number;
          unit_price: number;
          total_amount?: number;
          broker_commission_per_kg?: number;
          broker_commission_total?: number;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["purchase_slips"]["Insert"]>;
        Relationships: [];
      };
      rice_types: {
        Row: {
          id: string;
          name: string;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["rice_types"]["Insert"]>;
        Relationships: [];
      };
      seasons: {
        Row: {
          id: string;
          name: string;
          from_date: string | null;
          to_date: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          from_date?: string | null;
          to_date?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["seasons"]["Insert"]>;
        Relationships: [];
      };
      transport_route_stops: {
        Row: {
          id: string;
          route_id: string;
          stop_order: number;
          location_name: string;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          route_id: string;
          stop_order: number;
          location_name: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["transport_route_stops"]["Insert"]>;
        Relationships: [];
      };
      transport_routes: {
        Row: {
          id: string;
          name: string;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["transport_routes"]["Insert"]>;
        Relationships: [];
      };
      transport_trips: {
        Row: {
          id: string;
          code: string;
          transporter_boat_id: string;
          route_id: string;
          factory_id: string | null;
          season_id: string | null;
          rice_type_id: string;
          trip_date: string;
          loaded_weight_kg: number;
          unloaded_weight_kg: number;
          loss_weight_kg: number;
          loss_percent: number;
          transport_price_basis: Database["public"]["Enums"]["transport_price_basis"];
          transport_price: number;
          transport_cost: number;
          fuel_fee: number;
          labor_fee: number;
          weighing_fee: number;
          total_cost: number;
          payment_status: Database["public"]["Enums"]["payment_status"];
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          transporter_boat_id: string;
          route_id: string;
          factory_id?: string | null;
          season_id?: string | null;
          rice_type_id: string;
          trip_date: string;
          loaded_weight_kg?: number;
          unloaded_weight_kg?: number;
          loss_weight_kg?: number;
          loss_percent?: number;
          transport_price_basis?: Database["public"]["Enums"]["transport_price_basis"];
          transport_price?: number;
          transport_cost?: number;
          fuel_fee?: number;
          labor_fee?: number;
          weighing_fee?: number;
          total_cost?: number;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["transport_trips"]["Insert"]>;
        Relationships: [];
      };
      transporter_boats: {
        Row: {
          id: string;
          boat_name: string;
          owner_name: string | null;
          phone: string | null;
          citizen_id: string | null;
          bank_name: string | null;
          bank_account_number: string | null;
          bank_account_name: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          boat_name: string;
          owner_name?: string | null;
          phone?: string | null;
          citizen_id?: string | null;
          bank_name?: string | null;
          bank_account_number?: string | null;
          bank_account_name?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["transporter_boats"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      authorization_letter_status: "draft" | "active" | "expired" | "cancelled";
      attachment_type:
        | "citizen_id"
        | "authorization_letter"
        | "transfer_receipt"
        | "transport_receipt"
        | "processing_receipt"
        | "pdf_export"
        | "excel_export"
        | "other";
      debt_party_type: "broker" | "transporter_boat" | "factory";
      debt_source_type: "purchase_slip" | "transport_trip" | "processing_record";
      debt_type: "broker_commission" | "transport" | "processing";
      factory_type: "drying" | "milling" | "drying_milling";
      payment_method: "bank_transfer" | "cash";
      payment_status: "unpaid" | "partial" | "paid";
      payment_type: "farmer_payment" | "debt_payment";
      processing_service_type: "drying" | "milling";
      transport_price_basis: "loaded_weight" | "unloaded_weight" | "fixed";
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
