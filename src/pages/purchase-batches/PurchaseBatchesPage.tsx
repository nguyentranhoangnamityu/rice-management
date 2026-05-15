import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, Eye, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { ModalShell } from "../../components/ui/ModalShell";
import { supabase } from "../../lib/supabase";
import type { Tables } from "../../types/database";

type PurchaseBatch = Tables<"purchase_batches">;
type Season = Tables<"seasons">;

type BatchRow = PurchaseBatch & {
  season?: Season | null;
};

const batchSchema = z
  .object({
    code: z.string().trim().min(1, "Vui lòng nhập mã đợt mua"),
    season_id: z.string().optional(),
    from_date: z.string().min(1, "Vui lòng chọn ngày bắt đầu"),
    to_date: z.string().min(1, "Vui lòng chọn ngày kết thúc"),
    note: z.string().trim().optional(),
  })
  .refine((value) => value.to_date >= value.from_date, {
    message: "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu",
    path: ["to_date"],
  });

type BatchFormValues = z.infer<typeof batchSchema>;

const emptyValues: BatchFormValues = {
  code: "",
  season_id: "",
  from_date: "",
  to_date: "",
  note: "",
};

export function PurchaseBatchesPage() {
  const [items, setItems] = useState<BatchRow[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<BatchRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BatchFormValues>({
    resolver: zodResolver(batchSchema),
    defaultValues: emptyValues,
  });

  const filteredItems = useMemo(() => {
    const keyword = normalize(search);
    if (!keyword) return items;

    return items.filter((item) =>
      [item.code, item.season?.name, item.note].some((value) =>
        normalize(value).includes(keyword),
      ),
    );
  }, [items, search]);

  const formTitle = editingItem ? "Sửa đợt mua" : "Thêm đợt mua";

  async function loadData() {
    setLoading(true);
    setError(null);

    const [{ data: seasonRows, error: seasonsError }, { data: batchRows, error: batchesError }] =
      await Promise.all([
        supabase.from("seasons").select("*").order("from_date", { ascending: false }),
        supabase.from("purchase_batches").select("*").order("from_date", { ascending: false }),
      ]);

    if (seasonsError || batchesError) {
      setError(seasonsError?.message ?? batchesError?.message ?? "Không thể tải đợt mua.");
      setLoading(false);
      return;
    }

    const seasonMap = new Map((seasonRows ?? []).map((season) => [season.id, season]));
    setSeasons(seasonRows ?? []);
    setItems(
      (batchRows ?? []).map((batch) => ({
        ...batch,
        season: batch.season_id ? seasonMap.get(batch.season_id) ?? null : null,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  function startEdit(item: BatchRow) {
    setEditingItem(item);
    reset({
      code: item.code,
      season_id: item.season_id ?? "",
      from_date: item.from_date,
      to_date: item.to_date,
      note: item.note ?? "",
    });
    setFormOpen(true);
  }

  function clearForm() {
    setEditingItem(null);
    reset(emptyValues);
    setFormOpen(false);
  }

  async function onSubmit(values: BatchFormValues) {
    setSaving(true);
    setError(null);

    const payload = {
      code: values.code,
      season_id: values.season_id || null,
      from_date: values.from_date,
      to_date: values.to_date,
      note: toNullable(values.note),
    };

    const result = editingItem
      ? await supabase.from("purchase_batches").update(payload).eq("id", editingItem.id)
      : await supabase.from("purchase_batches").insert(payload);

    if (result.error) {
      setError(result.error.message);
    } else {
      clearForm();
      await loadData();
    }

    setSaving(false);
  }

  async function deleteItem(item: BatchRow) {
    const confirmed = window.confirm(`Xóa đợt mua "${item.code}"?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    const { error: deleteError } = await supabase
      .from("purchase_batches")
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

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Đợt mua</h1>
          <p>Quản lý các đợt mua theo mùa vụ và khoảng ngày.</p>
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
            Thêm đợt mua
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
            <span>Mã đợt mua</span>
            <input {...register("code")} placeholder="VD: DM-2026-001" />
            {errors.code ? <small>{errors.code.message}</small> : null}
          </label>

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

          <div className="field-grid">
            <label className="field">
              <span>Từ ngày</span>
              <input type="date" {...register("from_date")} />
              {errors.from_date ? <small>{errors.from_date.message}</small> : null}
            </label>
            <label className="field">
              <span>Đến ngày</span>
              <input type="date" {...register("to_date")} />
              {errors.to_date ? <small>{errors.to_date.message}</small> : null}
            </label>
          </div>

          <label className="field">
            <span>Ghi chú</span>
            <textarea {...register("note")} rows={3} placeholder="Thông tin thêm nếu cần" />
          </label>

          <button className="primary-button" type="submit" disabled={saving}>
            <Plus size={18} aria-hidden="true" />
            {saving ? "Đang lưu..." : editingItem ? "Lưu thay đổi" : "Thêm đợt mua"}
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
                placeholder="Tìm theo mã, mùa vụ, ghi chú"
              />
            </label>
          </div>

          {error ? <div className="alert error-alert">{error}</div> : null}

          {loading ? (
            <div className="state-box">Đang tải đợt mua...</div>
          ) : filteredItems.length === 0 ? (
            <div className="state-box">Không có đợt mua phù hợp.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table wide-table">
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Mùa vụ</th>
                    <th>Thời gian</th>
                    <th>Ghi chú</th>
                    <th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.code}</td>
                      <td>{item.season?.name || "-"}</td>
                      <td>{formatDateRange(item.from_date, item.to_date)}</td>
                      <td>{item.note || "-"}</td>
                      <td>
                        <div className="row-actions">
                          <Link className="icon-button" to={`/purchase-batches/${item.id}`} aria-label="Xem chi tiết">
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
          )}
        </div>
      </div>
    </section>
  );
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
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
