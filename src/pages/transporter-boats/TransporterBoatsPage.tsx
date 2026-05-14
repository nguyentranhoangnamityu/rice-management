import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import type { Tables } from "../../types/database";

type TransporterBoat = Tables<"transporter_boats">;

const transporterBoatSchema = z.object({
  boat_name: z.string().trim().min(1, "Vui lòng nhập tên ghe"),
  owner_name: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  citizen_id: z.string().trim().optional(),
  bank_name: z.string().trim().optional(),
  bank_account_number: z.string().trim().optional(),
  bank_account_name: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

type TransporterBoatFormValues = z.infer<typeof transporterBoatSchema>;

const emptyValues: TransporterBoatFormValues = {
  boat_name: "",
  owner_name: "",
  phone: "",
  citizen_id: "",
  bank_name: "",
  bank_account_number: "",
  bank_account_name: "",
  note: "",
};

export function TransporterBoatsPage() {
  const [items, setItems] = useState<TransporterBoat[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<TransporterBoat | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TransporterBoatFormValues>({
    resolver: zodResolver(transporterBoatSchema),
    defaultValues: emptyValues,
  });

  const filteredItems = useMemo(() => {
    const keyword = normalize(search);
    if (!keyword) return items;

    return items.filter((item) =>
      [item.boat_name, item.owner_name, item.phone, item.citizen_id].some((value) =>
        normalize(value).includes(keyword),
      ),
    );
  }, [items, search]);

  const formTitle = editingItem ? "Sửa ghe vận chuyển" : "Thêm ghe vận chuyển";

  async function loadTransporterBoats() {
    setLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from("transporter_boats")
      .select("*")
      .order("boat_name", { ascending: true });

    if (loadError) {
      setError(loadError.message);
    } else {
      setItems(data ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadTransporterBoats();
  }, []);

  function startEdit(item: TransporterBoat) {
    setEditingItem(item);
    reset({
      boat_name: item.boat_name,
      owner_name: item.owner_name ?? "",
      phone: item.phone ?? "",
      citizen_id: item.citizen_id ?? "",
      bank_name: item.bank_name ?? "",
      bank_account_number: item.bank_account_number ?? "",
      bank_account_name: item.bank_account_name ?? "",
      note: item.note ?? "",
    });
  }

  function clearForm() {
    setEditingItem(null);
    reset(emptyValues);
  }

  async function onSubmit(values: TransporterBoatFormValues) {
    setSaving(true);
    setError(null);

    const payload = {
      boat_name: values.boat_name,
      owner_name: toNullable(values.owner_name),
      phone: toNullable(values.phone),
      citizen_id: toNullable(values.citizen_id),
      bank_name: toNullable(values.bank_name),
      bank_account_number: toNullable(values.bank_account_number),
      bank_account_name: toNullable(values.bank_account_name),
      note: toNullable(values.note),
    };

    const result = editingItem
      ? await supabase.from("transporter_boats").update(payload).eq("id", editingItem.id)
      : await supabase.from("transporter_boats").insert(payload);

    if (result.error) {
      setError(result.error.message);
    } else {
      clearForm();
      await loadTransporterBoats();
    }

    setSaving(false);
  }

  async function deleteItem(item: TransporterBoat) {
    const confirmed = window.confirm(`Xóa ghe "${item.boat_name}"?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    const { error: deleteError } = await supabase
      .from("transporter_boats")
      .delete()
      .eq("id", item.id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      if (editingItem?.id === item.id) clearForm();
      await loadTransporterBoats();
    }

    setDeletingId(null);
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Ghe vận chuyển</h1>
          <p>Quản lý ghe, chủ ghe, CCCD và tài khoản ngân hàng cho vận chuyển.</p>
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
            <span>Tên ghe</span>
            <input {...register("boat_name")} placeholder="VD: Ghe Ba Tấn" />
            {errors.boat_name ? <small>{errors.boat_name.message}</small> : null}
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Chủ ghe</span>
              <input {...register("owner_name")} placeholder="Tên chủ ghe" />
            </label>
            <label className="field">
              <span>Số điện thoại</span>
              <input {...register("phone")} inputMode="tel" placeholder="VD: 090..." />
            </label>
          </div>

          <label className="field">
            <span>CCCD</span>
            <input {...register("citizen_id")} inputMode="numeric" placeholder="Số CCCD" />
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Ngân hàng</span>
              <input {...register("bank_name")} placeholder="VD: Agribank" />
            </label>
            <label className="field">
              <span>Số tài khoản</span>
              <input {...register("bank_account_number")} inputMode="numeric" />
            </label>
          </div>

          <label className="field">
            <span>Tên tài khoản</span>
            <input {...register("bank_account_name")} placeholder="Tên trên tài khoản ngân hàng" />
          </label>

          <label className="field">
            <span>Ghi chú</span>
            <textarea {...register("note")} rows={3} placeholder="Thông tin thêm nếu cần" />
          </label>

          <button className="primary-button" type="submit" disabled={saving}>
            <Plus size={18} aria-hidden="true" />
            {saving ? "Đang lưu..." : editingItem ? "Lưu thay đổi" : "Thêm ghe"}
          </button>
        </form>

        <div className="table-card">
          <div className="table-toolbar">
            <label className="search-field">
              <Search size={17} aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo tên ghe, chủ ghe, điện thoại, CCCD"
              />
            </label>
          </div>

          {error ? <div className="alert error-alert">{error}</div> : null}

          {loading ? (
            <div className="state-box">Đang tải ghe vận chuyển...</div>
          ) : filteredItems.length === 0 ? (
            <div className="state-box">Không có ghe phù hợp.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table wide-table">
                <thead>
                  <tr>
                    <th>Tên ghe</th>
                    <th>Chủ ghe</th>
                    <th>Điện thoại</th>
                    <th>CCCD</th>
                    <th>Ngân hàng</th>
                    <th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.boat_name}</td>
                      <td>{item.owner_name || "-"}</td>
                      <td>{item.phone || "-"}</td>
                      <td>{item.citizen_id || "-"}</td>
                      <td>
                        <div>{item.bank_name || "-"}</div>
                        <span className="muted-text">
                          {item.bank_account_number || ""}
                          {item.bank_account_name ? ` - ${item.bank_account_name}` : ""}
                        </span>
                      </td>
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

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toNullable(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
