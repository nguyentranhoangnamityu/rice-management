import { zodResolver } from "@hookform/resolvers/zod";
import { BarcodeFormat, BrowserQRCodeReader } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import { Camera, Edit2, ImageUp, PenLine, Plus, ScanLine, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import QrScanner from "qr-scanner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ModalShell } from "../../components/ui/ModalShell";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useServerPagination } from "../../hooks/useServerPagination";
import { buildPurchaseSlipFromFarmerState } from "../../lib/purchase-slip-navigation";
import { supabase } from "../../lib/supabase";
import type { Tables } from "../../types/database";
import { formatDbError } from "../../lib/db-errors";
import { formatDeleteBlockersMessage, getFarmerDeleteBlockers } from "../../lib/entity-delete-blockers";

type Farmer = Tables<"farmers">;

const farmerSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên nông dân"),
  phone: z.string().trim().min(1, "Vui lòng nhập số điện thoại"),
  citizen_id: z.string().trim().min(1, "Vui lòng nhập CCCD"),
  gender: z
    .string()
    .trim()
    .refine((value) => value === "Nam" || value === "Nữ", "Vui lòng chọn giới tính"),
  date_of_birth: z.string().trim().min(1, "Vui lòng chọn ngày sinh"),
  permanent_address: z.string().trim().min(1, "Vui lòng nhập địa chỉ thường trú"),
  citizen_id_issued_date: z.string().trim().min(1, "Vui lòng chọn ngày cấp CCCD"),
  citizen_id_qr_raw_text: z.string().trim().optional(),
  bank_name: z.string().trim().optional(),
  bank_account_number: z.string().trim().optional(),
  bank_account_name: z.string().trim().optional(),
  address: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

type FarmerFormValues = z.input<typeof farmerSchema>;
type FarmerFormStep = "scan" | "entry";

type ParsedCitizenQr = {
  citizen_id: string;
  name: string;
  date_of_birth: string;
  gender: string;
  permanent_address: string;
  citizen_id_issued_date: string;
  citizen_id_qr_raw_text: string;
  strategy: string;
  confidence: "high" | "medium" | "low";
  tokens: string[];
  warnings: string[];
};

const emptyValues: FarmerFormValues = {
  name: "",
  phone: "",
  citizen_id: "",
  gender: "",
  date_of_birth: "",
  permanent_address: "",
  citizen_id_issued_date: "",
  citizen_id_qr_raw_text: "",
  bank_name: "",
  bank_account_number: "",
  bank_account_name: "",
  address: "",
  note: "",
};

const QR_SCAN_MIN_SIZE = 180;
const QR_SCAN_IDEAL_SIZE = 260;
const QR_CAPTURE_OUTPUT_MIN_SIZE = 480;
const QR_CAPTURE_OUTPUT_MAX_SIZE = 1100;
const QR_REALTIME_ZXING_INTERVAL_MS = 160;
const QR_REALTIME_ZXING_PLANS_PER_TICK = 2;

function RequiredLabel({ children }: { children: string }) {
  return (
    <span>
      {children}{" "}
      <span aria-hidden="true" style={{ color: "#dc2626", fontWeight: 700 }}>
        *
      </span>
    </span>
  );
}

export function FarmersPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const {
    items,
    page,
    setPage,
    total,
    totalPages,
    search,
    setSearch,
    loading,
    error: listError,
    refresh,
  } = useServerPagination<Farmer>("farmers");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Farmer | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scanRawText, setScanRawText] = useState("");
  const [parsedCitizenQr, setParsedCitizenQr] = useState<ParsedCitizenQr | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formStep, setFormStep] = useState<FarmerFormStep>("entry");
  const [createdFarmerPrompt, setCreatedFarmerPrompt] = useState<Farmer | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setFocus,
    formState: { errors },
  } = useForm<FarmerFormValues>({
    resolver: zodResolver(farmerSchema),
    defaultValues: emptyValues,
  });

  const formTitle = editingItem ? "Sửa nông dân" : "Thêm nông dân";
  const isMobileAddFlow = isMobile && !editingItem;
  const showScanStep = isMobileAddFlow && formStep === "scan";
  const showEntryStep = !isMobileAddFlow || formStep === "entry";
  const showDesktopScanner = !isMobileAddFlow && scannerOpen;

  function startEdit(item: Farmer) {
    setEditingItem(item);
    reset({
      name: item.name,
      phone: item.phone ?? "",
      citizen_id: item.citizen_id ?? "",
      gender: item.gender ?? "",
      date_of_birth: item.date_of_birth ?? "",
      permanent_address: item.permanent_address ?? "",
      citizen_id_issued_date: item.citizen_id_issued_date ?? "",
      citizen_id_qr_raw_text: item.citizen_id_qr_raw_text ?? "",
      bank_name: item.bank_name ?? "",
      bank_account_number: item.bank_account_number ?? "",
      bank_account_name: item.bank_account_name ?? "",
      address: item.address ?? "",
      note: item.note ?? "",
    });
    setScanRawText(item.citizen_id_qr_raw_text ?? "");
    setParsedCitizenQr(null);
    setFormStep("entry");
    setScannerOpen(false);
    setFormOpen(true);
  }

  function openAddForm() {
    setEditingItem(null);
    reset(emptyValues);
    setScanRawText("");
    setParsedCitizenQr(null);
    setScannerError(null);
    setScannerOpen(false);
    setFormStep(isMobile ? "scan" : "entry");
    setFormOpen(true);
  }

  function goToManualEntry() {
    setFormStep("entry");
    setScannerError(null);
  }

  function goToScanStep() {
    setFormStep("scan");
    setScannerError(null);
  }

  function clearForm() {
    setEditingItem(null);
    reset(emptyValues);
    setScannerOpen(false);
    setScanRawText("");
    setParsedCitizenQr(null);
    setScannerError(null);
    setFormStep("scan");
    setFormOpen(false);
  }

  async function onSubmit(values: FarmerFormValues) {
    setSaving(true);
    setError(null);

    const payload = {
      name: values.name,
      phone: toNullable(values.phone),
      citizen_id: toNullable(values.citizen_id),
      gender: toNullable(values.gender),
      date_of_birth: toNullable(values.date_of_birth),
      permanent_address: toNullable(values.permanent_address),
      citizen_id_issued_date: toNullable(values.citizen_id_issued_date),
      citizen_id_qr_raw_text: toNullable(values.citizen_id_qr_raw_text),
      bank_name: toNullable(values.bank_name),
      bank_account_number: toNullable(values.bank_account_number),
      bank_account_name: toNullable(values.bank_account_name),
      address: toNullable(values.address),
      note: toNullable(values.note),
    };

    if (editingItem) {
      const result = await supabase.from("farmers").update(payload).eq("id", editingItem.id);
      if (result.error) {
        setError(formatDbError(result.error));
      } else {
        clearForm();
        await refresh(page);
      }
    } else {
      const result = await supabase.from("farmers").insert(payload).select("*").single();
      if (result.error) {
        setError(formatDbError(result.error));
      } else {
        const createdFarmer = result.data;
        clearForm();
        await refresh(1);
        setCreatedFarmerPrompt(createdFarmer);
      }
    }

    setSaving(false);
  }

  function goToCreatePurchaseSlip(farmer: Farmer) {
    setCreatedFarmerPrompt(null);
    navigate("/purchase-slips", {
      state: buildPurchaseSlipFromFarmerState(farmer),
    });
  }

  async function deleteItem(item: Farmer) {
    setError(null);

    try {
      const blockers = await getFarmerDeleteBlockers(item.id);
      if (blockers.length > 0) {
        setError(formatDeleteBlockersMessage(blockers));
        return;
      }
    } catch (checkError) {
      const message = checkError instanceof Error ? checkError.message : "Không thể kiểm tra dữ liệu liên quan";
      setError(formatDbError({ message }));
      return;
    }

    const confirmed = window.confirm(`Xóa nông dân "${item.name}"?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    const { error: deleteError } = await supabase
      .from("farmers")
      .delete()
      .eq("id", item.id);

    if (deleteError) {
      setError(formatDbError(deleteError));
    } else {
      if (editingItem?.id === item.id) {
        clearForm();
      }
      await refresh(page);
    }

    setDeletingId(null);
  }

  const applyScannedText = useCallback((rawText: string) => {
    const parsed = parseCitizenQr(rawText);

    setScanRawText(rawText);
    setParsedCitizenQr(parsed);
    setValue("citizen_id_qr_raw_text", rawText, { shouldDirty: true, shouldValidate: true });
    if (parsed.citizen_id) {
      setValue("citizen_id", parsed.citizen_id, { shouldDirty: true, shouldValidate: true });
    }
    if (parsed.name) {
      setValue("name", parsed.name, { shouldDirty: true, shouldValidate: true });
    }
    if (parsed.date_of_birth) {
      setValue("date_of_birth", parsed.date_of_birth, { shouldDirty: true, shouldValidate: true });
    }
    if (parsed.gender) {
      setValue("gender", parsed.gender, { shouldDirty: true, shouldValidate: true });
    }
    if (parsed.permanent_address) {
      setValue("permanent_address", parsed.permanent_address, { shouldDirty: true, shouldValidate: true });
    }
    if (parsed.citizen_id_issued_date) {
      setValue("citizen_id_issued_date", parsed.citizen_id_issued_date, { shouldDirty: true, shouldValidate: true });
    }

    const hasUsefulData = Boolean(parsed.citizen_id || parsed.name || parsed.permanent_address);

    if (!hasUsefulData) {
      setScannerError("Đã quét QR nhưng chưa nhận diện được thông tin CCCD. Vui lòng thử lại hoặc nhập tay.");
      return;
    }

    setScannerError(null);

    if (isMobile && !editingItem) {
      setFormStep("entry");
      window.setTimeout(() => {
        setFocus("phone");
      }, 150);
      return;
    }

    window.setTimeout(() => {
      setFocus("phone");
      document.querySelector('input[name="phone"]')?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 120);
  }, [editingItem, isMobile, setFocus, setValue]);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Nông dân</h1>
          <p>Quản lý thông tin người bán lúa, CCCD, tài khoản ngân hàng và liên hệ.</p>
        </div>
        <div className="header-actions">
          <Button type="button" onClick={openAddForm}>
            <Plus size={18} aria-hidden="true" />
            Thêm nông dân
          </Button>
        </div>
      </header>

      <div className="crud-grid modal-crud-grid">
        {formOpen ? (
          <ModalShell wide onClose={clearForm}>
            <form
              className={`form-card${isMobileAddFlow ? " farmer-form-wizard" : ""}`}
              onSubmit={handleSubmit(onSubmit)}
            >
              <div className="card-title-row">
                <div className="card-title-copy">
                  <h2>{formTitle}</h2>
                  {isMobileAddFlow ? (
                    <p className="form-step-label">
                      Bước {showScanStep ? 1 : 2}/2 · {showScanStep ? "Quét CCCD" : "Nhập thông tin"}
                    </p>
                  ) : null}
                </div>
                <div className="row-actions">
                  {showEntryStep && isMobileAddFlow ? (
                    <Button variant="secondary" type="button" onClick={goToScanStep}>
                      <ScanLine size={17} aria-hidden="true" />
                      Quét lại
                    </Button>
                  ) : null}
                  {!isMobileAddFlow ? (
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => {
                        setScannerOpen((current) => !current);
                        setScannerError(null);
                      }}
                    >
                      <ScanLine size={17} aria-hidden="true" />
                      Quét CCCD
                    </Button>
                  ) : null}
                  {editingItem ? (
                    <button className="icon-button" type="button" onClick={clearForm} aria-label="Hủy sửa">
                      <X size={18} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </div>

              {isMobileAddFlow ? (
                <div className="form-step-progress" aria-hidden="true">
                  <span className={showScanStep ? "active" : "done"} />
                  <span className={showEntryStep ? "active" : ""} />
                </div>
              ) : null}

              {showScanStep ? (
                <div className="farmer-scan-step">
                  <CitizenQrScanner
                    embedded
                    parsed={parsedCitizenQr}
                    rawText={scanRawText}
                    scannerError={scannerError}
                    onClose={goToManualEntry}
                    onManualEntry={goToManualEntry}
                    onError={setScannerError}
                    onScan={applyScannedText}
                  />
                  {scannerError ? <div className="alert error-alert">{scannerError}</div> : null}
                </div>
              ) : null}

              {showDesktopScanner ? (
                <CitizenQrScanner
                  parsed={parsedCitizenQr}
                  rawText={scanRawText}
                  scannerError={scannerError}
                  onClose={() => setScannerOpen(false)}
                  onError={setScannerError}
                  onScan={applyScannedText}
                />
              ) : null}

              {showEntryStep && !isMobileAddFlow && scanRawText ? (
                <div className="calculation-box">
                  <span>QR CCCD đã quét gần nhất</span>
                  <small>{scanRawText}</small>
                  {parsedCitizenQr ? <ParserDebug parsed={parsedCitizenQr} /> : null}
                </div>
              ) : null}

              {showEntryStep && isMobileAddFlow && parsedCitizenQr ? (
                <div className="farmer-scan-summary">
                  <strong>Đã quét: {parsedCitizenQr.name || "CCCD"}</strong>
                  <span>
                    {parsedCitizenQr.citizen_id ? `CCCD ${parsedCitizenQr.citizen_id}` : ""}
                    {parsedCitizenQr.citizen_id && parsedCitizenQr.date_of_birth ? " · " : ""}
                    {parsedCitizenQr.date_of_birth ? `Sinh ${parsedCitizenQr.date_of_birth}` : ""}
                  </span>
                </div>
              ) : null}

              {showEntryStep ? (
                <>
          <label className="field">
            <RequiredLabel>Tên nông dân</RequiredLabel>
            <input {...register("name")} placeholder="VD: Nguyễn Văn A" />
            {errors.name ? <small>{errors.name.message}</small> : null}
          </label>

          <div className="field-grid">
            <label className="field">
              <RequiredLabel>Số điện thoại</RequiredLabel>
              <input {...register("phone")} inputMode="tel" placeholder="VD: 090..." />
              {errors.phone ? <small>{errors.phone.message}</small> : null}
            </label>
            <label className="field">
              <RequiredLabel>CCCD</RequiredLabel>
              <input {...register("citizen_id")} inputMode="numeric" placeholder="Số CCCD" />
              {errors.citizen_id ? <small>{errors.citizen_id.message}</small> : null}
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <RequiredLabel>Giới tính</RequiredLabel>
              <select {...register("gender")}>
                <option value="">Chọn giới tính</option>
                <option value="Nam">Nam</option>
                <option value="Nữ">Nữ</option>
              </select>
              {errors.gender ? <small>{errors.gender.message}</small> : null}
            </label>
            <label className="field">
              <RequiredLabel>Ngày sinh</RequiredLabel>
              <input type="date" {...register("date_of_birth")} />
              {errors.date_of_birth ? <small>{errors.date_of_birth.message}</small> : null}
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <RequiredLabel>Ngày cấp CCCD</RequiredLabel>
              <input type="date" {...register("citizen_id_issued_date")} />
              {errors.citizen_id_issued_date ? <small>{errors.citizen_id_issued_date.message}</small> : null}
            </label>
            <label className="field">
              <RequiredLabel>Địa chỉ thường trú</RequiredLabel>
              <input {...register("permanent_address")} placeholder="Theo CCCD" />
              {errors.permanent_address ? <small>{errors.permanent_address.message}</small> : null}
            </label>
          </div>

          <label className="field">
            <span>Raw QR CCCD</span>
            <textarea {...register("citizen_id_qr_raw_text")} rows={3} placeholder="Dữ liệu QR sau khi quét" />
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

          <Button type="submit" disabled={saving}>
            <Plus size={18} aria-hidden="true" />
            {saving ? "Đang lưu..." : editingItem ? "Lưu thay đổi" : "Thêm nông dân"}
          </Button>
                </>
              ) : null}
            </form>
          </ModalShell>
        ) : null}

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

          {error || listError ? <div className="alert error-alert">{error ?? listError}</div> : null}

          {loading ? (
            <div className="state-box">Đang tải nông dân...</div>
          ) : items.length === 0 ? (
            <div className="state-box">Không có nông dân phù hợp.</div>
          ) : (
            <>
              <div className="farmers-mobile-list">
                {items.map((item) => (
                  <article key={`mobile-${item.id}`} className="farmer-mobile-card">
                    <div className="farmer-mobile-body">
                      <strong className="farmer-mobile-name">{item.name}</strong>
                      <p className="farmer-mobile-line">
                        <span>{item.phone || "Chưa có SĐT"}</span>
                        <span className="farmer-mobile-dot" aria-hidden="true">
                          ·
                        </span>
                        <span>{item.citizen_id ? `CCCD ${item.citizen_id}` : "Chưa có CCCD"}</span>
                      </p>
                    </div>
                    <div className="farmer-mobile-actions">
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => startEdit(item)}
                        aria-label={`Sửa ${item.name}`}
                      >
                        <Edit2 size={17} aria-hidden="true" />
                      </button>
                      <button
                        className="icon-button danger"
                        type="button"
                        onClick={() => void deleteItem(item)}
                        disabled={deletingId === item.id}
                        aria-label={`Xóa ${item.name}`}
                      >
                        <Trash2 size={17} aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="table-wrap farmers-desktop-table">
                <table className="data-table wide-table">
                  <thead>
                    <tr>
                      <th>Tên</th>
                      <th>Điện thoại</th>
                      <th>CCCD</th>
                      <th>Ngày sinh</th>
                      <th>Giới tính</th>
                      <th>Thường trú</th>
                      <th>Ngân hàng</th>
                      <th>Tài khoản</th>
                      <th aria-label="Thao tác" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.phone || "-"}</td>
                        <td>{item.citizen_id || "-"}</td>
                        <td>{formatDateValue(item.date_of_birth)}</td>
                        <td>{item.gender || "-"}</td>
                        <td>{item.permanent_address || "-"}</td>
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
              <PaginationControls
                page={page}
                totalPages={totalPages}
                total={total}
                loading={loading}
                onPageChange={setPage}
              />
            </>
          )}
        </div>
      </div>

      {createdFarmerPrompt ? (
        <ModalShell onClose={() => setCreatedFarmerPrompt(null)}>
          <div className="form-card post-create-prompt">
            <h2>Đã thêm nông dân</h2>
            <p>
              Đã lưu <strong>{createdFarmerPrompt.name}</strong>. Bạn có muốn tạo phiếu mua cho nông dân này ngay
              không?
            </p>
            <div className="post-create-actions">
              <Button type="button" onClick={() => goToCreatePurchaseSlip(createdFarmerPrompt)}>
                <Plus size={18} aria-hidden="true" />
                Tạo phiếu mua
              </Button>
              <Button variant="secondary" type="button" onClick={() => setCreatedFarmerPrompt(null)}>
                Để sau
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </section>
  );
}

type CitizenQrScannerProps = {
  parsed: ParsedCitizenQr | null;
  rawText: string;
  scannerError: string | null;
  embedded?: boolean;
  onClose: () => void;
  onManualEntry?: () => void;
  onError: (message: string | null) => void;
  onScan: (rawText: string) => void;
};

function CitizenQrScanner({
  parsed,
  rawText,
  scannerError,
  embedded = false,
  onClose,
  onManualEntry,
  onError,
  onScan,
}: CitizenQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const qrScannerRef = useRef<QrScanner | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastScanRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const realtimeStatusTimerRef = useRef<number | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [uploadScanStatus, setUploadScanStatus] = useState("");
  const [, setRealtimeScanState] = useState<"scanning" | "detected">("scanning");
  const [realtimeScanStatus, setRealtimeScanStatus] = useState("Đang dò QR realtime...");
  const [scanProgressPercent, setScanProgressPercent] = useState(0);
  const [qrDistanceLevel, setQrDistanceLevel] = useState<"unknown" | "far" | "good" | "near">("unknown");
  const [qrDistanceHint, setQrDistanceHint] = useState("Khoảng cách QR: đưa mã vào khung camera.");

  function markRealtimeDetected() {
    setRealtimeScanState("detected");
    setRealtimeScanStatus("Đã nhận QR, đang điền thông tin...");
    setScanProgressPercent(100);

    if (realtimeStatusTimerRef.current) {
      window.clearTimeout(realtimeStatusTimerRef.current);
    }
    realtimeStatusTimerRef.current = window.setTimeout(() => {
      setRealtimeScanState("scanning");
      setRealtimeScanStatus("Đang dò QR realtime...");
      setScanProgressPercent(0);
    }, 1800);
  }

  const handleDecodedText = useCallback((decodedText: string, result?: QrScanner.ScanResult) => {
    if (result && !embedded) {
      const video = videoRef.current;
      const estimation = estimateQrDistanceHint(
        { result: { resultPoints: result.cornerPoints } },
        video?.videoWidth ?? 0,
        video?.videoHeight ?? 0,
      );
      if (estimation) {
        setQrDistanceLevel(estimation.level);
        setQrDistanceHint(estimation.message);
      }
    }

    const now = Date.now();
    const isDuplicate =
      decodedText === lastScanRef.current.text && now - lastScanRef.current.at < 1200;
    if (isDuplicate) return;

    lastScanRef.current = { text: decodedText, at: now };
    markRealtimeDetected();
    setUploadScanStatus("Đã nhận dữ liệu QR.");
    onScan(decodedText);
  }, [embedded, onScan]);

  useEffect(() => {
    QrScanner.listCameras(false)
      .then((devices) => {
        const cameraOptions = devices.map((device) => ({ id: device.id, label: device.label }));
        setCameras(cameraOptions);
      })
      .catch(() => {
        // Camera listing may fail until permission is granted. Scanner start below reports the actionable error.
      });
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let active = true;
    let stopFullFrameScanLoop: (() => void) | null = null;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    preferWorkerQrEngineOnAppleMobile();

    const scanner = new QrScanner(video, (result) => {
      handleDecodedText(result.data, result);
    }, {
      calculateScanRegion: calculateQrScanRegion,
      highlightCodeOutline: true,
      highlightScanRegion: true,
      maxScansPerSecond: 12,
      onDecodeError: () => {
        // Decode misses happen continuously while searching; keep the UI quiet.
      },
      preferredCamera: selectedCameraId ?? "environment",
      returnDetailedScanResult: true,
    });
    scanner.setInversionMode("both");
    qrScannerRef.current = scanner;

    scanner.start()
      .then(() => {
        if (!active) {
          scanner.destroy();
          return;
        }
        setRealtimeScanStatus(embedded ? "Đưa mã QR CCCD vào khung camera" : "Đang dò QR realtime...");
        stopFullFrameScanLoop = startRobustFrameScanLoop(video, handleDecodedText, setRealtimeScanStatus);
        void QrScanner.listCameras(true).then((nextCameras) => {
          if (!active) return;
          const cameraOptions = nextCameras.map((camera) => ({ id: camera.id, label: camera.label }));
          setCameras(cameraOptions);
        });
        void tuneActiveVideoTrack(video);
        void video.play().catch(() => {
          // Safari may reject play() if the stream is still warming up; QrScanner keeps the stream active.
        });
        onError(null);
      })
      .catch((scanError: unknown) => {
        if (!active) return;
        if (!embedded) {
          onError(formatScannerError(scanError));
        }
      });

    return () => {
      active = false;
      if (realtimeStatusTimerRef.current) {
        window.clearTimeout(realtimeStatusTimerRef.current);
        realtimeStatusTimerRef.current = null;
      }
      stopFullFrameScanLoop?.();
      scanner.destroy();
      if (qrScannerRef.current === scanner) {
        qrScannerRef.current = null;
      }
    };
  }, [embedded, handleDecodedText, onError, selectedCameraId]);

  function switchCamera() {
    if (cameras.length === 0) return;

    setSelectedCameraId((currentId) => {
      const usableCameras = cameras.filter((camera) => camera.id);
      if (usableCameras.length === 0) return currentId;

      if (!currentId) {
        const rearCamera = findBestRearCamera(usableCameras);
        const rearIndex = rearCamera ? usableCameras.findIndex((camera) => camera.id === rearCamera.id) : -1;
        const nextIndex = rearIndex >= 0 ? (rearIndex + 1) % usableCameras.length : 0;
        return usableCameras[nextIndex].id;
      }

      const currentIndex = usableCameras.findIndex((camera) => camera.id === currentId);
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % usableCameras.length : 0;
      return usableCameras[nextIndex].id;
    });
    onError(null);
    setRealtimeScanState("scanning");
    setRealtimeScanStatus("Đang dò QR realtime...");
    setScanProgressPercent(0);
    setQrDistanceLevel("unknown");
    setQrDistanceHint("Khoảng cách QR: đưa mã vào khung camera.");
  }

  async function scanUploadedFile(file: File | null) {
    if (!file) return;

    try {
      onError(null);
      setUploadScanStatus("Đang đọc ảnh QR...");
      const decodedText = await scanFileWithEnhancement(file, (message) =>
        setUploadScanStatus(message),
      );
      setUploadScanStatus("Đã đọc QR từ ảnh.");
      onScan(decodedText);
    } catch (scanError) {
      setUploadScanStatus("");
      const message = `Không đọc được QR từ ảnh: ${formatErrorMessage(scanError)}`;
      if (embedded) {
        setRealtimeScanStatus(message);
      } else {
        onError(message);
      }
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function captureFrameAndScan() {
    try {
      onError(null);
      setUploadScanStatus("Đang chụp khung hình để quét...");

      const video = videoRef.current;
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
        throw new Error("Chưa lấy được hình từ camera.");
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Không thể tạo ảnh từ camera.");
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const file = await canvasToFile(canvas, "camera-frame.png");
      const decodedText = await scanFileWithEnhancement(file, (message) =>
        setUploadScanStatus(message),
      );
      setUploadScanStatus("Đã đọc QR từ ảnh chụp.");
      onScan(decodedText);
    } catch (scanError) {
      setUploadScanStatus("");
      onError(`Không đọc được QR từ ảnh chụp: ${formatErrorMessage(scanError)}`);
    }
  }

  const currentCameraLabel =
    cameras.find((camera) => camera.id === selectedCameraId)?.label ||
    (selectedCameraId ? "Camera đã chọn" : "Camera sau tự động");

  const content = (
    <>
      {!embedded ? (
        <div className="card-title-row">
          <h2>Quét CCCD</h2>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => void scanUploadedFile(event.target.files?.[0] ?? null)}
      />

      {!embedded ? (
        <div className="scanner-action-group">
          <div className="scanner-primary-actions">
            <Button variant="secondary" type="button" onClick={() => void captureFrameAndScan()}>
              <Camera size={17} aria-hidden="true" />
              Chụp để quét
            </Button>
            <Button variant="secondary" type="button" onClick={() => fileInputRef.current?.click()}>
              <ImageUp size={17} aria-hidden="true" />
              Upload QR
            </Button>
          </div>
          <div className="scanner-secondary-actions">
            <Button variant="secondary" type="button" onClick={switchCamera} disabled={cameras.length < 2}>
              Đổi camera
            </Button>
            <Button variant="secondary" type="button" onClick={onClose} aria-label="Đóng scanner">
              <X size={18} aria-hidden="true" />
              Đóng quét
            </Button>
          </div>
        </div>
      ) : null}

      <div className="scanner-frame">
        <div className="qr-scanner">
          <video ref={videoRef} muted playsInline autoPlay />
        </div>
      </div>

      {embedded ? (
        <>
          <p className="scanner-status-line" aria-live="polite">
            {uploadScanStatus || realtimeScanStatus}
          </p>
          <div className="farmer-scan-actions">
            <Button
              className="farmer-scan-action-button"
              variant="secondary"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageUp size={17} aria-hidden="true" />
              Chọn ảnh QR
            </Button>
            {onManualEntry ? (
              <Button className="farmer-scan-action-button" variant="secondary" type="button" onClick={onManualEntry}>
                <PenLine size={17} aria-hidden="true" />
                Nhập tay
              </Button>
            ) : null}
          </div>
          {cameras.length >= 2 ? (
            <Button className="farmer-scan-switch-camera" variant="ghost" size="sm" type="button" onClick={switchCamera}>
              Đổi camera
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <div className="scan-progress-card" aria-live="polite">
            <div className="scan-progress-head">
              <span>Tiến trình quét</span>
              <strong>{scanProgressPercent}%</strong>
            </div>
            <div className="scan-progress-track">
              <span style={{ width: `${scanProgressPercent}%` }} />
            </div>
            <small>{realtimeScanStatus}</small>
            <small className={`scan-distance-hint ${qrDistanceLevel}`}>{qrDistanceHint}</small>
          </div>

          {scannerError ? (
            <div className="alert error-alert">
              <strong>Lỗi camera:</strong> {scannerError} Bạn vẫn có thể nhập thông tin CCCD thủ công.
            </div>
          ) : (
            <p className="section-hint">
              Đưa mã QR vào khung camera. Hệ thống quét realtime liên tục. Đang dùng: {currentCameraLabel}.
            </p>
          )}

          {uploadScanStatus ? <p className="section-hint">{uploadScanStatus}</p> : null}
        </>
      )}

      {!embedded && rawText ? (
        <details className="scan-debug-details">
          <summary>Xem dữ liệu QR đã quét</summary>
          <label className="field">
            <span>Raw QR text</span>
            <textarea value={rawText} readOnly rows={4} />
          </label>
          {parsed ? <ParserDebug parsed={parsed} /> : null}
        </details>
      ) : null}
    </>
  );

  if (embedded) {
    return <div className="citizen-qr-scanner-embedded">{content}</div>;
  }

  return <div className="form-card">{content}</div>;
}

function findBestRearCamera(cameras: Array<{ id: string; label: string }>) {
  if (cameras.length === 0) return null;

  const scored = cameras.map((camera, index) => {
    const label = removeVietnameseMarks(camera.label).toLowerCase();
    let score = index;

    if (label.includes("environment") || label.includes("back") || label.includes("rear") || label.includes("sau")) score += 40;
    if (label.includes("main")) score += 18;
    if (label.includes("wide") && !label.includes("ultra")) score += 12;
    if (label.includes("camera sau") || label.includes("back camera")) score += 12;
    if (label.includes("ultra") || label.includes("tele")) score -= 24;
    if (label.includes("front") || label.includes("user") || label.includes("facetime") || label.includes("truoc")) score -= 80;

    return { camera, score };
  });

  return scored.sort((a, b) => b.score - a.score)[0]?.camera ?? cameras[cameras.length - 1];
}

function calculateQrScanRegion(video: HTMLVideoElement): QrScanner.ScanRegion {
  const minEdge = Math.min(video.videoWidth, video.videoHeight);
  if (minEdge <= 0) {
    return {
      downScaledWidth: 360,
      downScaledHeight: 360,
    };
  }

  const maxSize = Math.min(QR_SCAN_IDEAL_SIZE + 120, minEdge);
  const minSize = Math.min(QR_SCAN_MIN_SIZE, maxSize);
  const size = clamp(Math.round(minEdge * 0.72), minSize, maxSize);
  const x = Math.round((video.videoWidth - size) / 2);
  const y = Math.round((video.videoHeight - size) / 2);

  return {
    x,
    y,
    width: size,
    height: size,
    downScaledWidth: 360,
    downScaledHeight: 360,
  };
}

function startRobustFrameScanLoop(
  video: HTMLVideoElement,
  onDetected: (decodedText: string, result?: QrScanner.ScanResult) => void,
  onStatus: (message: string) => void,
) {
  let active = true;
  let scanning = false;
  let timerId: number | null = null;
  let scanPlanCursor = 0;
  const zxingReader = createZxingQrReader();

  onStatus(isAppleMobileDevice() ? "Đang quét QR tối ưu cho iPhone..." : "Đang quét QR realtime...");

  const scheduleNextScan = () => {
    if (!active) return;
    timerId = window.setTimeout(() => {
      void scanFrame();
    }, QR_REALTIME_ZXING_INTERVAL_MS);
  };

  const scanFrame = async () => {
    if (!active || scanning) return;

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
      scheduleNextScan();
      return;
    }

    scanning = true;
    try {
      const decodedText = decodeVideoFrameWithZxing(
        video,
        zxingReader,
        scanPlanCursor,
        QR_REALTIME_ZXING_PLANS_PER_TICK,
      );

      if (active) onDetected(decodedText);
    } catch {
      // Keep scanning; misses are expected frame-by-frame.
    } finally {
      scanPlanCursor = (scanPlanCursor + QR_REALTIME_ZXING_PLANS_PER_TICK) % VIDEO_QR_SCAN_PLANS.length;
      scanning = false;
      scheduleNextScan();
    }
  };

  scheduleNextScan();

  return () => {
    active = false;
    if (timerId) {
      window.clearTimeout(timerId);
    }
  };
}

function createZxingQrReader() {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.CHARACTER_SET, "UTF-8");

  return new BrowserQRCodeReader(hints, {
    delayBetweenScanAttempts: QR_REALTIME_ZXING_INTERVAL_MS,
    delayBetweenScanSuccess: 900,
    tryPlayVideoTimeout: 5000,
  });
}

function decodeVideoFrameWithZxing(
  video: HTMLVideoElement,
  reader: BrowserQRCodeReader,
  startPlanIndex: number,
  planCount: number,
) {
  for (let offset = 0; offset < planCount; offset += 1) {
    const plan = VIDEO_QR_SCAN_PLANS[(startPlanIndex + offset) % VIDEO_QR_SCAN_PLANS.length];
    const canvas = renderVideoQrVariant(video, plan);
    if (!canvas) continue;

    try {
      const result = reader.decodeFromCanvas(canvas);
      const text = result.getText();
      if (text) return text;
    } catch {
      // Try the next crop/contrast variant.
    }
  }

  throw new Error("No QR code found");
}

type VideoQrScanPlan = {
  centerXRatio: number;
  centerYRatio: number;
  mode: QrImageVariantMode;
  sizeRatio: number;
};

const VIDEO_QR_SCAN_PLANS: VideoQrScanPlan[] = [
  { centerXRatio: 0.5, centerYRatio: 0.5, mode: "raw", sizeRatio: 0.78 },
  { centerXRatio: 0.5, centerYRatio: 0.5, mode: "contrast", sizeRatio: 0.78 },
  { centerXRatio: 0.5, centerYRatio: 0.5, mode: "threshold-mid", sizeRatio: 0.78 },
  { centerXRatio: 0.5, centerYRatio: 0.5, mode: "raw", sizeRatio: 0.58 },
  { centerXRatio: 0.5, centerYRatio: 0.5, mode: "contrast", sizeRatio: 1 },
  { centerXRatio: 0.5, centerYRatio: 0.42, mode: "raw", sizeRatio: 0.72 },
  { centerXRatio: 0.5, centerYRatio: 0.58, mode: "raw", sizeRatio: 0.72 },
  { centerXRatio: 0.42, centerYRatio: 0.5, mode: "raw", sizeRatio: 0.72 },
  { centerXRatio: 0.58, centerYRatio: 0.5, mode: "raw", sizeRatio: 0.72 },
  { centerXRatio: 0.5, centerYRatio: 0.5, mode: "threshold-low", sizeRatio: 1 },
  { centerXRatio: 0.5, centerYRatio: 0.5, mode: "threshold-high", sizeRatio: 1 },
];

function renderVideoQrVariant(video: HTMLVideoElement, plan: VideoQrScanPlan) {
  const frameWidth = video.videoWidth;
  const frameHeight = video.videoHeight;
  const minEdge = Math.min(frameWidth, frameHeight);
  if (minEdge <= 0) return null;

  const sourceSize = Math.min(minEdge, Math.max(180, Math.round(minEdge * plan.sizeRatio)));
  const sourceX = clamp(Math.round(frameWidth * plan.centerXRatio - sourceSize / 2), 0, frameWidth - sourceSize);
  const sourceY = clamp(Math.round(frameHeight * plan.centerYRatio - sourceSize / 2), 0, frameHeight - sourceSize);
  const outputSize = clamp(Math.round(sourceSize * 1.25), 520, 900);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;

  const context = canvas.getContext("2d", { willReadFrequently: true }) ?? canvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outputSize, outputSize);
  context.imageSmoothingEnabled = false;
  context.drawImage(video, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outputSize, outputSize);
  applyQrCanvasMode(canvas, plan.mode);

  return canvas;
}

async function tuneActiveVideoTrack(video: HTMLVideoElement) {
  try {
    const stream = video.srcObject instanceof MediaStream ? video.srcObject : null;
    const track = stream?.getVideoTracks()[0];
    if (!track) return;

    const capabilities = typeof track.getCapabilities === "function"
      ? (track.getCapabilities() as Record<string, unknown>)
      : {};
    const advancedConstraints: Array<Record<string, unknown>> = [];

    if (cameraCapabilityIncludes(capabilities, "focusMode", "continuous")) {
      advancedConstraints.push({ focusMode: "continuous" });
    }
    if (cameraCapabilityIncludes(capabilities, "exposureMode", "continuous")) {
      advancedConstraints.push({ exposureMode: "continuous" });
    }
    if (cameraCapabilityIncludes(capabilities, "whiteBalanceMode", "continuous")) {
      advancedConstraints.push({ whiteBalanceMode: "continuous" });
    }

    if (advancedConstraints.length === 0) return;
    await track.applyConstraints({ advanced: advancedConstraints as MediaTrackConstraintSet[] });
  } catch {
    // Safari accepts only a subset of camera constraints; scanning still works without these hints.
  }
}

function cameraCapabilityIncludes(capabilities: Record<string, unknown>, key: string, value: string) {
  const candidate = capabilities[key];
  return Array.isArray(candidate) && candidate.includes(value);
}

function isAppleMobileDevice() {
  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function preferWorkerQrEngineOnAppleMobile() {
  if (!isAppleMobileDevice()) return;

  (QrScanner as unknown as { _disableBarcodeDetector?: boolean })._disableBarcodeDetector = true;
}

function estimateQrDistanceHint(
  decodedResult: unknown,
  videoWidth: number,
  videoHeight: number,
): { level: "far" | "good" | "near"; message: string } | null {
  if (videoWidth <= 0 || videoHeight <= 0) return null;

  const points = extractResultPoints(decodedResult);
  if (points.length < 3) return null;

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const qrArea = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
  const frameArea = videoWidth * videoHeight;
  if (frameArea <= 0 || qrArea <= 0) return null;

  const ratio = qrArea / frameArea;
  if (ratio < 0.03) {
    return {
      level: "far",
      message: "Khoảng cách QR: còn xa, đưa camera gần hơn.",
    };
  }
  if (ratio > 0.35) {
    return {
      level: "near",
      message: "Khoảng cách QR: hơi gần, lùi camera ra một chút.",
    };
  }

  return {
    level: "good",
    message: "Khoảng cách QR: tốt, giữ ổn định để quét nhanh.",
  };
}

function extractResultPoints(decodedResult: unknown): Array<{ x: number; y: number }> {
  if (!decodedResult || typeof decodedResult !== "object") return [];

  const candidate = decodedResult as {
    result?: { resultPoints?: unknown[] };
  };
  if (!candidate.result?.resultPoints) return [];

  return candidate.result.resultPoints
    .map((point) => {
      if (!point || typeof point !== "object") return null;
      const value = point as { x?: unknown; y?: unknown };
      const x = typeof value.x === "number" ? value.x : null;
      const y = typeof value.y === "number" ? value.y : null;
      if (x === null || y === null) return null;
      return { x, y };
    })
    .filter((point): point is { x: number; y: number } => point !== null);
}

async function scanFileWithEnhancement(
  file: File,
  onStatus: (message: string) => void,
) {
  preferWorkerQrEngineOnAppleMobile();
  const qrEngine = await QrScanner.createQrEngine();

  try {
    try {
      onStatus("Đang thử đọc ảnh gốc bằng QR worker...");
      return await scanQrImage(file, qrEngine);
    } catch {
      // Continue with generated crops and threshold variants.
    }

    const image = await loadImage(file);
    const zxingReader = createZxingQrReader();
    const fullImageVariants = [
      renderImageVariant(image, "raw"),
      renderImageVariant(image, "contrast"),
      renderImageVariant(image, "threshold-mid"),
    ];

    for (const [index, canvas] of fullImageVariants.entries()) {
      onStatus(`Đang thử ảnh đầy đủ ${index + 1}/${fullImageVariants.length}...`);
      try {
        return decodeCanvasWithZxing(canvas, zxingReader);
      } catch {
        // Try next full-image variant.
      }
    }

    const variants = buildQrImageVariants(image);

    for (const [index, variant] of variants.entries()) {
      onStatus(`Đang thử vùng QR ${index + 1}/${variants.length}...`);
      try {
        return await scanQrImage(variant.canvas, qrEngine);
      } catch {
        // Try ZXing below.
      }

      try {
        return decodeCanvasWithZxing(variant.canvas, zxingReader);
      } catch {
        // Try next variant.
      }
    }

    throw new Error("Ảnh có thể bị mờ, nghiêng quá nhiều hoặc QR quá sát mép. Hãy crop gần mã QR hơn rồi upload lại.");
  } finally {
    closeQrEngine(qrEngine);
  }
}

async function scanQrImage(
  source: Parameters<typeof QrScanner.scanImage>[0],
  qrEngine: Awaited<ReturnType<typeof QrScanner.createQrEngine>>,
) {
  const result = await QrScanner.scanImage(source, {
    alsoTryWithoutScanRegion: true,
    qrEngine,
    returnDetailedScanResult: true,
  });
  return result.data;
}

function decodeCanvasWithZxing(canvas: HTMLCanvasElement, reader: BrowserQRCodeReader) {
  const result = reader.decodeFromCanvas(canvas);
  const text = result.getText();
  if (!text) throw new Error("No QR code found");
  return text;
}

function closeQrEngine(qrEngine: Awaited<ReturnType<typeof QrScanner.createQrEngine>>) {
  if (typeof Worker !== "undefined" && qrEngine instanceof Worker) {
    qrEngine.terminate();
  }
}

function buildQrImageVariants(image: HTMLImageElement) {
  const variants: Array<{ canvas: HTMLCanvasElement }> = [];
  const seen = new Set<string>();
  const minEdge = Math.min(image.naturalWidth, image.naturalHeight);
  const cropSizes = [0.28, 0.36, 0.45, 0.56, 0.7, 0.88, 1].map((ratio) =>
    Math.round(minEdge * ratio),
  );
  const centers = [
    [0.5, 0.5],
    [0.5, 0.42],
    [0.5, 0.58],
    [0.42, 0.5],
    [0.58, 0.5],
    [0.45, 0.45],
    [0.55, 0.45],
    [0.45, 0.55],
    [0.55, 0.55],
  ];
  const modes: QrImageVariantMode[] = ["raw", "gray", "contrast", "threshold-low", "threshold-mid", "threshold-high"];

  for (const size of cropSizes) {
    for (const [centerXRatio, centerYRatio] of centers) {
      const x = clamp(Math.round(image.naturalWidth * centerXRatio - size / 2), 0, image.naturalWidth - size);
      const y = clamp(Math.round(image.naturalHeight * centerYRatio - size / 2), 0, image.naturalHeight - size);

      for (const mode of modes) {
        const key = `${x}:${y}:${size}:${mode}`;
        if (seen.has(key)) continue;
        seen.add(key);
        variants.push({
          canvas: renderCropVariant(image, x, y, size, mode),
        });
      }
    }
  }

  return variants;
}

type QrImageVariantMode = "raw" | "gray" | "contrast" | "threshold-low" | "threshold-mid" | "threshold-high";

function renderImageVariant(image: HTMLImageElement, mode: QrImageVariantMode) {
  const maxEdge = 1400;
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const outputWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const outputHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true }) ?? canvas.getContext("2d");
  if (!context) return canvas;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, outputWidth, outputHeight);
  applyQrCanvasMode(canvas, mode);

  return canvas;
}

function renderCropVariant(
  image: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  mode: QrImageVariantMode,
) {
  const outputSize = Math.max(QR_CAPTURE_OUTPUT_MIN_SIZE, Math.min(QR_CAPTURE_OUTPUT_MAX_SIZE, size * 2));
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outputSize, outputSize);
  context.imageSmoothingEnabled = false;
  context.drawImage(image, x, y, size, size, 0, 0, outputSize, outputSize);

  if (mode === "raw") return canvas;

  const imageData = context.getImageData(0, 0, outputSize, outputSize);
  normalizeQrImageData(imageData, mode);
  context.putImageData(imageData, 0, 0);

  return canvas;
}

function applyQrCanvasMode(canvas: HTMLCanvasElement, mode: QrImageVariantMode) {
  if (mode === "raw") return;

  const context = canvas.getContext("2d", { willReadFrequently: true }) ?? canvas.getContext("2d");
  if (!context) return;

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  normalizeQrImageData(imageData, mode);
  context.putImageData(imageData, 0, 0);
}

function normalizeQrImageData(imageData: ImageData, mode: QrImageVariantMode) {
  for (let index = 0; index < imageData.data.length; index += 4) {
    const gray =
      imageData.data[index] * 0.299 +
      imageData.data[index + 1] * 0.587 +
      imageData.data[index + 2] * 0.114;
    const value = normalizeQrPixel(gray, mode);
    imageData.data[index] = value;
    imageData.data[index + 1] = value;
    imageData.data[index + 2] = value;
  }
}

function normalizeQrPixel(gray: number, mode: QrImageVariantMode) {
  if (mode === "threshold-low") return gray < 112 ? 0 : 255;
  if (mode === "threshold-mid") return gray < 135 ? 0 : 255;
  if (mode === "threshold-high") return gray < 165 ? 0 : 255;
  if (mode === "contrast") return clamp(Math.round((gray - 128) * 1.45 + 128), 0, 255);
  return gray;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Không thể mở ảnh đã chọn."));
    };
    image.src = objectUrl;
  });
}

function canvasToFile(canvas: HTMLCanvasElement, fileName: string) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Không thể xử lý ảnh QR."));
        return;
      }

      resolve(new File([blob], fileName, { type: "image/png" }));
    }, "image/png");
  });
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function ParserDebug({ parsed }: { parsed: ParsedCitizenQr }) {
  return (
    <div className="calculation-box">
      <span>Parser debug</span>
      <small>Chiến lược: {parsed.strategy}</small>
      <small>Độ tin cậy: {parsed.confidence}</small>
      <small>CCCD: {parsed.citizen_id || "-"}</small>
      <small>Họ tên: {parsed.name || "-"}</small>
      <small>Ngày sinh: {formatDateValue(parsed.date_of_birth)}</small>
      <small>Giới tính: {parsed.gender || "-"}</small>
      <small>Thường trú: {parsed.permanent_address || "-"}</small>
      <small>Ngày cấp: {formatDateValue(parsed.citizen_id_issued_date)}</small>
      {parsed.warnings.length > 0 ? <small>Cảnh báo: {parsed.warnings.join("; ")}</small> : null}
      <small>Tokens: {parsed.tokens.length > 0 ? parsed.tokens.join(" | ") : "-"}</small>
    </div>
  );
}

function parseCitizenQr(rawText: string): ParsedCitizenQr {
  const trimmed = rawText.trim();
  const warnings: string[] = [];

  try {
    const parsedJson = JSON.parse(trimmed) as Record<string, unknown>;
    const jsonValues = flattenJsonValues(parsedJson);
    const citizenId =
      findCitizenId(jsonValues) ||
      normalizeCitizenId(readString(parsedJson, ["citizen_id", "id", "cccd", "so_cccd"]));
    const name = cleanName(readString(parsedJson, ["name", "full_name", "ho_ten"]));
    const dateOfBirth = normalizeDateValue(readString(parsedJson, ["date_of_birth", "dob", "birth_date", "ngay_sinh"]));
    const gender = normalizeGender(readString(parsedJson, ["gender", "sex", "gioi_tinh"]));
    const permanentAddress = readString(parsedJson, ["permanent_address", "address", "dia_chi", "thuong_tru"]);
    const issuedDate = normalizeDateValue(readString(parsedJson, ["citizen_id_issued_date", "issued_date", "issue_date", "ngay_cap"]));

    if (!citizenId) warnings.push("Không tìm thấy CCCD 12 số trong JSON.");
    if (!name) warnings.push("Không tìm thấy họ tên rõ ràng trong JSON.");
    if (!permanentAddress) warnings.push("Không tìm thấy địa chỉ trong JSON.");

    return {
      citizen_id: citizenId,
      name,
      date_of_birth: dateOfBirth,
      gender,
      permanent_address: permanentAddress,
      citizen_id_issued_date: issuedDate,
      citizen_id_qr_raw_text: rawText,
      strategy: "json",
      confidence: citizenId && name ? "high" : "medium",
      tokens: jsonValues,
      warnings,
    };
  } catch {
    // Vietnamese CCCD QR is commonly pipe-separated, not JSON.
  }

  const tokens = trimmed
    .split(/[|\n\r;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const citizenId = findCitizenId(tokens);
  const name = findLikelyName(tokens, citizenId);
  const dateOfBirth = findDateByContext(tokens, ["ngày sinh", "date of birth", "dob"]) || findLikelyDelimitedDate(tokens, 0);
  const gender = findLikelyGender(tokens);
  const permanentAddress = findLikelyAddress(tokens);
  const issuedDate = findDateByContext(tokens, ["ngày cấp", "issued", "issue"]) || findLikelyDelimitedDate(tokens, 1);

  if (!citizenId) warnings.push("Không tìm thấy CCCD 12 số.");
  if (!name) warnings.push("Không nhận diện chắc chắn họ tên.");
  if (!permanentAddress) warnings.push("Không nhận diện được địa chỉ.");

  return {
    citizen_id: citizenId,
    name,
    date_of_birth: dateOfBirth,
    gender,
    permanent_address: permanentAddress,
    citizen_id_issued_date: issuedDate,
    citizen_id_qr_raw_text: rawText,
    strategy: "delimited-heuristic",
    confidence: citizenId && name && permanentAddress ? "high" : citizenId && (name || permanentAddress) ? "medium" : "low",
    tokens,
    warnings,
  };
}

function findCitizenId(values: string[]) {
  for (const value of values) {
    const match = value.match(/\b\d{12}\b/);
    if (match) return match[0];
  }

  return "";
}

function normalizeCitizenId(value: string) {
  return value.match(/^\d{12}$/) ? value : "";
}

function findLikelyName(tokens: string[], citizenId: string) {
  const candidates = tokens
    .filter((token) => token !== citizenId)
    .filter((token) => !/\d/.test(token))
    .filter((token) => token.split(/\s+/).length >= 2)
    .filter((token) => !looksLikeAddress(token))
    .map(cleanName)
    .filter(Boolean);

  return candidates.find((candidate) => candidate === candidate.toUpperCase()) ?? candidates[0] ?? "";
}

function findLikelyAddress(tokens: string[]) {
  const addressCandidates = tokens.filter(looksLikeAddress);
  if (addressCandidates.length > 0) {
    return addressCandidates.sort((a, b) => b.length - a.length)[0];
  }

  return tokens
    .filter((token) => token.length > 20)
    .filter((token) => !/^\d+$/.test(token))
    .sort((a, b) => b.length - a.length)[0] ?? "";
}

function findLikelyGender(tokens: string[]) {
  for (const token of tokens) {
    const normalized = removeVietnameseMarks(token).toLowerCase().trim();
    if (normalized === "nam" || normalized.includes("gioi tinh nam") || normalized.includes("male")) {
      return "Nam";
    }
    if (
      normalized === "nu" ||
      normalized.includes("gioi tinh nu") ||
      normalized.includes("female")
    ) {
      return "Nữ";
    }
  }

  return "";
}

function normalizeGender(value: string) {
  if (!value) return "";
  return findLikelyGender([value]);
}

function findLikelyDelimitedDate(tokens: string[], occurrence: number) {
  const dates = tokens
    .map((token) => normalizeDateValue(token))
    .filter(Boolean);

  return dates[occurrence] ?? "";
}

function findDateByContext(tokens: string[], labels: string[]) {
  const normalizedLabels = labels.map((label) => removeVietnameseMarks(label).toLowerCase());

  for (let index = 0; index < tokens.length; index += 1) {
    const normalized = removeVietnameseMarks(tokens[index]).toLowerCase();
    if (!normalizedLabels.some((label) => normalized.includes(label))) continue;

    const sameTokenDate = normalizeDateValue(tokens[index]);
    if (sameTokenDate) return sameTokenDate;

    const nextTokenDate = normalizeDateValue(tokens[index + 1] ?? "");
    if (nextTokenDate) return nextTokenDate;
  }

  return "";
}

function normalizeDateValue(value: string) {
  const trimmed = value.trim();
  const compactMatch = trimmed.match(/\b(\d{2})(\d{2})(\d{4})\b/);
  if (compactMatch) {
    return `${compactMatch[3]}-${compactMatch[2]}-${compactMatch[1]}`;
  }

  const separatedMatch = trimmed.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (separatedMatch) {
    return `${separatedMatch[3]}-${separatedMatch[2].padStart(2, "0")}-${separatedMatch[1].padStart(2, "0")}`;
  }

  const isoMatch = trimmed.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  return isoMatch ? isoMatch[0] : "";
}

function looksLikeAddress(value: string) {
  const normalized = value.toLowerCase();
  return [
    "ấp",
    "xã",
    "phường",
    "huyện",
    "quận",
    "tỉnh",
    "thành phố",
    "đường",
    "thôn",
    "khóm",
  ].some((keyword) => normalized.includes(keyword));
}

function cleanName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function removeVietnameseMarks(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function flattenJsonValues(source: unknown): string[] {
  if (source === null || source === undefined) return [];
  if (typeof source === "string" || typeof source === "number") return [String(source).trim()].filter(Boolean);
  if (Array.isArray(source)) return source.flatMap(flattenJsonValues);
  if (typeof source === "object") return Object.values(source).flatMap(flattenJsonValues);
  return [];
}

function readString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function formatScannerError(error: unknown) {
  const message = formatErrorMessage(error);

  if (message.toLowerCase().includes("permission")) {
    return "Không có quyền truy cập camera. Vui lòng cấp quyền camera hoặc nhập thủ công.";
  }

  return `Không thể mở camera: ${message}`;
}

function formatErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatDateValue(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(new Date(value));
}

function toNullable(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
