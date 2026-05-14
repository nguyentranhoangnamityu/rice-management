import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, Plus, ScanLine, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Html5Qrcode } from "html5-qrcode";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import type { Tables } from "../../types/database";

type Farmer = Tables<"farmers">;

const farmerSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên nông dân"),
  phone: z.string().trim().optional(),
  citizen_id: z.string().trim().optional(),
  bank_name: z.string().trim().optional(),
  bank_account_number: z.string().trim().optional(),
  bank_account_name: z.string().trim().optional(),
  address: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

type FarmerFormValues = z.infer<typeof farmerSchema>;

const emptyValues: FarmerFormValues = {
  name: "",
  phone: "",
  citizen_id: "",
  bank_name: "",
  bank_account_number: "",
  bank_account_name: "",
  address: "",
  note: "",
};

export function FarmersPage() {
  const [items, setItems] = useState<Farmer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Farmer | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scanRawText, setScanRawText] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FarmerFormValues>({
    resolver: zodResolver(farmerSchema),
    defaultValues: emptyValues,
  });

  const filteredItems = useMemo(() => {
    const keyword = normalize(search);
    if (!keyword) return items;

    return items.filter((item) =>
      [item.name, item.phone, item.citizen_id].some((value) =>
        normalize(value).includes(keyword),
      ),
    );
  }, [items, search]);

  const formTitle = editingItem ? "Sửa nông dân" : "Thêm nông dân";

  async function loadFarmers() {
    setLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from("farmers")
      .select("*")
      .order("name", { ascending: true });

    if (loadError) {
      setError(loadError.message);
    } else {
      setItems(data ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadFarmers();
  }, []);

  function startEdit(item: Farmer) {
    setEditingItem(item);
    reset({
      name: item.name,
      phone: item.phone ?? "",
      citizen_id: item.citizen_id ?? "",
      bank_name: item.bank_name ?? "",
      bank_account_number: item.bank_account_number ?? "",
      bank_account_name: item.bank_account_name ?? "",
      address: item.address ?? "",
      note: item.note ?? "",
    });
  }

  function clearForm() {
    setEditingItem(null);
    reset(emptyValues);
  }

  async function onSubmit(values: FarmerFormValues) {
    setSaving(true);
    setError(null);

    const payload = {
      name: values.name,
      phone: toNullable(values.phone),
      citizen_id: toNullable(values.citizen_id),
      bank_name: toNullable(values.bank_name),
      bank_account_number: toNullable(values.bank_account_number),
      bank_account_name: toNullable(values.bank_account_name),
      address: toNullable(values.address),
      note: toNullable(values.note),
    };

    const result = editingItem
      ? await supabase.from("farmers").update(payload).eq("id", editingItem.id)
      : await supabase.from("farmers").insert(payload);

    if (result.error) {
      setError(result.error.message);
    } else {
      clearForm();
      await loadFarmers();
    }

    setSaving(false);
  }

  async function deleteItem(item: Farmer) {
    const confirmed = window.confirm(`Xóa nông dân "${item.name}"?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    const { error: deleteError } = await supabase
      .from("farmers")
      .delete()
      .eq("id", item.id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      if (editingItem?.id === item.id) {
        clearForm();
      }
      await loadFarmers();
    }

    setDeletingId(null);
  }

  const applyScannedText = useCallback((rawText: string) => {
    const parsed = parseCitizenQr(rawText);

    setScanRawText(rawText);
    if (parsed.citizen_id) {
      setValue("citizen_id", parsed.citizen_id, { shouldDirty: true, shouldValidate: true });
    }
    if (parsed.name) {
      setValue("name", parsed.name, { shouldDirty: true, shouldValidate: true });
    }
    if (parsed.address) {
      setValue("address", parsed.address, { shouldDirty: true, shouldValidate: true });
    }

    if (!parsed.citizen_id && !parsed.name && !parsed.address) {
      setScannerError("Đã quét QR nhưng chưa nhận diện được thông tin CCCD. Vui lòng nhập tay.");
    } else {
      setScannerError(null);
    }
  }, [setValue]);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Nông dân</h1>
          <p>Quản lý thông tin người bán lúa, CCCD, tài khoản ngân hàng và liên hệ.</p>
        </div>
      </header>

      <div className="crud-grid">
        <form className="form-card" onSubmit={handleSubmit(onSubmit)}>
          <div className="card-title-row">
            <h2>{formTitle}</h2>
            <div className="row-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setScannerOpen((current) => !current);
                  setScannerError(null);
                }}
              >
                <ScanLine size={17} aria-hidden="true" />
                Quét CCCD
              </button>
              {editingItem ? (
                <button className="icon-button" type="button" onClick={clearForm} aria-label="Hủy sửa">
                  <X size={18} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>

          {scannerOpen ? (
            <CitizenQrScanner
              rawText={scanRawText}
              scannerError={scannerError}
              onClose={() => setScannerOpen(false)}
              onError={setScannerError}
              onScan={applyScannedText}
            />
          ) : scanRawText ? (
            <div className="calculation-box">
              <span>QR CCCD đã quét gần nhất</span>
              <small>{scanRawText}</small>
            </div>
          ) : null}

          <label className="field">
            <span>Tên nông dân</span>
            <input {...register("name")} placeholder="VD: Nguyễn Văn A" />
            {errors.name ? <small>{errors.name.message}</small> : null}
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Số điện thoại</span>
              <input {...register("phone")} inputMode="tel" placeholder="VD: 090..." />
            </label>
            <label className="field">
              <span>CCCD</span>
              <input {...register("citizen_id")} inputMode="numeric" placeholder="Số CCCD" />
            </label>
          </div>

          <label className="field">
            <span>Địa chỉ</span>
            <input {...register("address")} placeholder="Ấp, xã, huyện..." />
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Ngân hàng</span>
              <input {...register("bank_name")} placeholder="VD: Agribank" />
            </label>
            <label className="field">
              <span>Số tài khoản</span>
              <input {...register("bank_account_number")} inputMode="numeric" />
            </label>
          </div>

          <label className="field">
            <span>Tên tài khoản</span>
            <input {...register("bank_account_name")} placeholder="Tên trên tài khoản ngân hàng" />
          </label>

          <label className="field">
            <span>Ghi chú</span>
            <textarea {...register("note")} rows={3} placeholder="Thông tin thêm nếu cần" />
          </label>

          <button className="primary-button" type="submit" disabled={saving}>
            <Plus size={18} aria-hidden="true" />
            {saving ? "Đang lưu..." : editingItem ? "Lưu thay đổi" : "Thêm nông dân"}
          </button>
        </form>

        <div className="table-card">
          <div className="table-toolbar">
            <label className="search-field">
              <Search size={17} aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo tên, điện thoại, CCCD"
              />
            </label>
          </div>

          {error ? <div className="alert error-alert">{error}</div> : null}

          {loading ? (
            <div className="state-box">Đang tải nông dân...</div>
          ) : filteredItems.length === 0 ? (
            <div className="state-box">Không có nông dân phù hợp.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table wide-table">
                <thead>
                  <tr>
                    <th>Tên</th>
                    <th>Điện thoại</th>
                    <th>CCCD</th>
                    <th>Ngân hàng</th>
                    <th>Tài khoản</th>
                    <th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.phone || "-"}</td>
                      <td>{item.citizen_id || "-"}</td>
                      <td>{item.bank_name || "-"}</td>
                      <td>
                        <div>{item.bank_account_number || "-"}</div>
                        <span className="muted-text">{item.bank_account_name || ""}</span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-button" type="button" onClick={() => startEdit(item)} aria-label="Sửa">
                            <Edit2 size={17} aria-hidden="true" />
                          </button>
                          <button
                            className="icon-button danger"
                            type="button"
                            onClick={() => void deleteItem(item)}
                            disabled={deletingId === item.id}
                            aria-label="Xóa"
                          >
                            <Trash2 size={17} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

type CitizenQrScannerProps = {
  rawText: string;
  scannerError: string | null;
  onClose: () => void;
  onError: (message: string | null) => void;
  onScan: (rawText: string) => void;
};

function CitizenQrScanner({
  rawText,
  scannerError,
  onClose,
  onError,
  onScan,
}: CitizenQrScannerProps) {
  const scannerElementId = useId().replace(/:/g, "-");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode(scannerElementId);
    scannerRef.current = scanner;
    stoppedRef.current = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          onScan(decodedText);
          void stopScanner(scanner, stoppedRef);
        },
        () => {
          // Ignore frame-level decode misses; they happen continuously while scanning.
        },
      )
      .catch((scanError: unknown) => {
        onError(formatScannerError(scanError));
      });

    return () => {
      void stopScanner(scanner, stoppedRef);
      scannerRef.current = null;
    };
  }, [onError, onScan, scannerElementId]);

  return (
    <div className="form-card">
      <div className="card-title-row">
        <h2>Quét CCCD</h2>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Đóng scanner">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div id={scannerElementId} className="qr-scanner" />

      {scannerError ? (
        <div className="alert error-alert">
          {scannerError} Bạn vẫn có thể nhập thông tin CCCD thủ công.
        </div>
      ) : (
        <p className="section-hint">Cho phép camera, đưa mã QR trên CCCD vào khung quét.</p>
      )}

      {rawText ? (
        <label className="field">
          <span>Raw QR text</span>
          <textarea value={rawText} readOnly rows={4} />
        </label>
      ) : null}
    </div>
  );
}

async function stopScanner(scanner: Html5Qrcode, stoppedRef: React.MutableRefObject<boolean>) {
  if (stoppedRef.current) return;
  stoppedRef.current = true;

  try {
    if (scanner.isScanning) {
      await scanner.stop();
    }
    await scanner.clear();
  } catch {
    // Camera may already be stopped by the browser or permission flow.
  }
}

function parseCitizenQr(rawText: string): Partial<Pick<FarmerFormValues, "citizen_id" | "name" | "address">> {
  const trimmed = rawText.trim();

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return {
      citizen_id: readString(parsed, ["citizen_id", "id", "cccd", "so_cccd"]),
      name: readString(parsed, ["name", "full_name", "ho_ten"]),
      address: readString(parsed, ["address", "dia_chi", "permanent_address"]),
    };
  } catch {
    // Vietnamese CCCD QR is commonly pipe-separated, not JSON.
  }

  const parts = trimmed
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  const citizenId = parts.find((part) => /^\d{9,12}$/.test(part)) ?? "";

  return {
    citizen_id: citizenId,
    name: parts[2] || parts[1] || "",
    address: parts[5] || parts[4] || "",
  };
}

function readString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function formatScannerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.toLowerCase().includes("permission")) {
    return "Không có quyền truy cập camera. Vui lòng cấp quyền camera hoặc nhập thủ công.";
  }

  return `Không thể mở camera: ${message}`;
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toNullable(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
