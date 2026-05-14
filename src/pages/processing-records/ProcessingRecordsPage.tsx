import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, FileDown, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { exportExcel, exportPdf } from "../../lib/export";
import { supabase } from "../../lib/supabase";
import type { Enums, Tables } from "../../types/database";

type ProcessingRecord = Tables<"processing_records">;
type TransportTrip = Tables<"transport_trips">;
type Factory = Tables<"factories">;
type Season = Tables<"seasons">;
type RiceType = Tables<"rice_types">;
type ServiceType = Enums<"processing_service_type">;
type PaymentStatus = Enums<"payment_status">;

type ProcessingRecordRow = ProcessingRecord & {
  trip?: TransportTrip | null;
  factory?: Factory | null;
  season?: Season | null;
  riceType?: RiceType | null;
};

const serviceTypeOptions: { value: ServiceType; label: string }[] = [
  { value: "drying", label: "Sấy" },
  { value: "milling", label: "Xay xát" },
];

const paymentStatusOptions: { value: PaymentStatus; label: string }[] = [
  { value: "unpaid", label: "Chưa trả" },
  { value: "partial", label: "Trả một phần" },
  { value: "paid", label: "Đã trả" },
];

const recordSchema = z.object({
  transport_trip_id: z.string().min(1, "Vui lòng chọn chuyến ghe"),
  factory_id: z.string().min(1, "Vui lòng chọn nhà máy"),
  season_id: z.string().optional(),
  service_type: z.enum(["drying", "milling"]),
  rice_type_id: z.string().min(1, "Vui lòng chọn loại lúa"),
  input_weight_kg: z.number().min(0, "Khối lượng đầu vào không được âm"),
  output_weight_kg: z.number().min(0, "Khối lượng đầu ra không được âm"),
  unit_price: z.number().min(0, "Đơn giá không được âm"),
  payment_status: z.enum(["unpaid", "partial", "paid"]),
  processed_date: z.string().min(1, "Vui lòng chọn ngày xử lý"),
  note: z.string().trim().optional(),
});

type RecordFormValues = z.infer<typeof recordSchema>;

const emptyValues: RecordFormValues = {
  transport_trip_id: "",
  factory_id: "",
  season_id: "",
  service_type: "drying",
  rice_type_id: "",
  input_weight_kg: 0,
  output_weight_kg: 0,
  unit_price: 0,
  payment_status: "unpaid",
  processed_date: "",
  note: "",
};

