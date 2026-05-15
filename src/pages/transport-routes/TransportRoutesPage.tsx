import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { ModalShell } from "../../components/ui/ModalShell";
import { supabase } from "../../lib/supabase";
import type { Tables } from "../../types/database";

type TransportRoute = Tables<"transport_routes">;
type TransportRouteStop = Tables<"transport_route_stops">;

type RouteWithStops = TransportRoute & {
  stops: TransportRouteStop[];
};

const routeSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên tuyến"),
  note: z.string().trim().optional(),
  stops: z
    .array(
      z.object({
        location_name: z.string().trim().min(1, "Vui lòng nhập điểm dừng"),
        note: z.string().trim().optional(),
      }),
    )
    .min(1, "Vui lòng thêm ít nhất một điểm dừng"),
});

type RouteFormValues = z.infer<typeof routeSchema>;

const emptyValues: RouteFormValues = {
  name: "",
  note: "",
  stops: [{ location_name: "", note: "" }],
};

export function TransportRoutesPage() {
  const [items, setItems] = useState<RouteWithStops[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<RouteWithStops | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RouteFormValues>({
    resolver: zodResolver(routeSchema),
    defaultValues: emptyValues,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "stops",
  });

  const filteredItems = useMemo(() => {
    const keyword = normalize(search);
    if (!keyword) return items;

    return items.filter((item) =>
      [item.name, item.note, ...item.stops.map((stop) => stop.location_name)].some((value) =>
        normalize(value).includes(keyword),
      ),
    );
  }, [items, search]);

  const formTitle = editingItem ? "Sửa tuyến vận chuyển" : "Thêm tuyến vận chuyển";

  async function loadRoutes() {
    setLoading(true);
    setError(null);

    const { data: routes, error: routesError } = await supabase
      .from("transport_routes")
      .select("*")
      .order("name", { ascending: true });

    if (routesError) {
      setError(routesError.message);
      setLoading(false);
      return;
    }

    const routeIds = (routes ?? []).map((route) => route.id);

    const { data: stops, error: stopsError } = routeIds.length
      ? await supabase
          .from("transport_route_stops")
          .select("*")
          .in("route_id", routeIds)
          .order("stop_order", { ascending: true })
      : { data: [], error: null };

    if (stopsError) {
      setError(stopsError.message);
      setLoading(false);
      return;
    }

    setItems(
      (routes ?? []).map((route) => ({
        ...route,
        stops: (stops ?? []).filter((stop) => stop.route_id === route.id),
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    void loadRoutes();
  }, []);

  function startEdit(item: RouteWithStops) {
    setEditingItem(item);
    reset({
      name: item.name,
      note: item.note ?? "",
      stops:
        item.stops.length > 0
          ? item.stops.map((stop) => ({
              location_name: stop.location_name,
              note: stop.note ?? "",
            }))
          : [{ location_name: "", note: "" }],
    });
    setFormOpen(true);
  }

  function clearForm() {
    setEditingItem(null);
    reset(emptyValues);
    setFormOpen(false);
  }

  async function onSubmit(values: RouteFormValues) {
    setSaving(true);
    setError(null);

    const routePayload = {
      name: values.name,
      note: toNullable(values.note),
    };

    const { data: savedRoute, error: routeError } = editingItem
      ? await supabase
          .from("transport_routes")
          .update(routePayload)
          .eq("id", editingItem.id)
          .select("id")
          .single()
      : await supabase.from("transport_routes").insert(routePayload).select("id").single();

    if (routeError || !savedRoute) {
      setError(routeError?.message ?? "Không thể lưu tuyến vận chuyển.");
      setSaving(false);
      return;
    }

    const routeId = savedRoute.id;

    if (editingItem) {
      const { error: deleteStopsError } = await supabase
        .from("transport_route_stops")
        .delete()
        .eq("route_id", routeId);

      if (deleteStopsError) {
        setError(deleteStopsError.message);
        setSaving(false);
        return;
      }
    }

    const stopsPayload = values.stops.map((stop, index) => ({
      route_id: routeId,
      stop_order: index + 1,
      location_name: stop.location_name,
      note: toNullable(stop.note),
    }));

    const { error: stopsError } = await supabase
      .from("transport_route_stops")
      .insert(stopsPayload);

    if (stopsError) {
      setError(stopsError.message);
    } else {
      clearForm();
      await loadRoutes();
    }

    setSaving(false);
  }

  async function deleteItem(item: RouteWithStops) {
    const confirmed = window.confirm(`Xóa tuyến "${item.name}"?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    const { error: deleteError } = await supabase
      .from("transport_routes")
      .delete()
      .eq("id", item.id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      if (editingItem?.id === item.id) clearForm();
      await loadRoutes();
    }

    setDeletingId(null);
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Tuyến vận chuyển</h1>
          <p>Quản lý tuyến và các điểm dừng theo thứ tự di chuyển.</p>
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
            Thêm tuyến
          </button>
        </div>
      </header>

      <div className="crud-grid modal-crud-grid">
        {formOpen ? (
          <ModalShell onClose={clearForm}>
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
            <span>Tên tuyến</span>
            <input {...register("name")} placeholder="VD: Ruộng - Chành Đức" />
            {errors.name ? <small>{errors.name.message}</small> : null}
          </label>

          <label className="field">
            <span>Ghi chú tuyến</span>
            <textarea {...register("note")} rows={3} placeholder="Thông tin thêm nếu cần" />
          </label>

          <div className="stops-editor">
            <div className="card-title-row">
              <h3>Điểm dừng</h3>
              <button
                className="secondary-button"
                type="button"
                onClick={() => append({ location_name: "", note: "" })}
              >
                <Plus size={17} aria-hidden="true" />
                Thêm điểm
              </button>
            </div>

            {typeof errors.stops?.message === "string" ? (
              <small className="form-error">{errors.stops.message}</small>
            ) : null}

            <div className="stop-list">
              {fields.map((field, index) => (
                <div className="stop-item" key={field.id}>
                  <div className="stop-order">{index + 1}</div>
                  <div className="stop-fields">
                    <label className="field">
                      <span>Tên điểm dừng</span>
                      <input
                        {...register(`stops.${index}.location_name`)}
                        placeholder="VD: Ruộng ông A"
                      />
                      {errors.stops?.[index]?.location_name ? (
                        <small>{errors.stops[index]?.location_name?.message}</small>
                      ) : null}
                    </label>
                    <label className="field">
                      <span>Ghi chú</span>
                      <input {...register(`stops.${index}.note`)} placeholder="Tùy chọn" />
                    </label>
                  </div>
                  <button
                    className="icon-button danger"
                    type="button"
                    onClick={() => remove(index)}
                    disabled={fields.length === 1}
                    aria-label="Xóa điểm dừng"
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button className="primary-button" type="submit" disabled={saving}>
            <Plus size={18} aria-hidden="true" />
            {saving ? "Đang lưu..." : editingItem ? "Lưu thay đổi" : "Thêm tuyến"}
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
                placeholder="Tìm theo tên tuyến hoặc điểm dừng"
              />
            </label>
          </div>

          {error ? <div className="alert error-alert">{error}</div> : null}

          {loading ? (
            <div className="state-box">Đang tải tuyến vận chuyển...</div>
          ) : filteredItems.length === 0 ? (
            <div className="state-box">Không có tuyến vận chuyển phù hợp.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table wide-table">
                <thead>
                  <tr>
                    <th>Tên tuyến</th>
                    <th>Lộ trình</th>
                    <th>Ghi chú</th>
                    <th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{formatRoutePath(item.stops)}</td>
                      <td>{item.note || "-"}</td>
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

function formatRoutePath(stops: TransportRouteStop[]) {
  if (stops.length === 0) return "-";
  return stops
    .slice()
    .sort((a, b) => a.stop_order - b.stop_order)
    .map((stop) => stop.location_name)
    .join(" → ");
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toNullable(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
