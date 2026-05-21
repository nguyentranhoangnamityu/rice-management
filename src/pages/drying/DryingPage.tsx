import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, ExternalLink, Flame, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { ModalShell } from "../../components/ui/ModalShell";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { useServerPagination } from "../../hooks/useServerPagination";
import {
  calculateDryingMetrics,
  deleteDryingTripExpense,
  formatTonFromKg,
  syncDryingTripExpense,
} from "../../lib/drying-record";
import { formatDbError } from "../../lib/db-errors";
import { supabase } from "../../lib/supabase";
import type { Enums, Tables } from "../../types/database";

type ProcessingRecord = Tables<"processing_records">;
type Trip = Tables<"trips">;
type Factory = Tables<"factories">;
type Season = Tables<"seasons">;
type RiceType = Tables<"rice_types">;
type PaymentStatus = Enums<"payment_status">;

type DryingRow = ProcessingRecord & {
  trip?: Trip | null;
  factory?: Factory | null;
  season?: Season | null;
  riceType?: RiceType | null;
};

type DryingSummary = {
  recordCount: number;
  totalInputKg: number;
  totalOutputKg: number;
  totalCost: number;
  unpaidCost: number;
  unpaidCount: number;
};

const paymentStatusOptions: { value: PaymentStatus; label: string; badgeClass: string }[] = [
  { value: "unpaid", label: "Chưa trả", badgeClass: "badge-cancelled" },
  { value: "partial", label: "Trả một phần", badgeClass: "badge-selling" },
  { value: "paid", label: "Đã trả", badgeClass: "badge-completed" },
];

const dryingSchema = z.object({
  trip_id: z.string().min(1, "Vui lòng chọn chuyến hàng"),
  factory_id: z.string().min(1, "Vui lòng chọn lò sấy"),
  season_id: z.string().optional(),
  rice_type_id: z.string().min(1, "Vui lòng chọn loại lúa"),
  input_weight_kg: z.number().min(0, "Khối lượng đầu vào không được âm"),
  output_weight_kg: z.number().min(0, "Khối lượng đầu ra không được âm"),
  unit_price: z.number().min(0, "Đơn giá không được âm"),
  payment_status: z.enum(["unpaid", "partial", "paid"]),
  processed_date: z.string().min(1, "Vui lòng chọn ngày sấy"),
  note: z.string().trim().optional(),
});

type DryingFormValues = z.infer<typeof dryingSchema>;

const emptyValues: DryingFormValues = {
  trip_id: "",
  factory_id: "",
  season_id: "",
  rice_type_id: "",
  input_weight_kg: 0,
  output_weight_kg: 0,
  unit_price: 0,
  payment_status: "unpaid",
  processed_date: new Date().toISOString().slice(0, 10),
  note: "",
};

