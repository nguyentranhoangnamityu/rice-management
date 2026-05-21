import { ArrowLeft, Ship } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  isBoatAdvanceAllowanceExpense,
  isBoatPayableExpense,
  isBoatTransportExpense,
} from "../../lib/boat-expenses";
import { formatDbError } from "../../lib/db-errors";
import { supabase } from "../../lib/supabase";
import type { Enums, Tables } from "../../types/database";

type TransporterBoat = Tables<"transporter_boats">;
type Trip = Tables<"trips">;
type TripExpense = Tables<"trip_expenses">;
type TripStatus = Enums<"trip_status">;

type TripRow = {
  trip: Trip;
  routeName: string;
  transportCost: number;
  allowanceCost: number;
  payableTotal: number;
  paidAmount: number;
  unpaidAmount: number;
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

function accumulateBoatPayable(expenses: TripExpense[]) {
  let transportCost = 0;
  let allowanceCost = 0;
  let payableTotal = 0;
  let paidAmount = 0;
  let unpaidAmount = 0;

  for (const expense of expenses) {
    if (!isBoatPayableExpense(expense.type)) continue;

    payableTotal += expense.amount;
    if (isBoatTransportExpense(expense.type)) {
      transportCost += expense.amount;
    }
    if (isBoatAdvanceAllowanceExpense(expense.type)) {
      allowanceCost += expense.amount;
    }
    if (expense.payment_status === "paid") {
      paidAmount += expense.amount;
    } else {
      unpaidAmount += expense.amount;
    }
  }

  return { transportCost, allowanceCost, payableTotal, paidAmount, unpaidAmount };
}

export function TransporterBoatDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [boat, setBoat] = useState<TransporterBoat | null>(null);
  const [tripRows, setTripRows] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setError(null);

    const boatResult = await supabase.from("transporter_boats").select("*").eq("id", id).maybeSingle();
    if (boatResult.error) {
      setError(formatDbError(boatResult.error));
      setLoading(false);
      return;
    }
    if (!boatResult.data) {
      setBoat(null);
      setTripRows([]);
      setLoading(false);
      return;
    }

    setBoat(boatResult.data);

    const tripsResult = await supabase
      .from("trips")
      .select("*")
      .eq("transporter_boat_id", id)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (tripsResult.error) {
      setError(formatDbError(tripsResult.error));
      setLoading(false);
      return;
    }

    const trips = tripsResult.data ?? [];
    if (trips.length === 0) {
      setTripRows([]);
      setLoading(false);
      return;
    }

    const tripIds = trips.map((trip) => trip.id);
    const routeIds = [...new Set(trips.map((trip) => trip.route_id).filter((value): value is string => Boolean(value)))];

    const [expensesResult, routesResult] = await Promise.all([
      supabase.from("trip_expenses").select("*").in("trip_id", tripIds),
      routeIds.length > 0
        ? supabase.from("transport_routes").select("id, name").in("id", routeIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    ]);

    if (expensesResult.error) {
      setError(formatDbError(expensesResult.error));
      setLoading(false);
      return;
    }
    if (routesResult.error) {
      setError(formatDbError(routesResult.error));
      setLoading(false);
      return;
    }

    const routeMap = new Map((routesResult.data ?? []).map((route) => [route.id, route.name]));
    const expensesByTrip = new Map<string, TripExpense[]>();
    for (const expense of expensesResult.data ?? []) {
      const list = expensesByTrip.get(expense.trip_id) ?? [];
      list.push(expense);
      expensesByTrip.set(expense.trip_id, list);
    }

    const rows: TripRow[] = trips.map((trip) => {
      const totals = accumulateBoatPayable(expensesByTrip.get(trip.id) ?? []);
      return {
        trip,
        routeName: trip.route_id ? routeMap.get(trip.route_id) ?? "—" : "—",
        ...totals,
      };
    });

    setTripRows(rows);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(() => {
    return tripRows.reduce(
      (acc, row) => {
        acc.tripCount += 1;
        acc.transportCost += row.transportCost;
        acc.allowanceCost += row.allowanceCost;
        acc.payableTotal += row.payableTotal;
        acc.paidAmount += row.paidAmount;
        acc.unpaidAmount += row.unpaidAmount;
        return acc;
      },
      {
        tripCount: 0,
        transportCost: 0,
        allowanceCost: 0,
        payableTotal: 0,
        paidAmount: 0,
        unpaidAmount: 0,
      },
    );
  }, [tripRows]);

  if (loading) {
    return (
      <section className="page">
        <div className="state-box">Đang tải chi tiết ghe...</div>
      </section>
    );
  }

  if (!boat) {
    return (
      <section className="page">
        <header className="page-header">
          <Link to="/transporter-boats" className="icon-button" aria-label="Quay lại">
            <ArrowLeft size={18} />
          </Link>
          <h1>Không tìm thấy ghe</h1>
        </header>
        {error ? <div className="alert error-alert">{error}</div> : null}
      </section>
    );
  }

  return (
    <section className="page" style={{ paddingBottom: "80px" }}>
      <header
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          flexWrap: "wrap",
          borderBottom: "1px solid var(--border-light)",
          paddingBottom: "18px",
          marginBottom: "20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
          <Link
            to="/transporter-boats"
            className="icon-button"
            style={{
              display: "inline-flex",
              background: "var(--bg-card)",
              border: "1px solid var(--border-light)",
              borderRadius: "50%",
              padding: "10px",
            }}
            aria-label="Quay lại danh sách ghe"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <Ship size={22} style={{ color: "var(--primary)" }} />
              <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "800" }}>{boat.boat_name}</h1>
            </div>
            <p style={{ color: "var(--text-muted)", marginTop: "8px", fontSize: "14px" }}>
              Chủ ghe: {boat.owner_name || "—"}
              {boat.phone ? ` · ${boat.phone}` : ""}
            </p>
            {(boat.bank_name || boat.bank_account_number) && (
              <p style={{ color: "var(--text-muted)", marginTop: "4px", fontSize: "13px" }}>
                {boat.bank_name || ""}
                {boat.bank_account_number ? ` · ${boat.bank_account_number}` : ""}
                {boat.bank_account_name ? ` (${boat.bank_account_name})` : ""}
              </p>
            )}
          </div>
        </div>
        <Link to="/transporter-boats" className="secondary-button">
          Danh sách ghe
        </Link>
      </header>

      {error ? <div className="alert error-alert" style={{ marginBottom: "16px" }}>{error}</div> : null}

      <div className="metric-grid" style={{ marginBottom: "24px" }}>
        <div className="metric-card">
          <span>Số chuyến đã chở</span>
          <strong>{summary.tripCount}</strong>
        </div>
        <BoatPaymentMetricCard summary={summary} />
      </div>

      <div className="table-card">
        <div className="card-title-row">
          <h2>Chuyến hàng của ghe</h2>
        </div>

        {tripRows.length === 0 ? (
          <div className="state-box">Ghe này chưa có chuyến hàng nào.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table extra-wide-table">
              <thead>
                <tr>
                  <th>Mã chuyến</th>
                  <th>Tuyến đường</th>
                  <th>Ngày bắt đầu</th>
                  <th>Trạng thái</th>
                  <th>Công ty phải trả</th>
                  <th>Thanh toán</th>
                  <th aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody>
                {tripRows.map((row) => (
                  <tr key={row.trip.id}>
                    <td>
                      <Link to={`/trips/${row.trip.id}`} style={{ fontWeight: "700", color: "var(--primary)" }}>
                        {row.trip.code}
                      </Link>
                    </td>
                    <td>{row.routeName}</td>
                    <td>{row.trip.start_date ? formatDate(row.trip.start_date) : "—"}</td>
                    <td>{statusLabels[row.trip.status] ?? row.trip.status}</td>
                    <td style={{ fontWeight: "700" }}>
                      {row.payableTotal > 0 ? formatMoney(row.payableTotal) : "—"}
                    </td>
                    <td>
                      {row.payableTotal === 0 ? (
                        <span className="muted-text">—</span>
                      ) : row.unpaidAmount === 0 ? (
                        <span className="badge badge-completed" style={{ fontSize: "11px" }}>
                          Đã trả đủ
                        </span>
                      ) : row.paidAmount === 0 ? (
                        <span className="badge badge-cancelled" style={{ fontSize: "11px" }}>
                          Chưa trả
                        </span>
                      ) : (
                        <>
                          <div>Đã trả {formatMoney(row.paidAmount)}</div>
                          <span className="muted-text">Còn {formatMoney(row.unpaidAmount)}</span>
                        </>
                      )}
                    </td>
                    <td>
                      <Link to={`/trips/${row.trip.id}`} className="secondary-button" style={{ fontSize: "13px", padding: "6px 10px" }}>
                        Chi tiết
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ fontWeight: "700" }}>
                    Tổng
                  </td>
                  <td style={{ fontWeight: "700" }}>{formatMoney(summary.payableTotal)}</td>
                  <td style={{ fontWeight: "700" }}>
                    {summary.payableTotal === 0
                      ? "—"
                      : summary.unpaidAmount === 0
                        ? "Đã trả đủ"
                        : summary.paidAmount === 0
                          ? "Chưa trả"
                          : `Còn ${formatMoney(summary.unpaidAmount)}`}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <p className="muted-text" style={{ marginTop: "16px", fontSize: "13px", lineHeight: 1.5 }}>
        Công ty trả một lần cho chủ ghe: <strong>tiền vận chuyển</strong> và <strong>bồi dưỡng đi chi</strong> (bồi
        dưỡng công nhân + tiền công vác lúa mà chủ ghe đã ứng). Cập nhật trạng thái trả trên từng chi phí ở bước 3 của
        chuyến hàng.
      </p>
    </section>
  );
}

type BoatSummary = {
  tripCount: number;
  transportCost: number;
  allowanceCost: number;
  payableTotal: number;
  paidAmount: number;
  unpaidAmount: number;
};

function BoatPaymentMetricCard({ summary }: { summary: BoatSummary }) {
  if (summary.payableTotal === 0) {
    return (
      <div className="metric-card">
        <span>Tiền trả chủ ghe</span>
        <strong>0 đ</strong>
        <small className="muted-text">Chưa ghi chi phí vận chuyển / bồi dưỡng trên các chuyến</small>
      </div>
    );
  }

  const fullyPaid = summary.unpaidAmount === 0;
  const hasPartialPayment = summary.paidAmount > 0 && summary.unpaidAmount > 0;

  return (
    <div className="metric-card">
      <span>Tiền trả chủ ghe</span>
      {fullyPaid ? (
        <strong style={{ color: "var(--success)" }}>{formatMoney(summary.payableTotal)}</strong>
      ) : (
        <strong className="profit-negative">{formatMoney(summary.unpaidAmount)}</strong>
      )}
      <small className="muted-text">
        {fullyPaid
          ? "Đã trả đủ (VC + bồi dưỡng đi chi)"
          : hasPartialPayment
            ? `Còn phải trả · Đã trả ${formatMoney(summary.paidAmount)} / ${formatMoney(summary.payableTotal)}`
            : "Còn phải trả · chưa trả lần nào"}
      </small>
      {summary.allowanceCost > 0 ? (
        <small className="muted-text" style={{ display: "block", marginTop: "4px" }}>
          Trong tổng: VC {formatMoney(summary.transportCost)} · bồi dưỡng {formatMoney(summary.allowanceCost)}
        </small>
      ) : null}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(new Date(`${value}T00:00:00`));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}
