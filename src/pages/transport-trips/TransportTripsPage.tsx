import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, FileDown, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ModalShell } from "../../components/ui/ModalShell";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { useServerPagination } from "../../hooks/useServerPagination";
import { exportExcel, exportPdf } from "../../lib/export";
import { supabase } from "../../lib/supabase";
import type { Enums, Tables } from "../../types/database";
import { formatDbError } from "../../lib/db-errors";
import {
  calculateTransportCost,
  calculateTransportLoss,
  transportPriceBasisOptions,
} from "../../lib/transport-cost";

type TransportTrip = Tables<"transport_trips">;
type TransporterBoat = Tables<"transporter_boats">;
type TransportRoute = Tables<"transport_routes">;
type TransportRouteStop = Tables<"transport_route_stops">;
type Factory = Tables<"factories">;
type Season = Tables<"seasons">;
type RiceType = Tables<"rice_types">;
type PurchaseSlip = Tables<"purchase_slips">;
type Farmer = Tables<"farmers">;
type Broker = Tables<"brokers">;
type PaymentStatus = Enums<"payment_status">;
type RouteWithStops = TransportRoute & {
  stops: TransportRouteStop[];
};

type TripRow = TransportTrip & {
  boat?: TransporterBoat | null;
  route?: RouteWithStops | null;
  factory?: Factory | null;
  season?: Season | null;
  riceType?: RiceType | null;
};

type PurchaseSlipAssignment = PurchaseSlip & {
  farmer?: Farmer | null;
  broker?: Broker | null;
  riceType?: RiceType | null;
};

const priceBasisOptions = transportPriceBasisOptions;

const paymentStatusOptions: { value: PaymentStatus; label: string }[] = [
  { value: "unpaid", label: "Chưa trả" },
  { value: "partial", label: "Trả một phần" },
  { value: "paid", label: "Đã trả" },
];

const tripSchema = z.object({
  code: z.string().trim().min(1, "Vui lòng nhập mã chuyến"),
  transporter_boat_id: z.string().min(1, "Vui lòng chọn ghe"),
  route_id: z.string().min(1, "Vui lòng chọn tuyến"),
  factory_id: z.string().optional(),
  season_id: z.string().min(1, "Vui lòng chọn mùa vụ"),
  rice_type_id: z.string().min(1, "Vui lòng chọn loại lúa"),
  trip_date: z.string().min(1, "Vui lòng chọn ngày chuyến"),
  loaded_weight_kg: z.number().min(0, "Kg lúa xuống ghe không được âm"),
  unloaded_weight_kg: z.number().min(0, "Kg lúa lên nhà máy không được âm"),
  transport_price_basis: z.enum(["loaded_weight", "unloaded_weight", "fixed"]),
  transport_price: z.number().min(0, "Giá vận chuyển không được âm"),
  fuel_fee: z.number().min(0, "Tiền dầu không được âm"),
  labor_fee: z.number().min(0, "Tiền công không được âm"),
  weighing_fee: z.number().min(0, "Tiền cân không được âm"),
  payment_status: z.enum(["unpaid", "partial", "paid"]),
  note: z.string().trim().optional(),
});

type TripFormValues = z.infer<typeof tripSchema>;

const emptyValues: TripFormValues = {
  code: "",
  transporter_boat_id: "",
  route_id: "",
  factory_id: "",
  season_id: "",
  rice_type_id: "",
  trip_date: "",
  loaded_weight_kg: 0,
  unloaded_weight_kg: 0,
  transport_price_basis: "unloaded_weight",
  transport_price: 0,
  fuel_fee: 0,
  labor_fee: 0,
  weighing_fee: 0,
  payment_status: "unpaid",
  note: "",
};

