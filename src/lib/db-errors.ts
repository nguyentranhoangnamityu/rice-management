import type { PostgrestError } from "@supabase/supabase-js";

type DbErrorLike = Pick<PostgrestError, "message" | "code"> | { message: string; code?: string } | null | undefined;

const TABLE_LABELS: Record<string, string> = {
  authorization_letters: "giấy ủy quyền",
  authorization_letter_purchase_slips: "liên kết giấy ủy quyền – phiếu mua",
  purchase_slips: "phiếu mua",
  purchase_slip_attachments: "file đính kèm phiếu mua",
  transport_trips: "chuyến ghe",
  transport_route_stops: "điểm dừng tuyến",
  processing_records: "phiếu sấy/xay",
  processing_price_books: "bảng giá gia công",
  payments: "thanh toán",
  debts: "công nợ",
  attachments: "chứng từ đính kèm",
};

const ENTITY_LABELS: Record<string, string> = {
  farmers: "nông dân",
  brokers: "cò lúa",
  seasons: "mùa vụ",
  rice_types: "loại lúa",
  factories: "nhà máy",
  transporter_boats: "ghe vận chuyển",
  transport_routes: "tuyến vận chuyển",
  transport_trips: "chuyến ghe",
  authorization_letters: "giấy ủy quyền",
  purchase_slips: "phiếu mua",
  processing_records: "phiếu sấy/xay",
  debts: "công nợ",
};

/** Thông báo theo tên constraint FK trong PostgreSQL/Supabase. */
const FK_CONSTRAINT_MESSAGES: Record<string, string> = {
  // farmers
  authorization_letters_farmer_id_fkey:
    "Không thể xóa nông dân vì đang có giấy ủy quyền. Hãy xóa hoặc đổi giấy ủy quyền trước.",
  purchase_slips_farmer_id_fkey:
    "Không thể xóa nông dân vì đang có phiếu mua. Hãy xóa hoặc đổi phiếu mua trước.",
  payments_farmer_id_fkey:
    "Không thể xóa nông dân vì đang có thanh toán. Hãy xóa hoặc đổi thanh toán trước.",

  // brokers
  authorization_letters_broker_id_fkey:
    "Không thể xóa cò lúa vì đang có giấy ủy quyền. Hãy xóa hoặc đổi giấy ủy quyền trước.",
  purchase_slips_broker_id_fkey:
    "Không thể xóa cò lúa vì đang có phiếu mua. Hãy xóa hoặc đổi phiếu mua trước.",
  purchase_slips_authorized_receiver_broker_id_fkey:
    "Không thể xóa cò lúa vì đang là người nhận ủy quyền trên phiếu mua. Hãy đổi phiếu mua trước.",
  payments_broker_id_fkey:
    "Không thể xóa cò lúa vì đang có thanh toán. Hãy xóa hoặc đổi thanh toán trước.",

  // seasons
  transport_trips_season_id_fkey:
    "Không thể xóa mùa vụ vì đang có chuyến ghe. Hãy xóa hoặc đổi chuyến ghe trước.",
  purchase_slips_season_id_fkey:
    "Không thể xóa mùa vụ vì đang có phiếu mua. Hãy xóa hoặc đổi phiếu mua trước.",
  processing_price_books_season_id_fkey:
    "Không thể xóa mùa vụ vì đang có bảng giá gia công. Hãy xóa bảng giá trước.",
  processing_records_season_id_fkey:
    "Không thể xóa mùa vụ vì đang có phiếu sấy/xay. Hãy xóa hoặc đổi phiếu sấy/xay trước.",
  debts_season_id_fkey:
    "Không thể xóa mùa vụ vì đang có công nợ. Hãy xóa hoặc đổi công nợ trước.",

  // rice_types
  transport_trips_rice_type_id_fkey:
    "Không thể xóa loại lúa vì đang có chuyến ghe. Hãy xóa hoặc đổi chuyến ghe trước.",
  purchase_slips_rice_type_id_fkey:
    "Không thể xóa loại lúa vì đang có phiếu mua. Hãy xóa hoặc đổi phiếu mua trước.",
  processing_price_books_rice_type_id_fkey:
    "Không thể xóa loại lúa vì đang có bảng giá gia công. Hãy xóa bảng giá trước.",
  processing_records_rice_type_id_fkey:
    "Không thể xóa loại lúa vì đang có phiếu sấy/xay. Hãy xóa hoặc đổi phiếu sấy/xay trước.",

  // factories
  transport_trips_factory_id_fkey:
    "Không thể xóa nhà máy vì đang có chuyến ghe. Hãy xóa hoặc đổi chuyến ghe trước.",
  processing_records_factory_id_fkey:
    "Không thể xóa nhà máy vì đang có phiếu sấy/xay. Hãy xóa hoặc đổi phiếu sấy/xay trước.",
  payments_factory_id_fkey:
    "Không thể xóa nhà máy vì đang có thanh toán. Hãy xóa hoặc đổi thanh toán trước.",

  // transporter_boats
  transport_trips_transporter_boat_id_fkey:
    "Không thể xóa ghe vận chuyển vì đang có chuyến ghe. Hãy xóa hoặc đổi chuyến ghe trước.",
  payments_transporter_boat_id_fkey:
    "Không thể xóa ghe vận chuyển vì đang có thanh toán. Hãy xóa hoặc đổi thanh toán trước.",

  // transport_routes
  transport_trips_route_id_fkey:
    "Không thể xóa tuyến vận chuyển vì đang có chuyến ghe. Hãy xóa hoặc đổi chuyến ghe trước.",

  // transport_trips
  processing_records_transport_trip_id_fkey:
    "Không thể xóa chuyến ghe vì đang có phiếu sấy/xay. Hãy xóa hoặc đổi phiếu sấy/xay trước.",

  // authorization_letters
  purchase_slips_authorization_letter_id_fkey:
    "Không thể xóa giấy ủy quyền vì đang có phiếu mua. Hãy xóa hoặc đổi phiếu mua trước.",
  authorization_letter_purchase_slips_authorization_letter_id_fkey:
    "Không thể xóa giấy ủy quyền vì đang liên kết với phiếu mua. Hãy gỡ liên kết trước.",
  authorization_letter_purchase_slips_purchase_slip_id_fkey:
    "Không thể xóa phiếu mua vì đang liên kết với giấy ủy quyền. Hãy gỡ liên kết trước.",

  payments_purchase_slip_id_fkey:
    "Không thể xóa phiếu mua vì đang có thanh toán. Hãy xóa hoặc đổi thanh toán trước.",

  // debts
  payments_debt_id_fkey:
    "Không thể xóa công nợ vì đang có thanh toán. Hãy xóa hoặc đổi thanh toán trước.",
};

