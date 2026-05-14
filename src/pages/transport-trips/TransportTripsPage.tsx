import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import type { Enums, Tables } from "../../types/database";

type TransportTrip = Tables<"transport_trips">;
type TransporterBoat = Tables<"transporter_boats">;
type TransportRoute = Tables<"transport_routes">;
type TransportRouteStop = Tables<"transport_route_stops">;
type Factory = Tables<"factories">;
type Season = Tables<"seasons">;
type RiceType = Tables<"rice_types">;
type PurchaseItem = Tables<"purchase_items">;
type PurchaseBatch = Tables<"purchase_batches">;
type Farmer = Tables<"farmers">;
type Broker = Tables<"brokers">;
type PaymentStatus = Enums<"payment_status">;
type TransportPriceBasis = Enums<"transport_price_basis">;

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

type PurchaseItemAssignment = PurchaseItem & {
  batch?: PurchaseBatch | null;
  farmer?: Farmer | null;
  broker?: Broker | null;
  riceType?: RiceType | null;
};

const priceBasisOptions: { value: TransportPriceBasis; label: string }[] = [
  { value: "loaded_weight", label: "Theo kg lên ghe" },
  { value: "unloaded_weight", label: "Theo kg xuống ghe" },
  { value: "fixed", label: "Giá cố định" },
];

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
  loaded_weight_kg: z.number().min(0, "Kg lên ghe không được âm"),
  unloaded_weight_kg: z.number().min(0, "Kg xuống ghe không được âm"),
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
  const [items, setItems] = useState<TripRow[]>([]);
  const [boats, setBoats] = useState<TransporterBoat[]>([]);
  const [routes, setRoutes] = useState<RouteWithStops[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [riceTypes, setRiceTypes] = useState<RiceType[]>([]);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemAssignment[]>([]);
  const [assigningItemId, setAssigningItemId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<TripRow | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<TripFormValues>({
    resolver: zodResolver(tripSchema),
    defaultValues: emptyValues,
  });

  const watchedLoadedWeight = watch("loaded_weight_kg");
  const watchedUnloadedWeight = watch("unloaded_weight_kg");
  const watchedPriceBasis = watch("transport_price_basis");
  const watchedTransportPrice = watch("transport_price");
  const watchedFuelFee = watch("fuel_fee");
  const watchedLaborFee = watch("labor_fee");
  const watchedWeighingFee = watch("weighing_fee");

  const calculated = calculateTrip({
    loadedWeight: watchedLoadedWeight,
    unloadedWeight: watchedUnloadedWeight,
    priceBasis: watchedPriceBasis,
    transportPrice: watchedTransportPrice,
    fuelFee: watchedFuelFee,
    laborFee: watchedLaborFee,
    weighingFee: watchedWeighingFee,
  });

  const filteredItems = useMemo(() => {
    const keyword = normalize(search);
    if (!keyword) return items;

    return items.filter((item) =>
      [
        item.code,
        item.boat?.boat_name,
        item.boat?.owner_name,
        item.route?.name,
        item.factory?.name,
        item.riceType?.name,
      ].some((value) => normalize(value).includes(keyword)),
    );
  }, [items, search]);

  const formTitle = editingItem ? "Sửa chuyến ghe" : "Thêm chuyến ghe";
  const assignablePurchaseItems = useMemo(() => {
    if (!editingItem) return [];

    return purchaseItems.filter(
      (item) => item.transport_trip_id === null || item.transport_trip_id === editingItem.id,
    );
  }, [editingItem, purchaseItems]);
  const assignedPurchaseWeight = useMemo(
    () =>
      editingItem
        ? purchaseItems
            .filter((item) => item.transport_trip_id === editingItem.id)
            .reduce((total, item) => total + item.weight_kg, 0)
        : 0,
    [editingItem, purchaseItems],
  );
  const assignedWeightDifference = editingItem
    ? assignedPurchaseWeight - watchedLoadedWeight
    : 0;

  async function loadData() {
    setLoading(true);
    setError(null);

    const [
      tripsResult,
      boatsResult,
      routesResult,
      factoriesResult,
      seasonsResult,
      riceTypesResult,
      purchaseItemsResult,
      purchaseBatchesResult,
      farmersResult,
      brokersResult,
    ] =
      await Promise.all([
        supabase.from("transport_trips").select("*").order("trip_date", { ascending: false }),
        supabase.from("transporter_boats").select("*").order("boat_name", { ascending: true }),
        supabase.from("transport_routes").select("*").order("name", { ascending: true }),
        supabase.from("factories").select("*").order("name", { ascending: true }),
        supabase.from("seasons").select("*").order("from_date", { ascending: false }),
        supabase.from("rice_types").select("*").order("name", { ascending: true }),
        supabase.from("purchase_items").select("*").order("created_at", { ascending: false }),
        supabase.from("purchase_batches").select("*").order("from_date", { ascending: false }),
        supabase.from("farmers").select("*").order("name", { ascending: true }),
        supabase.from("brokers").select("*").order("name", { ascending: true }),
      ]);

    const firstError =
      tripsResult.error ??
      boatsResult.error ??
      routesResult.error ??
      factoriesResult.error ??
      seasonsResult.error ??
      riceTypesResult.error ??
      purchaseItemsResult.error ??
      purchaseBatchesResult.error ??
      farmersResult.error ??
      brokersResult.error;

    if (firstError) {
      setError(firstError.message);
      setLoading(false);
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
        setError(stopsError.message);
        setLoading(false);
        return;
      }

      stopRows = stopsData ?? [];
    }

    const routeRowsWithStops = routeRows.map((route) => ({
      ...route,
      stops: stopRows.filter((stop) => stop.route_id === route.id),
    }));

    const boatRows = boatsResult.data ?? [];
    const factoryRows = factoriesResult.data ?? [];
    const seasonRows = seasonsResult.data ?? [];
    const riceTypeRows = riceTypesResult.data ?? [];
    const purchaseBatchRows = purchaseBatchesResult.data ?? [];
    const farmerRows = farmersResult.data ?? [];
    const brokerRows = brokersResult.data ?? [];
    const boatMap = new Map(boatRows.map((boat) => [boat.id, boat]));
    const routeMap = new Map(routeRowsWithStops.map((route) => [route.id, route]));
    const factoryMap = new Map(factoryRows.map((factory) => [factory.id, factory]));
    const seasonMap = new Map(seasonRows.map((season) => [season.id, season]));
    const riceTypeMap = new Map(riceTypeRows.map((riceType) => [riceType.id, riceType]));
    const purchaseBatchMap = new Map(purchaseBatchRows.map((batch) => [batch.id, batch]));
    const farmerMap = new Map(farmerRows.map((farmer) => [farmer.id, farmer]));
    const brokerMap = new Map(brokerRows.map((broker) => [broker.id, broker]));

    setBoats(boatRows);
    setRoutes(routeRowsWithStops);
    setFactories(factoryRows);
    setSeasons(seasonRows);
    setRiceTypes(riceTypeRows);
    setPurchaseItems(
      (purchaseItemsResult.data ?? []).map((item) => ({
        ...item,
        batch: purchaseBatchMap.get(item.purchase_batch_id) ?? null,
        farmer: farmerMap.get(item.farmer_id) ?? null,
        broker: brokerMap.get(item.broker_id) ?? null,
        riceType: riceTypeMap.get(item.rice_type_id) ?? null,
      })),
    );
    setItems(
      (tripsResult.data ?? []).map((trip) => ({
        ...trip,
        boat: boatMap.get(trip.transporter_boat_id) ?? null,
        route: routeMap.get(trip.route_id) ?? null,
        factory: trip.factory_id ? factoryMap.get(trip.factory_id) ?? null : null,
        season: trip.season_id ? seasonMap.get(trip.season_id) ?? null : null,
        riceType: riceTypeMap.get(trip.rice_type_id) ?? null,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  function startEdit(item: TripRow) {
    setEditingItem(item);
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
  }

  function clearForm() {
    setEditingItem(null);
    reset(emptyValues);
  }

  async function onSubmit(values: TripFormValues) {
    setSaving(true);
    setError(null);

    const nextCalculated = calculateTrip({
      loadedWeight: values.loaded_weight_kg,
      unloadedWeight: values.unloaded_weight_kg,
      priceBasis: values.transport_price_basis,
      transportPrice: values.transport_price,
      fuelFee: values.fuel_fee,
      laborFee: values.labor_fee,
      weighingFee: values.weighing_fee,
    });

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
      setError(result.error.message);
    } else {
      clearForm();
      await loadData();
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
      setError(deleteError.message);
    } else {
      if (editingItem?.id === item.id) clearForm();
      await loadData();
    }

    setDeletingId(null);
  }

  async function togglePurchaseItemAssignment(item: PurchaseItemAssignment) {
    if (!editingItem) return;

    setAssigningItemId(item.id);
    setError(null);

    const nextTripId = item.transport_trip_id === editingItem.id ? null : editingItem.id;
    const { error: assignmentError } = await supabase
      .from("purchase_items")
      .update({ transport_trip_id: nextTripId })
      .eq("id", item.id);

    if (assignmentError) {
      setError(assignmentError.message);
    } else {
      await loadData();
    }

    setAssigningItemId(null);
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Chuyến ghe</h1>
          <p>Theo dõi vận chuyển, hao hụt, chi phí và công nợ ghe theo mùa vụ.</p>
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
              <span>Kg lên ghe</span>
              <input
                type="number"
                min="0"
                step="0.01"
                {...register("loaded_weight_kg", { valueAsNumber: true })}
              />
              {errors.loaded_weight_kg ? <small>{errors.loaded_weight_kg.message}</small> : null}
            </label>
            <label className="field">
              <span>Kg xuống ghe</span>
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
                <span>Kg lên ghe</span>
                <strong>{formatNumber(watchedLoadedWeight)} kg</strong>
              </div>
              <div className="metric-card">
                <span>Chênh lệch</span>
                <strong>{formatNumber(assignedWeightDifference)} kg</strong>
              </div>
            </div>

            {assignedWeightDifference !== 0 ? (
              <div className="alert warning-alert">
                Khối lượng phiếu mua đã gán đang lệch với kg lên ghe. Bạn vẫn có thể lưu chuyến.
              </div>
            ) : null}

            {assignablePurchaseItems.length === 0 ? (
              <div className="state-box">Không có phiếu mua phù hợp để gán.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table extra-wide-table">
                  <thead>
                    <tr>
                      <th>Gán</th>
                      <th>Đợt mua</th>
                      <th>Nông dân</th>
                      <th>Cò lúa</th>
                      <th>Loại lúa</th>
                      <th>Kg</th>
                      <th>Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignablePurchaseItems.map((item) => {
                      const checked = item.transport_trip_id === editingItem.id;

                      return (
                        <tr key={item.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={assigningItemId === item.id}
                              onChange={() => void togglePurchaseItemAssignment(item)}
                              aria-label={checked ? "Bỏ gán phiếu mua" : "Gán phiếu mua"}
                            />
                          </td>
                          <td>{item.batch?.code || "-"}</td>
                          <td>{item.farmer?.name || "-"}</td>
                          <td>{item.broker?.name || "-"}</td>
                          <td>{item.riceType?.name || "-"}</td>
                          <td>{formatNumber(item.weight_kg)}</td>
                          <td>{formatMoney(item.total_amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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

          {error ? <div className="alert error-alert">{error}</div> : null}

          {loading ? (
            <div className="state-box">Đang tải chuyến ghe...</div>
          ) : filteredItems.length === 0 ? (
            <div className="state-box">Không có chuyến ghe phù hợp.</div>
          ) : (
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
                  {filteredItems.map((item) => (
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

function calculateTrip({
  loadedWeight,
  unloadedWeight,
  priceBasis,
  transportPrice,
  fuelFee,
  laborFee,
  weighingFee,
}: {
  loadedWeight: number;
  unloadedWeight: number;
  priceBasis: TransportPriceBasis;
  transportPrice: number;
  fuelFee: number;
  laborFee: number;
  weighingFee: number;
}) {
  const lossWeight = Math.max(loadedWeight - unloadedWeight, 0);
  const lossPercent = loadedWeight > 0 ? (lossWeight / loadedWeight) * 100 : 0;
  const transportCost =
    priceBasis === "loaded_weight"
      ? loadedWeight * transportPrice
      : priceBasis === "unloaded_weight"
        ? unloadedWeight * transportPrice
        : transportPrice;
  const totalCost = transportCost + fuelFee + laborFee + weighingFee;

  return {
    lossWeight: round2(lossWeight),
    lossPercent: round4(lossPercent),
    transportCost: round2(transportCost),
    totalCost: round2(totalCost),
  };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
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