export function ProcessingRecordsPage() {
  const [items, setItems] = useState<ProcessingRecordRow[]>([]);
  const [transportTrips, setTransportTrips] = useState<TransportTrip[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [riceTypes, setRiceTypes] = useState<RiceType[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ProcessingRecordRow | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RecordFormValues>({
    resolver: zodResolver(recordSchema),
    defaultValues: emptyValues,
  });

  const watchedTripId = watch("transport_trip_id");
  const watchedInputWeight = watch("input_weight_kg");
  const watchedOutputWeight = watch("output_weight_kg");
  const watchedUnitPrice = watch("unit_price");
  const calculated = calculateProcessing({
    inputWeight: watchedInputWeight,
    outputWeight: watchedOutputWeight,
    unitPrice: watchedUnitPrice,
  });

  const filteredItems = useMemo(() => {
    const keyword = normalize(search);
    if (!keyword) return items;

    return items.filter((item) =>
      [
        item.trip?.code,
        item.factory?.name,
        item.riceType?.name,
        formatServiceType(item.service_type),
      ].some((value) => normalize(value).includes(keyword)),
    );
  }, [items, search]);

  const formTitle = editingItem ? "Sửa phiếu xử lý" : "Thêm phiếu xử lý";

  async function loadData() {
    setLoading(true);
    setError(null);

    const [recordsResult, tripsResult, factoriesResult, seasonsResult, riceTypesResult] =
      await Promise.all([
        supabase.from("processing_records").select("*").order("processed_date", { ascending: false }),
        supabase.from("transport_trips").select("*").order("trip_date", { ascending: false }),
        supabase.from("factories").select("*").order("name", { ascending: true }),
        supabase.from("seasons").select("*").order("from_date", { ascending: false }),
        supabase.from("rice_types").select("*").order("name", { ascending: true }),
      ]);

    const firstError =
      recordsResult.error ??
      tripsResult.error ??
      factoriesResult.error ??
      seasonsResult.error ??
      riceTypesResult.error;

    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const tripRows = tripsResult.data ?? [];
    const factoryRows = factoriesResult.data ?? [];
    const seasonRows = seasonsResult.data ?? [];
    const riceTypeRows = riceTypesResult.data ?? [];
    const tripMap = new Map(tripRows.map((trip) => [trip.id, trip]));
    const factoryMap = new Map(factoryRows.map((factory) => [factory.id, factory]));
    const seasonMap = new Map(seasonRows.map((season) => [season.id, season]));
    const riceTypeMap = new Map(riceTypeRows.map((riceType) => [riceType.id, riceType]));

    setTransportTrips(tripRows);
    setFactories(factoryRows);
    setSeasons(seasonRows);
    setRiceTypes(riceTypeRows);
    setItems(
      (recordsResult.data ?? []).map((record) => ({
        ...record,
        trip: tripMap.get(record.transport_trip_id) ?? null,
        factory: factoryMap.get(record.factory_id) ?? null,
        season: record.season_id ? seasonMap.get(record.season_id) ?? null : null,
        riceType: riceTypeMap.get(record.rice_type_id) ?? null,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!watchedTripId || editingItem) return;

    const trip = transportTrips.find((item) => item.id === watchedTripId);
    if (!trip) return;

    if (trip.factory_id) setValue("factory_id", trip.factory_id);
    if (trip.season_id) setValue("season_id", trip.season_id);
    setValue("rice_type_id", trip.rice_type_id);
    setValue("input_weight_kg", trip.unloaded_weight_kg);
  }, [editingItem, setValue, transportTrips, watchedTripId]);

  function startEdit(item: ProcessingRecordRow) {
    setEditingItem(item);
    reset({
      transport_trip_id: item.transport_trip_id,
      factory_id: item.factory_id,
      season_id: item.season_id ?? "",
      service_type: item.service_type,
      rice_type_id: item.rice_type_id,
      input_weight_kg: item.input_weight_kg,
      output_weight_kg: item.output_weight_kg,
      unit_price: item.unit_price,
      payment_status: item.payment_status,
      processed_date: item.processed_date,
      note: item.note ?? "",
    });
  }

  function clearForm() {
    setEditingItem(null);
    reset(emptyValues);
  }

  async function onSubmit(values: RecordFormValues) {
    setSaving(true);
    setError(null);

    const nextCalculated = calculateProcessing({
      inputWeight: values.input_weight_kg,
      outputWeight: values.output_weight_kg,
      unitPrice: values.unit_price,
    });

    const payload = {
      transport_trip_id: values.transport_trip_id,
      factory_id: values.factory_id,
      season_id: values.season_id || null,
      service_type: values.service_type,
      rice_type_id: values.rice_type_id,
      input_weight_kg: values.input_weight_kg,
      output_weight_kg: values.output_weight_kg,
      loss_weight_kg: nextCalculated.lossWeight,
      loss_percent: nextCalculated.lossPercent,
      unit_price: values.unit_price,
      total_cost: nextCalculated.totalCost,
      payment_status: values.payment_status,
      processed_date: values.processed_date,
      note: toNullable(values.note),
    };

    const result = editingItem
      ? await supabase.from("processing_records").update(payload).eq("id", editingItem.id)
      : await supabase.from("processing_records").insert(payload);

    if (result.error) {
      setError(result.error.message);
    } else {
      clearForm();
      await loadData();
    }

    setSaving(false);
  }

  async function deleteItem(item: ProcessingRecordRow) {
    const confirmed = window.confirm(`Xóa phiếu xử lý chuyến "${item.trip?.code ?? ""}"?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    const { error: deleteError } = await supabase
      .from("processing_records")
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

  function exportRecordPdf(item: ProcessingRecordRow) {
    exportPdf({
      title: `Processing record ${item.trip?.code ?? ""}`,
      details: [
        `Date: ${formatDate(item.processed_date)}`,
        `Factory: ${item.factory?.name ?? "-"}`,
        `Service: ${formatServiceType(item.service_type)}`,
      ],
      fileName: `processing-record-${item.trip?.code ?? item.id}.pdf`,
      tables: [buildProcessingExportTable(item)],
    });
  }

  function exportRecordExcel(item: ProcessingRecordRow) {
    exportExcel({
      fileName: `processing-record-${item.trip?.code ?? item.id}.xlsx`,
      sheets: [buildProcessingExportTable(item)],
    });
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Sấy xay xát</h1>
          <p>Ghi nhận xử lý theo chuyến ghe, nhà máy, đầu vào, đầu ra và hao hụt.</p>
        </div>
      </header>

      <div className="crud-grid">
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
            <span>Chuyến ghe</span>
            <select {...register("transport_trip_id")}>
              <option value="">Chọn chuyến ghe</option>
              {transportTrips.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.code} - {formatDate(trip.trip_date)}
                </option>
              ))}
            </select>
            {errors.transport_trip_id ? <small>{errors.transport_trip_id.message}</small> : null}
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Nhà máy</span>
              <select {...register("factory_id")}>
                <option value="">Chọn nhà máy</option>
                {factories.map((factory) => (
                  <option key={factory.id} value={factory.id}>
                    {factory.name}
                  </option>
                ))}
              </select>
              {errors.factory_id ? <small>{errors.factory_id.message}</small> : null}
            </label>
            <label className="field">
              <span>Dịch vụ</span>
              <select {...register("service_type")}>
                {serviceTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Mùa vụ</span>
              <select {...register("season_id")}>
                <option value="">Không chọn</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
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
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Ngày xử lý</span>
              <input type="date" {...register("processed_date")} />
              {errors.processed_date ? <small>{errors.processed_date.message}</small> : null}
            </label>
            <label className="field">
              <span>Trạng thái thanh toán</span>
              <select {...register("payment_status")}>
                {paymentStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Kg đầu vào</span>
              <input
                type="number"
                min="0"
                step="0.01"
                {...register("input_weight_kg", { valueAsNumber: true })}
              />
              {errors.input_weight_kg ? <small>{errors.input_weight_kg.message}</small> : null}
            </label>
            <label className="field">
              <span>Kg đầu ra</span>
              <input
                type="number"
                min="0"
                step="0.01"
                {...register("output_weight_kg", { valueAsNumber: true })}
              />
              {errors.output_weight_kg ? <small>{errors.output_weight_kg.message}</small> : null}
            </label>
          </div>

          <label className="field">
            <span>Đơn giá / kg</span>
            <input type="number" min="0" step="1" {...register("unit_price", { valueAsNumber: true })} />
            {errors.unit_price ? <small>{errors.unit_price.message}</small> : null}
          </label>

          <div className="calculation-box">
            <span>Hao hụt: {formatNumber(calculated.lossWeight)} kg ({formatNumber(calculated.lossPercent)}%)</span>
            <span>Tổng chi phí: {formatMoney(calculated.totalCost)}</span>
          </div>

          <label className="field">
            <span>Ghi chú</span>
            <textarea {...register("note")} rows={3} placeholder="Thông tin thêm nếu cần" />
          </label>

          <button className="primary-button" type="submit" disabled={saving}>
            <Plus size={18} aria-hidden="true" />
            {saving ? "Đang lưu..." : editingItem ? "Lưu thay đổi" : "Thêm phiếu xử lý"}
          </button>
        </form>

        <div className="table-card">
          <div className="table-toolbar">
            <label className="search-field">
              <Search size={17} aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo chuyến, nhà máy, loại lúa"
              />
            </label>
          </div>

          {error ? <div className="alert error-alert">{error}</div> : null}

          {loading ? (
            <div className="state-box">Đang tải phiếu xử lý...</div>
          ) : filteredItems.length === 0 ? (
            <div className="state-box">Không có phiếu xử lý phù hợp.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table extra-wide-table">
                <thead>
                  <tr>
                    <th>Chuyến</th>
                    <th>Ngày</th>
                    <th>Nhà máy</th>
                    <th>Dịch vụ</th>
                    <th>Loại lúa</th>
                    <th>Đầu vào/ra</th>
                    <th>Hao hụt</th>
                    <th>Chi phí</th>
                    <th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.trip?.code || "-"}</td>
                      <td>{formatDate(item.processed_date)}</td>
                      <td>{item.factory?.name || "-"}</td>
                      <td>{formatServiceType(item.service_type)}</td>
                      <td>{item.riceType?.name || "-"}</td>
                      <td>
                        <div>{formatNumber(item.input_weight_kg)} kg</div>
                        <span className="muted-text">Ra: {formatNumber(item.output_weight_kg)} kg</span>
                      </td>
                      <td>
                        <div>{formatNumber(item.loss_weight_kg)} kg</div>
                        <span className="muted-text">{formatNumber(item.loss_percent)}%</span>
                      </td>
                      <td>{formatMoney(item.total_cost)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-button" type="button" onClick={() => exportRecordPdf(item)} aria-label="Xuất PDF">
                            <FileDown size={17} aria-hidden="true" />
                          </button>
                          <button className="icon-button" type="button" onClick={() => exportRecordExcel(item)} aria-label="Xuất Excel">
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

function calculateProcessing({
  inputWeight,
  outputWeight,
  unitPrice,
}: {
  inputWeight: number;
  outputWeight: number;
  unitPrice: number;
}) {
  const lossWeight = Math.max(inputWeight - outputWeight, 0);
  const lossPercent = inputWeight > 0 ? (lossWeight / inputWeight) * 100 : 0;
  const totalCost = inputWeight * unitPrice;

  return {
    lossWeight: round2(lossWeight),
    lossPercent: round4(lossPercent),
    totalCost: round2(totalCost),
  };
}

function buildProcessingExportTable(item: ProcessingRecordRow) {
  return {
    title: "Processing record",
    headers: ["Field", "Value"],
    rows: [
      ["Transport trip", item.trip?.code ?? "-"],
      ["Processed date", formatDate(item.processed_date)],
      ["Factory", item.factory?.name ?? "-"],
      ["Service type", formatServiceType(item.service_type)],
      ["Rice type", item.riceType?.name ?? "-"],
      ["Input weight", item.input_weight_kg],
      ["Output weight", item.output_weight_kg],
      ["Loss weight", item.loss_weight_kg],
      ["Loss percent", item.loss_percent],
      ["Unit price", item.unit_price],
      ["Total cost", item.total_cost],
    ],
  };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function formatServiceType(value: ServiceType) {
  return serviceTypeOptions.find((option) => option.value === value)?.label ?? value;
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toNullable(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(
    new Date(`${value}T00:00:00`),
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}
