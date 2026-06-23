export type ListTableKey =
  | "app_users"
  | "farmers"
  | "brokers"
  | "rice_types"
  | "seasons"
  | "factories"
  | "transporter_boats"
  | "transport_routes"
  | "transport_trips"
  | "trips"
  | "purchase_slips"
  | "authorization_letters"
  | "processing_records"
  | "warehouses"
  | "inventory_transactions"
  | "trip_sales"
  | "attachments";

type ListTableConfig = {
  orderColumn: string;
  searchColumns: string[];
  ascending?: boolean;
};

export const listTableConfig: Record<ListTableKey, ListTableConfig> = {
  app_users: { orderColumn: "created_at", searchColumns: ["full_name", "email", "phone", "note"] },
  farmers: { orderColumn: "stt", searchColumns: ["name", "phone", "citizen_id"], ascending: true },
  brokers: { orderColumn: "created_at", searchColumns: ["name", "phone", "citizen_id"] },
  rice_types: { orderColumn: "created_at", searchColumns: ["name", "note"] },
  seasons: { orderColumn: "created_at", searchColumns: ["name", "note"] },
  factories: { orderColumn: "created_at", searchColumns: ["name", "phone", "tax_code"] },
  transporter_boats: {
    orderColumn: "created_at",
    searchColumns: ["boat_name", "owner_name", "phone", "citizen_id"],
  },
  transport_routes: { orderColumn: "created_at", searchColumns: ["name", "note"] },
  transport_trips: { orderColumn: "trip_date", searchColumns: ["code", "note"] },
  trips: { orderColumn: "start_date", searchColumns: ["code", "note"] },
  purchase_slips: { orderColumn: "purchase_date", searchColumns: ["note"] },
  authorization_letters: { orderColumn: "created_at", searchColumns: ["code", "note"] },
  processing_records: { orderColumn: "processed_date", searchColumns: ["note"] },
  warehouses: { orderColumn: "created_at", searchColumns: ["name", "address", "note"] },
  inventory_transactions: { orderColumn: "transaction_date", searchColumns: ["note"] },
  trip_sales: { orderColumn: "sale_date", searchColumns: ["buyer_name", "note"] },
  attachments: { orderColumn: "uploaded_at", searchColumns: ["file_name"] },
};
