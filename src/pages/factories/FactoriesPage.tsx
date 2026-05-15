import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ModalShell } from "../../components/ui/ModalShell";
import { supabase } from "../../lib/supabase";
import type { Enums, Tables } from "../../types/database";

type Factory = Tables<"factories">;
type FactoryType = Enums<"factory_type">;

const factoryTypeOptions: { value: FactoryType; label: string }[] = [
  { value: "drying", label: "Sấy" },
  { value: "milling", label: "Xay xát" },
  { value: "drying_milling", label: "Sấy + xay xát" },
];

const factorySchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên nhà máy"),
  type: z.enum(["drying", "milling", "drying_milling"]),
  phone: z.string().trim().optional(),
  tax_code: z.string().trim().optional(),
  bank_name: z.string().trim().optional(),
  bank_account_number: z.string().trim().optional(),
  bank_account_name: z.string().trim().optional(),
  address: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

type FactoryFormValues = z.infer<typeof factorySchema>;

const emptyValues: FactoryFormValues = {
  name: "",
  type: "drying",
  phone: "",
  tax_code: "",
  bank_name: "",
  bank_account_number: "",
  bank_account_name: "",
  address: "",
  note: "",
};

export function FactoriesPage() {
  const [items, setItems] = useState<Factory[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Factory | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FactoryFormValues>({
    resolver: zodResolver(factorySchema),
    defaultValues: emptyValues,
  });

  const filteredItems = useMemo(() => {
    const keyword = normalize(search);
    if (!keyword) return items;

    return items.filter((item) =>
      [item.name, item.phone, item.tax_code].some((value) =>
        normalize(value).includes(keyword),
      ),
    );
  }, [items, search]);

  const formTitle = editingItem ? "Sửa nhà máy" : "Thêm nhà máy";

  async function loadFactories() {
    setLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from("factories")
      .select("*")
      .order("name", { ascending: true });

    if (loadError) {
      setError(loadError.message);
    } else {
      setItems(data ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadFactories();
  }, []);

  function startEdit(item: Factory) {
    setEditingItem(item);
    reset({
      name: item.name,
      type: item.type,
      phone: item.phone ?? "",
      tax_code: item.tax_code ?? "",
      bank_name: item.bank_name ?? "",
      bank_account_number: item.bank_account_number ?? "",
      bank_account_name: item.bank_account_name ?? "",
      address: item.address ?? "",
      note: item.note ?? "",
    });
    setFormOpen(true);
  }

  function clearForm() {
    setEditingItem(null);
    reset(emptyValues);
    setFormOpen(false);
  }

  async function onSubmit(values: FactoryFormValues) {
    setSaving(true);
    setError(null);

    const payload = {
      name: values.name,
      type: values.type,
      phone: toNullable(values.phone),
      tax_code: toNullable(values.tax_code),
      bank_name: toNullable(values.bank_name),
      bank_account_number: toNullable(values.bank_account_number),
      bank_account_name: toNullable(values.bank_account_name),
      address: toNullable(values.address),
      note: toNullable(values.note),
    };

    const result = editingItem
      ? await supabase.from("factories").update(payload).eq("id", editingItem.id)
      : await supabase.from("factories").insert(payload);

    if (result.error) {
      setError(result.error.message);
    } else {
      clearForm();
      await loadFactories();
    }

    setSaving(false);
  }

  async function deleteItem(item: Factory) {
    const confirmed = window.confirm(`Xóa nhà máy "${item.name}"?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    const { error: deleteError } = await supabase
      .from("factories")
      .delete()
      .eq("id", item.id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      if (editingItem?.id === item.id) clearForm();
      await loadFactories();
    }

    setDeletingId(null);
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Nhà máy</h1>
          <p>Quản lý nhà máy sấy, xay xát, mã số thuế và tài khoản ngân hàng.</p>
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
            Thêm nhà máy
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
            <span>Tên nhà máy</span>
            <input {...register("name")} placeholder="VD: Chành Đức" />
            {errors.name ? <small>{errors.name.message}</small> : null}
          </label>

          <label className="field">
            <span>Loại dịch vụ</span>
            <select {...register("type")}>
              {factoryTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Số điện thoại</span>
              <input {...register("phone")} inputMode="tel" placeholder="VD: 090..." />
            </label>
            <label className="field">
              <span>Mã số thuế</span>
              <input {...register("tax_code")} placeholder="Mã số thuế" />
            </label>
          </div>

          <label className="field">
            <span>Địa chỉ</span>
            <input {...register("address")} placeholder="Địa chỉ nhà máy" />
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Ngân hàng</span>
              <input {...register("bank_name")} placeholder="VD: Vietcombank" />
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
            {saving ? "Đang lưu..." : editingItem ? "Lưu thay đổi" : "Thêm nhà máy"}
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
                placeholder="Tìm theo tên, điện thoại, mã số thuế"
              />
            </label>
          </div>

          {error ? <div className="alert error-alert">{error}</div> : null}

          {loading ? (
            <div className="state-box">Đang tải nhà máy...</div>
          ) : filteredItems.length === 0 ? (
            <div className="state-box">Không có nhà máy phù hợp.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table wide-table">
                <thead>
                  <tr>
                    <th>Tên</th>
                    <th>Loại</th>
                    <th>Điện thoại</th>
                    <th>Mã số thuế</th>
                    <th>Ngân hàng</th>
                    <th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{formatFactoryType(item.type)}</td>
                      <td>{item.phone || "-"}</td>
                      <td>{item.tax_code || "-"}</td>
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

function formatFactoryType(value: FactoryType) {
  return factoryTypeOptions.find((option) => option.value === value)?.label ?? value;
}
