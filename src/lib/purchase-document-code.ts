export type PurchaseDateParts = {
  year: string;
  month: string;
  day: string;
};

export function normalizePurchaseDate(value: string | null | undefined): PurchaseDateParts | null {
  if (!value) return null;

  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return { year: iso[1], month: iso[2], day: iso[3] };
  }

  const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    return {
      year: dmy[3],
      month: dmy[2].padStart(2, "0"),
      day: dmy[1].padStart(2, "0"),
    };
  }

  return null;
}

export function toIsoDateInput(value: string | null | undefined): string {
  const parts = normalizePurchaseDate(value);
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatPurchaseDateVi(value: string | null | undefined): string {
  const parts = normalizePurchaseDate(value);
  if (!parts) return "-";
  return `${parts.day}/${parts.month}/${parts.year}`;
}

/** Lấy phần địa chỉ cuối sau dấu phẩy. VD: "..., Kiên Giang" → "Kiên Giang" */
export function extractLastAddressSegment(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";

  const parts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return parts.at(-1) ?? trimmed;
}
