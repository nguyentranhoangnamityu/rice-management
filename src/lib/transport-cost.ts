import type { Enums } from "../types/database";

export type TransportPriceBasis = Enums<"transport_price_basis">;

export const ROUTE_TRANSPORT_EXPENSE_DESCRIPTION = "Tiền vận chuyển (theo tuyến)";

export const transportPriceBasisOptions: { value: TransportPriceBasis; label: string }[] = [
  { value: "loaded_weight", label: "Theo kg lúa xuống ghe" },
  { value: "unloaded_weight", label: "Theo kg lúa lên nhà máy" },
  { value: "fixed", label: "Giá cố định / chuyến" },
];

export function formatTransportPriceBasis(value: TransportPriceBasis) {
  return transportPriceBasisOptions.find((option) => option.value === value)?.label ?? value;
}

export function sumPurchaseSlipWeightKg(slips: { weight_kg: number | null }[]) {
  return round2(slips.reduce((sum, slip) => sum + (slip.weight_kg || 0), 0));
}

export function calculateTransportLoss(loadedWeightKg: number, unloadedWeightKg: number) {
  const lossWeight = Math.max(loadedWeightKg - unloadedWeightKg, 0);
  const lossPercent = loadedWeightKg > 0 ? round4((lossWeight / loadedWeightKg) * 100) : 0;
  return { lossWeight: round2(lossWeight), lossPercent };
}

export function calculateTransportCost({
  loadedWeightKg,
  unloadedWeightKg,
  priceBasis,
  transportPrice,
}: {
  loadedWeightKg: number;
  unloadedWeightKg: number;
  priceBasis: TransportPriceBasis;
  transportPrice: number;
}) {
  const transportCost =
    priceBasis === "loaded_weight"
      ? loadedWeightKg * transportPrice
      : priceBasis === "unloaded_weight"
        ? unloadedWeightKg * transportPrice
        : transportPrice;

  return round2(transportCost);
}

export function formatTransportPriceLabel(priceBasis: TransportPriceBasis, transportPrice: number) {
  if (transportPrice <= 0) return "Chưa cấu hình giá";
  if (priceBasis === "fixed") return `${formatNumber(transportPrice)} đ/chuyến`;
  return `${formatNumber(transportPrice)} đ/kg`;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}
