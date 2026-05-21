import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ModalShell } from "../../components/ui/ModalShell";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { useServerPagination } from "../../hooks/useServerPagination";
import { formatDbError } from "../../lib/db-errors";
import { supabase } from "../../lib/supabase";
import type { Enums, Tables } from "../../types/database";

type Warehouse = Tables<"warehouses">;
type InventoryTransaction = Tables<"inventory_transactions">;
type Trip = Tables<"trips">;
type InventoryItemType = Enums<"inventory_item_type">;
type InventoryTransactionType = Enums<"inventory_transaction_type">;

type InventoryRow = InventoryTransaction & {
  warehouse?: Warehouse | null;
  trip?: Trip | null;
};

const itemTypeOptions: { value: InventoryItemType; label: string }[] = [
  { value: "paddy", label: "Lúa" },
  { value: "rice", label: "Gạo" },
  { value: "byproduct", label: "Phụ phẩm" },
];

const transactionTypeOptions: { value: InventoryTransactionType; label: string }[] = [
  { value: "in", label: "Nhập" },
  { value: "out", label: "Xuất" },
  { value: "adjustment", label: "Điều chỉnh" },
];

const warehouseSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên kho"),
  address: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

const inventorySchema = z.object({
  warehouse_id: z.string().min(1, "Vui lòng chọn kho"),
  trip_id: z.string().optional(),
  type: z.enum(["in", "out", "adjustment"]),
  item_type: z.enum(["paddy", "rice", "byproduct"]),
  quantity_kg: z.number().refine((value) => value !== 0, "Số kg không được bằng 0"),
  transaction_date: z.string().min(1, "Vui lòng chọn ngày"),
  note: z.string().trim().optional(),
});

type WarehouseFormValues = z.infer<typeof warehouseSchema>;
type InventoryFormValues = z.infer<typeof inventorySchema>;

const emptyWarehouseValues: WarehouseFormValues = {
  name: "",
  address: "",
  note: "",
};

const emptyInventoryValues: InventoryFormValues = {
  warehouse_id: "",
  trip_id: "",
  type: "in",
  item_type: "paddy",
  quantity_kg: 0,
  transaction_date: new Date().toISOString().slice(0, 10),
  note: "",
};

