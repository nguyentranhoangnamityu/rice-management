import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, Eye, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { ModalShell } from "../../components/ui/ModalShell";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { useServerPagination } from "../../hooks/useServerPagination";
import { formatDbError } from "../../lib/db-errors";
import { supabase } from "../../lib/supabase";
import type { Database, Enums, Tables } from "../../types/database";

type Trip = Tables<"trips">;
type Season = Tables<"seasons">;
type RiceType = Tables<"rice_types">;
type TransporterBoat = Tables<"transporter_boats">;
type TransportRoute = Tables<"transport_routes">;
type Factory = Tables<"factories">;
type TripStatus = Enums<"trip_status">;
type TripSummary = Database["public"]["Views"]["trip_summaries"]["Row"];

type TripRow = Trip & {
  season?: Season | null;
  riceType?: RiceType | null;
  boat?: TransporterBoat | null;
  route?: TransportRoute | null;
  factory?: Factory | null;
  summary?: TripSummary | null;
};

const statusOptions: { value: TripStatus; label: string }[] = [
  { value: "draft", label: "Nháp" },
  { value: "purchasing", label: "Đang mua" },
  { value: "loaded_to_boat", label: "Đã xuống ghe" },
  { value: "drying", label: "Đang sấy" },
  { value: "milling", label: "Đang xay xát" },
  { value: "ready_to_sell", label: "Sẵn sàng bán" },
  { value: "selling", label: "Đang bán" },
  { value: "completed", label: "Hoàn tất" },
  { value: "cancelled", label: "Đã hủy" },
];

const tripSchema = z.object({
  code: z.string().trim().min(1, "Vui lòng nhập mã chuyến"),
  transporter_boat_id: z.string().min(1, "Vui lòng chọn ghe vận chuyển"),
});

type TripFormValues = z.infer<typeof tripSchema>;

const emptyTripValues: TripFormValues = {
  code: "",
  transporter_boat_id: "",
};

