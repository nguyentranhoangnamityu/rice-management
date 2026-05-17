import { zodResolver } from "@hookform/resolvers/zod";
import { Download, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ModalShell } from "../../components/ui/ModalShell";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { useServerPagination } from "../../hooks/useServerPagination";
import { supabase } from "../../lib/supabase";
import type { Enums, Tables, TablesInsert } from "../../types/database";
import { formatDbError } from "../../lib/db-errors";

const DOCUMENTS_BUCKET = "documents";

type Attachment = Tables<"attachments">;
type AttachmentType = Enums<"attachment_type">;
type AuthorizationLetter = Tables<"authorization_letters">;
type Debt = Tables<"debts">;
type Farmer = Tables<"farmers">;
type Payment = Tables<"payments">;
type ProcessingRecord = Tables<"processing_records">;
type PurchaseSlip = Tables<"purchase_slips">;
type TransportTrip = Tables<"transport_trips">;

type ParentType =
  | "farmer"
  | "authorization_letter"
  | "purchase_slip"
  | "transport_trip"
  | "processing_record"
  | "payment"
  | "debt";

type ParentOption = {
  id: string;
  label: string;
};

const attachmentTypeOptions: { value: AttachmentType; label: string }[] = [
  { value: "citizen_id", label: "CCCD" },
  { value: "authorization_letter", label: "Giấy ủy quyền" },
  { value: "transfer_receipt", label: "Biên nhận chuyển khoản" },
  { value: "transport_receipt", label: "Chứng từ vận chuyển" },
  { value: "processing_receipt", label: "Chứng từ xử lý" },
  { value: "pdf_export", label: "PDF xuất file" },
  { value: "excel_export", label: "Excel xuất file" },
  { value: "other", label: "Khác" },
];

const parentTypeOptions: { value: ParentType; label: string }[] = [
  { value: "farmer", label: "Nông dân" },
  { value: "authorization_letter", label: "Giấy ủy quyền" },
  { value: "purchase_slip", label: "Phiếu mua" },
  { value: "transport_trip", label: "Chuyến ghe" },
  { value: "processing_record", label: "Phiếu xử lý" },
  { value: "payment", label: "Thanh toán" },
  { value: "debt", label: "Công nợ" },
];

const parentColumnByType: Record<ParentType, keyof Attachment> = {
  farmer: "farmer_id",
  authorization_letter: "authorization_letter_id",
  purchase_slip: "purchase_slip_id",
  transport_trip: "transport_trip_id",
  processing_record: "processing_record_id",
  payment: "payment_id",
  debt: "debt_id",
};

const formSchema = z.object({
  parent_type: z.enum([
    "farmer",
    "authorization_letter",
    "purchase_slip",
    "transport_trip",
    "processing_record",
    "payment",
    "debt",
  ]),
  parent_id: z.string().min(1, "Vui lòng chọn hồ sơ liên kết"),
  type: z.enum([
    "citizen_id",
    "authorization_letter",
    "transfer_receipt",
    "transport_receipt",
    "processing_receipt",
    "pdf_export",
    "excel_export",
    "other",
  ]),
});

type FormValues = z.infer<typeof formSchema>;

const emptyValues: FormValues = {
  parent_type: "farmer",
  parent_id: "",
  type: "other",
};

