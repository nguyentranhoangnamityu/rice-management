import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Edit2, FileDown, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";
import { ModalShell } from "../../components/ui/ModalShell";
import { exportExcel, exportPdf } from "../../lib/export";
import { supabase } from "../../lib/supabase";
import type { Enums, Tables } from "../../types/database";

type PurchaseBatch = Tables<"purchase_batches">;
type PurchaseItem = Tables<"purchase_items">;
type Farmer = Tables<"farmers">;
type Broker = Tables<"brokers">;
type RiceType = Tables<"rice_types">;
type AuthorizationLetter = Tables<"authorization_letters">;
type TransportTrip = Tables<"transport_trips">;
type PaymentStatus = Enums<"payment_status">;

type PurchaseItemRow = PurchaseItem & {
  farmer?: Farmer | null;
  broker?: Broker | null;
  riceType?: RiceType | null;
};

const paymentStatusOptions: { value: PaymentStatus; label: string }[] = [
  { value: "unpaid", label: "Chưa trả" },
  { value: "partial", label: "Trả một phần" },
  { value: "paid", label: "Đã trả" },
];

const itemSchema = z.object({
  farmer_id: z.string().min(1, "Vui lòng chọn nông dân"),
  broker_id: z.string().min(1, "Vui lòng chọn cò lúa"),
  authorization_letter_id: z.string().optional(),
  transport_trip_id: z.string().optional(),
  rice_type_id: z.string().min(1, "Vui lòng chọn loại lúa"),
  weight_kg: z.number().min(0, "Khối lượng không được âm"),
  unit_price: z.number().min(0, "Đơn giá không được âm"),
  broker_commission_per_kg: z.number().min(0, "Hoa hồng không được âm"),
  farmer_payment_status: z.enum(["unpaid", "partial", "paid"]),
  note: z.string().trim().optional(),
});

type ItemFormValues = z.infer<typeof itemSchema>;

const emptyValues: ItemFormValues = {
  farmer_id: "",
  broker_id: "",
  authorization_letter_id: "",
  transport_trip_id: "",
  rice_type_id: "",
  weight_kg: 0,
  unit_price: 0,
  broker_commission_per_kg: 0,
  farmer_payment_status: "unpaid",
  note: "",
};

