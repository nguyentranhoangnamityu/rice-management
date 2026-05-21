import { supabase } from "./supabase";

export function calculateDryingMetrics({
  inputWeightKg,
  outputWeightKg,
  unitPrice,
}: {
  inputWeightKg: number;
  outputWeightKg: number;
  unitPrice: number;
}) {
  const lossWeight = Math.max(inputWeightKg - outputWeightKg, 0);
  const lossPercent = inputWeightKg > 0 ? round4((lossWeight / inputWeightKg) * 100) : 0;
  const totalCost = round2(outputWeightKg * unitPrice);

  return {
    lossWeight: round2(lossWeight),
    lossPercent,
    totalCost,
  };
}

export function dryingExpenseDescription(recordId: string) {
  return `Chi phí sấy lúa [Đợt ${recordId.slice(0, 4)}]`;
}

export async function syncDryingTripExpense({
  tripId,
  recordId,
  totalCost,
  processedDate,
  paymentStatus,
  factoryName,
  note,
}: {
  tripId: string;
  recordId: string;
  totalCost: number;
  processedDate: string | null;
  paymentStatus: "unpaid" | "partial" | "paid";
  factoryName: string | null;
  note: string | null;
}) {
  const description = dryingExpenseDescription(recordId);
  const partialId = recordId.slice(0, 4);

  const { data: existing } = await supabase
    .from("trip_expenses")
    .select("id")
    .eq("trip_id", tripId)
    .eq("type", "drying_cost")
    .like("description", `%${partialId}%`)
    .maybeSingle();

  const payload = {
    trip_id: tripId,
    type: "drying_cost" as const,
    description,
    amount: totalCost,
    expense_date: processedDate,
    payment_status: paymentStatus,
    party_name: factoryName,
    note,
  };

  if (existing?.id) {
    const { error } = await supabase.from("trip_expenses").update(payload).eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("trip_expenses").insert(payload);
  if (error) throw error;
}

export async function deleteDryingTripExpense(tripId: string, recordId: string) {
  const partialId = recordId.slice(0, 4);
  await supabase
    .from("trip_expenses")
    .delete()
    .eq("trip_id", tripId)
    .eq("type", "drying_cost")
    .like("description", `%${partialId}%`);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

export function formatTonFromKg(kg: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(kg / 1000);
}