export function TransportTripsPage() {
  const {
    items: tripRows,
    page,
    setPage,
    total,
    totalPages,
    search,
    setSearch,
    loading,
    error: listError,
    refresh,
  } = useServerPagination<TransportTrip>("transport_trips");
  const [boats, setBoats] = useState<TransporterBoat[]>([]);
  const [routes, setRoutes] = useState<RouteWithStops[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [riceTypes, setRiceTypes] = useState<RiceType[]>([]);
  const [purchaseSlips, setPurchaseSlips] = useState<PurchaseSlipAssignment[]>([]);
  const [assigningItemId, setAssigningItemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<TripRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TripFormValues>({
    resolver: zodResolver(tripSchema),
    defaultValues: emptyValues,
  });

  const watchedRouteId = watch("route_id");
  const watchedLoadedWeight = watch("loaded_weight_kg");
  const watchedUnloadedWeight = watch("unloaded_weight_kg");
  const watchedPriceBasis = watch("transport_price_basis");
  const watchedTransportPrice = watch("transport_price");
  const watchedFuelFee = watch("fuel_fee");
  const watchedLaborFee = watch("labor_fee");
  const watchedWeighingFee = watch("weighing_fee");
  const previousRouteIdRef = useRef<string | null>(null);

  const calculated = useMemo(() => {
    const loss = calculateTransportLoss(watchedLoadedWeight || 0, watchedUnloadedWeight || 0);
    const transportCost = calculateTransportCost({
      loadedWeightKg: watchedLoadedWeight || 0,
      unloadedWeightKg: watchedUnloadedWeight || 0,
      priceBasis: watchedPriceBasis,
      transportPrice: watchedTransportPrice || 0,
    });
    return {
      lossWeight: loss.lossWeight,
      lossPercent: loss.lossPercent,
      transportCost,
      totalCost: round2(transportCost + (watchedFuelFee || 0) + (watchedLaborFee || 0) + (watchedWeighingFee || 0)),
    };
  }, [
    watchedLoadedWeight,
    watchedUnloadedWeight,
    watchedPriceBasis,
    watchedTransportPrice,
    watchedFuelFee,
    watchedLaborFee,
    watchedWeighingFee,
  ]);

  const boatMap = useMemo(() => new Map(boats.map((boat) => [boat.id, boat])), [boats]);
  const routeMap = useMemo(() => new Map(routes.map((route) => [route.id, route])), [routes]);
  const factoryMap = useMemo(() => new Map(factories.map((factory) => [factory.id, factory])), [factories]);
  const seasonMap = useMemo(() => new Map(seasons.map((season) => [season.id, season])), [seasons]);
  const riceTypeMap = useMemo(
    () => new Map(riceTypes.map((riceType) => [riceType.id, riceType])),
    [riceTypes],
  );

  const items = useMemo<TripRow[]>(
    () =>
      tripRows.map((trip) => ({
        ...trip,
        boat: boatMap.get(trip.transporter_boat_id) ?? null,
        route: routeMap.get(trip.route_id) ?? null,
        factory: trip.factory_id ? factoryMap.get(trip.factory_id) ?? null : null,
        season: trip.season_id ? seasonMap.get(trip.season_id) ?? null : null,
        riceType: riceTypeMap.get(trip.rice_type_id) ?? null,
      })),
    [tripRows, boatMap, routeMap, factoryMap, seasonMap, riceTypeMap],
  );

  const formTitle = editingItem ? "Sửa chuyến ghe" : "Thêm chuyến ghe";
  const assignablePurchaseSlips = useMemo(() => {
    if (!editingItem) return [];

    return purchaseSlips.filter(
      (item) => item.transport_trip_id === null || item.transport_trip_id === editingItem.id,
    );
  }, [editingItem, purchaseSlips]);
  const assignedPurchaseWeight = useMemo(
    () =>
      editingItem
        ? purchaseSlips
            .filter((item) => item.transport_trip_id === editingItem.id)
            .reduce((total, item) => total + item.weight_kg, 0)
        : 0,
    [editingItem, purchaseSlips],
  );
  const assignedWeightDifference = editingItem
    ? assignedPurchaseWeight - watchedLoadedWeight
    : 0;

  async function loadReferenceData() {
    const [
      boatsResult,
      routesResult,
      factoriesResult,
      seasonsResult,
      riceTypesResult,
      purchaseSlipsResult,
      farmersResult,
      brokersResult,
    ] = await Promise.all([
      supabase.from("transporter_boats").select("*").order("boat_name", { ascending: true }),
      supabase.from("transport_routes").select("*").order("name", { ascending: true }),
      supabase.from("factories").select("*").order("name", { ascending: true }),
      supabase.from("seasons").select("*").order("from_date", { ascending: false }),
      supabase.from("rice_types").select("*").order("name", { ascending: true }),
      supabase.from("purchase_slips").select("*").order("purchase_date", { ascending: false }),
      supabase.from("farmers").select("*").order("name", { ascending: true }),
      supabase.from("brokers").select("*").order("name", { ascending: true }),
    ]);

    const firstError =
      boatsResult.error ??
      routesResult.error ??
      factoriesResult.error ??
      seasonsResult.error ??
      riceTypesResult.error ??
      purchaseSlipsResult.error ??
      farmersResult.error ??
      brokersResult.error;

    if (firstError) {
      setError(formatDbError(firstError));
      return;
    }

    const routeRows = routesResult.data ?? [];
    const routeIds = routeRows.map((route) => route.id);
    let stopRows: TransportRouteStop[] = [];

    if (routeIds.length > 0) {
      const { data: stopsData, error: stopsError } = await supabase
        .from("transport_route_stops")
        .select("*")
        .in("route_id", routeIds)
        .order("stop_order", { ascending: true });

      if (stopsError) {
        setError(formatDbError(stopsError));
        return;
      }

      stopRows = stopsData ?? [];
    }

    const routeRowsWithStops = routeRows.map((route) => ({
      ...route,
      stops: stopRows.filter((stop) => stop.route_id === route.id),
    }));

    const riceTypeRows = riceTypesResult.data ?? [];
    const farmerRows = farmersResult.data ?? [];
    const brokerRows = brokersResult.data ?? [];
    const farmerMap = new Map(farmerRows.map((farmer) => [farmer.id, farmer]));
    const brokerMap = new Map(brokerRows.map((broker) => [broker.id, broker]));
    const riceTypeMapRef = new Map(riceTypeRows.map((riceType) => [riceType.id, riceType]));

    setBoats(boatsResult.data ?? []);
    setRoutes(routeRowsWithStops);
    setFactories(factoriesResult.data ?? []);
    setSeasons(seasonsResult.data ?? []);
    setRiceTypes(riceTypeRows);
    setPurchaseSlips(
      (purchaseSlipsResult.data ?? []).map((item) => ({
        ...item,
        farmer: farmerMap.get(item.farmer_id) ?? null,
        broker: item.broker_id ? brokerMap.get(item.broker_id) ?? null : null,
        riceType: riceTypeMapRef.get(item.rice_type_id) ?? null,
      })),
    );
  }

  useEffect(() => {
    void loadReferenceData();
  }, []);

  useEffect(() => {
    if (!formOpen || !watchedRouteId) return;
    if (previousRouteIdRef.current === watchedRouteId) return;

    const route = routeMap.get(watchedRouteId);
    previousRouteIdRef.current = watchedRouteId;

    if (!route || route.transport_price <= 0) return;

    setValue("transport_price_basis", route.transport_price_basis);
    setValue("transport_price", route.transport_price);
  }, [formOpen, watchedRouteId, routeMap, setValue]);

  function startEdit(item: TripRow) {
    setEditingItem(item);
    previousRouteIdRef.current = item.route_id;
    reset({
      code: item.code,
      transporter_boat_id: item.transporter_boat_id,
      route_id: item.route_id,
      factory_id: item.factory_id ?? "",
      season_id: item.season_id ?? "",
      rice_type_id: item.rice_type_id,
      trip_date: item.trip_date,
      loaded_weight_kg: item.loaded_weight_kg,
      unloaded_weight_kg: item.unloaded_weight_kg,
      transport_price_basis: item.transport_price_basis,
      transport_price: item.transport_price,
      fuel_fee: item.fuel_fee,
      labor_fee: item.labor_fee,
      weighing_fee: item.weighing_fee,
      payment_status: item.payment_status,
      note: item.note ?? "",
    });
    setFormOpen(true);
  }

  function clearForm() {
    setEditingItem(null);
    previousRouteIdRef.current = null;
    reset(emptyValues);
    setFormOpen(false);
  }

  async function onSubmit(values: TripFormValues) {
    setSaving(true);
    setError(null);

    const loss = calculateTransportLoss(values.loaded_weight_kg, values.unloaded_weight_kg);
    const transportCost = calculateTransportCost({
      loadedWeightKg: values.loaded_weight_kg,
      unloadedWeightKg: values.unloaded_weight_kg,
      priceBasis: values.transport_price_basis,
      transportPrice: values.transport_price,
    });
    const nextCalculated = {
      lossWeight: loss.lossWeight,
      lossPercent: loss.lossPercent,
      transportCost,
      totalCost: round2(transportCost + values.fuel_fee + values.labor_fee + values.weighing_fee),
    };

    const payload = {
      code: values.code,
      transporter_boat_id: values.transporter_boat_id,
      route_id: values.route_id,
      factory_id: values.factory_id || null,
      season_id: values.season_id,
      rice_type_id: values.rice_type_id,
      trip_date: values.trip_date,
      loaded_weight_kg: values.loaded_weight_kg,
      unloaded_weight_kg: values.unloaded_weight_kg,
      loss_weight_kg: nextCalculated.lossWeight,
      loss_percent: nextCalculated.lossPercent,
      transport_price_basis: values.transport_price_basis,
      transport_price: values.transport_price,
      transport_cost: nextCalculated.transportCost,
      fuel_fee: values.fuel_fee,
      labor_fee: values.labor_fee,
      weighing_fee: values.weighing_fee,
      total_cost: nextCalculated.totalCost,
      payment_status: values.payment_status,
      note: toNullable(values.note),
    };

    const result = editingItem
      ? await supabase.from("transport_trips").update(payload).eq("id", editingItem.id)
      : await supabase.from("transport_trips").insert(payload);

    if (result.error) {
      setError(formatDbError(result.error));
    } else {
      clearForm();
      await refresh(editingItem ? page : 1);
    }

    setSaving(false);
  }

  async function deleteItem(item: TripRow) {
    const confirmed = window.confirm(`Xóa chuyến ghe "${item.code}"?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    const { error: deleteError } = await supabase
      .from("transport_trips")
      .delete()
      .eq("id", item.id);

    if (deleteError) {
      setError(formatDbError(deleteError));
    } else {
      if (editingItem?.id === item.id) clearForm();
      await refresh(page);
    }

    setDeletingId(null);
  }

  async function togglePurchaseSlipAssignment(item: PurchaseSlipAssignment) {
    if (!editingItem) return;

    setAssigningItemId(item.id);
    setError(null);

    const nextTripId = item.transport_trip_id === editingItem.id ? null : editingItem.id;
    const { error: assignmentError } = await supabase
      .from("purchase_slips")
      .update({ transport_trip_id: nextTripId })
      .eq("id", item.id);

    if (assignmentError) {
      setError(formatDbError(assignmentError));
    } else {
      await loadReferenceData();
    }

    setAssigningItemId(null);
  }

  function exportTripPdf(item: TripRow) {
    exportPdf({
      title: `Transport trip ${item.code}`,
      details: [
        `Date: ${formatDate(item.trip_date)}`,
        `Boat: ${item.boat?.boat_name ?? "-"}`,
        `Route: ${item.route ? formatRoutePath(item.route.stops) : "-"}`,
      ],
      fileName: `transport-trip-${item.code}.pdf`,
      tables: [buildTripExportTable(item)],
    });
  }

  function exportTripExcel(item: TripRow) {
    exportExcel({
      fileName: `transport-trip-${item.code}.xlsx`,
      sheets: [buildTripExportTable(item)],
    });
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Chuyến ghe</h1>
          <p>Theo dõi vận chuyển, hao hụt, chi phí và công nợ ghe theo mùa vụ.</p>
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
            Thêm chuyến ghe
          </button>
        </div>
      </header>

      <div className="crud-grid modal-crud-grid">
        {formOpen ? (
          <ModalShell wide onClose={clearForm}>
            <form className="form-card" onSubmit={handleSubmit(onSubmit)}>
          <div className="card-title-row">
            <h2>{formTitle}</h2>
          </div>

          <label className="field">
            <span>Mã chuyến</span>
            <input {...register("code")} placeholder="VD: CG-2026-001" />
            {errors.code ? <small>{errors.code.message}</small> : null}
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Ghe</span>
              <select {...register("transporter_boat_id")}>
                <option value="">Chọn ghe</option>
                {boats.map((boat) => (
                  <option key={boat.id} value={boat.id}>
                    {boat.boat_name}
                  </option>
                ))}
              </select>
              {errors.transporter_boat_id ? <small>{errors.transporter_boat_id.message}</small> : null}
            </label>
            <label className="field">
              <span>Ngày chuyến</span>
              <input type="date" {...register("trip_date")} />
              {errors.trip_date ? <small>{errors.trip_date.message}</small> : null}
            </label>
          </div>

          <label className="field">
            <span>Tuyến</span>
            <select {...register("route_id")}>
              <option value="">Chọn tuyến</option>
              {routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.name} - {formatRoutePath(route.stops)}
                </option>
              ))}
            </select>
            {errors.route_id ? <small>{errors.route_id.message}</small> : null}
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Nhà máy</span>
              <select {...register("factory_id")}>
                <option value="">Không chọn</option>
                {factories.map((factory) => (
                  <option key={factory.id} value={factory.id}>
                    {factory.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Mùa vụ</span>
              <select {...register("season_id")}>
                <option value="">Chọn mùa vụ</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
              {errors.season_id ? <small>{errors.season_id.message}</small> : null}
            </label>
          </div>

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
              <span>Kg lúa xuống ghe</span>
              <input
                type="number"
                min="0"
                step="0.01"
                {...register("loaded_weight_kg", { valueAsNumber: true })}
              />
              {errors.loaded_weight_kg ? <small>{errors.loaded_weight_kg.message}</small> : null}
            </label>
            <label className="field">
              <span>Kg lúa lên nhà máy</span>
              <input
                type="number"
                min="0"
                step="0.01"
                {...register("unloaded_weight_kg", { valueAsNumber: true })}
              />
              {errors.unloaded_weight_kg ? <small>{errors.unloaded_weight_kg.message}</small> : null}
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Cách tính giá</span>
              <select {...register("transport_price_basis")}>
                {priceBasisOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Giá vận chuyển</span>
              <input
                type="number"
                min="0"
                step="1"
                {...register("transport_price", { valueAsNumber: true })}
              />
              {errors.transport_price ? <small>{errors.transport_price.message}</small> : null}
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Tiền dầu</span>
              <input type="number" min="0" step="1" {...register("fuel_fee", { valueAsNumber: true })} />
              {errors.fuel_fee ? <small>{errors.fuel_fee.message}</small> : null}
            </label>
            <label className="field">
              <span>Tiền công</span>
              <input type="number" min="0" step="1" {...register("labor_fee", { valueAsNumber: true })} />
              {errors.labor_fee ? <small>{errors.labor_fee.message}</small> : null}
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Tiền cân</span>
              <input type="number" min="0" step="1" {...register("weighing_fee", { valueAsNumber: true })} />
              {errors.weighing_fee ? <small>{errors.weighing_fee.message}</small> : null}
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

          <div className="calculation-box">
            <span>Hao hụt: {formatNumber(calculated.lossWeight)} kg ({formatNumber(calculated.lossPercent)}%)</span>
            <span>Tiền vận chuyển: {formatMoney(calculated.transportCost)}</span>
            <span>Tổng chi phí: {formatMoney(calculated.totalCost)}</span>
          </div>

          <label className="field">
            <span>Ghi chú</span>
            <textarea {...register("note")} rows={3} placeholder="Thông tin thêm nếu cần" />
          </label>

          <button className="primary-button" type="submit" disabled={saving}>
            <Plus size={18} aria-hidden="true" />
            {saving ? "Đang lưu..." : editingItem ? "Lưu thay đổi" : "Thêm chuyến"}
          </button>
            </form>

            {editingItem ? (
          <div className="table-card assignment-panel">
            <div className="card-title-row">
              <div>
                <h2>Gán phiếu mua</h2>
                <p className="section-hint">
                  Chỉ hiển thị phiếu mua chưa gán chuyến hoặc đang thuộc chuyến này.
                </p>
              </div>
            </div>

            <div className="metric-grid compact-metrics">
              <div className="metric-card">
                <span>Kg phiếu mua đã gán</span>
                <strong>{formatNumber(assignedPurchaseWeight)} kg</strong>
              </div>
              <div className="metric-card">
                <span>Kg lúa xuống ghe</span>
                <strong>{formatNumber(watchedLoadedWeight)} kg</strong>
              </div>
              <div className="metric-card">
                <span>Chênh lệch</span>
                <strong>{formatNumber(assignedWeightDifference)} kg</strong>
              </div>
            </div>

            {assignedWeightDifference !== 0 ? (
              <div className="alert warning-alert">
                Khối lượng phiếu mua đã gán đang lệch với kg lúa xuống ghe. Bạn vẫn có thể lưu chuyến.
              </div>
            ) : null}

            {assignablePurchaseSlips.length === 0 ? (
              <div className="state-box">Không có phiếu mua phù hợp để gán.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table extra-wide-table">
                  <thead>
                    <tr>
                      <th>Gán</th>
                      <th>Ngày mua</th>
                      <th>Nông dân</th>
                      <th>Cò lúa</th>
                      <th>Loại lúa</th>
                      <th>Kg</th>
                      <th>Thành tiền</th>
                      <th>Thanh toán</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignablePurchaseSlips.map((item) => {
                      const checked = item.transport_trip_id === editingItem.id;

                      return (
                        <tr key={item.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={assigningItemId === item.id}
                              onChange={() => void togglePurchaseSlipAssignment(item)}
                              aria-label={checked ? "Bỏ gán phiếu mua" : "Gán phiếu mua"}
                            />
                          </td>
                          <td>{formatDate(item.purchase_date)}</td>
                          <td>{item.farmer?.name || "-"}</td>
                          <td>{item.broker?.name || "-"}</td>
                          <td>{item.riceType?.name || "-"}</td>
                          <td>{formatNumber(item.weight_kg)}</td>
                          <td>{formatMoney(item.total_amount)}</td>
                          <td>{formatPaymentStatus(item.payment_status)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
              </div>
            ) : null}
          </ModalShell>
        ) : null}

        <div className="table-card">
          <div className="table-toolbar">
            <label className="search-field">
              <Search size={17} aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo mã, ghe, tuyến, nhà máy"
              />
            </label>
          </div>

          {error ?? listError ? <div className="alert error-alert">{error ?? listError}</div> : null}

          {loading ? (
            <div className="state-box">Đang tải chuyến ghe...</div>
          ) : items.length === 0 ? (
            <div className="state-box">Không có chuyến ghe phù hợp.</div>
          ) : (
            <>
            <div className="table-wrap">
              <table className="data-table extra-wide-table">
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Ngày</th>
                    <th>Ghe</th>
                    <th>Tuyến</th>
                    <th>Loại lúa</th>
                    <th>Hao hụt</th>
                    <th>Chi phí</th>
                    <th>Thanh toán</th>
                    <th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.code}</td>
                      <td>{formatDate(item.trip_date)}</td>
                      <td>{item.boat?.boat_name || "-"}</td>
                      <td>
                        <div>{item.route?.name || "-"}</div>
                        <span className="muted-text">{item.route ? formatRoutePath(item.route.stops) : ""}</span>
                      </td>
                      <td>{item.riceType?.name || "-"}</td>
                      <td>
                        <div>{formatNumber(item.loss_weight_kg)} kg</div>
                        <span className="muted-text">{formatNumber(item.loss_percent)}%</span>
                      </td>
                      <td>
                        <div>{formatMoney(item.total_cost)}</div>
                        <span className="muted-text">VC: {formatMoney(item.transport_cost)}</span>
                      </td>
                      <td>{formatPaymentStatus(item.payment_status)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-button" type="button" onClick={() => exportTripPdf(item)} aria-label="Xuất PDF">
                            <FileDown size={17} aria-hidden="true" />
                          </button>
                          <button className="icon-button" type="button" onClick={() => exportTripExcel(item)} aria-label="Xuất Excel">
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

function buildTripExportTable(item: TripRow) {
  return {
    title: "Transport trip",
    headers: ["Field", "Value"],
    rows: [
      ["Trip code", item.code],
      ["Date", formatDate(item.trip_date)],
      ["Boat", item.boat?.boat_name ?? "-"],
      ["Route", item.route ? formatRoutePath(item.route.stops) : "-"],
      ["Rice type", item.riceType?.name ?? "-"],
      ["Loaded weight", item.loaded_weight_kg],
      ["Unloaded weight", item.unloaded_weight_kg],
      ["Loss weight", item.loss_weight_kg],
      ["Loss percent", item.loss_percent],
      ["Transport cost", item.transport_cost],
      ["Fuel fee", item.fuel_fee],
      ["Labor fee", item.labor_fee],
      ["Weighing fee", item.weighing_fee],
      ["Total cost", item.total_cost],
    ],
  };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function formatRoutePath(stops: TransportRouteStop[]) {
  if (stops.length === 0) return "-";
  return stops
    .slice()
    .sort((a, b) => a.stop_order - b.stop_order)
    .map((stop) => stop.location_name)
    .join(" → ");
}

function formatPaymentStatus(value: PaymentStatus) {
  return paymentStatusOptions.find((option) => option.value === value)?.label ?? value;
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