export function WarehousesPage() {
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
  } = useServerPagination<Warehouse>("warehouses");
  const [allWarehouses, setAllWarehouses] = useState<Warehouse[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingTransaction, setSavingTransaction] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Warehouse | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<InventoryTransaction | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: emptyWarehouseValues,
  });

  const {
    register: registerTransaction,
    handleSubmit: handleSubmitTransaction,
    reset: resetTransaction,
    formState: { errors: transactionErrors },
  } = useForm<InventoryFormValues>({
    resolver: zodResolver(inventorySchema),
    defaultValues: emptyInventoryValues,
  });

  const warehouseMap = useMemo(() => new Map(allWarehouses.map((item) => [item.id, item])), [allWarehouses]);
  const tripMap = useMemo(() => new Map(trips.map((trip) => [trip.id, trip])), [trips]);
  const inventoryRows = useMemo<InventoryRow[]>(
    () =>
      transactions.map((transaction) => ({
        ...transaction,
        warehouse: warehouseMap.get(transaction.warehouse_id) ?? null,
        trip: transaction.trip_id ? tripMap.get(transaction.trip_id) ?? null : null,
      })),
    [transactions, warehouseMap, tripMap],
  );
  const stockRows = useMemo(() => summarizeStock(inventoryRows), [inventoryRows]);

  useEffect(() => {
    void loadReferenceData();
  }, []);

  async function loadReferenceData() {
    const [warehouseResult, transactionResult, tripResult] = await Promise.all([
      supabase.from("warehouses").select("*").order("name", { ascending: true }),
      supabase.from("inventory_transactions").select("*").order("transaction_date", { ascending: false }),
      supabase.from("trips").select("*").order("start_date", { ascending: false }),
    ]);

    const firstError = warehouseResult.error ?? transactionResult.error ?? tripResult.error;
    if (firstError) {
      setError(formatDbError(firstError));
      return;
    }

    setAllWarehouses(warehouseResult.data ?? []);
    setTransactions(transactionResult.data ?? []);
    setTrips(tripResult.data ?? []);
  }

  function startEdit(item: Warehouse) {
    setEditingItem(item);
    reset({
      name: item.name,
      address: item.address ?? "",
      note: item.note ?? "",
    });
    setFormOpen(true);
  }

  function clearForm() {
    setEditingItem(null);
    reset(emptyWarehouseValues);
    setFormOpen(false);
  }

  async function onSubmit(values: WarehouseFormValues) {
    setSaving(true);
    setError(null);

    const payload = {
      name: values.name,
      address: toNullable(values.address),
      note: toNullable(values.note),
    };

    const result = editingItem
      ? await supabase.from("warehouses").update(payload).eq("id", editingItem.id)
      : await supabase.from("warehouses").insert(payload);

    if (result.error) {
      setError(formatDbError(result.error));
    } else {
      clearForm();
      await refresh(editingItem ? page : 1);
      await loadReferenceData();
    }

    setSaving(false);
  }

  async function deleteItem(item: Warehouse) {
    const confirmed = window.confirm(`Xóa kho "${item.name}"?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    const { error: deleteError } = await supabase.from("warehouses").delete().eq("id", item.id);

    if (deleteError) {
      setError(formatDbError(deleteError));
    } else {
      if (editingItem?.id === item.id) clearForm();
      await refresh(page);
      await loadReferenceData();
    }

    setDeletingId(null);
  }

  function startEditTransaction(item: InventoryTransaction) {
    setEditingTransaction(item);
    resetTransaction({
      warehouse_id: item.warehouse_id,
      trip_id: item.trip_id ?? "",
      type: item.type,
      item_type: item.item_type,
      quantity_kg: item.quantity_kg,
      transaction_date: item.transaction_date,
      note: item.note ?? "",
    });
  }

  async function onSubmitTransaction(values: InventoryFormValues) {
    setSavingTransaction(true);
    setError(null);

    const payload = {
      warehouse_id: values.warehouse_id,
      trip_id: values.trip_id || null,
      type: values.type,
      item_type: values.item_type,
      quantity_kg: values.quantity_kg,
      transaction_date: values.transaction_date,
      note: toNullable(values.note),
    };

    const result = editingTransaction
      ? await supabase.from("inventory_transactions").update(payload).eq("id", editingTransaction.id)
      : await supabase.from("inventory_transactions").insert(payload);

    if (result.error) {
      setError(formatDbError(result.error));
    } else {
      setEditingTransaction(null);
      resetTransaction(emptyInventoryValues);
      await loadReferenceData();
    }

    setSavingTransaction(false);
  }

  async function deleteTransaction(item: InventoryTransaction) {
    const confirmed = window.confirm("Xóa giao dịch kho này?");
    if (!confirmed) return;

    setDeletingTransactionId(item.id);
    setError(null);

    const { error: deleteError } = await supabase.from("inventory_transactions").delete().eq("id", item.id);

    if (deleteError) {
      setError(formatDbError(deleteError));
    } else {
      if (editingTransaction?.id === item.id) {
        setEditingTransaction(null);
        resetTransaction(emptyInventoryValues);
      }
      await loadReferenceData();
    }

    setDeletingTransactionId(null);
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Quản lý kho</h1>
          <p>Quản lý danh mục kho, nhập xuất lúa/gạo và tồn kho tạm tính theo giao dịch.</p>
        </div>
        <div className="header-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setEditingItem(null);
              reset(emptyWarehouseValues);
              setFormOpen(true);
            }}
          >
            <Plus size={18} aria-hidden="true" />
            Thêm kho
          </button>
        </div>
      </header>

      <div className="crud-grid modal-crud-grid">
        {formOpen ? (
          <ModalShell onClose={clearForm}>
            <form className="form-card" onSubmit={handleSubmit(onSubmit)}>
              <div className="card-title-row">
                <h2>{editingItem ? "Sửa kho" : "Thêm kho"}</h2>
              </div>

              <label className="field">
                <span>Tên kho</span>
                <input {...register("name")} placeholder="VD: Kho nhà" />
                {errors.name ? <small>{errors.name.message}</small> : null}
              </label>

              <label className="field">
                <span>Địa chỉ</span>
                <input {...register("address")} placeholder="Địa chỉ kho" />
              </label>

              <label className="field">
                <span>Ghi chú</span>
                <textarea {...register("note")} rows={3} placeholder="Thông tin thêm nếu cần" />
              </label>

              <button className="primary-button" type="submit" disabled={saving}>
                <Plus size={18} aria-hidden="true" />
                {saving ? "Đang lưu..." : editingItem ? "Lưu thay đổi" : "Thêm kho"}
              </button>
            </form>
          </ModalShell>
        ) : null}

        <section className="table-card">
          <div className="card-title-row">
            <h2>Tồn kho tạm tính</h2>
          </div>
          {stockRows.length === 0 ? (
            <div className="state-box">Chưa có giao dịch kho.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Kho</th>
                    <th>Loại hàng</th>
                    <th>Số kg tồn</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((row) => (
                    <tr key={`${row.warehouseId}-${row.itemType}`}>
                      <td>{row.warehouseName}</td>
                      <td>{formatItemType(row.itemType)}</td>
                      <td>{formatNumber(row.quantityKg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="table-card">
          <div className="card-title-row">
            <h2>Giao dịch kho</h2>
          </div>

          <form className="form-card" onSubmit={handleSubmitTransaction(onSubmitTransaction)}>
            <div className="field-grid">
              <label className="field">
                <span>Kho</span>
                <select {...registerTransaction("warehouse_id")}>
                  <option value="">Chọn kho</option>
                  {allWarehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
                {transactionErrors.warehouse_id ? <small>{transactionErrors.warehouse_id.message}</small> : null}
              </label>
              <label className="field">
                <span>Chuyến hàng</span>
                <select {...registerTransaction("trip_id")}>
                  <option value="">Không chọn</option>
                  {trips.map((trip) => (
                    <option key={trip.id} value={trip.id}>
                      {trip.code}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="field-grid">
              <label className="field">
                <span>Loại giao dịch</span>
                <select {...registerTransaction("type")}>
                  {transactionTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Loại hàng</span>
                <select {...registerTransaction("item_type")}>
                  {itemTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="field-grid">
              <label className="field">
                <span>Số kg</span>
                <input type="number" step="0.01" {...registerTransaction("quantity_kg", { valueAsNumber: true })} />
                {transactionErrors.quantity_kg ? <small>{transactionErrors.quantity_kg.message}</small> : null}
              </label>
              <label className="field">
                <span>Ngày</span>
                <input type="date" {...registerTransaction("transaction_date")} />
                {transactionErrors.transaction_date ? <small>{transactionErrors.transaction_date.message}</small> : null}
              </label>
            </div>

            <label className="field">
              <span>Ghi chú</span>
              <textarea {...registerTransaction("note")} rows={2} placeholder="Thông tin thêm nếu cần" />
            </label>

            <div className="row-actions">
              <button className="primary-button" type="submit" disabled={savingTransaction}>
                <Plus size={18} aria-hidden="true" />
                {savingTransaction ? "Đang lưu..." : editingTransaction ? "Lưu giao dịch" : "Thêm giao dịch"}
              </button>
              {editingTransaction ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setEditingTransaction(null);
                    resetTransaction(emptyInventoryValues);
                  }}
                >
                  Hủy sửa
                </button>
              ) : null}
            </div>
          </form>

          {inventoryRows.length === 0 ? (
            <div className="state-box">Chưa có giao dịch kho.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table extra-wide-table">
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Kho</th>
                    <th>Chuyến</th>
                    <th>Loại</th>
                    <th>Hàng</th>
                    <th>Số kg</th>
                    <th>Ghi chú</th>
                    <th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {inventoryRows.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.transaction_date)}</td>
                      <td>{item.warehouse?.name ?? "-"}</td>
                      <td>{item.trip?.code ?? "-"}</td>
                      <td>{formatTransactionType(item.type)}</td>
                      <td>{formatItemType(item.item_type)}</td>
                      <td>{formatNumber(item.quantity_kg)}</td>
                      <td>{item.note ?? "-"}</td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-button" type="button" onClick={() => startEditTransaction(item)} aria-label="Sửa">
                            <Edit2 size={17} aria-hidden="true" />
                          </button>
                          <button
                            className="icon-button danger"
                            type="button"
                            onClick={() => void deleteTransaction(item)}
                            disabled={deletingTransactionId === item.id}
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
        </section>

        <section className="table-card">
          <div className="table-toolbar">
            <label className="search-field">
              <Search size={17} aria-hidden="true" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên kho" />
            </label>
          </div>

          {error ?? listError ? <div className="alert error-alert">{error ?? listError}</div> : null}

          {loading ? (
            <div className="state-box">Đang tải kho...</div>
          ) : items.length === 0 ? (
            <div className="state-box">Chưa có kho.</div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tên kho</th>
                      <th>Địa chỉ</th>
                      <th>Ghi chú</th>
                      <th aria-label="Thao tác" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.address ?? "-"}</td>
                        <td>{item.note ?? "-"}</td>
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
              <PaginationControls page={page} totalPages={totalPages} total={total} loading={loading} onPageChange={setPage} />
            </>
          )}
        </section>
      </div>
    </section>
  );
}

function summarizeStock(rows: InventoryRow[]) {
  const totals = new Map<string, { warehouseId: string; warehouseName: string; itemType: InventoryItemType; quantityKg: number }>();

  rows.forEach((row) => {
    const key = `${row.warehouse_id}-${row.item_type}`;
    const current = totals.get(key) ?? {
      warehouseId: row.warehouse_id,
      warehouseName: row.warehouse?.name ?? "-",
      itemType: row.item_type,
      quantityKg: 0,
    };
    const sign = row.type === "out" ? -1 : 1;
    current.quantityKg += row.quantity_kg * sign;
    totals.set(key, current);
  });

  return [...totals.values()].sort((a, b) => a.warehouseName.localeCompare(b.warehouseName));
}

function formatItemType(value: InventoryItemType) {
  return itemTypeOptions.find((option) => option.value === value)?.label ?? value;
}

function formatTransactionType(value: InventoryTransactionType) {
  return transactionTypeOptions.find((option) => option.value === value)?.label ?? value;
}

function toNullable(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(new Date(`${value}T00:00:00`));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}
