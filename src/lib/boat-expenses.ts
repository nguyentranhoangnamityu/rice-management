import type { Enums } from "../types/database";

export type TripExpenseType = Enums<"trip_expense_type">;

/** Tiền vận chuyển — công ty trả lại cho ghe */
export function isBoatTransportExpense(type: TripExpenseType) {
  return type === "transport_cost";
}

/**
 * Bồi dưỡng / tiền công đi chi — chủ ghe ứng trước, công ty trả chung với tiền ghe.
 */
export function isBoatAdvanceAllowanceExpense(type: TripExpenseType) {
  return type === "worker_allowance" || type === "rice_carrying_labor";
}

/** Tất cả khoản công ty phải trả lại cho chủ ghe (VC + bồi dưỡng đi chi) */
export function isBoatPayableExpense(type: TripExpenseType) {
  return isBoatTransportExpense(type) || isBoatAdvanceAllowanceExpense(type);
}