export function TripsPage() {
  const navigate = useNavigate();
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
  } = useServerPagination<Trip>("trips");

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [riceTypes, setRiceTypes] = useState<RiceType[]>([]);
  const [boats, setBoats] = useState<TransporterBoat[]>([]);
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [summaries, setSummaries] = useState<TripSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TripFormValues>({
    resolver: zodResolver(tripSchema),
    defaultValues: emptyTripValues,
  });

  const seasonMap = useMemo(() => new Map(seasons.map((season) => [season.id, season])), [seasons]);
  const riceTypeMap = useMemo(() => new Map(riceTypes.map((riceType) => [riceType.id, riceType])), [riceTypes]);
  const boatMap = useMemo(() => new Map(boats.map((boat) => [boat.id, boat])), [boats]);
  const routeMap = useMemo(() => new Map(routes.map((route) => [route.id, route])), [routes]);
  const factoryMap = useMemo(() => new Map(factories.map((factory) => [factory.id, factory])), [factories]);
  const summaryMap = useMemo(() => new Map(summaries.map((summary) => [summary.trip_id, summary])), [summaries]);

  const items = useMemo<TripRow[]>(
    () =>
      tripRows.map((trip) => ({
        ...trip,
        season: trip.season_id ? seasonMap.get(trip.season_id) ?? null : null,
        riceType: trip.rice_type_id ? riceTypeMap.get(trip.rice_type_id) ?? null : null,
        boat: trip.transporter_boat_id ? boatMap.get(trip.transporter_boat_id) ?? null : null,
        route: trip.route_id ? routeMap.get(trip.route_id) ?? null : null,
        factory: trip.factory_id ? factoryMap.get(trip.factory_id) ?? null : null,
        summary: summaryMap.get(trip.id) ?? null,
      })),
    [tripRows, seasonMap, riceTypeMap, boatMap, routeMap, factoryMap, summaryMap],
  );

  async function loadStaticReferenceData() {
    setError(null);
    const [seasonsResult, riceTypesResult, boatsResult, routesResult, factoriesResult] =
      await Promise.all([
        supabase.from("seasons").select("*").order("from_date", { ascending: false }),
        supabase.from("rice_types").select("*").order("name", { ascending: true }),
        supabase.from("transporter_boats").select("*").order("boat_name", { ascending: true }),
        supabase.from("transport_routes").select("*").order("name", { ascending: true }),
        supabase.from("factories").select("*").order("name", { ascending: true }),
      ]);

    const firstError =
      seasonsResult.error ??
      riceTypesResult.error ??
      boatsResult.error ??
      routesResult.error ??
      factoriesResult.error;

    if (firstError) {
      setError(formatDbError(firstError));
      return;
    }

    setSeasons(seasonsResult.data ?? []);
    setRiceTypes(riceTypesResult.data ?? []);
    setBoats(boatsResult.data ?? []);
    setRoutes(routesResult.data ?? []);
    setFactories(factoriesResult.data ?? []);
  }

  async function loadSummaries() {
    const { data, error: summariesError } = await supabase.from("trip_summaries").select("*");
    if (summariesError) {
      setError(formatDbError(summariesError));
      return;
    }
    setSummaries(data ?? []);
  }

  useEffect(() => {
    void loadStaticReferenceData();
    void loadSummaries();
  }, []);

  async function startCreate() {
    setError(null);
    const today = new Date();
    const todayStr = today.getFullYear() +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");

    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const { count } = await supabase
        .from("trips")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart.toISOString())
        .lte("created_at", todayEnd.toISOString());

      const seq = String((count ?? 0) + 1).padStart(2, "0");
      const suggestedCode = `CH-${todayStr}-${seq}`;

      reset({
        code: suggestedCode,
        transporter_boat_id: "",
      });
    } catch (e) {
      const rand = Math.floor(10 + Math.random() * 90);
      reset({
        code: `CH-${todayStr}-${rand}`,
        transporter_boat_id: "",
      });
    }

    setFormOpen(true);
  }

  function startEdit(item: TripRow) {
    navigate(`/trips/${item.id}`);
  }

  async function onSubmit(values: TripFormValues) {
    setSaving(true);
    setError(null);

    const payload = {
      code: values.code,
      status: "draft" as const,
      transporter_boat_id: values.transporter_boat_id,
      start_date: new Date().toISOString().split("T")[0],
      loaded_weight_kg: 0,
      unloaded_weight_kg: 0,
      loss_weight_kg: 0,
      loss_percent: 0,
      estimated_revenue: 0,
    };

    const result = await supabase.from("trips").insert(payload).select("*").single();

    if (result.error) {
      setError(formatDbError(result.error));
      setSaving(false);
    } else {
      const savedTrip = result.data;
      setFormOpen(false);
      reset(emptyTripValues);
      setSaving(false);
      navigate(`/trips/${savedTrip.id}`);
    }
  }

  async function deleteItem(item: TripRow) {
    const confirmed = window.confirm(`Xóa chuyến hàng "${item.code}"?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    const { error: deleteError } = await supabase.from("trips").delete().eq("id", item.id);

    if (deleteError) {
      setError(formatDbError(deleteError));
    } else {
      await refresh(page);
      await loadSummaries();
    }

    setDeletingId(null);
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Chuyến hàng</h1>
          <p>Quản lý chuyến hàng tổng quát, phiếu mua trong chuyến, chi phí phát sinh và giá vốn tạm tính.</p>
        </div>
        <div className="header-actions">
          <button className="primary-button" type="button" onClick={startCreate}>
            <Plus size={18} aria-hidden="true" />
            Thêm chuyến hàng
          </button>
        </div>
      </header>

      <div className="crud-grid modal-crud-grid">
        {formOpen ? (
          <ModalShell onClose={() => setFormOpen(false)}>
            <div className="trip-modal-wrapper" style={{ padding: "8px" }}>
              <div className="card-title-row" style={{ marginBottom: "20px" }}>
                <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "bold", color: "var(--text-main)" }}>
                  Tạo chuyến hàng mới
                </h2>
              </div>

              {error ? <div className="alert error-alert" style={{ marginBottom: "16px" }}>{error}</div> : null}

              <form className="form-card" onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: "16px", border: "none", padding: 0, background: "transparent", boxShadow: "none" }}>
                <label className="field">
                  <span style={{ fontWeight: "600", fontSize: "14px", marginBottom: "6px", display: "block" }}>
                    Mã chuyến hàng <span className="text-danger">*</span>
                  </span>
                  <input
                    {...register("code")}
                    placeholder="VD: CH-20260520-01"
                    style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)", fontSize: "15px" }}
                  />
                  {errors.code ? <small className="text-danger" style={{ marginTop: "4px", display: "block" }}>{errors.code.message}</small> : null}
                </label>

                <label className="field">
                  <span style={{ fontWeight: "600", fontSize: "14px", marginBottom: "6px", display: "block" }}>
                    Ghe vận chuyển <span className="text-danger">*</span>
                  </span>
                  <select
                    {...register("transporter_boat_id")}
                    style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)", fontSize: "15px", background: "var(--bg-main)" }}
                  >
                    <option value="">-- Chọn ghe vận chuyển --</option>
                    {boats.map((boat) => (
                      <option key={boat.id} value={boat.id}>
                        {boat.boat_name} {boat.owner_name ? `(${boat.owner_name})` : ""}
                      </option>
                    ))}
                  </select>
                  {errors.transporter_boat_id ? <small className="text-danger" style={{ marginTop: "4px", display: "block" }}>{errors.transporter_boat_id.message}</small> : null}
                </label>

                <div className="row-actions" style={{ marginTop: "12px", display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                  <button className="secondary-button" type="button" onClick={() => setFormOpen(false)} style={{ padding: "10px 18px", borderRadius: "8px", fontSize: "14px" }}>
                    Hủy bỏ
                  </button>
                  <button className="primary-button" type="submit" disabled={saving} style={{ padding: "10px 20px", borderRadius: "8px", fontSize: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                    {saving ? "Đang tạo..." : "Tạo chuyến hàng"}
                  </button>
                </div>
              </form>
            </div>
          </ModalShell>
        ) : null}

        <div className="table-card">
          <div className="table-toolbar">
            <label className="search-field">
              <Search size={18} aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo mã chuyến hoặc ghi chú"
              />
            </label>
          </div>

          {listError ? <div className="alert error-alert">{listError}</div> : null}

          {loading ? (
            <div className="state-box">Đang tải chuyến hàng...</div>
          ) : items.length === 0 ? (
            <div className="state-box">Không có chuyến hàng phù hợp.</div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="data-table extra-wide-table">
                  <thead>
                    <tr>
                      <th>Mã</th>
                      <th>Trạng thái</th>
                      <th>Ngày bắt đầu</th>
                      <th>Ghe</th>
                      <th>Mùa vụ</th>
                      <th>Loại lúa</th>
                      <th>Hao hụt</th>
                      <th>Kg mua</th>
                      <th>Giá vốn tạm</th>
                      <th>Giá vốn/kg</th>
                      <th>Lãi/lỗ tạm</th>
                      <th aria-label="Thao tác" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <Link to={`/trips/${item.id}`} style={{ fontWeight: "700", color: "var(--primary)" }}>
                            {item.code}
                          </Link>
                        </td>
                        <td>{formatTripStatus(item.status)}</td>
                        <td>{item.start_date ? formatDate(item.start_date) : "-"}</td>
                        <td>{item.boat?.boat_name || "-"}</td>
                        <td>{item.season?.name || "-"}</td>
                        <td>{item.riceType?.name || "-"}</td>
                        <td>
                          <div>{formatNumber(item.loss_weight_kg ?? 0)} kg</div>
                          <span className="muted-text">{formatNumber(item.loss_percent ?? 0)}%</span>
                        </td>
                        <td>{formatNumber(item.summary?.total_purchase_kg ?? 0)}</td>
                        <td>{formatMoney(item.summary?.temporary_total_cost ?? 0)}</td>
                        <td>{formatNullableMoney(item.summary?.temporary_cost_per_kg)}</td>
                        <td>{formatMoney(item.summary?.temporary_profit ?? 0)}</td>
                        <td>
                          <div className="row-actions">
                            <Link to={`/trips/${item.id}`} className="icon-button" aria-label="Xem chi tiết" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                              <Eye size={17} aria-hidden="true" />
                            </Link>
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

function formatTripStatus(value: TripStatus) {
  return statusOptions.find((option) => option.value === value)?.label ?? value;
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

function formatNullableMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return formatMoney(value);
}
