import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ModalShell } from "../../components/ui/ModalShell";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { useServerPagination } from "../../hooks/useServerPagination";
import { supabase } from "../../lib/supabase";
import type { Tables } from "../../types/database";
import { formatDbError } from "../../lib/db-errors";

type Season = Tables<"seasons">;

const seasonSchema = z
  .object({
    name: z.string().trim().min(1, "Vui lòng nhập tên mùa vụ"),
    from_date: z.string().optional(),
    to_date: z.string().optional(),
    note: z.string().trim().optional(),
  })
  .refine(
    (value) => {
      if (!value.from_date || !value.to_date) return true;
      return value.to_date >= value.from_date;
    },
    {
      message: "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu",
      path: ["to_date"],
    },
  );

type SeasonFormValues = z.infer<typeof seasonSchema>;

const emptyValues: SeasonFormValues = {
  name: "",
  from_date: "",
  to_date: "",
  note: "",
};

export function SeasonsPage() {
  const {
    items,
    page,
    setPage,
    total,
    totalPages,
    loading,
    error: listError,
    refresh,
  } = useServerPagination<Season>("seasons");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Season | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SeasonFormValues>({
    resolver: zodResolver(seasonSchema),
    defaultValues: emptyValues,
  });

  const formTitle = useMemo(
    () => (editingItem ? "Sửa mùa vụ" : "Thêm mùa vụ"),
    [editingItem],
  );

  function startEdit(item: Season) {
    setEditingItem(item);
    reset({
      name: item.name,
      from_date: item.from_date ?? "",
      to_date: item.to_date ?? "",
      note: item.note ?? "",
    });
    setFormOpen(true);
  }

  function clearForm() {
    setEditingItem(null);
    reset(emptyValues);
    setFormOpen(false);
  }

  async function onSubmit(values: SeasonFormValues) {
    setSaving(true);
    setError(null);

    const payload = {
      name: values.name,
      from_date: values.from_date || null,
      to_date: values.to_date || null,
      note: values.note || null,
    };

    const result = editingItem
      ? await supabase.from("seasons").update(payload).eq("id", editingItem.id)
      : await supabase.from("seasons").insert(payload);

    if (result.error) {
      setError(formatDbError(result.error));
    } else {
      clearForm();
      await refresh(editingItem ? page : 1);
    }

    setSaving(false);
  }

  async function deleteItem(item: Season) {
    const confirmed = window.confirm(`Xóa mùa vụ "${item.name}"?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    const { error: deleteError } = await supabase
      .from("seasons")
      .delete()
      .eq("id", item.id);

    if (deleteError) {
      setError(formatDbError(deleteError));
    } else {
      if (editingItem?.id === item.id) {
        clearForm();
      }
      await refresh(page);
    }

    setDeletingId(null);
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Mùa vụ</h1>
          <p>Quản lý các mùa vụ để gom phiếu mua, bảng giá xử lý và công nợ.</p>
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
            Thêm mùa vụ
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
            <span>Tên mùa vụ</span>
            <input {...register("name")} placeholder="VD: Đông Xuân 2026" />
            {errors.name ? <small>{errors.name.message}</small> : null}
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Từ ngày</span>
              <input type="date" {...register("from_date")} />
            </label>

            <label className="field">
              <span>Đến ngày</span>
              <input type="date" {...register("to_date")} />
              {errors.to_date ? <small>{errors.to_date.message}</small> : null}
            </label>
          </div>

          <label className="field">
            <span>Ghi chú</span>
            <textarea {...register("note")} rows={4} placeholder="Thông tin thêm nếu cần" />
          </label>

          <button className="primary-button" type="submit" disabled={saving}>
            <Plus size={18} aria-hidden="true" />
            {saving ? "Đang lưu..." : editingItem ? "Lưu thay đổi" : "Thêm mùa vụ"}
          </button>
            </form>
          </ModalShell>
        ) : null}

        <div className="table-card">
          {error || listError ? <div className="alert error-alert">{error ?? listError}</div> : null}

          {loading ? (
            <div className="state-box">Đang tải mùa vụ...</div>
          ) : items.length === 0 ? (
            <div className="state-box">Chưa có mùa vụ.</div>
          ) : (
            <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tên</th>
                    <th>Thời gian</th>
                    <th>Ghi chú</th>
                    <th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{formatDateRange(item.from_date, item.to_date)}</td>
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

function formatDateRange(fromDate: string | null, toDate: string | null) {
  if (!fromDate && !toDate) return "-";
  if (fromDate && !toDate) return `Từ ${formatDate(fromDate)}`;
  if (!fromDate && toDate) return `Đến ${formatDate(toDate)}`;
  return `${formatDate(fromDate)} - ${formatDate(toDate)}`;
}

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(
    new Date(`${value}T00:00:00`),
  );
}
