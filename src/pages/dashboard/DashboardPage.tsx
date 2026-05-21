import {
  Banknote,
  Factory,
  Package,
  PackageCheck,
  RefreshCw,
  Scale,
  TrendingUp,
  Truck,
  Wheat,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatDbError } from "../../lib/db-errors";
import { supabase } from "../../lib/supabase";
import type { Database, Enums, Tables } from "../../types/database";

type Trip = Tables<"trips">;
type ProcessingRecord = Tables<"processing_records">;
type InventoryTransaction = Tables<"inventory_transactions">;
type TripSale = Tables<"trip_sales">;
type TripSummary = Database["public"]["Views"]["trip_summaries"]["Row"];
type InventoryItemType = Enums<"inventory_item_type">;
type TripStatus = Enums<"trip_status">;

type DashboardData = {
  trips: Trip[];
  summaries: TripSummary[];
  processingRecords: ProcessingRecord[];
  inventoryTransactions: InventoryTransaction[];
  sales: TripSale[];
};

const emptyData: DashboardData = {
  trips: [],
  summaries: [],
  processingRecords: [],
  inventoryTransactions: [],
  sales: [],
};

const itemTypeLabels: Record<InventoryItemType, string> = {
  paddy: "Lúa",
  rice: "Gạo",
  byproduct: "Phụ phẩm",
};

const statusLabels: Record<TripStatus, string> = {
  draft: "Nháp",
  purchasing: "Đang mua",
  loaded_to_boat: "Đã xuống ghe",
  drying: "Đang sấy",
  milling: "Đang xay xát",
  ready_to_sell: "Sẵn sàng bán",
  selling: "Đang bán",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
};

