import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ModalShell } from "../../components/ui/ModalShell";
import { supabase } from "../../lib/supabase";
import type { Tables } from "../../types/database";

type Broker = Tables<"brokers">;

const brokerSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên cò lúa"),
  phone: z.string().trim().optional(),
  citizen_id: z.string().trim().optional(),
  bank_name: z.string().trim().optional(),
  bank_account_number: z.string().trim().optional(),
  bank_account_name: z.string().trim().optional(),
  default_commission_per_kg: z
    .number({ error: "Hoa hồng mặc định phải là số" })
    .min(0, "Hoa hồng mặc định không được âm"),
  address: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

type BrokerFormValues = z.infer<typeof brokerSchema>;

const emptyValues: BrokerFormValues = {
  name: "",
  phone: "",
  citizen_id: "",
  bank_name: "",
  bank_account_number: "",
  bank_account_name: "",
  default_commission_per_kg: 0,
  address: "",
  note: "",
};

export function BrokersPage() {
  const [items, setItems] = useState<Broker[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Broker | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BrokerFormValues>({
    resolver: zodResolver(brokerSchema),
    defaultValues: emptyValues,
  });

  const filteredItems = useMemo(() => {
    const keyword = normalize(search);
    if (!keyword) return items;

    return items.filter((item) =>
      [item.name, item.phone, item.citizen_id].some((value) =>
        normalize(value).includes(keyword),
      ),
    );
  }, [items, search]);

  const formTitle = editingItem ? "Sửa cò lúa" : "Thêm cò lúa";

  async function loadBrokers() {
    setLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from("brokers")
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
    void loadBrokers();
  }, []);

  function startEdit(item: Broker) {
    setEditingItem(item);
    reset({
      name: item.name,
      phone: item.phone ?? "",
      citizen_id: item.citizen_id ?? "",
      bank_name: item.bank_name ?? "",
      bank_account_number: item.bank_account_number ?? "",
      bank_account_name: item.bank_account_name ?? "",
      default_commission_per_kg: item.default_commission_per_kg ?? 0,
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

  async function onSubmit(values: BrokerFormValues) {
    setSaving(true);
    setError(null);

    const payload = {
      name: values.name,
      phone: toNullable(values.phone),
      citizen_id: toNullable(values.citizen_id),
      bank_name: toNullable(values.bank_name),
      bank_account_number: toNullable(values.bank_account_number),
      bank_account_name: toNullable(values.bank_account_name),
      default_commission_per_kg: values.default_commission_per_kg,
      address: toNullable(values.address),
      note: toNullable(values.note),
    };

    const result = editingItem
      ? await supabase.from("brokers").update(payload).eq("id", editingItem.id)
      : await supabase.from("brokers").insert(payload);

    if (result.error) {
      setError(result.error.message);
    } else {
      clearForm();
      await loadBrokers();
    }

    setSaving(false);
  }

  async function deleteItem(item: Broker) {
    const confirmed = window.confirm(`Xóa cò lúa "${item.name}"?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    const { error: deleteError } = await supabase
      .from("brokers")
      .delete()
      .eq("id", item.id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      if (editingItem?.id === item.id) {
        clearForm();
      }
      await loadBrokers();
    }

    setDeletingId(null);
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Cò lúa</h1>
          <p>Quản lý người môi giới, giấy tờ, tài khoản ngân hàng và hoa hồng mặc định.</p>
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
            Thêm cò lúa
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
            <span>Tên cò lúa</span>
            <input {...register("name")} placeholder="VD: Trần Văn B" />
            {errors.name ? <small>{errors.name.message}</small> : null}
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Số điện thoại</span>
              <input {...register("phone")} inputMode="tel" placeholder="VD: 090..." />
            </label>
            <label className="field">
              <span>CCCD</span>
              <input {...register("citizen_id")} inputMode="numeric" placeholder="Số CCCD" />
            </label>
          </div>

          <label className="field">
            <span>Địa chỉ</span>
            <input {...register("address")} placeholder="Ấp, xã, huyện..." />
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
            <span>Hoa hồng mặc định / kg</span>
            <input
              type="number"
              min="0"
              step="1"
              {...register("default_commission_per_kg", { valueAsNumber: true })}
            />
            {errors.default_commission_per_kg ? (
              <small>{errors.default_commission_per_kg.message}</small>
            ) : null}
          </label>

          <label className="field">
            <span>Ghi chú</span>
            <textarea {...register("note")} rows={3} placeholder="Thông tin thêm nếu cần" />
          </label>

          <button className="primary-button" type="submit" disabled={saving}>
            <Plus size={18} aria-hidden="true" />
            {saving ? "Đang lưu..." : editingItem ? "Lưu thay đổi" : "Thêm cò lúa"}
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
                placeholder="Tìm theo tên, điện thoại, CCCD"
              />
            </label>
          </div>

          {error ? <div className="alert error-alert">{error}</div> : null}

          {loading ? (
            <div className="state-box">Đang tải cò lúa...</div>
          ) : filteredItems.length === 0 ? (
            <div className="state-box">Không có cò lúa phù hợp.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table wide-table">
                <thead>
                  <tr>
                    <th>Tên</th>
                    <th>Điện thoại</th>
                    <th>CCCD</th>
                    <th>Ngân hàng</th>
                    <th>Hoa hồng/kg</th>
                    <th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.phone || "-"}</td>
                      <td>{item.citizen_id || "-"}</td>
                      <td>
                        <div>{item.bank_name || "-"}</div>
                        <span className="muted-text">
                          {item.bank_account_number || ""}
                          {item.bank_account_name ? ` - ${item.bank_account_name}` : ""}
                        </span>
                      </td>
                      <td>{formatNumber(item.default_commission_per_kg)}</td>
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

function formatNumber(value: number | null) {
  if (value === null) return "-";
  return new Intl.NumberFormat("vi-VN").format(value);
}