export function DryingPage() {
  const [factoryFilter, setFactoryFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | "">("");
  const [seasonFilter, setSeasonFilter] = useState("");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [riceTypes, setRiceTypes] = useState<RiceType[]>([]);
  const [summary, setSummary] = useState<DryingSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<DryingRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const listFilter = useCallback(
    (query: ReturnType<typeof supabase.from>) => {
      let next = query.eq("service_type", "drying");
      if (factoryFilter) next = next.eq("factory_id", factoryFilter);
      if (paymentFilter) next = next.eq("payment_status", paymentFilter);
      if (seasonFilter) next = next.eq("season_id", seasonFilter);
      return next;
    },
    [factoryFilter, paymentFilter, seasonFilter],
  );

  const resolveSearchFilter = useCallback(async (search: string) => {
    const term = search.trim().replace(/[%_,]/g, "");
    if (!term) return null;

    const [{ data: tripMatches }, { data: factoryMatches }] = await Promise.all([
      supabase.from("trips").select("id").ilike("code", `%${term}%`),
      supabase.from("factories").select("id").ilike("name", `%${term}%`),
    ]);

    const parts: string[] = [`note.ilike.%${term}%`];
    if (tripMatches?.length) {
      parts.push(`trip_id.in.(${tripMatches.map((trip) => trip.id).join(",")})`);
    }
    if (factoryMatches?.length) {
      parts.push(`factory_id.in.(${factoryMatches.map((factory) => factory.id).join(",")})`);
    }
    return parts.join(",");
  }, []);

  const queryOptions = useMemo(
    () => ({
      applyFilter: listFilter,
      resolveSearchFilter,
    }),
    [listFilter, resolveSearchFilter],
  );

  const {
    items: recordRows,
    page,
    setPage,
    total,
    totalPages,
    search,
    setSearch,
    loading,
    error: listError,
    refresh,
  } = useServerPagination<ProcessingRecord>("processing_records", {
    queryOptions,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<DryingFormValues>({
    resolver: zodResolver(dryingSchema),
    defaultValues: emptyValues,
  });

  const watchedTripId = watch("trip_id");
  const watchedInputWeight = watch("input_weight_kg");
  const watchedOutputWeight = watch("output_weight_kg");
  const watchedUnitPrice = watch("unit_price");

  const calculated = useMemo(
    () =>
      calculateDryingMetrics({
        inputWeightKg: watchedInputWeight || 0,
        outputWeightKg: watchedOutputWeight || 0,
        unitPrice: watchedUnitPrice || 0,
      }),
    [watchedInputWeight, watchedOutputWeight, watchedUnitPrice],
  );

  const tripMap = useMemo(() => new Map(trips.map((trip) => [trip.id, trip])), [trips]);
  const factoryMap = useMemo(() => new Map(factories.map((factory) => [factory.id, factory])), [factories]);
  const seasonMap = useMemo(() => new Map(seasons.map((season) => [season.id, season])), [seasons]);
  const riceTypeMap = useMemo(() => new Map(riceTypes.map((riceType) => [riceType.id, riceType])), [riceTypes]);

  const dryingFactories = useMemo(
    () => factories.filter((factory) => factory.type === "drying" || factory.type === "drying_milling" || !factory.type),
    [factories],
  );

  const items = useMemo<DryingRow[]>(
    () =>
      recordRows.map((record) => ({
        ...record,
        trip: record.trip_id ? tripMap.get(record.trip_id) ?? null : null,
        factory: factoryMap.get(record.factory_id) ?? null,
        season: record.season_id ? seasonMap.get(record.season_id) ?? null : null,
        riceType: riceTypeMap.get(record.rice_type_id) ?? null,
      })),
    [recordRows, tripMap, factoryMap, seasonMap, riceTypeMap],
  );

  const factorySummaries = useMemo(() => {
    const totals = new Map<
      string,
      { factoryId: string; factoryName: string; recordCount: number; outputKg: number; totalCost: number; unpaidCost: number }
    >();

    for (const item of items) {
      const key = item.factory_id;
      const current = totals.get(key) ?? {
        factoryId: key,
        factoryName: item.factory?.name ?? "-",
        recordCount: 0,
        outputKg: 0,
        totalCost: 0,
        unpaidCost: 0,
      };
      current.recordCount += 1;
      current.outputKg += item.output_weight_kg || 0;
      current.totalCost += item.total_cost || 0;
      if (item.payment_status !== "paid") {
        current.unpaidCost += item.total_cost || 0;
      }
      totals.set(key, current);
    }

    return [...totals.values()].sort((a, b) => b.unpaidCost - a.unpaidCost);
  }, [items]);

  async function loadReferenceData() {
    const [tripsResult, factoriesResult, seasonsResult, riceTypesResult] = await Promise.all([
      supabase.from("trips").select("*").order("start_date", { ascending: false }),
      supabase.from("factories").select("*").order("name", { ascending: true }),
      supabase.from("seasons").select("*").order("from_date", { ascending: false }),
      supabase.from("rice_types").select("*").order("name", { ascending: true }),
    ]);

    const firstError =
      tripsResult.error ?? factoriesResult.error ?? seasonsResult.error ?? riceTypesResult.error;

    if (firstError) {
      setError(formatDbError(firstError));
      return;
    }

    setTrips(tripsResult.data ?? []);
    setFactories(factoriesResult.data ?? []);
    setSeasons(seasonsResult.data ?? []);
    setRiceTypes(riceTypesResult.data ?? []);
  }

  async function loadSummary() {
    setSummaryLoading(true);
    let query = supabase
      .from("processing_records")
      .select("input_weight_kg, output_weight_kg, total_cost, payment_status")
      .eq("service_type", "drying");

    if (factoryFilter) query = query.eq("factory_id", factoryFilter);
    if (paymentFilter) query = query.eq("payment_status", paymentFilter);
    if (seasonFilter) query = query.eq("season_id", seasonFilter);

    const { data, error: summaryError } = await query;
    if (summaryError) {
      setError(formatDbError(summaryError));
      setSummaryLoading(false);
      return;
    }

    const rows = data ?? [];
    setSummary({
      recordCount: rows.length,
      totalInputKg: rows.reduce((sum, row) => sum + (row.input_weight_kg || 0), 0),
      totalOutputKg: rows.reduce((sum, row) => sum + (row.output_weight_kg || 0), 0),
      totalCost: rows.reduce((sum, row) => sum + (row.total_cost || 0), 0),
      unpaidCost: rows
        .filter((row) => row.payment_status !== "paid")
        .reduce((sum, row) => sum + (row.total_cost || 0), 0),
      unpaidCount: rows.filter((row) => row.payment_status !== "paid").length,
    });
    setSummaryLoading(false);
  }

  useEffect(() => {
    void loadReferenceData();
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [factoryFilter, paymentFilter, seasonFilter]);

  useEffect(() => {
    setPage(1);
  }, [factoryFilter, paymentFilter, seasonFilter, setPage]);

  useEffect(() => {
    if (!watchedTripId || editingItem) return;

    const trip = trips.find((item) => item.id === watchedTripId);
    if (!trip) return;

    if (trip.factory_id) setValue("factory_id", trip.factory_id);
    if (trip.season_id) setValue("season_id", trip.season_id);
    if (trip.rice_type_id) setValue("rice_type_id", trip.rice_type_id);
    if (trip.unloaded_weight_kg > 0) setValue("input_weight_kg", trip.unloaded_weight_kg);
    if (trip.start_date) setValue("processed_date", trip.start_date);
  }, [editingItem, setValue, trips, watchedTripId]);

  function startEdit(item: DryingRow) {
    setEditingItem(item);
    reset({
      trip_id: item.trip_id ?? "",
      factory_id: item.factory_id,
      season_id: item.season_id ?? "",
      rice_type_id: item.rice_type_id,
      input_weight_kg: item.input_weight_kg,
      output_weight_kg: item.output_weight_kg,
      unit_price: item.unit_price,
      payment_status: item.payment_status,
      processed_date: item.processed_date,
      note: item.note ?? "",
    });
    setFormOpen(true);
  }

  function clearForm() {
    setEditingItem(null);
    reset(emptyValues);
    setFormOpen(false);
  }

  async function onSubmit(values: DryingFormValues) {
    setSaving(true);
    setError(null);

    try {
      const metrics = calculateDryingMetrics({
        inputWeightKg: values.input_weight_kg,
        outputWeightKg: values.output_weight_kg,
        unitPrice: values.unit_price,
      });

      const payload = {
        trip_id: values.trip_id,
        transport_trip_id: null,
        factory_id: values.factory_id,
        season_id: values.season_id || null,
        service_type: "drying" as const,
        rice_type_id: values.rice_type_id,
        input_weight_kg: values.input_weight_kg,
        output_weight_kg: values.output_weight_kg,
        loss_weight_kg: metrics.lossWeight,
        loss_percent: metrics.lossPercent,
        unit_price: values.unit_price,
        total_cost: metrics.totalCost,
        payment_status: values.payment_status,
        processed_date: values.processed_date,
        note: toNullable(values.note),
      };

      const factoryName = factoryMap.get(values.factory_id)?.name ?? null;

      if (editingItem) {
        const { error: updateError } = await supabase
          .from("processing_records")
          .update(payload)
          .eq("id", editingItem.id);
        if (updateError) throw updateError;

        await syncDryingTripExpense({
          tripId: values.trip_id,
          recordId: editingItem.id,
          totalCost: metrics.totalCost,
          processedDate: values.processed_date,
          paymentStatus: values.payment_status,
          factoryName,
          note: toNullable(values.note),
        });
      } else {
        const { data: created, error: insertError } = await supabase
          .from("processing_records")
          .insert(payload)
          .select("id")
          .single();
        if (insertError) throw insertError;

        if (created?.id) {
          await syncDryingTripExpense({
            tripId: values.trip_id,
            recordId: created.id,
            totalCost: metrics.totalCost,
            processedDate: values.processed_date,
            paymentStatus: values.payment_status,
            factoryName,
            note: toNullable(values.note),
          });
        }
      }

      clearForm();
      await Promise.all([refresh(editingItem ? page : 1), loadSummary()]);
    } catch (submitError) {
      setError(formatDbError(submitError));
    } finally {
      setSaving(false);
    }
  }

  async function updatePaymentStatus(item: DryingRow, paymentStatus: PaymentStatus) {
    if (item.payment_status === paymentStatus) return;

    setUpdatingPaymentId(item.id);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("processing_records")
        .update({ payment_status: paymentStatus })
        .eq("id", item.id);
      if (updateError) throw updateError;

      if (item.trip_id) {
        await syncDryingTripExpense({
          tripId: item.trip_id,
          recordId: item.id,
          totalCost: item.total_cost,
          processedDate: item.processed_date,
          paymentStatus,
          factoryName: item.factory?.name ?? null,
          note: item.note,
        });
      }

      await Promise.all([refresh(page), loadSummary()]);
    } catch (paymentError) {
      setError(formatDbError(paymentError));
    } finally {
      setUpdatingPaymentId(null);
    }
  }

  async function deleteItem(item: DryingRow) {
    const confirmed = window.confirm(`Xóa phiếu sấy chuyến "${item.trip?.code ?? ""}"?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    try {
      const { error: deleteError } = await supabase.from("processing_records").delete().eq("id", item.id);
      if (deleteError) throw deleteError;

      if (item.trip_id) {
        await deleteDryingTripExpense(item.trip_id, item.id);
      }

      if (editingItem?.id === item.id) clearForm();
      await Promise.all([refresh(page), loadSummary()]);
    } catch (deleteErr) {
      setError(formatDbError(deleteErr));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Sấy lúa</h1>
          <p>Theo dõi sấy theo chuyến hàng, khối lượng, tiền sấy và trạng thái trả nhà máy.</p>
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
            Ghi nhận sấy
          </button>
        </div>
      </header>

      <div className="metric-grid" style={{ marginBottom: "20px" }}>
        <div className="metric-card">
          <span>Số đợt sấy</span>
          <strong>{summaryLoading ? "..." : summary?.recordCount ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span>Lúa tươi vào sấy</span>
          <strong>{summaryLoading ? "..." : `${formatTonFromKg(summary?.totalInputKg ?? 0)} tấn`}</strong>
          <small className="muted-text">{formatNumber(summary?.totalInputKg ?? 0)} kg</small>
        </div>
        <div className="metric-card">
          <span>Lúa khô thu về</span>
          <strong>{summaryLoading ? "..." : `${formatTonFromKg(summary?.totalOutputKg ?? 0)} tấn`}</strong>
          <small className="muted-text">{formatNumber(summary?.totalOutputKg ?? 0)} kg</small>
        </div>
        <div className="metric-card">
          <span>Tổng tiền sấy</span>
          <strong>{summaryLoading ? "..." : formatMoney(summary?.totalCost ?? 0)}</strong>
        </div>
        <div className="metric-card">
          <span>Còn phải trả</span>
          <strong className="profit-negative">
            {summaryLoading ? "..." : formatMoney(summary?.unpaidCost ?? 0)}
          </strong>
          <small className="muted-text">{summary?.unpaidCount ?? 0} đợt chưa trả đủ</small>
        </div>
      </div>

      <div className="crud-grid modal-crud-grid">
        {formOpen ? (
          <ModalShell wide onClose={clearForm}>
            <form className="form-card" onSubmit={handleSubmit(onSubmit)}>
              <div className="card-title-row">
                <h2>{editingItem ? "Sửa phiếu sấy" : "Ghi nhận sấy lúa"}</h2>
              </div>

              <label className="field">
                <span>Chuyến hàng</span>
                <select {...register("trip_id")}>
                  <option value="">Chọn chuyến hàng</option>
                  {trips.map((trip) => (
                    <option key={trip.id} value={trip.id}>
                      {trip.code} · {trip.start_date ? formatDate(trip.start_date) : "Chưa có ngày"}
                    </option>
                  ))}
                </select>
                {errors.trip_id ? <small>{errors.trip_id.message}</small> : null}
              </label>

              <div className="field-grid">
                <label className="field">
                  <span>Lò sấy / Nhà máy</span>
                  <select {...register("factory_id")}>
                    <option value="">Chọn lò sấy</option>
                    {dryingFactories.map((factory) => (
                      <option key={factory.id} value={factory.id}>
                        {factory.name}
                      </option>
                    ))}
                  </select>
                  {errors.factory_id ? <small>{errors.factory_id.message}</small> : null}
                </label>
                <label className="field">
                  <span>Ngày sấy xong</span>
                  <input type="date" {...register("processed_date")} />
                  {errors.processed_date ? <small>{errors.processed_date.message}</small> : null}
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
                  <span>Lúa tươi vào sấy (kg)</span>
                  <input type="number" min="0" step="0.01" {...register("input_weight_kg", { valueAsNumber: true })} />
                  {errors.input_weight_kg ? <small>{errors.input_weight_kg.message}</small> : null}
                </label>
                <label className="field">
                  <span>Lúa khô thu về (kg)</span>
                  <input type="number" min="0" step="0.01" {...register("output_weight_kg", { valueAsNumber: true })} />
                  {errors.output_weight_kg ? <small>{errors.output_weight_kg.message}</small> : null}
                </label>
              </div>

              <div className="field-grid">
                <label className="field">
                  <span>Đơn giá sấy (đ/kg lúa khô)</span>
                  <input type="number" min="0" step="1" {...register("unit_price", { valueAsNumber: true })} />
                  {errors.unit_price ? <small>{errors.unit_price.message}</small> : null}
                </label>
                <label className="field">
                  <span>Thanh toán</span>
                  <select {...register("payment_status")}>
                    {paymentStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="calculation-box">
                <span>
                  Hao sấy: {formatNumber(calculated.lossWeight)} kg ({formatNumber(calculated.lossPercent)}%)
                </span>
                <span>Lúa khô: {formatTonFromKg(watchedOutputWeight || 0)} tấn</span>
                <span>Tổng tiền sấy: {formatMoney(calculated.totalCost)}</span>
              </div>

              <label className="field">
                <span>Ghi chú</span>
                <textarea {...register("note")} rows={3} placeholder="VD: Sấy đợt 1, mưa nhẹ..." />
              </label>

              <button className="primary-button" type="submit" disabled={saving}>
                <Flame size={18} aria-hidden="true" />
                {saving ? "Đang lưu..." : editingItem ? "Lưu thay đổi" : "Ghi nhận sấy"}
              </button>
            </form>
          </ModalShell>
        ) : null}

        <div className="table-card">
          <div className="table-toolbar" style={{ flexWrap: "wrap", gap: "12px" }}>
            <label className="search-field">
              <Search size={17} aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo mã chuyến, nhà máy, ghi chú"
              />
            </label>
            <select value={factoryFilter} onChange={(event) => setFactoryFilter(event.target.value)}>
              <option value="">Tất cả lò sấy</option>
              {dryingFactories.map((factory) => (
                <option key={factory.id} value={factory.id}>
                  {factory.name}
                </option>
              ))}
            </select>
            <select
              value={paymentFilter}
              onChange={(event) => setPaymentFilter(event.target.value as PaymentStatus | "")}
            >
              <option value="">Tất cả thanh toán</option>
              {paymentStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select value={seasonFilter} onChange={(event) => setSeasonFilter(event.target.value)}>
              <option value="">Tất cả mùa vụ</option>
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </div>

          {error || listError ? <div className="alert error-alert">{error ?? listError}</div> : null}

          {factorySummaries.length > 0 ? (
            <div style={{ marginBottom: "16px", padding: "12px 14px", background: "var(--bg-app)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)" }}>
              <strong style={{ fontSize: "13px" }}>Tổng hợp trang hiện tại theo lò sấy</strong>
              <div className="table-wrap" style={{ marginTop: "10px" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Lò sấy</th>
                      <th>Số đợt</th>
                      <th>Lúa khô</th>
                      <th>Tổng tiền</th>
                      <th>Còn nợ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {factorySummaries.map((row) => (
                      <tr key={row.factoryId}>
                        <td>{row.factoryName}</td>
                        <td>{row.recordCount}</td>
                        <td>{formatTonFromKg(row.outputKg)} tấn</td>
                        <td>{formatMoney(row.totalCost)}</td>
                        <td className="profit-negative">{formatMoney(row.unpaidCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="state-box">Đang tải phiếu sấy...</div>
          ) : items.length === 0 ? (
            <div className="state-box">Không có phiếu sấy phù hợp.</div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="data-table extra-wide-table">
                  <thead>
                    <tr>
                      <th>Chuyến hàng</th>
                      <th>Ngày sấy</th>
                      <th>Lò sấy</th>
                      <th>Lúa tươi</th>
                      <th>Lúa khô</th>
                      <th>Hao sấy</th>
                      <th>Đơn giá</th>
                      <th>Tổng tiền</th>
                      <th>Thanh toán</th>
                      <th aria-label="Thao tác" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const paymentMeta =
                        paymentStatusOptions.find((option) => option.value === item.payment_status) ??
                        paymentStatusOptions[0];
                      return (
                        <tr key={item.id}>
                          <td>
                            {item.trip_id ? (
                              <Link to={`/trips/${item.trip_id}`} style={{ fontWeight: 700, color: "var(--primary)" }}>
                                {item.trip?.code ?? "Chuyến"}
                              </Link>
                            ) : (
                              "-"
                            )}
                            {item.riceType ? (
                              <div className="muted-text">{item.riceType.name}</div>
                            ) : null}
                          </td>
                          <td>{formatDate(item.processed_date)}</td>
                          <td>{item.factory?.name || "-"}</td>
                          <td>
                            <div>{formatTonFromKg(item.input_weight_kg)} tấn</div>
                            <span className="muted-text">{formatNumber(item.input_weight_kg)} kg</span>
                          </td>
                          <td>
                            <div>{formatTonFromKg(item.output_weight_kg)} tấn</div>
                            <span className="muted-text">{formatNumber(item.output_weight_kg)} kg</span>
                          </td>
                          <td>
                            <div>{formatNumber(item.loss_weight_kg)} kg</div>
                            <span className="muted-text">{formatNumber(item.loss_percent)}%</span>
                          </td>
                          <td>{formatMoney(item.unit_price)}/kg</td>
                          <td style={{ fontWeight: 700 }}>{formatMoney(item.total_cost)}</td>
                          <td>
                            <span className={`badge ${paymentMeta.badgeClass}`} style={{ fontSize: "11px" }}>
                              {paymentMeta.label}
                            </span>
                            <select
                              value={item.payment_status}
                              disabled={updatingPaymentId === item.id}
                              onChange={(event) =>
                                void updatePaymentStatus(item, event.target.value as PaymentStatus)
                              }
                              style={{ display: "block", marginTop: "6px", fontSize: "12px", maxWidth: "130px" }}
                            >
                              {paymentStatusOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <div className="row-actions">
                              {item.trip_id ? (
                                <Link to={`/trips/${item.trip_id}`} className="icon-button" aria-label="Xem chuyến">
                                  <ExternalLink size={17} aria-hidden="true" />
                                </Link>
                              ) : null}
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

function toNullable(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(new Date(`${value}T00:00:00`));
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