const UNIQUE_CONSTRAINT_MESSAGES: Record<string, string> = {
  seasons_name_key: "Tên mùa vụ đã tồn tại. Vui lòng dùng tên khác.",
  rice_types_name_key: "Tên loại lúa đã tồn tại. Vui lòng dùng tên khác.",
  transport_trips_code_key: "Mã chuyến ghe đã tồn tại. Vui lòng dùng mã khác.",
  transport_route_stops_unique_order: "Thứ tự điểm dừng trùng trong cùng tuyến.",
};

function formatForeignKeyError(message: string) {
  const constraint = message.match(/constraint "([^"]+)"/)?.[1];
  if (constraint && FK_CONSTRAINT_MESSAGES[constraint]) {
    return FK_CONSTRAINT_MESSAGES[constraint];
  }

  const childTable = message.match(/on table "([^"]+)"/)?.[1];
  const parentTable = message.match(/(?:update or )?delete on table "([^"]+)"/)?.[1];
  const isDelete = message.includes("delete on table");

  if (parentTable && childTable) {
    const parentLabel = ENTITY_LABELS[parentTable] ?? parentTable;
    const childLabel = TABLE_LABELS[childTable] ?? childTable;
    if (isDelete) {
      return `Không thể xóa ${parentLabel} vì đang được dùng trong ${childLabel}. Hãy xóa hoặc đổi dữ liệu liên quan trước.`;
    }
    return `Không thể cập nhật ${parentLabel} vì đang được dùng trong ${childLabel}.`;
  }

  return "Không thể thực hiện vì dữ liệu đang được dùng ở bản ghi khác. Hãy xóa hoặc đổi dữ liệu liên quan trước.";
}

function formatUniqueViolation(message: string) {
  const constraint = message.match(/constraint "([^"]+)"/)?.[1];
  if (constraint && UNIQUE_CONSTRAINT_MESSAGES[constraint]) {
    return UNIQUE_CONSTRAINT_MESSAGES[constraint];
  }
  return "Dữ liệu bị trùng. Vui lòng kiểm tra lại thông tin đã nhập.";
}

/** Chuyển lỗi Supabase/PostgreSQL sang thông báo tiếng Việt dễ hiểu. */
export function formatDbError(error: DbErrorLike, fallback = "Đã xảy ra lỗi. Vui lòng thử lại."): string {
  if (!error?.message?.trim()) return fallback;

  const message = error.message;
  const code = "code" in error ? error.code : undefined;

  if (code === "23503" || message.includes("foreign key constraint")) {
    return formatForeignKeyError(message);
  }

  if (code === "23505" || message.includes("unique constraint") || message.includes("duplicate key")) {
    return formatUniqueViolation(message);
  }

  return message;
}
