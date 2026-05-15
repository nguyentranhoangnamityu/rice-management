import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, FileDown, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ModalShell } from "../../components/ui/ModalShell";
import { exportPdf } from "../../lib/export";
import { supabase } from "../../lib/supabase";
import type { Enums, Tables } from "../../types/database";

type AuthorizationLetter = Tables<"authorization_letters">;
type AuthorizationLetterPurchaseSlip = Tables<"authorization_letter_purchase_slips">;
type AuthorizationLetterStatus = Enums<"authorization_letter_status">;
type Broker = Tables<"brokers">;
type Farmer = Tables<"farmers">;
type PurchaseSlip = Tables<"purchase_slips">;
type RiceType = Tables<"rice_types">;

type SlipRow = PurchaseSlip & {
  farmer?: Farmer | null;
  broker?: Broker | null;
  riceType?: RiceType | null;
};

type LetterRow = AuthorizationLetter & {
  receiverBroker?: Broker | null;
  slips: SlipRow[];
};

const statusOptions: { value: AuthorizationLetterStatus; label: string }[] = [
  { value: "draft", label: "Nháp" },
  { value: "active", label: "Đang hiệu lực" },
  { value: "expired", label: "Hết hạn" },
  { value: "cancelled", label: "Đã hủy" },
];

const formSchema = z
  .object({
    code: z.string().trim().min(1, "Vui lòng nhập mã giấy ủy quyền"),
    authorized_receiver_broker_id: z.string().min(1, "Vui lòng chọn cò nhận ủy quyền"),
    valid_from: z.string().optional(),
    valid_to: z.string().optional(),
    status: z.enum(["draft", "active", "expired", "cancelled"]),
    note: z.string().trim().optional(),
    purchase_slip_ids: z.array(z.string()).min(1, "Vui lòng chọn ít nhất một phiếu mua"),
  })
  .refine((value) => !value.valid_from || !value.valid_to || value.valid_to >= value.valid_from, {
    message: "Ngày hết hạn phải sau hoặc bằng ngày bắt đầu",
    path: ["valid_to"],
  });

type FormValues = z.infer<typeof formSchema>;

const emptyValues: FormValues = {
  code: "",
  authorized_receiver_broker_id: "",
  valid_from: "",
  valid_to: "",
  status: "draft",
  note: "",
  purchase_slip_ids: [],
};

