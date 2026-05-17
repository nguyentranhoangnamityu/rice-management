import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ModalShell } from "../../components/ui/ModalShell";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { useServerPagination } from "../../hooks/useServerPagination";
import { supabase } from "../../lib/supabase";
import type { Tables } from "../../types/database";
import { formatDbError } from "../../lib/db-errors";

type RiceType = Tables<"rice_types">;

const riceTypeSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên loại lúa"),
  note: z.string().trim().optional(),
});

type RiceTypeFormValues = z.infer<typeof riceTypeSchema>;

const emptyValues: RiceTypeFormValues = {
  name: "",
  note: "",
};

export function RiceTypesPage() {
  const {
    items,
    page,
    setPage,
    total,
    totalPages,
    search,
    setSearch,
    loading,
    error: listError,
    refresh,
  } = useServerPagination<RiceType>("rice_types");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<RiceType | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RiceTypeFormValues>({
    resolver: zodResolver(riceTypeSchema),
    defaultValues: emptyValues,
  });

  const formTitle = useMemo(
    () => (editingItem ? "Sửa loại lúa" : "Thêm loại lúa"),
    [editingItem],
  );

  function startEdit(item: RiceType) {
    setEditingItem(item);
    reset({
      name: item.name,
      note: item.note ?? "",
    });
    setFormOpen(true);
  }

  function clearForm() {
    setEditingItem(null);
    reset(emptyValues);
    setFormOpen(false);
  }

  async function onSubmit(values: RiceTypeFormValues) {
    setSaving(true);
    setError(null);

    const payload = {
      name: values.name,
      note: values.note || null,
    };

    const result = editingItem
      ? await supabase.from("rice_types").update(payload).eq("id", editingItem.id)
      : await supabase.from("rice_types").insert(payload);

    if (result.error) {
      setError(formatDbError(result.error));
    } else {
      clearForm();
      await refresh(editingItem ? page : 1);
    }

    setSaving(false);
  }

  async function deleteItem(item: RiceType) {
    const confirmed = window.confirm(`Xóa loại lúa "${item.name}"?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    const { error: deleteError } = await supabase
      .from("rice_types")
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
          <h1>Loại lúa</h1>
          <p>Quản lý danh mục loại lúa dùng trong phiếu mua, vận chuyển và xử lý.</p>
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
            Thêm loại lúa
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
            <span>Tên loại lúa</span>
            <input {...register("name")} placeholder="VD: OM 5451" />
            {errors.name ? <small>{errors.name.message}</small> : null}
          </label>

          <label className="field">
            <span>Ghi chú</span>
            <textarea {...register("note")} rows={4} placeholder="Thông tin thêm nếu cần" />
          </label>

          <button className="primary-button" type="submit" disabled={saving}>
            <Plus size={18} aria-hidden="true" />
            {saving ? "Đang lưu..." : editingItem ? "Lưu thay đổi" : "Thêm loại lúa"}
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
                placeholder="Tìm theo tên, ghi chú"
              />
            </label>
          </div>

          {error || listError ? <div className="alert error-alert">{error ?? listError}</div> : null}

          {loading ? (
            <div className="state-box">Đang tải loại lúa...</div>
          ) : items.length === 0 ? (
            <div className="state-box">Không có loại lúa phù hợp.</div>
          ) : (
            <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tên</th>
                    <th>Ghi chú</th>
                    <th>Cập nhật</th>
                    <th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.note || "-"}</td>
                      <td>{formatDateTime(item.updated_at)}</td>
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