export function DashboardPage() {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    const [tripsResult, summariesResult, processingResult, inventoryResult, salesResult] =
      await Promise.all([
        supabase.from("trips").select("*").order("start_date", { ascending: false }),
        supabase.from("trip_summaries").select("*"),
        supabase.from("processing_records").select("*").order("processed_date", { ascending: false }),
        supabase.from("inventory_transactions").select("*").order("transaction_date", { ascending: false }),
        supabase.from("trip_sales").select("*").order("sale_date", { ascending: false }),
      ]);

    const firstError =
      tripsResult.error ??
      summariesResult.error ??
      processingResult.error ??
      inventoryResult.error ??
      salesResult.error;

    if (firstError) {
      setError(formatDbError(firstError));
      setLoading(false);
      return;
    }

    setData({
      trips: tripsResult.data ?? [],
      summaries: summariesResult.data ?? [],
      processingRecords: processingResult.data ?? [],
      inventoryTransactions: inventoryResult.data ?? [],
      sales: salesResult.data ?? [],
    });
    setLoading(false);
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  const summary = useMemo(() => buildSummary(data), [data]);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Tổng quan</h1>
          <p>Theo dõi nhanh tồn kho, chuyến ghe, sản lượng lúa/gạo, chi phí sấy xay và doanh thu bán gạo.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" type="button" onClick={() => void loadDashboard()} disabled={loading}>
            <RefreshCw size={18} aria-hidden="true" />
            {loading ? "Đang tải..." : "Làm mới"}
          </button>
        </div>
      </header>

      {error ? <div className="alert error-alert">{error}</div> : null}

      {loading ? (
        <div className="state-box">Đang tải tổng quan...</div>
      ) : (
        <>
          <div className="metric-grid dashboard-metric-grid">
            <MetricCard icon={Package} label="Tồn kho lúa" value={formatTon(summary.stock.paddy)} />
            <MetricCard icon={PackageCheck} label="Tồn kho gạo" value={formatTon(summary.stock.rice)} />
            <MetricCard icon={Truck} label="Số chuyến ghe" value={formatInteger(summary.tripCount)} />
            <MetricCard icon={Wheat} label="Tổng lúa đã mua" value={formatTon(summary.totalPaddyKg)} />
            <MetricCard icon={Scale} label="Gạo đã bán" value={formatTon(summary.totalSoldRiceKg)} />
            <MetricCard icon={TrendingUp} label="Tiền bán gạo" value={formatCurrency(summary.totalRevenue)} />
            <MetricCard icon={Factory} label="Tiền sấy còn" value={formatCurrency(summary.unpaidDryingCost)} />
            <MetricCard icon={Factory} label="Tiền xay xát còn" value={formatCurrency(summary.unpaidMillingCost)} />
            <MetricCard icon={Banknote} label="Lãi tạm tính" value={formatCurrency(summary.temporaryProfit)} />
          </div>

          <div className="dashboard-grid">
            <section className="table-card dashboard-panel">
              <div className="card-title-row">
                <h2>Tồn kho theo loại</h2>
              </div>
              <div className="dashboard-stock-list">
                {summary.stockRows.map((row) => (
                  <div className="dashboard-stock-row" key={row.itemType}>
                    <span>{itemTypeLabels[row.itemType]}</span>
                    <strong>{formatTon(row.quantityKg)}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="table-card dashboard-panel">
              <div className="card-title-row">
                <h2>Chi phí xử lý</h2>
              </div>
              <div className="dashboard-money-list">
                <MoneyRow label="Tổng tiền sấy" value={summary.totalDryingCost} />
                <MoneyRow label="Tiền sấy còn" value={summary.unpaidDryingCost} />
                <MoneyRow label="Tổng tiền xay xát" value={summary.totalMillingCost} />
                <MoneyRow label="Tiền xay xát còn" value={summary.unpaidMillingCost} />
              </div>
            </section>

            <section className="table-card dashboard-panel">
              <div className="card-title-row">
                <h2>Bán gạo</h2>
              </div>
              <div className="dashboard-money-list">
                <MoneyRow label="Doanh thu đã ghi nhận" value={summary.totalRevenue} />
                <MoneyRow label="Tiền bán gạo còn thu" value={summary.unpaidRevenue} />
                <MoneyRow label="Sản lượng đã bán" value={summary.totalSoldRiceKg} formatter={formatTon} />
                <MoneyRow label="Giá bán bình quân" value={summary.averageSalePrice} />
              </div>
            </section>

            <section className="table-card dashboard-panel">
              <div className="card-title-row">
                <h2>Trạng thái chuyến</h2>
              </div>
              <div className="dashboard-status-list">
                {summary.statusRows.map((row) => (
                  <div className="dashboard-status-row" key={row.status}>
                    <span>{statusLabels[row.status]}</span>
                    <strong>{formatInteger(row.count)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: string;
}) {
  return (
    <article className="metric-card dashboard-metric-card">
      <Icon size={22} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function MoneyRow({
  label,
  value,
  formatter = formatCurrency,
}: {
  label: string;
  value: number;
  formatter?: (value: number) => string;
}) {
  return (
    <div className="dashboard-money-row">
      <span>{label}</span>
      <strong>{formatter(value)}</strong>
    </div>
  );
}

function buildSummary(data: DashboardData) {
  const stockRows = summarizeStock(data.inventoryTransactions);
  const stock = stockRows.reduce(
    (result, row) => {
      result[row.itemType] = row.quantityKg;
      return result;
    },
    { paddy: 0, rice: 0, byproduct: 0 } as Record<InventoryItemType, number>,
  );

  const totalPaddyKg = sum(data.summaries, (item) => item.total_purchase_kg);
  const totalSoldRiceKg = sum(data.summaries, (item) => item.total_sale_kg);
  const totalRevenue = sum(data.summaries, (item) => item.total_revenue);
  const temporaryProfit = sum(data.summaries, (item) => item.temporary_profit);

  const dryingRecords = data.processingRecords.filter((item) => item.service_type === "drying");
  const millingRecords = data.processingRecords.filter((item) => item.service_type === "milling");

  const totalDryingCost = sum(dryingRecords, (item) => item.total_cost);
  const unpaidDryingCost = sum(
    dryingRecords.filter((item) => item.payment_status !== "paid"),
    (item) => item.total_cost,
  );
  const totalMillingCost = sum(millingRecords, (item) => item.total_cost);
  const unpaidMillingCost = sum(
    millingRecords.filter((item) => item.payment_status !== "paid"),
    (item) => item.total_cost,
  );

  const unpaidRevenue = sum(
    data.sales.filter((item) => item.payment_status !== "paid"),
    (item) => item.total_amount,
  );
  const averageSalePrice = totalSoldRiceKg > 0 ? totalRevenue / totalSoldRiceKg : 0;

  const statusMap = new Map<TripStatus, number>();
  data.trips.forEach((trip) => {
    statusMap.set(trip.status, (statusMap.get(trip.status) ?? 0) + 1);
  });

  return {
    stock,
    stockRows,
    tripCount: data.trips.length,
    totalPaddyKg,
    totalSoldRiceKg,
    totalRevenue,
    unpaidRevenue,
    averageSalePrice,
    totalDryingCost,
    unpaidDryingCost,
    totalMillingCost,
    unpaidMillingCost,
    temporaryProfit,
    statusRows: [...statusMap.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
  };
}

function summarizeStock(rows: InventoryTransaction[]) {
  const totals = new Map<InventoryItemType, { itemType: InventoryItemType; quantityKg: number }>();

  rows.forEach((row) => {
    const current = totals.get(row.item_type) ?? {
      itemType: row.item_type,
      quantityKg: 0,
    };
    const sign = row.type === "out" ? -1 : 1;
    current.quantityKg += row.quantity_kg * sign;
    totals.set(row.item_type, current);
  });

  return (["paddy", "rice", "byproduct"] as InventoryItemType[]).map(
    (itemType) => totals.get(itemType) ?? { itemType, quantityKg: 0 },
  );
}

function sum<T>(items: T[], selector: (item: T) => number | null | undefined) {
  return items.reduce((total, item) => total + Number(selector(item) ?? 0), 0);
}

function formatTon(valueKg: number) {
  return `${formatNumber(valueKg / 1000)} tấn`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}
