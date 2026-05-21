import type { Tables } from "../types/database";
import { supabase } from "./supabase";
import {
  ROUTE_TRANSPORT_EXPENSE_DESCRIPTION,
  calculateTransportCost,
  calculateTransportLoss,
  formatTransportPriceBasis,
  sumPurchaseSlipWeightKg,
} from "./transport-cost";

type TransportRoute = Pick<
  Tables<"transport_routes">,
  "id" | "name" | "transport_price" | "transport_price_basis"
>;

export async function syncTripTransportExpenseFromRoute({
  tripId,
  route,
  loadedWeightKg,
  unloadedWeightKg,
  expenseDate,
  partyName,
}: {
  tripId: string;
  route: TransportRoute | null | undefined;
  loadedWeightKg: number;
  unloadedWeightKg: number;
  expenseDate: string | null;
  partyName: string | null;
}) {
  const { data: existing } = await supabase
    .from("trip_expenses")
    .select("id")
    .eq("trip_id", tripId)
    .eq("type", "transport_cost")
    .eq("description", ROUTE_TRANSPORT_EXPENSE_DESCRIPTION)
    .maybeSingle();

  if (!route || route.transport_price <= 0) {
    if (existing?.id) {
      await supabase.from("trip_expenses").delete().eq("id", existing.id);
    }
    return { amount: 0, synced: false };
  }

  const amount = calculateTransportCost({
    loadedWeightKg,
    unloadedWeightKg,
    priceBasis: route.transport_price_basis,
    transportPrice: route.transport_price,
  });

  if (amount <= 0) {
    if (existing?.id) {
      await supabase.from("trip_expenses").delete().eq("id", existing.id);
    }
    return { amount: 0, synced: false };
  }

  const payload = {
    trip_id: tripId,
    type: "transport_cost" as const,
    description: ROUTE_TRANSPORT_EXPENSE_DESCRIPTION,
    amount,
    expense_date: expenseDate,
    payment_status: "unpaid" as const,
    party_name: partyName,
    note: `Tuyến ${route.name} · ${formatTransportPriceBasis(route.transport_price_basis)} · ${route.transport_price}`,
  };

  if (existing?.id) {
    const { error } = await supabase.from("trip_expenses").update(payload).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("trip_expenses").insert(payload);
    if (error) throw error;
  }

  return { amount, synced: true };
}

/** Cập nhật kg xuống ghe = tổng phiếu mua, hao hụt VC và tiền vận chuyển theo tuyến. */
export async function syncTripWeightsFromPurchaseSlips({
  tripId,
  unloadedWeightKg,
  route,
  partyName,
  expenseDate,
}: {
  tripId: string;
  unloadedWeightKg: number;
  route: TransportRoute | null | undefined;
  partyName: string | null;
  expenseDate: string | null;
}) {
  const { data: slips, error: slipsError } = await supabase
    .from("purchase_slips")
    .select("weight_kg")
    .eq("trip_id", tripId);

  if (slipsError) throw slipsError;

  const loadedWeightKg = sumPurchaseSlipWeightKg(slips ?? []);
  const loss = calculateTransportLoss(loadedWeightKg, unloadedWeightKg);

  const { error: tripError } = await supabase
    .from("trips")
    .update({
      loaded_weight_kg: loadedWeightKg,
      loss_weight_kg: loss.lossWeight,
      loss_percent: loss.lossPercent,
    })
    .eq("id", tripId);

  if (tripError) throw tripError;

  const transportSync = await syncTripTransportExpenseFromRoute({
    tripId,
    route,
    loadedWeightKg,
    unloadedWeightKg,
    expenseDate,
    partyName,
  });

  return { loadedWeightKg, loss, transportSync };
}
