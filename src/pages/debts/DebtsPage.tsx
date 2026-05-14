import { useEffect, useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { exportExcel, exportPdf } from "../../lib/export";
import { supabase } from "../../lib/supabase";
import type { Enums, Tables } from "../../types/database";

type Broker = Tables<"brokers">;
type Factory = Tables<"factories">;
type ProcessingRecord = Tables<"processing_records">;
type PurchaseSlip = Tables<"purchase_slips">;
type Season = Tables<"seasons">;
type TransporterBoat = Tables<"transporter_boats">;
type TransportTrip = Tables<"transport_trips">;
type PaymentStatus = Enums<"payment_status">;

type BrokerDebtRow = {
  brokerId: string;
  brokerName: string;
  totalWeight: number;
  totalCommission: number;
};

type TransportDebtRow = {
  boatId: string;
  boatName: string;
  ownerName: string;
  totalTrips: number;
  totalCost: number;
};

type FactoryDebtRow = {
  factoryId: string;
  factoryName: string;
  totalRecords: number;
  totalInputWeight: number;
  totalCost: number;
};

const paymentStatusOptions: { value: PaymentStatus; label: string }[] = [
  { value: "unpaid", label: "Chưa trả" },
  { value: "partial", label: "Trả một phần" },
  { value: "paid", label: "Đã trả" },
];

export function DebtsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [purchaseSlips, setPurchaseSlips] = useState<PurchaseSlip[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [transportTrips, setTransportTrips] = useState<TransportTrip[]>([]);
  const [boats, setBoats] = useState<TransporterBoat[]>([]);
  const [processingRecords, setProcessingRecords] = useState<ProcessingRecord[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [seasonFilter, setSeasonFilter] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);

    const [
      seasonsResult,
      purchaseSlipsResult,
      brokersResult,
      transportTripsResult,
      boatsResult,
      processingRecordsResult,
      factoriesResult,
    ] = await Promise.all([
      supabase.from("seasons").select("*").order("from_date", { ascending: false }),
      supabase.from("purchase_slips").select("*"),
      supabase.from("brokers").select("*").order("name", { ascending: true }),
      supabase.from("transport_trips").select("*"),
      supabase.from("transporter_boats").select("*").order("boat_name", { ascending: true }),
      supabase.from("processing_records").select("*"),
      supabase.from("factories").select("*").order("name", { ascending: true }),
    ]);

    const firstError =
      seasonsResult.error ??
      purchaseSlipsResult.error ??
      brokersResult.error ??
      transportTripsResult.error ??
      boatsResult.error ??
      processingRecordsResult.error ??
      factoriesResult.error;

    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    setSeasons(seasonsResult.data ?? []);
    setPurchaseSlips(purchaseSlipsResult.data ?? []);
    setBrokers(brokersResult.data ?? []);
    setTransportTrips(transportTripsResult.data ?? []);
    setBoats(boatsResult.data ?? []);
    setProcessingRecords(processingRecordsResult.data ?? []);
    setFactories(factoriesResult.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  const summaries = useMemo(() => {
    const brokerMap = new Map(brokers.map((broker) => [broker.id, broker]));
    const boatMap = new Map(boats.map((boat) => [boat.id, boat]));
    const factoryMap = new Map(factories.map((factory) => [factory.id, factory]));

    const filteredPurchaseSlips = purchaseSlips.filter((item) => {
      const seasonMatch = !seasonFilter || item.season_id === seasonFilter;
      const paymentMatch = !paymentStatusFilter || item.payment_status === paymentStatusFilter;
      return seasonMatch && paymentMatch;
    });

    const filteredTransportTrips = transportTrips.filter((trip) => {
      const seasonMatch = !seasonFilter || trip.season_id === seasonFilter;
      const paymentMatch = !paymentStatusFilter || trip.payment_status === paymentStatusFilter;
      return seasonMatch && paymentMatch;
    });

    const filteredProcessingRecords = processingRecords.filter((record) => {
      const seasonMatch = !seasonFilter || record.season_id === seasonFilter;
      const paymentMatch = !paymentStatusFilter || record.payment_status === paymentStatusFilter;
      return seasonMatch && paymentMatch;
    });

    const brokerDebtMap = new Map<string, BrokerDebtRow>();
    for (const item of filteredPurchaseSlips) {
      const broker = brokerMap.get(item.broker_id);
      const current = brokerDebtMap.get(item.broker_id) ?? {
        brokerId: item.broker_id,
        brokerName: broker?.name ?? "-",
        totalWeight: 0,
        totalCommission: 0,
      };

      current.totalWeight += item.weight_kg;
      current.totalCommission += item.broker_commission_total;
      brokerDebtMap.set(item.broker_id, current);
    }

    const transportDebtMap = new Map<string, TransportDebtRow>();
    for (const trip of filteredTransportTrips) {
      const boat = boatMap.get(trip.transporter_boat_id);
      const current = transportDebtMap.get(trip.transporter_boat_id) ?? {
        boatId: trip.transporter_boat_id,
        boatName: boat?.boat_name ?? "-",
        ownerName: boat?.owner_name ?? "-",
        totalTrips: 0,
        totalCost: 0,
      };

      current.totalTrips += 1;
      current.totalCost += trip.total_cost;
      transportDebtMap.set(trip.transporter_boat_id, current);
    }

    const factoryDebtMap = new Map<string, FactoryDebtRow>();
    for (const record of filteredProcessingRecords) {
      const factory = factoryMap.get(record.factory_id);
      const current = factoryDebtMap.get(record.factory_id) ?? {
        factoryId: record.factory_id,
        factoryName: factory?.name ?? "-",
        totalRecords: 0,
        totalInputWeight: 0,
        totalCost: 0,
      };

      current.totalRecords += 1;
      current.totalInputWeight += record.input_weight_kg;
      current.totalCost += record.total_cost;
      factoryDebtMap.set(record.factory_id, current);
    }

    const brokerRows = Array.from(brokerDebtMap.values()).sort(
      (a, b) => b.totalCommission - a.totalCommission,
    );
    const transportRows = Array.from(transportDebtMap.values()).sort(
      (a, b) => b.totalCost - a.totalCost,
    );
    const factoryRows = Array.from(factoryDebtMap.values()).sort(
      (a, b) => b.totalCost - a.totalCost,
    );

    return {
      brokerRows,
      transportRows,
      factoryRows,
      totalBrokerCommission: brokerRows.reduce((total, row) => total + row.totalCommission, 0),
      totalTransportCost: transportRows.reduce((total, row) => total + row.totalCost, 0),
      totalFactoryCost: factoryRows.reduce((total, row) => total + row.totalCost, 0),
    };
  }, [
    boats,
    brokers,
    factories,
    paymentStatusFilter,
    processingRecords,
    purchaseSlips,
    seasonFilter,
    transportTrips,
  ]);

  function exportDebtsPdf() {
    exportPdf({
      title: "Debt summary",
      fileName: "debt-summary.pdf",
      tables: buildDebtExportTables(summaries),
    });
  }

  function exportDebtsExcel() {
    exportExcel({
      fileName: "debt-summary.xlsx",
      sheets: buildDebtExportTables(summaries),
    });
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Công nợ</h1>
          <p>Tổng hợp công nợ phát sinh từ dữ liệu mua lúa, vận chuyển và xử lý.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" type="button" onClick={exportDebtsPdf}>
            <FileDown size={17} aria-hidden="true" />
            PDF
          </button>
          <button className="secondary-button" type="button" onClick={exportDebtsExcel}>
            <FileDown size={17} aria-hidden="true" />
            Excel
          </button>
        </div>
      </header>

      <div className="filter-bar">
        <label className="field">
          <span>Mùa vụ</span>
          <select value={seasonFilter} onChange={(event) => setSeasonFilter(event.target.value)}>
            <option value="">Tất cả mùa vụ</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Trạng thái thanh toán</span>
          <select
            value={paymentStatusFilter}
            onChange={(event) => setPaymentStatusFilter(event.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            {paymentStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <span>Nợ hoa hồng cò</span>
          <strong>{formatMoney(summaries.totalBrokerCommission)}</strong>
        </div>
        <div className="metric-card">
          <span>Nợ vận chuyển</span>
          <strong>{formatMoney(summaries.totalTransportCost)}</strong>
        </div>
        <div className="metric-card">
          <span>Nợ nhà máy</span>
          <strong>{formatMoney(summaries.totalFactoryCost)}</strong>
        </div>
      </div>

      {error ? <div className="alert error-alert">{error}</div> : null}

      {loading ? (
        <div className="state-box">Đang tải công nợ...</div>
      ) : (
        <>
          <DebtSection title="Công nợ hoa hồng cò lúa">
            {summaries.brokerRows.length === 0 ? (
              <div className="state-box">Không có dữ liệu hoa hồng phù hợp.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Cò lúa</th>
                      <th>Tổng kg</th>
                      <th>Tổng hoa hồng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.brokerRows.map((row) => (
                      <tr key={row.brokerId}>
                        <td>{row.brokerName}</td>
                        <td>{formatNumber(row.totalWeight)}</td>
                        <td>{formatMoney(row.totalCommission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DebtSection>

          <DebtSection title="Công nợ vận chuyển">
            {summaries.transportRows.length === 0 ? (
              <div className="state-box">Không có dữ liệu vận chuyển phù hợp.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ghe</th>
                      <th>Chủ ghe</th>
                      <th>Số chuyến</th>
                      <th>Tổng chi phí</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.transportRows.map((row) => (
                      <tr key={row.boatId}>
                        <td>{row.boatName}</td>
                        <td>{row.ownerName}</td>
                        <td>{row.totalTrips}</td>
                        <td>{formatMoney(row.totalCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DebtSection>

          <DebtSection title="Công nợ nhà máy">
            {summaries.factoryRows.length === 0 ? (
              <div className="state-box">Không có dữ liệu xử lý phù hợp.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nhà máy</th>
                      <th>Số phiếu</th>
                      <th>Tổng kg đầu vào</th>
                      <th>Tổng chi phí</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.factoryRows.map((row) => (
                      <tr key={row.factoryId}>
                        <td>{row.factoryName}</td>
                        <td>{row.totalRecords}</td>
                        <td>{formatNumber(row.totalInputWeight)}</td>
                        <td>{formatMoney(row.totalCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DebtSection>
        </>
      )}
    </section>
  );
}

function DebtSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="table-card debt-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function buildDebtExportTables(summaries: {
  brokerRows: BrokerDebtRow[];
  transportRows: TransportDebtRow[];
  factoryRows: FactoryDebtRow[];
}) {
  return [
    {
      title: "Broker debts",
      headers: ["Broker", "Total kg", "Total commission"],
      rows: summaries.brokerRows.map((row) => [
        row.brokerName,
        row.totalWeight,
        row.totalCommission,
      ]),
    },
    {
      title: "Transport debts",
      headers: ["Boat", "Owner", "Total trips", "Total cost"],
      rows: summaries.transportRows.map((row) => [
        row.boatName,
        row.ownerName,
        row.totalTrips,
        row.totalCost,
      ]),
    },
    {
      title: "Factory debts",
      headers: ["Factory", "Total records", "Total input weight", "Total cost"],
      rows: summaries.factoryRows.map((row) => [
        row.factoryName,
        row.totalRecords,
        row.totalInputWeight,
        row.totalCost,
      ]),
    },
  ];
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}
