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

/** Mã chứng từ: YYYY + DD + MM + STT trong ngày (2 chữ số). Ví dụ: 2026230601 */
export function formatDocumentCode(dailySequence: number, purchaseDate: string): string {
  const parts = normalizePurchaseDate(purchaseDate);
  if (!parts) return "";

  return `${parts.year}${parts.day}${parts.month}${String(dailySequence).padStart(2, "0")}`;
}

export const CONTRACT_CODE_SUFFIX = "-HĐMB/CLTV";

export function formatContractCode(dailySequence: number, purchaseDate: string): string {
  const code = formatDocumentCode(dailySequence, purchaseDate);
  return code ? `${code}${CONTRACT_CODE_SUFFIX}` : "";
}

export function formatReceiptCode(dailySequence: number, purchaseDate: string): string {
  return formatDocumentCode(dailySequence, purchaseDate);
}
