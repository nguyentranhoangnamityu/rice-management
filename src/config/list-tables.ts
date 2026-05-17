export type ListTableKey =
  | "farmers"
  | "brokers"
  | "rice_types"
  | "seasons"
  | "factories"
  | "transporter_boats"
  | "transport_routes"
  | "transport_trips"
  | "purchase_slips"
  | "authorization_letters"
  | "processing_records"
  | "attachments";

type ListTableConfig = {
  orderColumn: string;
  searchColumns: string[];
};

export const listTableConfig: Record<ListTableKey, ListTableConfig> = {
  farmers: { orderColumn: "created_at", searchColumns: ["name", "phone", "citizen_id"] },
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
  purchase_slips: { orderColumn: "purchase_date", searchColumns: ["note"] },
  authorization_letters: { orderColumn: "created_at", searchColumns: ["code", "note"] },
  processing_records: { orderColumn: "processed_date", searchColumns: ["note"] },
  attachments: { orderColumn: "uploaded_at", searchColumns: ["file_name"] },
};