export function AttachmentsPage() {
  const {
    items: attachments,
    page,
    setPage,
    total,
    totalPages,
    search,
    setSearch,
    loading,
    error: listError,
    refresh,
  } = useServerPagination<Attachment>("attachments");
  const [parentOptions, setParentOptions] = useState<Record<ParentType, ParentOption[]>>({
    farmer: [],
    authorization_letter: [],
    purchase_slip: [],
    transport_trip: [],
    processing_record: [],
    payment: [],
    debt: [],
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyValues,
  });

  const watchedParentType = watch("parent_type");
  const activeParentOptions = parentOptions[watchedParentType];

  const parentLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const parentType of parentTypeOptions) {
      for (const option of parentOptions[parentType.value]) {
        map.set(`${parentType.value}:${option.id}`, option.label);
      }
    }
    return map;
  }, [parentOptions]);

  async function loadReferenceData() {
    setReferenceLoading(true);
    setError(null);

    const [
      farmersResult,
      lettersResult,
      slipsResult,
      tripsResult,
      recordsResult,
      paymentsResult,
      debtsResult,
    ] = await Promise.all([
      supabase.from("farmers").select("*").order("name", { ascending: true }),
      supabase.from("authorization_letters").select("*").order("created_at", { ascending: false }),
      supabase.from("purchase_slips").select("*").order("purchase_date", { ascending: false }),
      supabase.from("transport_trips").select("*").order("trip_date", { ascending: false }),
      supabase.from("processing_records").select("*").order("processed_date", { ascending: false }),
      supabase.from("payments").select("*").order("paid_date", { ascending: false }),
      supabase.from("debts").select("*").order("created_at", { ascending: false }),
    ]);

    const firstError =
      farmersResult.error ??
      lettersResult.error ??
      slipsResult.error ??
      tripsResult.error ??
      recordsResult.error ??
      paymentsResult.error ??
      debtsResult.error;

    if (firstError) {
      setError(formatDbError(firstError));
      setReferenceLoading(false);
      return;
    }

    setParentOptions({
      farmer: (farmersResult.data ?? []).map((farmer: Farmer) => ({
        id: farmer.id,
        label: farmer.name,
      })),
      authorization_letter: (lettersResult.data ?? []).map((letter: AuthorizationLetter) => ({
        id: letter.id,
        label: `Giấy ủy quyền ${letter.signed_date ? formatDate(letter.signed_date) : letter.id.slice(0, 8)}`,
      })),
      purchase_slip: (slipsResult.data ?? []).map((slip: PurchaseSlip) => ({
        id: slip.id,
        label: `Phiếu mua ${formatDate(slip.purchase_date)} - ${formatNumber(slip.weight_kg)} kg`,
      })),
      transport_trip: (tripsResult.data ?? []).map((trip: TransportTrip) => ({
        id: trip.id,
        label: `${trip.code} - ${formatDate(trip.trip_date)}`,
      })),
      processing_record: (recordsResult.data ?? []).map((record: ProcessingRecord) => ({
        id: record.id,
        label: `Xử lý ${formatDate(record.processed_date)} - ${formatNumber(record.input_weight_kg)} kg`,
      })),
      payment: (paymentsResult.data ?? []).map((payment: Payment) => ({
        id: payment.id,
        label: `Thanh toán ${formatDate(payment.paid_date)} - ${formatMoney(payment.amount)}`,
      })),
      debt: (debtsResult.data ?? []).map((debt: Debt) => ({
        id: debt.id,
        label: `${formatDebtType(debt.debt_type)} - ${formatMoney(debt.amount)}`,
      })),
    });
    setReferenceLoading(false);
  }

  useEffect(() => {
    void loadReferenceData();
  }, []);

  useEffect(() => {
    setValue("parent_id", "");
  }, [setValue, watchedParentType]);

  function clearForm() {
    setSelectedFile(null);
    reset(emptyValues);
    setFormOpen(false);
  }

  async function onSubmit(values: FormValues) {
    if (!selectedFile) {
      setError("Vui lòng chọn file cần tải lên.");
      return;
    }

    setSaving(true);
    setError(null);

    const safeName = selectedFile.name.replace(/[^\w.\-]+/g, "_");
    const filePath = `${values.parent_type}/${values.parent_id}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(filePath, selectedFile, {
        contentType: selectedFile.type || undefined,
        upsert: false,
      });

    if (uploadError) {
      setError(formatDbError(uploadError));
      setSaving(false);
      return;
    }

    const metadata: TablesInsert<"attachments"> = {
      farmer_id: null,
      authorization_letter_id: null,
      purchase_slip_id: null,
      transport_trip_id: null,
      processing_record_id: null,
      payment_id: null,
      debt_id: null,
      file_name: selectedFile.name,
      file_path: filePath,
      file_type: selectedFile.type || null,
      file_size: selectedFile.size,
      type: values.type,
    };
    setAttachmentParentId(metadata, values.parent_type, values.parent_id);

    const { error: insertError } = await supabase.from("attachments").insert(metadata);

    if (insertError) {
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([filePath]);
      setError(formatDbError(insertError));
    } else {
      clearForm();
      setFormOpen(false);
      await refresh(1);
    }

    setSaving(false);
  }

  async function openAttachment(attachment: Attachment) {
    setError(null);

    const { data, error: signedUrlError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(attachment.file_path, 60);

    if (signedUrlError || !data?.signedUrl) {
      setError(signedUrlError?.message ?? "Không thể mở file.");
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteAttachment(attachment: Attachment) {
    const confirmed = window.confirm(`Xóa chứng từ "${attachment.file_name}"?`);
    if (!confirmed) return;

    setDeletingId(attachment.id);
    setError(null);

    const { error: storageError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .remove([attachment.file_path]);

    if (storageError) {
      setError(formatDbError(storageError));
      setDeletingId(null);
      return;
    }

    const { error: deleteError } = await supabase
      .from("attachments")
      .delete()
      .eq("id", attachment.id);

    if (deleteError) {
      setError(formatDbError(deleteError));
    } else {
      await refresh(page);
    }

    setDeletingId(null);
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Chứng từ</h1>
          <p>Tải lên, mở và quản lý file chứng từ trong Supabase Storage.</p>
        </div>
        <div className="header-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              reset(emptyValues);
              setSelectedFile(null);
              setFormOpen(true);
            }}
          >
            <Plus size={18} aria-hidden="true" />
            Tải chứng từ
          </button>
        </div>
      </header>

      <div className="crud-grid modal-crud-grid">
        {formOpen ? (
          <ModalShell onClose={clearForm}>
            <form className="form-card" onSubmit={handleSubmit(onSubmit)}>
          <div className="card-title-row">
            <h2>Tải chứng từ</h2>
          </div>

          <label className="field">
            <span>Loại hồ sơ</span>
            <select {...register("parent_type")}>
              {parentTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Hồ sơ liên kết</span>
            <select {...register("parent_id")}>
              <option value="">Chọn hồ sơ</option>
              {activeParentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.parent_id ? <small>{errors.parent_id.message}</small> : null}
          </label>

          <label className="field">
            <span>Loại chứng từ</span>
            <select {...register("type")}>
              {attachmentTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>File</span>
            <input
              type="file"
              accept="image/*,.pdf,.xls,.xlsx,.doc,.docx"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
          </label>

          {selectedFile ? (
            <div className="calculation-box">
              <span>{selectedFile.name}</span>
              <span>{formatFileSize(selectedFile.size)}</span>
            </div>
          ) : null}

          <button className="primary-button" type="submit" disabled={saving}>
            <Plus size={18} aria-hidden="true" />
            {saving ? "Đang tải lên..." : "Tải lên"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setSelectedFile(null);
              reset(emptyValues);
              setFormOpen(false);
            }}
          >
            Đóng
          </button>
            </form>
          </ModalShell>
        ) : null}

        <div className="table-card">
          <div className="table-toolbar">
            <label className="search-field">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo tên file"
              />
            </label>
          </div>

          {error ?? listError ? <div className="alert error-alert">{error ?? listError}</div> : null}

          {loading || referenceLoading ? (
            <div className="state-box">Đang tải chứng từ...</div>
          ) : attachments.length === 0 ? (
            <div className="state-box">Chưa có chứng từ.</div>
          ) : (
            <>
            <div className="table-wrap">
              <table className="data-table extra-wide-table">
                <thead>
                  <tr>
                    <th>Tên file</th>
                    <th>Loại</th>
                    <th>Hồ sơ</th>
                    <th>Kích thước</th>
                    <th>Ngày tải</th>
                    <th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {attachments.map((attachment) => {
                    const parent = getAttachmentParent(attachment);

                    return (
                      <tr key={attachment.id}>
                        <td>{attachment.file_name}</td>
                        <td>{formatAttachmentType(attachment.type)}</td>
                        <td>
                          <div>{parent.label}</div>
                          <span className="muted-text">
                            {parentLabelMap.get(`${parent.type}:${parent.id}`) ?? parent.id}
                          </span>
                        </td>
                        <td>{formatFileSize(attachment.file_size ?? 0)}</td>
                        <td>{formatDateTime(attachment.uploaded_at)}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="icon-button"
                              type="button"
                              onClick={() => void openAttachment(attachment)}
                              aria-label="Mở file"
                            >
                              <Download size={17} aria-hidden="true" />
                            </button>
                            <button
                              className="icon-button danger"
                              type="button"
                              onClick={() => void deleteAttachment(attachment)}
                              disabled={deletingId === attachment.id}
                              aria-label="Xóa"
                            >
                              <Trash2 size={17} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
    </section>
  );
}

function getAttachmentParent(attachment: Attachment) {
  for (const option of parentTypeOptions) {
    const column = parentColumnByType[option.value];
    const id = attachment[column] as string | null;
    if (id) {
      return {
        id,
        type: option.value,
        label: option.label,
      };
    }
  }

  return {
    id: "-",
    type: "farmer" as ParentType,
    label: "-",
  };
}

function setAttachmentParentId(
  metadata: TablesInsert<"attachments">,
  parentType: ParentType,
  parentId: string,
) {
  if (parentType === "farmer") metadata.farmer_id = parentId;
  if (parentType === "authorization_letter") metadata.authorization_letter_id = parentId;
  if (parentType === "purchase_slip") metadata.purchase_slip_id = parentId;
  if (parentType === "transport_trip") metadata.transport_trip_id = parentId;
  if (parentType === "processing_record") metadata.processing_record_id = parentId;
  if (parentType === "payment") metadata.payment_id = parentId;
  if (parentType === "debt") metadata.debt_id = parentId;
}

function formatAttachmentType(value: AttachmentType) {
  return attachmentTypeOptions.find((option) => option.value === value)?.label ?? value;
}

function formatDebtType(value: Debt["debt_type"]) {
  const labels: Record<Debt["debt_type"], string> = {
    broker_commission: "Hoa hồng cò",
    transport: "Vận chuyển",
    processing: "Nhà máy",
  };
  return labels[value];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(
    new Date(`${value}T00:00:00`),
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