export function PurchaseBatchDetailPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const [batch, setBatch] = useState<PurchaseBatch | null>(null);
  const [items, setItems] = useState<PurchaseItemRow[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [riceTypes, setRiceTypes] = useState<RiceType[]>([]);
  const [authorizationLetters, setAuthorizationLetters] = useState<AuthorizationLetter[]>([]);
  const [transportTrips, setTransportTrips] = useState<TransportTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<PurchaseItemRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: emptyValues,
  });

  const watchedWeight = watch("weight_kg");
  const watchedUnitPrice = watch("unit_price");
  const watchedCommission = watch("broker_commission_per_kg");
  const watchedBrokerId = watch("broker_id");

  const calculatedTotalAmount = watchedWeight * watchedUnitPrice;
  const calculatedCommissionTotal = watchedWeight * watchedCommission;

  const totals = useMemo(
    () =>
      items.reduce(
        (summary, item) => ({
          weight: summary.weight + item.weight_kg,
          amount: summary.amount + item.total_amount,
          commission: summary.commission + item.broker_commission_total,
        }),
        { weight: 0, amount: 0, commission: 0 },
      ),
    [items],
  );

  const formTitle = editingItem ? "Sửa phiếu mua" : "Thêm phiếu mua";

  async function loadData() {
    if (!batchId) return;

    setLoading(true);
    setError(null);

    const [
      batchResult,
      itemsResult,
      farmersResult,
      brokersResult,
      riceTypesResult,
      lettersResult,
      tripsResult,
    ] = await Promise.all([
      supabase.from("purchase_batches").select("*").eq("id", batchId).single(),
      supabase
        .from("purchase_items")
        .select("*")
        .eq("purchase_batch_id", batchId)
        .order("created_at", { ascending: false }),
      supabase.from("farmers").select("*").order("name", { ascending: true }),
      supabase.from("brokers").select("*").order("name", { ascending: true }),
      supabase.from("rice_types").select("*").order("name", { ascending: true }),
      supabase.from("authorization_letters").select("*").order("created_at", { ascending: false }),
      supabase.from("transport_trips").select("*").order("trip_date", { ascending: false }),
    ]);

    const firstError =
      batchResult.error ??
      itemsResult.error ??
      farmersResult.error ??
      brokersResult.error ??
      riceTypesResult.error ??
      lettersResult.error ??
      tripsResult.error;

    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const farmerRows = farmersResult.data ?? [];
    const brokerRows = brokersResult.data ?? [];
    const riceTypeRows = riceTypesResult.data ?? [];
    const farmerMap = new Map(farmerRows.map((farmer) => [farmer.id, farmer]));
    const brokerMap = new Map(brokerRows.map((broker) => [broker.id, broker]));
    const riceTypeMap = new Map(riceTypeRows.map((riceType) => [riceType.id, riceType]));

    setBatch(batchResult.data);
    setFarmers(farmerRows);
    setBrokers(brokerRows);
    setRiceTypes(riceTypeRows);
    setAuthorizationLetters(lettersResult.data ?? []);
    setTransportTrips(tripsResult.data ?? []);
    setItems(
      (itemsResult.data ?? []).map((item) => ({
        ...item,
        farmer: farmerMap.get(item.farmer_id) ?? null,
        broker: brokerMap.get(item.broker_id) ?? null,
        riceType: riceTypeMap.get(item.rice_type_id) ?? null,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, [batchId]);

  useEffect(() => {
    if (!watchedBrokerId || editingItem) return;

    const broker = brokers.find((item) => item.id === watchedBrokerId);
    if (broker?.default_commission_per_kg !== null && broker?.default_commission_per_kg !== undefined) {
      setValue("broker_commission_per_kg", broker.default_commission_per_kg);
    }
  }, [brokers, editingItem, setValue, watchedBrokerId]);

  function startEdit(item: PurchaseItemRow) {
    setEditingItem(item);
    reset({
      farmer_id: item.farmer_id,
      broker_id: item.broker_id,
      authorization_letter_id: item.authorization_letter_id ?? "",
      transport_trip_id: item.transport_trip_id ?? "",
      rice_type_id: item.rice_type_id,
      weight_kg: item.weight_kg,
      unit_price: item.unit_price,
      broker_commission_per_kg: item.broker_commission_per_kg,
      farmer_payment_status: item.farmer_payment_status,
      note: item.note ?? "",
    });
    setFormOpen(true);
  }

  function clearForm() {
    setEditingItem(null);
    reset(emptyValues);
    setFormOpen(false);
  }

  async function onSubmit(values: ItemFormValues) {
    if (!batchId) return;

    setSaving(true);
    setError(null);

    const payload = {
      purchase_batch_id: batchId,
      farmer_id: values.farmer_id,
      broker_id: values.broker_id,
      authorization_letter_id: values.authorization_letter_id || null,
      transport_trip_id: values.transport_trip_id || null,
      rice_type_id: values.rice_type_id,
      weight_kg: values.weight_kg,
      unit_price: values.unit_price,
      total_amount: values.weight_kg * values.unit_price,
      broker_commission_per_kg: values.broker_commission_per_kg,
      broker_commission_total: values.weight_kg * values.broker_commission_per_kg,
      farmer_payment_status: values.farmer_payment_status,
      note: toNullable(values.note),
    };

    const result = editingItem
      ? await supabase.from("purchase_items").update(payload).eq("id", editingItem.id)
      : await supabase.from("purchase_items").insert(payload);

    if (result.error) {
      setError(result.error.message);
    } else {
      clearForm();
      await loadData();
    }

    setSaving(false);
  }

  async function deleteItem(item: PurchaseItemRow) {
    const confirmed = window.confirm(`Xóa phiếu mua của "${item.farmer?.name ?? "nông dân"}"?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    const { error: deleteError } = await supabase
      .from("purchase_items")
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

  function exportBatchPdf() {
    exportPdf({
      title: `Purchase batch ${batch?.code ?? ""}`,
      details: batch ? [`Date range: ${formatDateRange(batch.from_date, batch.to_date)}`] : [],
      fileName: `purchase-batch-${batch?.code ?? "export"}.pdf`,
      tables: [buildBatchExportTable(items, totals)],
    });
  }

  function exportBatchExcel() {
    exportExcel({
      fileName: `purchase-batch-${batch?.code ?? "export"}.xlsx`,
      sheets: [buildBatchExportTable(items, totals)],
    });
  }

  if (loading) {
    return (
      <section className="page">
        <div className="state-box">Đang tải chi tiết đợt mua...</div>
      </section>
    );
  }

  if (!batch) {
    return (
      <section className="page">
        <div className="state-box">Không tìm thấy đợt mua.</div>
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <Link className="back-link" to="/purchase-batches">
            <ArrowLeft size={17} aria-hidden="true" />
            Quay lại đợt mua
          </Link>
          <h1>{batch.code}</h1>
          <p>{formatDateRange(batch.from_date, batch.to_date)}</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" type="button" onClick={exportBatchPdf}>
            <FileDown size={17} aria-hidden="true" />
            PDF
          </button>
          <button className="secondary-button" type="button" onClick={exportBatchExcel}>
            <FileDown size={17} aria-hidden="true" />
            Excel
          </button>
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
            Thêm phiếu mua
          </button>
        </div>
      </header>

      <div className="metric-grid">
        <div className="metric-card">
          <span>Tổng khối lượng</span>
          <strong>{formatNumber(totals.weight)} kg</strong>
        </div>
        <div className="metric-card">
          <span>Tổng tiền mua</span>
          <strong>{formatMoney(totals.amount)}</strong>
        </div>
        <div className="metric-card">
          <span>Tổng hoa hồng</span>
          <strong>{formatMoney(totals.commission)}</strong>
        </div>
      </div>

      <div className="crud-grid modal-crud-grid">
        {formOpen ? (
          <ModalShell wide onClose={clearForm}>
            <form className="form-card" onSubmit={handleSubmit(onSubmit)}>
          <div className="card-title-row">
            <h2>{formTitle}</h2>
            {editingItem ? (
              <button className="icon-button" type="button" onClick={clearForm} aria-label="Hủy sửa">
                <X size={18} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <label className="field">
            <span>Nông dân</span>
            <select {...register("farmer_id")}>
              <option value="">Chọn nông dân</option>
              {farmers.map((farmer) => (
                <option key={farmer.id} value={farmer.id}>
                  {farmer.name}
                </option>
              ))}
            </select>
            {errors.farmer_id ? <small>{errors.farmer_id.message}</small> : null}
          </label>

          <label className="field">
            <span>Cò lúa</span>
            <select {...register("broker_id")}>
              <option value="">Chọn cò lúa</option>
              {brokers.map((broker) => (
                <option key={broker.id} value={broker.id}>
                  {broker.name}
                </option>
              ))}
            </select>
            {errors.broker_id ? <small>{errors.broker_id.message}</small> : null}
          </label>

          <label className="field">
            <span>Loại lúa</span>
            <select {...register("rice_type_id")}>
              <option value="">Chọn loại lúa</option>
              {riceTypes.map((riceType) => (
                <option key={riceType.id} value={riceType.id}>
                  {riceType.name}
                </option>
              ))}
            </select>
            {errors.rice_type_id ? <small>{errors.rice_type_id.message}</small> : null}
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Khối lượng kg</span>
              <input type="number" min="0" step="0.01" {...register("weight_kg", { valueAsNumber: true })} />
              {errors.weight_kg ? <small>{errors.weight_kg.message}</small> : null}
            </label>
            <label className="field">
              <span>Đơn giá</span>
              <input type="number" min="0" step="1" {...register("unit_price", { valueAsNumber: true })} />
              {errors.unit_price ? <small>{errors.unit_price.message}</small> : null}
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Hoa hồng / kg</span>
              <input
                type="number"
                min="0"
                step="1"
                {...register("broker_commission_per_kg", { valueAsNumber: true })}
              />
              {errors.broker_commission_per_kg ? (
                <small>{errors.broker_commission_per_kg.message}</small>
              ) : null}
            </label>
            <label className="field">
              <span>Trạng thái trả tiền</span>
              <select {...register("farmer_payment_status")}>
                {paymentStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="calculation-box">
            <span>Thành tiền: {formatMoney(calculatedTotalAmount)}</span>
            <span>Hoa hồng: {formatMoney(calculatedCommissionTotal)}</span>
          </div>

          <label className="field">
            <span>Giấy ủy quyền</span>
            <select {...register("authorization_letter_id")}>
              <option value="">Không chọn</option>
              {authorizationLetters.map((letter) => (
                <option key={letter.id} value={letter.id}>
                  {formatAuthorizationLetter(letter)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Chuyến ghe</span>
            <select {...register("transport_trip_id")}>
              <option value="">Chưa gán chuyến</option>
              {transportTrips.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.code} - {formatDate(trip.trip_date)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Ghi chú</span>
            <textarea {...register("note")} rows={3} placeholder="Thông tin thêm nếu cần" />
          </label>

          <button className="primary-button" type="submit" disabled={saving}>
            <Plus size={18} aria-hidden="true" />
            {saving ? "Đang lưu..." : editingItem ? "Lưu thay đổi" : "Thêm phiếu mua"}
          </button>
            </form>
          </ModalShell>
        ) : null}

        <div className="table-card">
          {error ? <div className="alert error-alert">{error}</div> : null}

          {items.length === 0 ? (
            <div className="state-box">Đợt mua này chưa có phiếu mua.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table extra-wide-table">
                <thead>
                  <tr>
                    <th>Nông dân</th>
                    <th>Cò lúa</th>
                    <th>Loại lúa</th>
                    <th>Kg</th>
                    <th>Đơn giá</th>
                    <th>Thành tiền</th>
                    <th>Hoa hồng</th>
                    <th>Trạng thái</th>
                    <th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.farmer?.name || "-"}</td>
                      <td>{item.broker?.name || "-"}</td>
                      <td>{item.riceType?.name || "-"}</td>
                      <td>{formatNumber(item.weight_kg)}</td>
                      <td>{formatMoney(item.unit_price)}</td>
                      <td>{formatMoney(item.total_amount)}</td>
                      <td>
                        <div>{formatMoney(item.broker_commission_total)}</div>
                        <span className="muted-text">{formatMoney(item.broker_commission_per_kg)} / kg</span>
                      </td>
                      <td>{formatPaymentStatus(item.farmer_payment_status)}</td>
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

function formatAuthorizationLetter(letter: AuthorizationLetter) {
  const signedDate = letter.signed_date ? formatDate(letter.signed_date) : "chưa có ngày ký";
  return `Giấy ủy quyền ${signedDate}`;
}

function buildBatchExportTable(
  items: PurchaseItemRow[],
  totals: { weight: number; amount: number; commission: number },
) {
  return {
    title: "Purchase items",
    headers: [
      "Farmer",
      "Broker",
      "Rice type",
      "Weight",
      "Unit price",
      "Total amount",
      "Broker commission",
    ],
    rows: [
      ...items.map((item) => [
        item.farmer?.name ?? "-",
        item.broker?.name ?? "-",
        item.riceType?.name ?? "-",
        item.weight_kg,
        item.unit_price,
        item.total_amount,
        item.broker_commission_total,
      ]),
      ["TOTAL", "", "", totals.weight, "", totals.amount, totals.commission],
    ],
  };
}

function formatPaymentStatus(value: PaymentStatus) {
  return paymentStatusOptions.find((option) => option.value === value)?.label ?? value;
}

function toNullable(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function formatDateRange(fromDate: string, toDate: string) {
  return `${formatDate(fromDate)} - ${formatDate(toDate)}`;
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