export function AuthorizationLettersPage() {
  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [purchaseSlips, setPurchaseSlips] = useState<SlipRow[]>([]);
  const [links, setLinks] = useState<AuthorizationLetterPurchaseSlip[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<LetterRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyValues,
  });

  const selectedBrokerId = watch("authorized_receiver_broker_id");
  const selectedSlipIds = watch("purchase_slip_ids");
  const selectedSlips = useMemo(
    () => purchaseSlips.filter((slip) => selectedSlipIds.includes(slip.id)),
    [purchaseSlips, selectedSlipIds],
  );
  const selectedTotals = calculateTotals(selectedSlips);

  const slipLinkMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const link of links) {
      map.set(link.purchase_slip_id, link.authorization_letter_id);
    }
    return map;
  }, [links]);

  const availableSlips = useMemo(() => {
    if (!selectedBrokerId) return [];

    return purchaseSlips.filter((slip) => {
      const linkedLetterId = slipLinkMap.get(slip.id);
      return (
        slip.authorized_receiver_broker_id === selectedBrokerId &&
        (!linkedLetterId || linkedLetterId === editingItem?.id)
      );
    });
  }, [editingItem?.id, purchaseSlips, selectedBrokerId, slipLinkMap]);

  const filteredLetters = useMemo(() => {
    const keyword = normalize(search);
    if (!keyword) return letters;

    return letters.filter((letter) =>
      [letter.code, letter.receiverBroker?.name, letter.note].some((value) =>
        normalize(value).includes(keyword),
      ),
    );
  }, [letters, search]);

  async function loadData() {
    setLoading(true);
    setError(null);

    const [lettersResult, linksResult, brokersResult, slipsResult, farmersResult, riceTypesResult] =
      await Promise.all([
        supabase.from("authorization_letters").select("*").order("created_at", { ascending: false }),
        supabase.from("authorization_letter_purchase_slips").select("*"),
        supabase.from("brokers").select("*").order("name", { ascending: true }),
        supabase.from("purchase_slips").select("*").order("purchase_date", { ascending: false }),
        supabase.from("farmers").select("*").order("name", { ascending: true }),
        supabase.from("rice_types").select("*").order("name", { ascending: true }),
      ]);

    const firstError =
      lettersResult.error ??
      linksResult.error ??
      brokersResult.error ??
      slipsResult.error ??
      farmersResult.error ??
      riceTypesResult.error;

    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const brokerRows = brokersResult.data ?? [];
    const farmerRows = farmersResult.data ?? [];
    const riceTypeRows = riceTypesResult.data ?? [];
    const linkRows = linksResult.data ?? [];
    const brokerMap = new Map(brokerRows.map((broker) => [broker.id, broker]));
    const farmerMap = new Map(farmerRows.map((farmer) => [farmer.id, farmer]));
    const riceTypeMap = new Map(riceTypeRows.map((riceType) => [riceType.id, riceType]));
    const slipRows: SlipRow[] = (slipsResult.data ?? []).map((slip) => ({
      ...slip,
      farmer: farmerMap.get(slip.farmer_id) ?? null,
      broker: brokerMap.get(slip.broker_id) ?? null,
      riceType: riceTypeMap.get(slip.rice_type_id) ?? null,
    }));
    const slipMap = new Map(slipRows.map((slip) => [slip.id, slip]));

    setBrokers(brokerRows);
    setPurchaseSlips(slipRows);
    setLinks(linkRows);
    setLetters(
      (lettersResult.data ?? []).map((letter) => ({
        ...letter,
        receiverBroker: letter.authorized_receiver_broker_id
          ? brokerMap.get(letter.authorized_receiver_broker_id) ?? null
          : null,
        slips: linkRows
          .filter((link) => link.authorization_letter_id === letter.id)
          .reduce<SlipRow[]>((currentSlips, link) => {
            const slip = slipMap.get(link.purchase_slip_id);
            if (slip) currentSlips.push(slip);
            return currentSlips;
          }, []),
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  function startEdit(item: LetterRow) {
    setEditingItem(item);
    reset({
      code: item.code ?? "",
      authorized_receiver_broker_id: item.authorized_receiver_broker_id ?? "",
      valid_from: item.valid_from ?? "",
      valid_to: item.valid_to ?? "",
      status: item.status,
      note: item.note ?? "",
      purchase_slip_ids: item.slips.map((slip) => slip.id),
    });
    setFormOpen(true);
  }

  function clearForm() {
    setEditingItem(null);
    reset(emptyValues);
    setFormOpen(false);
  }

  function toggleSlip(slipId: string, checked: boolean) {
    const nextIds = checked
      ? Array.from(new Set([...selectedSlipIds, slipId]))
      : selectedSlipIds.filter((id) => id !== slipId);

    setValue("purchase_slip_ids", nextIds, { shouldDirty: true, shouldValidate: true });
  }

  async function onSubmit(values: FormValues) {
    setSaving(true);
    setError(null);

    const hasValidSlip = values.purchase_slip_ids.some((slipId) =>
      purchaseSlips.some((slip) => slip.id === slipId),
    );
    if (!hasValidSlip) {
      setError("Vui lòng chọn ít nhất một phiếu mua hợp lệ.");
      setSaving(false);
      return;
    }

    const payload = {
      code: values.code,
      farmer_id: null,
      broker_id: null,
      authorized_receiver_broker_id: values.authorized_receiver_broker_id,
      valid_from: values.valid_from || null,
      valid_to: values.valid_to || null,
      status: values.status,
      note: toNullable(values.note),
    };

    const result = editingItem
      ? await supabase
          .from("authorization_letters")
          .update(payload)
          .eq("id", editingItem.id)
          .select("id")
          .single()
      : await supabase.from("authorization_letters").insert(payload).select("id").single();

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    const letterId = result.data.id;
    const deleteLinksResult = await supabase
      .from("authorization_letter_purchase_slips")
      .delete()
      .eq("authorization_letter_id", letterId);

    if (deleteLinksResult.error) {
      setError(deleteLinksResult.error.message);
      setSaving(false);
      return;
    }

    const linkRows = values.purchase_slip_ids.map((slipId) => ({
      authorization_letter_id: letterId,
      purchase_slip_id: slipId,
    }));
    const insertLinksResult = await supabase
      .from("authorization_letter_purchase_slips")
      .insert(linkRows);

    if (insertLinksResult.error) {
      setError(insertLinksResult.error.message);
    } else {
      clearForm();
      await loadData();
    }

    setSaving(false);
  }

  async function deleteItem(item: LetterRow) {
    const confirmed = window.confirm(`Xóa giấy ủy quyền "${item.code ?? item.id}"?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    const { error: deleteError } = await supabase
      .from("authorization_letters")
      .delete()
      .eq("id", item.id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      if (editingItem?.id === item.id) clearForm();
      await loadData();
    }

    setDeletingId(null);
  }

  function exportLetterPdf(item: LetterRow) {
    const totals = calculateTotals(item.slips);

    exportPdf({
      title: `Giay uy quyen ${item.code ?? ""}`.trim(),
      fileName: `authorization-letter-${item.code ?? item.id.slice(0, 8)}.pdf`,
      details: [
        `Nguoi nhan uy quyen: ${item.receiverBroker?.name ?? "-"}`,
        `Hieu luc: ${formatDateRange(item.valid_from, item.valid_to)}`,
        `Tong nong dan: ${totals.totalFarmers}`,
        `Tong khoi luong: ${formatNumber(totals.totalWeight)} kg`,
        `Tong thanh tien: ${formatMoney(totals.totalAmount)}`,
        `Ghi chu: ${item.note ?? "-"}`,
      ],
      tables: [
        {
          title: "Purchase slips",
          headers: ["Farmer", "Date", "Rice type", "Weight kg", "Total amount"],
          rows: item.slips.map((slip) => [
            slip.farmer?.name ?? "-",
            formatDate(slip.purchase_date),
            slip.riceType?.name ?? "-",
            slip.weight_kg,
            slip.total_amount,
          ]),
        },
        {
          title: "Signatures",
          headers: ["Nguoi uy quyen", "Nguoi nhan uy quyen", "Nguoi lap phieu"],
          rows: [["Ky va ghi ro ho ten", "Ky va ghi ro ho ten", "Ky va ghi ro ho ten"]],
        },
      ],
    });
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Giấy ủy quyền</h1>
          <p>Tạo giấy ủy quyền gom nhiều phiếu mua cho cùng một cò nhận ủy quyền.</p>
        </div>
        <div className="header-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setEditingItem(null);
              reset(emptyValues);
              setFormOpen(true);
            }}
          >
            <Plus size={18} aria-hidden="true" />
            Thêm giấy ủy quyền
          </button>
        </div>
      </header>

      <div className="crud-grid modal-crud-grid">
        {formOpen ? (
          <ModalShell wide onClose={clearForm}>
            <form className="form-card" onSubmit={handleSubmit(onSubmit)}>
          <div className="card-title-row">
            <h2>{editingItem ? "Sửa giấy ủy quyền" : "Thêm giấy ủy quyền"}</h2>
            {editingItem ? (
              <button className="icon-button" type="button" onClick={clearForm} aria-label="Hủy sửa">
                <X size={18} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <label className="field">
            <span>Mã giấy ủy quyền</span>
            <input {...register("code")} placeholder="VD: UQ-2026-001" />
            {errors.code ? <small>{errors.code.message}</small> : null}
          </label>

          <label className="field">
            <span>Cò nhận ủy quyền</span>
            <select
              {...register("authorized_receiver_broker_id", {
                onChange: () =>
                  setValue("purchase_slip_ids", [], { shouldDirty: true, shouldValidate: true }),
              })}
            >
              <option value="">Chọn cò nhận ủy quyền</option>
              {brokers.map((broker) => (
                <option key={broker.id} value={broker.id}>
                  {broker.name}
                </option>
              ))}
            </select>
            {errors.authorized_receiver_broker_id ? (
              <small>{errors.authorized_receiver_broker_id.message}</small>
            ) : null}
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Hiệu lực từ</span>
              <input type="date" {...register("valid_from")} />
            </label>
            <label className="field">
              <span>Hiệu lực đến</span>
              <input type="date" {...register("valid_to")} />
              {errors.valid_to ? <small>{errors.valid_to.message}</small> : null}
            </label>
          </div>

          <label className="field">
            <span>Trạng thái</span>
            <select {...register("status")}>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="stops-editor">
            <h3>Phiếu mua</h3>
            {errors.purchase_slip_ids ? <div className="form-error">{errors.purchase_slip_ids.message}</div> : null}
            {!selectedBrokerId ? (
              <div className="state-box">Chọn cò nhận ủy quyền để xem phiếu mua phù hợp.</div>
            ) : availableSlips.length === 0 ? (
              <div className="state-box">Không có phiếu mua phù hợp hoặc chưa liên kết giấy khác.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table wide-table">
                  <thead>
                    <tr>
                      <th>Chọn</th>
                      <th>Nông dân</th>
                      <th>Ngày mua</th>
                      <th>Loại lúa</th>
                      <th>Kg</th>
                      <th>Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableSlips.map((slip) => {
                      const checked = selectedSlipIds.includes(slip.id);

                      return (
                        <tr key={slip.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => toggleSlip(slip.id, event.target.checked)}
                              aria-label={checked ? "Bỏ chọn phiếu mua" : "Chọn phiếu mua"}
                            />
                          </td>
                          <td>{slip.farmer?.name || "-"}</td>
                          <td>{formatDate(slip.purchase_date)}</td>
                          <td>{slip.riceType?.name || "-"}</td>
                          <td>{formatNumber(slip.weight_kg)}</td>
                          <td>{formatMoney(slip.total_amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="metric-grid compact-metrics">
            <div className="metric-card">
              <span>Tổng nông dân</span>
              <strong>{selectedTotals.totalFarmers}</strong>
            </div>
            <div className="metric-card">
              <span>Tổng kg</span>
              <strong>{formatNumber(selectedTotals.totalWeight)}</strong>
            </div>
            <div className="metric-card">
              <span>Tổng tiền</span>
              <strong>{formatMoney(selectedTotals.totalAmount)}</strong>
            </div>
          </div>

          <label className="field">
            <span>Ghi chú</span>
            <textarea {...register("note")} rows={3} placeholder="Thông tin thêm nếu cần" />
          </label>

          <button className="primary-button" type="submit" disabled={saving}>
            <Plus size={18} aria-hidden="true" />
            {saving ? "Đang lưu..." : editingItem ? "Lưu thay đổi" : "Thêm giấy ủy quyền"}
          </button>
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
                placeholder="Tìm theo mã, cò nhận, ghi chú"
              />
            </label>
          </div>

          {error ? <div className="alert error-alert">{error}</div> : null}

          {loading ? (
            <div className="state-box">Đang tải giấy ủy quyền...</div>
          ) : filteredLetters.length === 0 ? (
            <div className="state-box">Không có giấy ủy quyền phù hợp.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table extra-wide-table">
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Cò nhận</th>
                    <th>Hiệu lực</th>
                    <th>Trạng thái</th>
                    <th>Số phiếu</th>
                    <th>Tổng kg</th>
                    <th>Tổng tiền</th>
                    <th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {filteredLetters.map((item) => {
                    const totals = calculateTotals(item.slips);

                    return (
                      <tr key={item.id}>
                        <td>{item.code || "-"}</td>
                        <td>{item.receiverBroker?.name || "-"}</td>
                        <td>{formatDateRange(item.valid_from, item.valid_to)}</td>
                        <td>{formatStatus(item.status)}</td>
                        <td>{item.slips.length}</td>
                        <td>{formatNumber(totals.totalWeight)}</td>
                        <td>{formatMoney(totals.totalAmount)}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="icon-button"
                              type="button"
                              onClick={() => exportLetterPdf(item)}
                              aria-label="Xuất PDF"
                            >
                              <FileDown size={17} aria-hidden="true" />
                            </button>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function calculateTotals(slips: SlipRow[]) {
  return {
    totalFarmers: new Set(slips.map((slip) => slip.farmer_id)).size,
    totalWeight: slips.reduce((total, slip) => total + slip.weight_kg, 0),
    totalAmount: slips.reduce((total, slip) => total + slip.total_amount, 0),
  };
}

function formatStatus(value: AuthorizationLetterStatus) {
  return statusOptions.find((option) => option.value === value)?.label ?? value;
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toNullable(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function formatDateRange(fromDate: string | null, toDate: string | null) {
  if (!fromDate && !toDate) return "-";
  return `${fromDate ? formatDate(fromDate) : "-"} - ${toDate ? formatDate(toDate) : "-"}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(
    new Date(`${value}T00:00:00`),
  );
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
