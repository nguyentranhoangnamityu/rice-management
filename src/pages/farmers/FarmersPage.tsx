import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, ImageUp, Plus, ScanLine, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
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

type ParsedCitizenQr = {
  citizen_id: string;
  name: string;
  address: string;
  strategy: string;
  confidence: "high" | "medium" | "low";
  tokens: string[];
  warnings: string[];
};

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
  const [parsedCitizenQr, setParsedCitizenQr] = useState<ParsedCitizenQr | null>(null);

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
    setParsedCitizenQr(parsed);
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
              parsed={parsedCitizenQr}
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
              {parsedCitizenQr ? <ParserDebug parsed={parsedCitizenQr} /> : null}
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
  parsed: ParsedCitizenQr | null;
  rawText: string;
  scannerError: string | null;
  onClose: () => void;
  onError: (message: string | null) => void;
  onScan: (rawText: string) => void;
};

function CitizenQrScanner({
  parsed,
  rawText,
  scannerError,
  onClose,
  onError,
  onScan,
}: CitizenQrScannerProps) {
  const scannerElementId = useId().replace(/:/g, "-");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stoppedRef = useRef(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [uploadScanStatus, setUploadScanStatus] = useState("");

  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        setCameras(devices.map((device) => ({ id: device.id, label: device.label })));
      })
      .catch(() => {
        // Camera listing may fail until permission is granted. Scanner start below reports the actionable error.
      });
  }, []);

  useEffect(() => {
    const scanner = new Html5Qrcode(scannerElementId, {
      verbose: false,
      formatsToSupport: getQrCodeFormats(),
    });
    scannerRef.current = scanner;
    stoppedRef.current = false;
    const cameraConfig = selectedCameraId
      ? selectedCameraId
      : { facingMode: { exact: "environment" } };

    scanner
      .start(
        cameraConfig,
        {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.7);
            const size = Math.max(180, Math.min(edge, 420));
            return { width: size, height: size };
          },
        },
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
  }, [onError, onScan, scannerElementId, selectedCameraId]);

  function switchCamera() {
    if (cameras.length === 0) return;

    setSelectedCameraId((currentId) => {
      if (!currentId) return cameras[0].id;
      const currentIndex = cameras.findIndex((camera) => camera.id === currentId);
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % cameras.length : 0;
      return cameras[nextIndex].id;
    });
    onError(null);
  }

  async function scanUploadedFile(file: File | null) {
    if (!file) return;

    try {
      onError(null);
      setUploadScanStatus("Đang đọc ảnh QR...");
      const scanner = scannerRef.current ?? new Html5Qrcode(scannerElementId, {
        verbose: false,
        formatsToSupport: getQrCodeFormats(),
      });
      scannerRef.current = scanner;
      await stopScanner(scanner, stoppedRef);
      const decodedText = await scanFileWithEnhancement(scanner, file, (message) =>
        setUploadScanStatus(message),
      );
      setUploadScanStatus("Đã đọc QR từ ảnh.");
      onScan(decodedText);
    } catch (scanError) {
      setUploadScanStatus("");
      onError(`Không đọc được QR từ ảnh đã chọn: ${formatErrorMessage(scanError)}`);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  const currentCameraLabel =
    cameras.find((camera) => camera.id === selectedCameraId)?.label ||
    (selectedCameraId ? "Camera đã chọn" : "Camera sau");

  return (
    <div className="form-card">
      <div className="card-title-row">
        <h2>Quét CCCD</h2>
        <div className="row-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => void scanUploadedFile(event.target.files?.[0] ?? null)}
          />
          <button
            className="secondary-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageUp size={17} aria-hidden="true" />
            Upload QR
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={switchCamera}
            disabled={cameras.length < 2}
          >
            Đổi camera
          </button>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Đóng scanner">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div id={scannerElementId} className="qr-scanner" />

      {scannerError ? (
        <div className="alert error-alert">
          <strong>Lỗi camera:</strong> {scannerError} Bạn vẫn có thể nhập thông tin CCCD thủ công.
        </div>
      ) : (
        <p className="section-hint">
          Đưa mã QR vào giữa khung, giữ yên 1-2 giây. Đang dùng: {currentCameraLabel}.
        </p>
      )}

      {uploadScanStatus ? <p className="section-hint">{uploadScanStatus}</p> : null}

      {rawText ? (
        <>
          <label className="field">
            <span>Raw QR text</span>
            <textarea value={rawText} readOnly rows={4} />
          </label>
          {parsed ? <ParserDebug parsed={parsed} /> : null}
        </>
      ) : null}
    </div>
  );
}

function getQrCodeFormats() {
  if ("QR_CODE" in Html5QrcodeSupportedFormats) {
    return [Html5QrcodeSupportedFormats.QR_CODE];
  }

  return undefined;
}

async function scanFileWithEnhancement(
  scanner: Html5Qrcode,
  file: File,
  onStatus: (message: string) => void,
) {
  try {
    onStatus("Đang thử đọc ảnh gốc...");
    return await scanner.scanFile(file, false);
  } catch {
    // Continue with generated crops and threshold variants.
  }

  const image = await loadImage(file);
  const variants = buildQrImageVariants(image);

  for (const [index, variant] of variants.entries()) {
    onStatus(`Đang thử vùng QR ${index + 1}/${variants.length}...`);
    const variantFile = await canvasToFile(variant.canvas, `qr-variant-${index}.png`);
    try {
      const decodedText = await scanner.scanFile(variantFile, false);
      return decodedText;
    } catch {
      // Try next variant.
    }
  }

  throw new Error("Ảnh có thể bị mờ, nghiêng quá nhiều hoặc QR quá sát mép. Hãy crop gần mã QR hơn rồi upload lại.");
}

function buildQrImageVariants(image: HTMLImageElement) {
  const variants: Array<{ canvas: HTMLCanvasElement }> = [];
  const minEdge = Math.min(image.naturalWidth, image.naturalHeight);
  const cropSizes = [0.32, 0.38, 0.45, 0.55, 0.7].map((ratio) =>
    Math.round(minEdge * ratio),
  );
  const centers = [
    [0.5, 0.5],
    [0.45, 0.45],
    [0.55, 0.45],
    [0.45, 0.55],
    [0.55, 0.55],
    [0.5, 0.35],
    [0.5, 0.65],
    [0.35, 0.5],
    [0.65, 0.5],
  ];
  const modes: Array<"raw" | "gray" | "threshold"> = ["raw", "gray", "threshold"];

  for (const size of cropSizes) {
    for (const [centerXRatio, centerYRatio] of centers) {
      const x = clamp(Math.round(image.naturalWidth * centerXRatio - size / 2), 0, image.naturalWidth - size);
      const y = clamp(Math.round(image.naturalHeight * centerYRatio - size / 2), 0, image.naturalHeight - size);

      for (const mode of modes) {
        variants.push({
          canvas: renderCropVariant(image, x, y, size, mode),
        });
      }
    }
  }

  return variants;
}

function renderCropVariant(
  image: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  mode: "raw" | "gray" | "threshold",
) {
  const outputSize = Math.max(360, Math.min(900, size * 2));
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
  for (let index = 0; index < imageData.data.length; index += 4) {
    const gray =
      imageData.data[index] * 0.299 +
      imageData.data[index + 1] * 0.587 +
      imageData.data[index + 2] * 0.114;
    const value = mode === "threshold" ? (gray < 135 ? 0 : 255) : gray;
    imageData.data[index] = value;
    imageData.data[index + 1] = value;
    imageData.data[index + 2] = value;
  }
  context.putImageData(imageData, 0, 0);

  return canvas;
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
      <small>Địa chỉ: {parsed.address || "-"}</small>
      {parsed.warnings.length > 0 ? <small>Cảnh báo: {parsed.warnings.join("; ")}</small> : null}
      <small>Tokens: {parsed.tokens.length > 0 ? parsed.tokens.join(" | ") : "-"}</small>
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
    const address = readString(parsedJson, ["address", "dia_chi", "permanent_address"]);

    if (!citizenId) warnings.push("Không tìm thấy CCCD 12 số trong JSON.");
    if (!name) warnings.push("Không tìm thấy họ tên rõ ràng trong JSON.");
    if (!address) warnings.push("Không tìm thấy địa chỉ trong JSON.");

    return {
      citizen_id: citizenId,
      name,
      address,
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
  const address = findLikelyAddress(tokens);

  if (!citizenId) warnings.push("Không tìm thấy CCCD 12 số.");
  if (!name) warnings.push("Không nhận diện chắc chắn họ tên.");
  if (!address) warnings.push("Không nhận diện được địa chỉ.");

  return {
    citizen_id: citizenId,
    name,
    address,
    strategy: "delimited-heuristic",
    confidence: citizenId && name && address ? "high" : citizenId && (name || address) ? "medium" : "low",
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

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toNullable(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
