/** Lấy phần địa chỉ cuối sau dấu phẩy. VD: "Tổ 1, ..., Kiên Giang" → "Kiên Giang" */
export function extractLastAddressSegment(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";

  const parts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts[parts.length - 1] ?? trimmed;
}
