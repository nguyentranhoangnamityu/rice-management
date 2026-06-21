import { ArrowLeft, Calendar, Coins, Info, Package, Percent, Ship, TrendingUp, Edit2, Trash2, Plus, Check, X, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatDbError } from "../../lib/db-errors";
import { supabase } from "../../lib/supabase";
import { syncTripWeightsFromPurchaseSlips } from "../../lib/trip-transport-expense";
import { formatTonFromKg } from "../../lib/drying-record";
import {
  ROUTE_TRANSPORT_EXPENSE_DESCRIPTION,
  calculateTransportCost,
  calculateTransportLoss,
  formatTransportPriceBasis,
  formatTransportPriceLabel,
  sumPurchaseSlipWeightKg,
} from "../../lib/transport-cost";
import type { Database, Enums, Tables } from "../../types/database";

type Trip = Tables<"trips">;
type TripExpense = Tables<"trip_expenses">;
type ProcessingRecord = Tables<"processing_records">;
type PurchaseSlip = Tables<"purchase_slips">;
type TripSale = Tables<"trip_sales">;
type Warehouse = Tables<"warehouses">;
type InventoryTransaction = Tables<"inventory_transactions">;
type InventoryItemType = Enums<"inventory_item_type">;
type Season = Tables<"seasons">;
type RiceType = Tables<"rice_types">;
type Farmer = Tables<"farmers">;
type Broker = Tables<"brokers">;
type TransporterBoat = Tables<"transporter_boats">;
type TransportRoute = Tables<"transport_routes">;
type Factory = Tables<"factories">;
type TripStatus = Enums<"trip_status">;
type TripExpenseType = Enums<"trip_expense_type">;
type PaymentStatus = Enums<"payment_status">;
type TripSummary = Database["public"]["Views"]["trip_summaries"]["Row"];

type DetailedTrip = Trip & {
  season?: Season | null;
  riceType?: RiceType | null;
  boat?: TransporterBoat | null;
  route?: TransportRoute | null;
  factory?: Factory | null;
  summary?: TripSummary | null;
};

type DetailedPurchaseSlip = PurchaseSlip & {
  farmer?: Farmer | null;
  broker?: Broker | null;
  season?: Season | null;
  riceType?: RiceType | null;
};

const statusOptions: { value: TripStatus; label: string; colorClass: string }[] = [
  { value: "draft", label: "Nháp", colorClass: "badge-draft" },
  { value: "purchasing", label: "Đang mua", colorClass: "badge-purchasing" },
  { value: "loaded_to_boat", label: "Đã xuống ghe", colorClass: "badge-boat" },
  { value: "drying", label: "Đang sấy", colorClass: "badge-drying" },
  { value: "milling", label: "Đang xay xát", colorClass: "badge-milling" },
  { value: "ready_to_sell", label: "Sẵn sàng bán", colorClass: "badge-ready" },
  { value: "selling", label: "Đang bán", colorClass: "badge-selling" },
  { value: "completed", label: "Hoàn tất", colorClass: "badge-completed" },
  { value: "cancelled", label: "Đã hủy", colorClass: "badge-cancelled" },
];

const expenseTypeLabels: Record<TripExpenseType, string> = {
  loi_cost: "Chi phí lòi",
  rice_carrying_labor: "Công nhân vác lúa / bốc xếp xuống ghe",
  boat_cost: "Chi phí ghe",
  boat_unloading: "Bốc xếp xuống ghe (cũ)",
  worker_allowance: "Bồi dưỡng công nhân",
  drying_cost: "Chi phí sấy",
  milling_cost: "Chi phí xay xát",
  warehouse_loading: "Bốc xếp lên kho",
  transport_cost: "Chi phí vận chuyển",
  fuel_fee: "Tiền dầu",
  weighing_fee: "Tiền cân",
  other: "Chi phí khác",
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  unpaid: "Chưa trả",
  partial: "Trả một phần",
  paid: "Đã trả",
};

export function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<DetailedTrip | null>(null);
  const [purchaseSlips, setPurchaseSlips] = useState<DetailedPurchaseSlip[]>([]);
  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [dryingRecords, setDryingRecords] = useState<ProcessingRecord[]>([]);
  const [millingRecords, setMillingRecords] = useState<ProcessingRecord[]>([]);
  const [sales, setSales] = useState<TripSale[]>([]);
  const [inventoryTransactions, setInventoryTransactions] = useState<InventoryTransaction[]>([]);

  // Static reference data
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [riceTypes, setRiceTypes] = useState<RiceType[]>([]);
  const [boats, setBoats] = useState<TransporterBoat[]>([]);
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // In-place edit active step state
  // null means read-only, otherwise designates which step is being edited
  const [activeEditStep, setActiveEditStep] = useState<"step1" | "step2" | "step3" | "step4" | "step5" | "step6" | "step7" | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // STEP 1 Form State
  const [step1Form, setStep1Form] = useState({
    code: "",
    season_id: "",
    rice_type_id: "",
    transporter_boat_id: "",
    route_id: "",
    start_date: "",
    unloaded_weight_kg: 0,
    note: "",
  });
  const [savingStep1, setSavingStep1] = useState(false);

  // STEP 2 Assignment State (Purchase Slips)
  const [availableSlips, setAvailableSlips] = useState<DetailedPurchaseSlip[]>([]);
  const [loadingAvailableSlips, setLoadingAvailableSlips] = useState(false);
  const [purchaseSlipSearch, setPurchaseSlipSearch] = useState("");
  const [filterSameRiceType, setFilterSameRiceType] = useState(false);
  const [filterSameSeason, setFilterSameSeason] = useState(false);

  // STEP 3 Form State (Expenses)
  const [expenseForm, setExpenseForm] = useState({
    id: "", // empty for new
    type: "other" as TripExpenseType,
    description: "",
    amount: 0,
    expense_date: "",
    payment_status: "unpaid" as PaymentStatus,
    party_name: "",
    note: "",
  });
  const [savingExpense, setSavingExpense] = useState(false);

  // STEP 4 Form State (Drying)
  const [dryingForm, setDryingForm] = useState({
    id: "", // empty for new
    factory_id: "",
    processed_date: "",
    input_weight_kg: 0,
    output_weight_kg: 0,
    unit_price: 0,
    total_cost: 0,
    payment_status: "unpaid" as PaymentStatus,
    note: "",
  });
  const [savingDrying, setSavingDrying] = useState(false);

  // STEP 5 Form State (Warehouse intake after drying)
  const [inventoryForm, setInventoryForm] = useState({
    id: "",
    warehouse_id: "",
    quantity_kg: 0,
    transaction_date: "",
    item_type: "paddy" as InventoryItemType,
    note: "",
  });
  const [savingInventory, setSavingInventory] = useState(false);

  // STEP 6 Form State (Milling)
  const [millingForm, setMillingForm] = useState({
    id: "", // empty for new
    factory_id: "",
    processed_date: "",
    input_weight_kg: 0,
    output_weight_kg: 0,
    unit_price: 0,
    total_cost: 0,
    payment_status: "unpaid" as PaymentStatus,
    note: "",
  });
  const [savingMilling, setSavingMilling] = useState(false);

  // STEP 7 Form State (Sales)
  const [saleForm, setSaleForm] = useState({
    id: "", // empty for new
    buyer_name: "",
    sale_date: "",
    rice_weight_kg: 0,
    unit_price: 0,
    total_amount: 0,
    payment_status: "unpaid" as PaymentStatus,
    note: "",
  });
  const [savingSale, setSavingSale] = useState(false);

  const seasonMap = useMemo(() => new Map(seasons.map((s) => [s.id, s])), [seasons]);
  const riceTypeMap = useMemo(() => new Map(riceTypes.map((r) => [r.id, r])), [riceTypes]);
  const boatMap = useMemo(() => new Map(boats.map((b) => [b.id, b])), [boats]);
  const routeMap = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);
  const factoryMap = useMemo(() => new Map(factories.map((f) => [f.id, f])), [factories]);
  const farmerMap = useMemo(() => new Map(farmers.map((f) => [f.id, f])), [farmers]);
  const brokerMap = useMemo(() => new Map(brokers.map((b) => [b.id, b])), [brokers]);
  const warehouseMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);

  // Load static reference tables
  useEffect(() => {
    async function loadStaticData() {
      try {
        const [
          seasonsResult,
          riceTypesResult,
          boatsResult,
          routesResult,
          factoriesResult,
          farmersResult,
          brokersResult,
          warehousesResult,
        ] = await Promise.all([
          supabase.from("seasons").select("*").order("from_date", { ascending: false }),
          supabase.from("rice_types").select("*").order("name", { ascending: true }),
          supabase.from("transporter_boats").select("*").order("boat_name", { ascending: true }),
          supabase.from("transport_routes").select("*").order("name", { ascending: true }),
          supabase.from("factories").select("*").order("name", { ascending: true }),
          supabase.from("farmers").select("*").order("name", { ascending: true }),
          supabase.from("brokers").select("*").order("name", { ascending: true }),
          supabase.from("warehouses").select("*").order("name", { ascending: true }),
        ]);

        const firstStaticError =
          seasonsResult.error ??
          riceTypesResult.error ??
          boatsResult.error ??
          routesResult.error ??
          factoriesResult.error ??
          farmersResult.error ??
          brokersResult.error ??
          warehousesResult.error;

        if (firstStaticError) {
          setError(formatDbError(firstStaticError));
          return;
        }

        setSeasons(seasonsResult.data ?? []);
        setRiceTypes(riceTypesResult.data ?? []);
        setBoats(boatsResult.data ?? []);
        setRoutes(routesResult.data ?? []);
        setFactories(factoriesResult.data ?? []);
        setFarmers(farmersResult.data ?? []);
        setBrokers(brokersResult.data ?? []);
        setWarehouses(warehousesResult.data ?? []);
      } catch (err: any) {
        setError(err.message || "Lỗi tải dữ liệu tham chiếu.");
      }
    }

    void loadStaticData();
  }, []);

  // Main fetch function for specific trip data
  const loadTripData = async () => {
    if (!id) return;
    try {
      const [tripResult, summaryResult, slipsResult, expensesResult, recordsResult, salesResult, inventoryResult] =
        await Promise.all([
        supabase.from("trips").select("*").eq("id", id).maybeSingle(),
        supabase.from("trip_summaries").select("*").eq("trip_id", id).maybeSingle(),
        supabase.from("purchase_slips").select("*").eq("trip_id", id).order("purchase_date", { ascending: false }),
        supabase.from("trip_expenses").select("*").eq("trip_id", id).order("expense_date", { ascending: false }),
        supabase.from("processing_records").select("*").eq("trip_id", id).order("processed_date", { ascending: false }),
        supabase.from("trip_sales").select("*").eq("trip_id", id).order("sale_date", { ascending: false }),
        supabase.from("inventory_transactions").select("*").eq("trip_id", id).order("transaction_date", { ascending: false }),
      ]);

      if (tripResult.error) {
        setError(formatDbError(tripResult.error));
        return;
      }

      if (!tripResult.data) {
        setError("Không tìm thấy chuyến hàng yêu cầu.");
        return;
      }

      const tRow = tripResult.data as Trip;
      setTrip({
        ...tRow,
        season: tRow.season_id ? seasonMap.get(tRow.season_id) ?? null : null,
        riceType: tRow.rice_type_id ? riceTypeMap.get(tRow.rice_type_id) ?? null : null,
        boat: tRow.transporter_boat_id ? boatMap.get(tRow.transporter_boat_id) ?? null : null,
        route: tRow.route_id ? routeMap.get(tRow.route_id) ?? null : null,
        factory: tRow.factory_id ? factoryMap.get(tRow.factory_id) ?? null : null,
        summary: summaryResult.data ?? null,
      });

      // Mapped slips
      setPurchaseSlips(
        (slipsResult.data ?? []).map((slip) => ({
          ...slip,
          farmer: slip.farmer_id ? farmerMap.get(slip.farmer_id) ?? null : null,
          broker: slip.broker_id ? brokerMap.get(slip.broker_id) ?? null : null,
          season: slip.season_id ? seasonMap.get(slip.season_id) ?? null : null,
          riceType: slip.rice_type_id ? riceTypeMap.get(slip.rice_type_id) ?? null : null,
        }))
      );

      // Mapped expenses
      setExpenses(expensesResult.data ?? []);

      // Separate records
      const records = recordsResult.data ?? [];
      setDryingRecords(records.filter((r) => r.service_type === "drying"));
      setMillingRecords(records.filter((r) => r.service_type === "milling"));

      // Mapped sales
      setSales(salesResult.data ?? []);

      if (inventoryResult.error) {
        setError(formatDbError(inventoryResult.error));
        return;
      }
      setInventoryTransactions(inventoryResult.data ?? []);
    } catch (err: any) {
      setError(err.message || "Lỗi cập nhật dữ liệu chuyến hàng.");
    }
  };

  // Mount loading
  useEffect(() => {
    if (seasons.length > 0) {
      setLoading(true);
      void loadTripData().finally(() => setLoading(false));
    }
  }, [id, seasons]);

  // Load available slips for Step 2
  const loadAvailableSlips = async () => {
    if (!id) return;
    setLoadingAvailableSlips(true);
    try {
      const { data, error: slipsErr } = await supabase
        .from("purchase_slips")
        .select("*")
        .is("trip_id", null)
        .order("purchase_date", { ascending: false });

      if (slipsErr) {
        setError(formatDbError(slipsErr));
      } else {
        setAvailableSlips(
          (data ?? []).map((slip) => ({
            ...slip,
            farmer: slip.farmer_id ? farmerMap.get(slip.farmer_id) ?? null : null,
            broker: slip.broker_id ? brokerMap.get(slip.broker_id) ?? null : null,
            season: slip.season_id ? seasonMap.get(slip.season_id) ?? null : null,
            riceType: slip.rice_type_id ? riceTypeMap.get(slip.rice_type_id) ?? null : null,
          }))
        );
      }
    } catch (e: any) {
      setError(e.message || "Lỗi tải phiếu mua hàng.");
    } finally {
      setLoadingAvailableSlips(false);
    }
  };

  // Step 2 Available Slips Filtered
  const filteredAvailableSlips = useMemo(() => {
    return availableSlips.filter((slip) => {
      // Search text
      if (purchaseSlipSearch.trim()) {
        const query = purchaseSlipSearch.toLowerCase();
        const farmerName = slip.farmer?.name?.toLowerCase() || "";
        const brokerName = slip.broker?.name?.toLowerCase() || "";
        const slipCode = `ps-${slip.id.slice(0, 5)}`.toLowerCase();
        if (!farmerName.includes(query) && !brokerName.includes(query) && !slipCode.includes(query)) {
          return false;
        }
      }
      // Same Rice Type Filter
      if (filterSameRiceType && trip?.rice_type_id && slip.rice_type_id !== trip.rice_type_id) {
        return false;
      }
      // Same Season Filter
      if (filterSameSeason && trip?.season_id && slip.season_id !== trip.season_id) {
        return false;
      }
      return true;
    });
  }, [availableSlips, purchaseSlipSearch, filterSameRiceType, filterSameSeason, trip]);

  // Flash success message helper
  const triggerSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg(null);
    }, 4000);
  };

  // Direct Status Update Handler
  const handleStatusChange = async (newStatus: TripStatus) => {
    if (!trip || !id) return;
    setUpdatingStatus(true);
    setError(null);
    try {
      const { error: updErr } = await supabase.from("trips").update({ status: newStatus }).eq("id", id);
      if (updErr) {
        setError(formatDbError(updErr));
      } else {
        await loadTripData();
        triggerSuccess(`Đã cập nhật trạng thái chuyến hàng sang: ${statusOptions.find((o) => o.value === newStatus)?.label}`);
      }
    } catch (e: any) {
      setError(e.message || "Lỗi cập nhật trạng thái.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Loss Calculation Helper
  const calculateLoss = (input: number, output: number) => {
    const lossWeight = Math.max(0, input - output);
    const lossPercent = input > 0 ? round2((lossWeight / input) * 100) : 0;
    return { lossWeight, lossPercent };
  };

  const round2 = (val: number) => {
    return Math.round(val * 100) / 100;
  };

  const suggestedDriedKg = useMemo(
    () => round2(dryingRecords.reduce((sum, record) => sum + (record.output_weight_kg || 0), 0)),
    [dryingRecords],
  );

  const inventoriedKg = useMemo(
    () =>
      round2(
        inventoryTransactions
          .filter((tx) => tx.type === "in")
          .reduce((sum, tx) => sum + Math.abs(tx.quantity_kg || 0), 0),
      ),
    [inventoryTransactions],
  );

  const remainingDriedKg = useMemo(
    () => Math.max(0, round2(suggestedDriedKg - inventoriedKg)),
    [suggestedDriedKg, inventoriedKg],
  );

  const defaultInventoryDate = useMemo(() => {
    const latestDryingDate = dryingRecords.find((record) => record.processed_date)?.processed_date;
    return latestDryingDate || trip?.start_date || new Date().toISOString().slice(0, 10);
  }, [dryingRecords, trip?.start_date]);

  const canEnterWarehouse = dryingRecords.length > 0 && millingRecords.length === 0;
  const tripCompletedViaWarehouse =
    inventoryTransactions.some((tx) => tx.type === "in") && trip?.status === "completed";

  const routeTransportExpense = useMemo(
    () => expenses.find((expense) => expense.description === ROUTE_TRANSPORT_EXPENSE_DESCRIPTION) ?? null,
    [expenses],
  );

  const linkedPurchaseWeightKg = useMemo(
    () => sumPurchaseSlipWeightKg(purchaseSlips),
    [purchaseSlips],
  );

  const step1SelectedRoute = useMemo(
    () => (step1Form.route_id ? routeMap.get(step1Form.route_id) ?? null : null),
    [step1Form.route_id, routeMap],
  );

  const step1TransportPreview = useMemo(() => {
    if (!step1SelectedRoute || step1SelectedRoute.transport_price <= 0) {
      return null;
    }
    const loss = calculateTransportLoss(
      linkedPurchaseWeightKg,
      Number(step1Form.unloaded_weight_kg) || 0,
    );
    const transportCost = calculateTransportCost({
      loadedWeightKg: linkedPurchaseWeightKg,
      unloadedWeightKg: Number(step1Form.unloaded_weight_kg) || 0,
      priceBasis: step1SelectedRoute.transport_price_basis,
      transportPrice: step1SelectedRoute.transport_price,
    });
    return { loss, transportCost, route: step1SelectedRoute };
  }, [linkedPurchaseWeightKg, step1Form.unloaded_weight_kg, step1SelectedRoute]);

  const toNullable = (val: string) => {
    return val.trim() ? val.trim() : null;
  };

  // Auto-calculations for form events
  useEffect(() => {
    setDryingForm((prev) => ({
      ...prev,
      total_cost: Math.round(prev.output_weight_kg * prev.unit_price),
    }));
  }, [dryingForm.output_weight_kg, dryingForm.unit_price]);

  useEffect(() => {
    setMillingForm((prev) => ({
      ...prev,
      total_cost: Math.round(prev.input_weight_kg * prev.unit_price),
    }));
  }, [millingForm.input_weight_kg, millingForm.unit_price]);

  useEffect(() => {
    setSaleForm((prev) => ({
      ...prev,
      total_amount: Math.round(prev.rice_weight_kg * prev.unit_price),
    }));
  }, [saleForm.rice_weight_kg, saleForm.unit_price]);

  // Save Step 1 (General Info)
  const saveStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSavingStep1(true);
    setError(null);
    try {
      const unloadedWeightKg = Number(step1Form.unloaded_weight_kg) || 0;
      const selectedRoute = step1Form.route_id ? routeMap.get(step1Form.route_id) ?? null : null;
      const selectedBoat = step1Form.transporter_boat_id ? boatMap.get(step1Form.transporter_boat_id) ?? null : null;

      const { error: updErr } = await supabase
        .from("trips")
        .update({
          code: step1Form.code,
          season_id: toNullable(step1Form.season_id),
          rice_type_id: toNullable(step1Form.rice_type_id),
          transporter_boat_id: toNullable(step1Form.transporter_boat_id),
          route_id: toNullable(step1Form.route_id),
          start_date: toNullable(step1Form.start_date),
          unloaded_weight_kg: unloadedWeightKg,
          note: toNullable(step1Form.note),
        })
        .eq("id", id);

      if (updErr) {
        setError(formatDbError(updErr));
        return;
      }

      const weightSync = await syncTripWeightsFromPurchaseSlips({
        tripId: id,
        unloadedWeightKg,
        route: selectedRoute,
        expenseDate: toNullable(step1Form.start_date),
        partyName: selectedBoat?.boat_name ?? selectedRoute?.name ?? null,
      });

      await loadTripData();
      setActiveEditStep(null);
      if (weightSync.transportSync.synced) {
        triggerSuccess(
          `Đã lưu chuyến hàng. Tổng xuống ghe: ${formatNumber(weightSync.loadedWeightKg)} kg · Tiền VC: ${formatMoney(weightSync.transportSync.amount)}.`,
        );
      } else {
        triggerSuccess(
          `Đã lưu chuyến hàng. Tổng xuống ghe từ phiếu mua: ${formatNumber(weightSync.loadedWeightKg)} kg.`,
        );
      }
    } catch (err: any) {
      setError(formatDbError(err));
    } finally {
      setSavingStep1(false);
    }
  };

  // STEP 2 Link/Unlink Purchase Slip Handlers
  const refreshTripWeightsAfterSlipChange = async () => {
    if (!id || !trip) return;
    await syncTripWeightsFromPurchaseSlips({
      tripId: id,
      unloadedWeightKg: trip.unloaded_weight_kg || 0,
      route: trip.route_id ? routeMap.get(trip.route_id) ?? null : null,
      expenseDate: trip.start_date,
      partyName: trip.boat?.boat_name ?? trip.route?.name ?? null,
    });
    await Promise.all([loadTripData(), loadAvailableSlips()]);
  };

  const handleLinkSlip = async (slipId: string) => {
    setError(null);
    try {
      const { error: linkErr } = await supabase.from("purchase_slips").update({ trip_id: id }).eq("id", slipId);
      if (linkErr) {
        setError(formatDbError(linkErr));
      } else {
        await refreshTripWeightsAfterSlipChange();
        triggerSuccess("Đã gán phiếu mua và cập nhật tổng kg xuống ghe.");
      }
    } catch (e: any) {
      setError(formatDbError(e));
    }
  };

  const handleUnlinkSlip = async (slipId: string) => {
    setError(null);
    try {
      const { error: unlinkErr } = await supabase.from("purchase_slips").update({ trip_id: null }).eq("id", slipId);
      if (unlinkErr) {
        setError(formatDbError(unlinkErr));
      } else {
        await refreshTripWeightsAfterSlipChange();
        triggerSuccess("Đã gỡ phiếu mua và cập nhật tổng kg xuống ghe.");
      }
    } catch (e: any) {
      setError(formatDbError(e));
    }
  };

  // STEP 3 Save Expense Handler (Add/Edit)
  const saveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSavingExpense(true);
    setError(null);
    try {
      const payload = {
        trip_id: id,
        type: expenseForm.type,
        description: toNullable(expenseForm.description),
        amount: Number(expenseForm.amount) || 0,
        expense_date: toNullable(expenseForm.expense_date),
        payment_status: expenseForm.payment_status,
        party_name: toNullable(expenseForm.party_name),
        note: toNullable(expenseForm.note),
      };

      if (expenseForm.id) {
        // Edit mode
        const { error: expErr } = await supabase.from("trip_expenses").update(payload).eq("id", expenseForm.id);
        if (expErr) throw expErr;
        triggerSuccess("Đã cập nhật chi phí.");
      } else {
        // Create mode
        const { error: expErr } = await supabase.from("trip_expenses").insert(payload);
        if (expErr) throw expErr;
        triggerSuccess("Đã thêm chi phí mới.");
      }

      // Reset Form & Reload
      setExpenseForm({
        id: "",
        type: "other",
        description: "",
        amount: 0,
        expense_date: trip?.start_date || "",
        payment_status: "unpaid",
        party_name: "",
        note: "",
      });
      await loadTripData();
    } catch (e: any) {
      setError(formatDbError(e));
    } finally {
      setSavingExpense(false);
    }
  };

  const deleteExpense = async (expenseId: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa chi phí này không?")) return;
    setError(null);
    try {
      const { error: delErr } = await supabase.from("trip_expenses").delete().eq("id", expenseId);
      if (delErr) {
        setError(formatDbError(delErr));
      } else {
        await loadTripData();
        triggerSuccess("Đã xóa chi phí thành công.");
      }
    } catch (e: any) {
      setError(e.message || "Lỗi xóa chi phí.");
    }
  };

  // STEP 4 Save Drying Record Handler (Add/Edit)
  const saveDryingRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !trip) return;
    setSavingDrying(true);
    setError(null);

    try {
      if (!dryingForm.factory_id) {
        setError("Vui lòng chọn nhà máy sấy.");
        setSavingDrying(false);
        return;
      }

      const loss = calculateLoss(Number(dryingForm.input_weight_kg) || 0, Number(dryingForm.output_weight_kg) || 0);
      const totalCost = Number(dryingForm.total_cost) || 0;

      const payload = {
        trip_id: id,
        factory_id: dryingForm.factory_id,
        processed_date: toNullable(dryingForm.processed_date) ?? trip.start_date ?? new Date().toISOString().slice(0, 10),
        service_type: "drying" as const,
        season_id: trip.season_id,
        rice_type_id: trip.rice_type_id ?? "",
        input_weight_kg: Number(dryingForm.input_weight_kg) || 0,
        output_weight_kg: Number(dryingForm.output_weight_kg) || 0,
        loss_weight_kg: loss.lossWeight,
        loss_percent: loss.lossPercent,
        unit_price: Number(dryingForm.unit_price) || 0,
        total_cost: totalCost,
        payment_status: dryingForm.payment_status,
        note: toNullable(dryingForm.note),
      };

      if (dryingForm.id) {
        const { error: prErr } = await supabase.from("processing_records").update(payload).eq("id", dryingForm.id);
        if (prErr) throw prErr;

        // Also sync the trip expense if exists
        await supabase
          .from("trip_expenses")
          .update({
            amount: totalCost,
            expense_date: toNullable(dryingForm.processed_date),
            payment_status: dryingForm.payment_status,
            party_name: factoryMap.get(dryingForm.factory_id)?.name ?? null,
            note: toNullable(dryingForm.note),
          })
          .eq("trip_id", id)
          .eq("type", "drying_cost")
          .like("description", `%${dryingForm.id.slice(0, 4)}%`);

        triggerSuccess("Đã cập nhật nhật ký sấy lúa.");
      } else {
        const { data: newRecord, error: prErr } = await supabase
          .from("processing_records")
          .insert(payload)
          .select("*")
          .single();

        if (prErr) throw prErr;

        // Automatically sync to trip expenses
        const expenseId = newRecord ? newRecord.id.slice(0, 4) : "mới";
        await supabase.from("trip_expenses").insert({
          trip_id: id,
          type: "drying_cost",
          description: `Chi phí sấy lúa [Đợt ${expenseId}]`,
          amount: totalCost,
          expense_date: toNullable(dryingForm.processed_date),
          payment_status: dryingForm.payment_status,
          party_name: factoryMap.get(dryingForm.factory_id)?.name ?? null,
          note: toNullable(dryingForm.note),
        });

        triggerSuccess("Đã ghi nhận đợt sấy lúa mới và cập nhật chi phí.");
      }

      setDryingForm({
        id: "",
        factory_id: "",
        processed_date: trip.start_date || "",
        input_weight_kg: 0,
        output_weight_kg: 0,
        unit_price: 0,
        total_cost: 0,
        payment_status: "unpaid",
        note: "",
      });
      await loadTripData();
    } catch (e: any) {
      setError(formatDbError(e));
    } finally {
      setSavingDrying(false);
    }
  };

  const deleteDryingRecord = async (record: ProcessingRecord) => {
    if (!id) return;
    if (!window.confirm("Bạn có chắc chắn muốn xóa nhật ký sấy lúa này?")) return;
    setError(null);
    try {
      const { error: delErr } = await supabase.from("processing_records").delete().eq("id", record.id);
      if (delErr) throw delErr;

      // Clean up linked expense if possible
      const partialId = record.id.slice(0, 4);
      await supabase
        .from("trip_expenses")
        .delete()
        .eq("trip_id", id)
        .eq("type", "drying_cost")
        .like("description", `%${partialId}%`);

      await loadTripData();
      triggerSuccess("Đã xóa nhật ký sấy lúa và chi phí sấy liên quan.");
    } catch (e: any) {
      setError(formatDbError(e));
    }
  };

  const completeTripAfterWarehouse = async (transactionDate: string) => {
    if (!id) return;
    const { error: tripErr } = await supabase
      .from("trips")
      .update({
        status: "completed",
        end_date: toNullable(transactionDate) ?? new Date().toISOString().slice(0, 10),
      })
      .eq("id", id);
    if (tripErr) throw tripErr;
  };

  // STEP 5 Save Warehouse Intake Handler (Add/Edit)
  const saveInventoryRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !trip) return;

    if (!canEnterWarehouse) {
      setError("Chỉ nhập kho được khi đã sấy xong và chưa xay xát.");
      return;
    }

    setSavingInventory(true);
    setError(null);

    try {
      if (!inventoryForm.warehouse_id) {
        setError("Vui lòng chọn kho nhập.");
        setSavingInventory(false);
        return;
      }

      const quantityKg = inventoryForm.id
        ? Number(inventoryForm.quantity_kg) || 0
        : remainingDriedKg;

      if (!inventoryForm.id && remainingDriedKg <= 0) {
        setError("Không còn lúa khô để nhập kho.");
        setSavingInventory(false);
        return;
      }

      if (quantityKg <= 0) {
        setError("Khối lượng nhập kho phải lớn hơn 0.");
        setSavingInventory(false);
        return;
      }

      const payload = {
        warehouse_id: inventoryForm.warehouse_id,
        trip_id: id,
        type: "in" as const,
        item_type: inventoryForm.id ? inventoryForm.item_type : ("paddy" as const),
        quantity_kg: quantityKg,
        transaction_date: toNullable(inventoryForm.transaction_date) ?? defaultInventoryDate,
        note: toNullable(inventoryForm.note) ?? (inventoryForm.id ? null : "Nhập toàn bộ lúa khô sau sấy"),
      };

      if (inventoryForm.id) {
        const { error: invErr } = await supabase.from("inventory_transactions").update(payload).eq("id", inventoryForm.id);
        if (invErr) throw invErr;
        triggerSuccess("Đã cập nhật phiếu nhập kho.");
      } else {
        const confirmed = window.confirm(
          "Nhập kho sẽ hoàn tất chuyến hàng (không cần xay xát/bán gạo trên chuyến này). Bạn có chắc muốn tiếp tục?",
        );
        if (!confirmed) {
          setSavingInventory(false);
          return;
        }

        const { error: invErr } = await supabase.from("inventory_transactions").insert(payload);
        if (invErr) throw invErr;
        await completeTripAfterWarehouse(payload.transaction_date);
        triggerSuccess(`Đã nhập toàn bộ ${formatNumber(quantityKg)} kg lúa khô và hoàn tất chuyến hàng.`);
      }

      setInventoryForm({
        id: "",
        warehouse_id: "",
        quantity_kg: 0,
        transaction_date: trip.start_date || new Date().toISOString().slice(0, 10),
        item_type: "paddy",
        note: "",
      });
      await loadTripData();
    } catch (err: any) {
      setError(formatDbError(err));
    } finally {
      setSavingInventory(false);
    }
  };

  const deleteInventoryRecord = async (transaction: InventoryTransaction) => {
    if (!id) return;
    if (!window.confirm("Bạn có chắc chắn muốn xóa phiếu nhập kho này?")) return;
    setError(null);
    try {
      const { error: delErr } = await supabase.from("inventory_transactions").delete().eq("id", transaction.id);
      if (delErr) throw delErr;

      const remaining = inventoryTransactions.filter((tx) => tx.id !== transaction.id && tx.type === "in");
      if (remaining.length === 0 && trip?.status === "completed" && millingRecords.length === 0 && sales.length === 0) {
        const { error: tripErr } = await supabase.from("trips").update({ status: "drying", end_date: null }).eq("id", id);
        if (tripErr) throw tripErr;
      }

      await loadTripData();
      triggerSuccess("Đã xóa phiếu nhập kho.");
    } catch (err: any) {
      setError(formatDbError(err));
    }
  };

  // STEP 6 Save Milling Record Handler (Add/Edit)
  const saveMillingRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !trip) return;
    setSavingMilling(true);
    setError(null);

    try {
      if (!millingForm.factory_id) {
        setError("Vui lòng chọn nhà máy xay xát.");
        setSavingMilling(false);
        return;
      }

      const loss = calculateLoss(Number(millingForm.input_weight_kg) || 0, Number(millingForm.output_weight_kg) || 0);
      const totalCost = Number(millingForm.total_cost) || 0;

      const payload = {
        trip_id: id,
        factory_id: millingForm.factory_id,
        processed_date: toNullable(millingForm.processed_date) ?? trip.start_date ?? new Date().toISOString().slice(0, 10),
        service_type: "milling" as const,
        season_id: trip.season_id,
        rice_type_id: trip.rice_type_id ?? "",
        input_weight_kg: Number(millingForm.input_weight_kg) || 0,
        output_weight_kg: Number(millingForm.output_weight_kg) || 0,
        loss_weight_kg: loss.lossWeight,
        loss_percent: loss.lossPercent,
        unit_price: Number(millingForm.unit_price) || 0,
        total_cost: totalCost,
        payment_status: millingForm.payment_status,
        note: toNullable(millingForm.note),
      };

      if (millingForm.id) {
        const { error: prErr } = await supabase.from("processing_records").update(payload).eq("id", millingForm.id);
        if (prErr) throw prErr;

        // Update corresponding trip expense
        await supabase
          .from("trip_expenses")
          .update({
            amount: totalCost,
            expense_date: toNullable(millingForm.processed_date),
            payment_status: millingForm.payment_status,
            party_name: factoryMap.get(millingForm.factory_id)?.name ?? null,
            note: toNullable(millingForm.note),
          })
          .eq("trip_id", id)
          .eq("type", "milling_cost")
          .like("description", `%${millingForm.id.slice(0, 4)}%`);

        triggerSuccess("Đã cập nhật nhật ký xay xát.");
      } else {
        const { data: newRecord, error: prErr } = await supabase
          .from("processing_records")
          .insert(payload)
          .select("*")
          .single();

        if (prErr) throw prErr;

        // Create trip expense automatically
        const expenseId = newRecord ? newRecord.id.slice(0, 4) : "mới";
        await supabase.from("trip_expenses").insert({
          trip_id: id,
          type: "milling_cost",
          description: `Chi phí xay xát [Đợt ${expenseId}]`,
          amount: totalCost,
          expense_date: toNullable(millingForm.processed_date),
          payment_status: millingForm.payment_status,
          party_name: factoryMap.get(millingForm.factory_id)?.name ?? null,
          note: toNullable(millingForm.note),
        });

        triggerSuccess("Đã thêm đợt xay xát mới và tự động tạo chi phí.");
      }

      setMillingForm({
        id: "",
        factory_id: "",
        processed_date: trip.start_date || "",
        input_weight_kg: 0,
        output_weight_kg: 0,
        unit_price: 0,
        total_cost: 0,
        payment_status: "unpaid",
        note: "",
      });
      await loadTripData();
    } catch (e: any) {
      setError(formatDbError(e));
    } finally {
      setSavingMilling(false);
    }
  };

  const deleteMillingRecord = async (record: ProcessingRecord) => {
    if (!id) return;
    if (!window.confirm("Bạn có chắc chắn muốn xóa nhật ký xay xát này?")) return;
    setError(null);
    try {
      const { error: delErr } = await supabase.from("processing_records").delete().eq("id", record.id);
      if (delErr) throw delErr;

      // Clean up linked expense
      const partialId = record.id.slice(0, 4);
      await supabase
        .from("trip_expenses")
        .delete()
        .eq("trip_id", id)
        .eq("type", "milling_cost")
        .like("description", `%${partialId}%`);

      await loadTripData();
      triggerSuccess("Đã xóa nhật ký xay xát và chi phí liên quan.");
    } catch (e: any) {
      setError(formatDbError(e));
    }
  };

  // STEP 6 Save Sale Record Handler (Add/Edit)
  const saveSaleRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !trip) return;
    setSavingSale(true);
    setError(null);

    try {
      const payload = {
        trip_id: id,
        buyer_name: saleForm.buyer_name,
        sale_date: toNullable(saleForm.sale_date) ?? undefined,
        rice_weight_kg: Number(saleForm.rice_weight_kg) || 0,
        unit_price: Number(saleForm.unit_price) || 0,
        total_amount: Number(saleForm.total_amount) || 0,
        payment_status: saleForm.payment_status,
        note: toNullable(saleForm.note),
      };

      if (saleForm.id) {
        const { error: saleErr } = await supabase.from("trip_sales").update(payload).eq("id", saleForm.id);
        if (saleErr) throw saleErr;
        triggerSuccess("Đã cập nhật giao dịch bán.");
      } else {
        const { error: saleErr } = await supabase.from("trip_sales").insert(payload);
        if (saleErr) throw saleErr;
        triggerSuccess("Đã ghi nhận giao dịch bán mới.");
      }

      setSaleForm({
        id: "",
        buyer_name: "",
        sale_date: trip.start_date || "",
        rice_weight_kg: 0,
        unit_price: 0,
        total_amount: 0,
        payment_status: "unpaid",
        note: "",
      });
      await loadTripData();
    } catch (e: any) {
      setError(formatDbError(e));
    } finally {
      setSavingSale(false);
    }
  };

  const deleteSaleRecord = async (saleId: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa giao dịch bán này?")) return;
    setError(null);
    try {
      const { error: delErr } = await supabase.from("trip_sales").delete().eq("id", saleId);
      if (delErr) {
        setError(formatDbError(delErr));
      } else {
        await loadTripData();
        triggerSuccess("Đã xóa giao dịch bán hàng.");
      }
    } catch (e: any) {
      setError(e.message || "Lỗi xóa giao dịch.");
    }
  };

  // Toggle buttons
  const startEditingStep1 = () => {
    if (!trip) return;
    setStep1Form({
      code: trip.code || "",
      season_id: trip.season_id || "",
      rice_type_id: trip.rice_type_id || "",
      transporter_boat_id: trip.transporter_boat_id || "",
      route_id: trip.route_id || "",
      start_date: trip.start_date || "",
      unloaded_weight_kg: trip.unloaded_weight_kg || 0,
      note: trip.note || "",
    });
    setActiveEditStep("step1");
  };

  const startEditingStep2 = async () => {
    setActiveEditStep("step2");
    await loadAvailableSlips();
  };

  const startEditingStep3 = () => {
    setExpenseForm({
      id: "",
      type: "other",
      description: "",
      amount: 0,
      expense_date: trip?.start_date || "",
      payment_status: "unpaid",
      party_name: "",
      note: "",
    });
    setActiveEditStep("step3");
  };

  const startEditExpenseRow = (exp: TripExpense) => {
    setExpenseForm({
      id: exp.id,
      type: exp.type,
      description: exp.description || "",
      amount: exp.amount,
      expense_date: exp.expense_date || "",
      payment_status: exp.payment_status,
      party_name: exp.party_name || "",
      note: exp.note || "",
    });
  };

  const startEditingStep4 = () => {
    setDryingForm({
      id: "",
      factory_id: "",
      processed_date: trip?.start_date || "",
      input_weight_kg: 0,
      output_weight_kg: 0,
      unit_price: 0,
      total_cost: 0,
      payment_status: "unpaid",
      note: "",
    });
    setActiveEditStep("step4");
  };

  const startEditDryingRow = (record: ProcessingRecord) => {
    setDryingForm({
      id: record.id,
      factory_id: record.factory_id,
      processed_date: record.processed_date || "",
      input_weight_kg: record.input_weight_kg,
      output_weight_kg: record.output_weight_kg,
      unit_price: record.unit_price,
      total_cost: record.total_cost,
      payment_status: record.payment_status,
      note: record.note || "",
    });
  };

  const startEditingStep5 = () => {
    setInventoryForm({
      id: "",
      warehouse_id: "",
      quantity_kg: remainingDriedKg,
      transaction_date: defaultInventoryDate,
      item_type: "paddy",
      note: "Nhập toàn bộ lúa khô sau sấy",
    });
    setActiveEditStep("step5");
  };

  const startEditInventoryRow = (transaction: InventoryTransaction) => {
    setInventoryForm({
      id: transaction.id,
      warehouse_id: transaction.warehouse_id,
      quantity_kg: Math.abs(transaction.quantity_kg),
      transaction_date: transaction.transaction_date || "",
      item_type: transaction.item_type,
      note: transaction.note || "",
    });
  };

  const startEditingStep6 = () => {
    setMillingForm({
      id: "",
      factory_id: "",
      processed_date: trip?.start_date || "",
      input_weight_kg: 0,
      output_weight_kg: 0,
      unit_price: 0,
      total_cost: 0,
      payment_status: "unpaid",
      note: "",
    });
    setActiveEditStep("step6");
  };

  const startEditMillingRow = (record: ProcessingRecord) => {
    setMillingForm({
      id: record.id,
      factory_id: record.factory_id,
      processed_date: record.processed_date || "",
      input_weight_kg: record.input_weight_kg,
      output_weight_kg: record.output_weight_kg,
      unit_price: record.unit_price,
      total_cost: record.total_cost,
      payment_status: record.payment_status,
      note: record.note || "",
    });
  };

  const startEditingStep7 = () => {
    setSaleForm({
      id: "",
      buyer_name: "",
      sale_date: trip?.start_date || "",
      rice_weight_kg: 0,
      unit_price: 0,
      total_amount: 0,
      payment_status: "unpaid",
      note: "",
    });
    setActiveEditStep("step7");
  };

  const startEditSaleRow = (sale: TripSale) => {
    setSaleForm({
      id: sale.id,
      buyer_name: sale.buyer_name || "",
      sale_date: sale.sale_date || "",
      rice_weight_kg: sale.rice_weight_kg,
      unit_price: sale.unit_price,
      total_amount: sale.total_amount,
      payment_status: sale.payment_status,
      note: sale.note || "",
    });
  };

  if (loading) {
    return (
      <section className="page">
        <div className="state-box">
          <Loader2 className="spinning" size={32} style={{ color: "var(--primary)", marginBottom: "12px" }} />
          <div>Đang tải thông tin chi tiết chuyến hàng...</div>
        </div>
      </section>
    );
  }

  if (error && !trip) {
    return (
      <section className="page">
        <header className="page-header">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Link to="/trips" className="icon-button" aria-label="Quay lại">
              <ArrowLeft size={18} />
            </Link>
            <h1>Lỗi chi tiết</h1>
          </div>
        </header>
        <div className="alert error-alert" style={{ margin: "20px" }}>{error || "Chuyến hàng không hợp lý"}</div>
      </section>
    );
  }

  if (!trip) return null;

  return (
    <section className="page" style={{ paddingBottom: "80px" }}>
      {/* 1. Header & Live Status Selector */}
      <header className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap", borderBottom: "1px solid var(--border-light)", paddingBottom: "18px", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link to="/trips" className="icon-button" style={{ display: "inline-flex", background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: "50%", padding: "10px", color: "var(--text-main)", boxShadow: "var(--shadow-sm)" }} aria-label="Quay lại danh sách">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "800" }}>Chuyến hàng: {trip.code}</h1>
              
              {/* Interactive Status Changer */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--primary-soft)", padding: "4px 10px", borderRadius: "99px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", color: "var(--text-muted)" }}>Trạng thái:</span>
                <select
                  value={trip.status}
                  onChange={(e) => void handleStatusChange(e.target.value as TripStatus)}
                  disabled={updatingStatus}
                  style={{
                    border: "none",
                    background: "transparent",
                    fontWeight: "bold",
                    color: "var(--primary)",
                    fontSize: "14px",
                    cursor: "pointer",
                    outline: "none",
                    paddingRight: "8px",
                  }}
                >
                  {statusOptions.map((opt) => (
                    <option key={opt.value} value={opt.value} style={{ background: "var(--bg-card)", color: "var(--text-main)" }}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {updatingStatus && <Loader2 className="spinning" size={14} style={{ color: "var(--primary)" }} />}
              </div>
            </div>
            <p style={{ color: "var(--text-muted)", marginTop: "6px", fontSize: "13.5px" }}>
              Xem và chỉnh sửa trực tiếp thông tin các phân đoạn chuyến hàng.
            </p>
          </div>
        </div>
      </header>

      {/* Alert Notifications */}
      {error && <div className="alert error-alert" style={{ marginBottom: "16px" }}>{error}</div>}
      {successMsg && <div className="alert success-alert" style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}><Check size={18} /> {successMsg}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
        
        {/* 2. Dashboard tài chính tổng quan (Auto-refreshed) */}
        <div className="card" style={{ padding: "24px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)" }}>
          <div className="card-title-row" style={{ marginBottom: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
            <TrendingUp size={22} style={{ color: "var(--primary)" }} />
            <h2 style={{ fontSize: "18px", fontWeight: "800" }}>Hiệu quả Tài chính Chuyến hàng (Tạm tính)</h2>
          </div>
          
          <div className="grid-responsive" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
            {/* Sản lượng mua */}
            <div style={{ background: "var(--primary-soft)", padding: "16px", borderRadius: "var(--radius-md)", borderLeft: "4px solid var(--primary)", boxShadow: "var(--shadow-sm)" }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "600", display: "block" }}>SẢN LƯỢNG THU MUA</span>
              <strong style={{ fontSize: "22px", color: "var(--text-main)", display: "block", marginTop: "6px", fontWeight: "800" }}>
                {formatNumber(trip.summary?.total_purchase_kg ?? 0)} kg
              </strong>
            </div>

            {/* Tiền mua lúa */}
            <div style={{ background: "var(--primary-soft)", padding: "16px", borderRadius: "var(--radius-md)", borderLeft: "4px solid var(--primary)", boxShadow: "var(--shadow-sm)" }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "600", display: "block" }}>TỔNG TIỀN MUA LÚA</span>
              <strong style={{ fontSize: "22px", color: "var(--text-main)", display: "block", marginTop: "6px", fontWeight: "800" }}>
                {formatMoney(trip.summary?.total_purchase_amount ?? 0)}
              </strong>
            </div>

            {/* Tổng chi phí phát sinh */}
            <div style={{ background: "var(--accent-soft)", padding: "16px", borderRadius: "var(--radius-md)", borderLeft: "4px solid var(--accent)", boxShadow: "var(--shadow-sm)" }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "600", display: "block" }}>CHI PHÍ PHÁT SINH + CÒ</span>
              <strong style={{ fontSize: "22px", color: "var(--text-main)", display: "block", marginTop: "6px", fontWeight: "800" }}>
                {formatMoney((trip.summary?.total_expense_amount ?? 0) + (trip.summary?.total_broker_commission ?? 0))}
              </strong>
              <small style={{ color: "var(--text-muted)", fontSize: "11px", display: "block", marginTop: "4px" }}>
                Gồm {formatMoney(trip.summary?.total_expense_amount ?? 0)} chi phí & {formatMoney(trip.summary?.total_broker_commission ?? 0)} cò lúa
              </small>
            </div>

            {/* Giá vốn / kg */}
            <div style={{ background: "var(--accent-soft)", padding: "16px", borderRadius: "var(--radius-md)", borderLeft: "4px solid var(--accent)", boxShadow: "var(--shadow-sm)" }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "600", display: "block" }}>GIÁ VỐN TẠM TÍNH/KG</span>
              <strong style={{ fontSize: "22px", color: "var(--warning)", display: "block", marginTop: "6px", fontWeight: "800" }}>
                {formatNullableMoney(trip.summary?.temporary_cost_per_kg)}
              </strong>
            </div>

            {/* Lãi / Lỗ tạm tính */}
            <div style={{ 
              background: (trip.summary?.temporary_profit ?? 0) > 0 ? "rgba(46, 125, 50, 0.07)" : (trip.summary?.temporary_profit ?? 0) < 0 ? "rgba(198, 40, 40, 0.07)" : "var(--border-light)", 
              padding: "16px", 
              borderRadius: "var(--radius-md)", 
              borderLeft: `4px solid ${(trip.summary?.temporary_profit ?? 0) > 0 ? "var(--success)" : (trip.summary?.temporary_profit ?? 0) < 0 ? "var(--danger)" : "var(--text-muted)"}`,
              boxShadow: "var(--shadow-sm)"
            }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "600", display: "block" }}>ƯỚC TÍNH LÃI / LỖ</span>
              <strong className={(trip.summary?.temporary_profit ?? 0) > 0 ? "profit-positive" : (trip.summary?.temporary_profit ?? 0) < 0 ? "profit-negative" : ""} style={{ fontSize: "22px", display: "block", marginTop: "6px", fontWeight: "900", color: (trip.summary?.temporary_profit ?? 0) > 0 ? "var(--success)" : (trip.summary?.temporary_profit ?? 0) < 0 ? "var(--danger)" : "var(--text-main)" }}>
                {formatMoney(trip.summary?.temporary_profit ?? 0)}
              </strong>
              {trip.summary?.total_sale_kg ? (
                <small style={{ color: "var(--text-muted)", fontSize: "11px", display: "block", marginTop: "4px" }}>
                  Đã bán {formatNumber(trip.summary?.total_sale_kg)} kg gạo - DT: {formatMoney(trip.summary?.total_revenue ?? 0)}
                </small>
              ) : (
                <small style={{ color: "var(--text-muted)", fontSize: "11px", display: "block", marginTop: "4px" }}>Chưa bán gạo</small>
              )}
            </div>
          </div>
        </div>

        {/* 3. TUYẾN TRÌNH LUỒNG CÔNG VIỆC 6 BƯỚC LOGIC */}
        
        {/* ========================================================================= */}
        {/* BƯỚC 1: THÔNG TIN CHUNG */}
        {/* ========================================================================= */}
        <div className="card" style={{ padding: "24px", border: activeEditStep === "step1" ? "2px solid var(--primary)" : "1px solid var(--border-light)", position: "relative" }}>
          <div className="card-title-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-light)", paddingBottom: "14px", marginBottom: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ background: "var(--primary)", color: "white", width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "14px" }}>1</div>
              <Ship size={20} style={{ color: "var(--primary)" }} />
              <h2 style={{ fontSize: "17px", fontWeight: "800" }}>Bước 1: Thông tin chung Chuyến hàng</h2>
            </div>
            
            {activeEditStep !== "step1" ? (
              <button className="secondary-button" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "13px" }} onClick={startEditingStep1}>
                <Edit2 size={14} /> Chỉnh sửa
              </button>
            ) : (
              <button className="secondary-button" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "13px", color: "var(--danger)" }} onClick={() => setActiveEditStep(null)}>
                <X size={14} /> Hủy bỏ
              </button>
            )}
          </div>

          {activeEditStep === "step1" ? (
            <form onSubmit={saveStep1} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                <label className="field">
                  <span>Mã chuyến hàng <span className="text-danger">*</span></span>
                  <input type="text" value={step1Form.code} onChange={(e) => setStep1Form({ ...step1Form, code: e.target.value })} required placeholder="VD: CH-2026-001" />
                </label>

                <label className="field">
                  <span>Mùa vụ lúa</span>
                  <select value={step1Form.season_id} onChange={(e) => setStep1Form({ ...step1Form, season_id: e.target.value })}>
                    <option value="">Không chọn</option>
                    {seasons.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Giống lúa</span>
                  <select value={step1Form.rice_type_id} onChange={(e) => setStep1Form({ ...step1Form, rice_type_id: e.target.value })}>
                    <option value="">Không chọn</option>
                    {riceTypes.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                <label className="field">
                  <span>Ghe chở lúa</span>
                  <select value={step1Form.transporter_boat_id} onChange={(e) => setStep1Form({ ...step1Form, transporter_boat_id: e.target.value })}>
                    <option value="">Không chọn</option>
                    {boats.map((b) => (
                      <option key={b.id} value={b.id}>{b.boat_name} ({b.owner_name})</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Tuyến đường sông</span>
                  <select value={step1Form.route_id} onChange={(e) => setStep1Form({ ...step1Form, route_id: e.target.value })}>
                    <option value="">Không chọn</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Ngày bắt đầu chuyến</span>
                  <input type="date" value={step1Form.start_date} onChange={(e) => setStep1Form({ ...step1Form, start_date: e.target.value })} />
                </label>
              </div>

              <div className="field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                <label className="field">
                  <span>Cân nặng xuống ghe - tươi (kg)</span>
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-app)",
                      fontSize: "14px",
                    }}
                  >
                    <strong style={{ color: "var(--primary)" }}>{formatNumber(linkedPurchaseWeightKg)} kg</strong>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                      Tổng từ {purchaseSlips.length} phiếu mua đã gán (Bước 2). Gán thêm/bớt phiếu để thay đổi.
                    </div>
                  </div>
                </label>

                <label className="field">
                  <span>Cân nặng lên kho / nhà máy (kg)</span>
                  <input type="number" value={step1Form.unloaded_weight_kg || ""} onChange={(e) => setStep1Form({ ...step1Form, unloaded_weight_kg: Number(e.target.value) })} placeholder="Nhập số kg cân tại lò sấy" />
                </label>
              </div>

              {step1SelectedRoute ? (
                <div style={{ background: "var(--bg-app)", padding: "12px 14px", borderRadius: "var(--radius-sm)", border: "1px dashed var(--border-light)", fontSize: "13px" }}>
                  <div>
                    Giá tuyến <strong>{step1SelectedRoute.name}</strong>:{" "}
                    <strong>{formatTransportPriceLabel(step1SelectedRoute.transport_price_basis, step1SelectedRoute.transport_price)}</strong>
                    <span style={{ color: "var(--text-muted)", marginLeft: "8px" }}>
                      ({formatTransportPriceBasis(step1SelectedRoute.transport_price_basis)})
                    </span>
                  </div>
                  {step1TransportPreview ? (
                    <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "12px 20px" }}>
                      <span>
                        Hao hụt VC:{" "}
                        <strong className="profit-negative">
                          {formatNumber(step1TransportPreview.loss.lossWeight)} kg ({formatNumber(step1TransportPreview.loss.lossPercent)}%)
                        </strong>
                      </span>
                      <span>
                        Tiền vận chuyển (ước tính): <strong style={{ color: "var(--danger)" }}>{formatMoney(step1TransportPreview.transportCost)}</strong>
                      </span>
                    </div>
                  ) : (
                    <div style={{ marginTop: "6px", color: "var(--text-muted)" }}>
                      Tuyến chưa có giá — cấu hình tại Quản lý tuyến vận chuyển.
                    </div>
                  )}
                </div>
              ) : null}

              <label className="field">
                <span>Ghi chú chuyến hàng</span>
                <textarea rows={2} value={step1Form.note} onChange={(e) => setStep1Form({ ...step1Form, note: e.target.value })} placeholder="Thông tin thêm..." />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
                <button type="button" className="secondary-button" onClick={() => setActiveEditStep(null)}>Hủy</button>
                <button type="submit" className="primary-button" disabled={savingStep1} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  {savingStep1 ? <Loader2 className="spinning" size={16} /> : <Check size={16} />} Lưu thay đổi
                </button>
              </div>
            </form>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px 24px", fontSize: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border-light)", paddingBottom: "6px" }}>
                <span style={{ color: "var(--text-muted)" }}>Mã chuyến hàng:</span>
                <strong style={{ color: "var(--primary)" }}>{trip.code}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border-light)", paddingBottom: "6px" }}>
                <span style={{ color: "var(--text-muted)" }}>Mùa vụ lúa:</span>
                <strong>{trip.season?.name || "-"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border-light)", paddingBottom: "6px" }}>
                <span style={{ color: "var(--text-muted)" }}>Giống lúa:</span>
                <strong>{trip.riceType?.name || "-"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border-light)", paddingBottom: "6px" }}>
                <span style={{ color: "var(--text-muted)" }}>Ghe chở lúa:</span>
                <strong>{trip.boat?.boat_name || "-"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border-light)", paddingBottom: "6px" }}>
                <span style={{ color: "var(--text-muted)" }}>Tuyến đường sông:</span>
                <strong>{trip.route?.name || "-"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border-light)", paddingBottom: "6px" }}>
                <span style={{ color: "var(--text-muted)" }}>Ngày bắt đầu:</span>
                <strong>{trip.start_date ? formatDate(trip.start_date) : "-"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border-light)", paddingBottom: "6px" }}>
                <span style={{ color: "var(--text-muted)" }}>Cân xuống ghe (tổng phiếu mua):</span>
                <strong>
                  {formatNumber(linkedPurchaseWeightKg)} kg
                  {purchaseSlips.length > 0 ? (
                    <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "normal", marginLeft: "6px" }}>
                      ({purchaseSlips.length} phiếu)
                    </span>
                  ) : null}
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border-light)", paddingBottom: "6px" }}>
                <span style={{ color: "var(--text-muted)" }}>Cân tại nhà máy (kho):</span>
                <strong>{formatNumber(trip.unloaded_weight_kg)} kg</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border-light)", paddingBottom: "6px" }}>
                <span style={{ color: "var(--text-muted)" }}>Hao hụt vận chuyển:</span>
                <strong className={trip.loss_weight_kg > 0 ? "profit-negative" : ""}>
                  {formatNumber(trip.loss_weight_kg)} kg ({formatNumber(trip.loss_percent)}%)
                </strong>
              </div>
              {trip.route && trip.route.transport_price > 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border-light)", paddingBottom: "6px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Giá tuyến VC:</span>
                  <strong>{formatTransportPriceLabel(trip.route.transport_price_basis, trip.route.transport_price)}</strong>
                </div>
              ) : null}
              {routeTransportExpense ? (
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border-light)", paddingBottom: "6px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Tiền vận chuyển (theo tuyến):</span>
                  <strong style={{ color: "var(--danger)" }}>{formatMoney(routeTransportExpense.amount)}</strong>
                </div>
              ) : null}
              {trip.note && (
                <div style={{ gridColumn: "1 / -1", background: "var(--primary-soft)", padding: "10px 14px", borderRadius: "var(--radius-sm)", borderLeft: "4px solid var(--primary)", marginTop: "6px" }}>
                  <span style={{ fontWeight: "700", display: "block", fontSize: "12px", color: "var(--primary)" }}>Ghi chú hành trình:</span>
                  <span style={{ color: "var(--text-main)" }}>{trip.note}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* BƯỚC 2: NGUỒN LÚA THU MUA (GÁN PHIẾU MUA HÀNG) */}
        {/* ========================================================================= */}
        <div className="card" style={{ padding: "24px", border: activeEditStep === "step2" ? "2px solid var(--primary)" : "1px solid var(--border-light)" }}>
          <div className="card-title-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-light)", paddingBottom: "14px", marginBottom: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ background: "var(--primary)", color: "white", width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "14px" }}>2</div>
              <Info size={20} style={{ color: "var(--primary)" }} />
              <h2 style={{ fontSize: "17px", fontWeight: "800" }}>Bước 2: Nguồn lúa Thu mua (Phiếu mua hàng đã gán)</h2>
            </div>
            
            {activeEditStep !== "step2" ? (
              <button className="secondary-button" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "13px" }} onClick={startEditingStep2}>
                <Edit2 size={14} /> Gán / Gỡ phiếu mua
              </button>
            ) : (
              <button className="secondary-button" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "13px", color: "var(--danger)" }} onClick={() => setActiveEditStep(null)}>
                <Check size={14} /> Hoàn tất gán
              </button>
            )}
          </div>

          {activeEditStep === "step2" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* CURRENTLY ASSIGNED PURCHASE SLIPS */}
              <div>
                <h3 style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "10px", color: "var(--primary)" }}>Danh sách Phiếu mua đang thuộc chuyến ({purchaseSlips.length})</h3>
                {purchaseSlips.length === 0 ? (
                  <div className="empty-state" style={{ padding: "20px" }}>Không có phiếu mua hàng nào được gán cho chuyến này.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Mã phiếu</th>
                          <th>Nông dân</th>
                          <th>Cò lúa</th>
                          <th>Loại lúa</th>
                          <th style={{ textAlign: "right" }}>Số cân (kg)</th>
                          <th style={{ textAlign: "right" }}>Đơn giá (đ/kg)</th>
                          <th style={{ textAlign: "center" }}>Hành động</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchaseSlips.map((slip) => (
                          <tr key={slip.id}>
                            <td style={{ fontWeight: "700" }}>ps-{slip.id.slice(0, 5)}</td>
                            <td>{slip.farmer?.name || "Nông dân"}</td>
                            <td>{slip.broker?.name || "-"}</td>
                            <td>{slip.riceType?.name || "-"}</td>
                            <td style={{ textAlign: "right", fontWeight: "bold" }}>{formatNumber(slip.weight_kg ?? 0)} kg</td>
                            <td style={{ textAlign: "right" }}>{formatMoney(slip.unit_price ?? 0)}</td>
                            <td style={{ textAlign: "center" }}>
                              <button className="secondary-button" style={{ color: "var(--danger)", padding: "4px 8px", fontSize: "12px", border: "1px solid rgba(198,40,40,0.2)" }} onClick={() => void handleUnlinkSlip(slip.id)}>
                                Gỡ bỏ
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <hr style={{ border: "0", borderTop: "1px solid var(--border-light)" }} />

              {/* FIND AND LINK UNASSIGNED SLIPS */}
              <div>
                <h3 style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "12px" }}>Tìm & Gán thêm Phiếu mua hàng chưa thuộc chuyến</h3>
                
                {/* Available search bar */}
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "14px", padding: "12px", background: "var(--primary-soft)", borderRadius: "var(--radius-md)" }}>
                  <label className="search-field" style={{ flex: "1 1 240px", margin: 0 }}>
                    <Search size={16} />
                    <input type="text" value={purchaseSlipSearch} onChange={(e) => setPurchaseSlipSearch(e.target.value)} placeholder="Tìm phiếu theo tên nông dân, cò, mã..." style={{ fontSize: "13px" }} />
                  </label>
                  
                  <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
                      <input type="checkbox" checked={filterSameRiceType} onChange={(e) => setFilterSameRiceType(e.target.checked)} />
                      <span>Cùng loại lúa ({trip.riceType?.name || "Chưa chọn"})</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
                      <input type="checkbox" checked={filterSameSeason} onChange={(e) => setFilterSameSeason(e.target.checked)} />
                      <span>Cùng mùa vụ ({trip.season?.name || "Chưa chọn"})</span>
                    </label>
                  </div>
                </div>

                {loadingAvailableSlips ? (
                  <div className="state-box"><Loader2 className="spinning" /> Đang tìm phiếu mua...</div>
                ) : filteredAvailableSlips.length === 0 ? (
                  <div className="empty-state" style={{ padding: "30px" }}>Không tìm thấy phiếu mua hàng chưa gán phù hợp.</div>
                ) : (
                  <div className="table-wrap" style={{ maxHeight: "300px", overflowY: "auto" }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Mã phiếu</th>
                          <th>Nông dân</th>
                          <th>Cò lúa</th>
                          <th>Mùa vụ</th>
                          <th>Loại lúa</th>
                          <th style={{ textAlign: "right" }}>Số cân (kg)</th>
                          <th style={{ textAlign: "right" }}>Đơn giá</th>
                          <th style={{ textAlign: "center" }}>Gán</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAvailableSlips.map((slip) => (
                          <tr key={slip.id}>
                            <td style={{ fontWeight: "700" }}>ps-{slip.id.slice(0, 5)}</td>
                            <td>{slip.farmer?.name || "Nông dân"}</td>
                            <td>{slip.broker?.name || "-"}</td>
                            <td>{slip.season?.name || "-"}</td>
                            <td>{slip.riceType?.name || "-"}</td>
                            <td style={{ textAlign: "right", fontWeight: "bold" }}>{formatNumber(slip.weight_kg ?? 0)} kg</td>
                            <td style={{ textAlign: "right" }}>{formatMoney(slip.unit_price ?? 0)}</td>
                            <td style={{ textAlign: "center" }}>
                              <button className="primary-button" style={{ padding: "4px 8px", fontSize: "12px" }} onClick={() => void handleLinkSlip(slip.id)}>
                                + Gán
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              {purchaseSlips.length === 0 ? (
                <div className="empty-state" style={{ padding: "30px", background: "rgba(0,0,0,0.01)", border: "1px dashed var(--border-light)" }}>
                  Chưa gán phiếu mua hàng nào cho chuyến này. Click "Gán / Gỡ phiếu mua" ở trên để thực hiện.
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Mã phiếu</th>
                        <th>Nông dân</th>
                        <th>Cò lúa</th>
                        <th>Loại lúa</th>
                        <th style={{ textAlign: "right" }}>Khối lượng (kg)</th>
                        <th style={{ textAlign: "right" }}>Đơn giá mua (đ/kg)</th>
                        <th style={{ textAlign: "right" }}>Thành tiền mua</th>
                        <th>Ngày mua</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseSlips.map((slip) => {
                        const price = slip.unit_price ?? 0;
                        const weight = slip.weight_kg ?? 0;
                        const total = weight * price;
                        return (
                          <tr key={slip.id}>
                            <td style={{ fontWeight: "700" }}>ps-{slip.id.slice(0, 5)}</td>
                            <td>{slip.farmer?.name || "Nông dân"}</td>
                            <td>{slip.broker?.name || "-"}</td>
                            <td>{slip.riceType?.name || "-"}</td>
                            <td style={{ textAlign: "right", fontWeight: "bold" }}>{formatNumber(weight)} kg</td>
                            <td style={{ textAlign: "right" }}>{formatMoney(price)}</td>
                            <td style={{ textAlign: "right", fontWeight: "bold", color: "var(--primary)" }}>{formatMoney(total)}</td>
                            <td>{formatDate(slip.purchase_date)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* BƯỚC 3: CHI PHÍ PHÁT SINH CHUYẾN HÀNG */}
        {/* ========================================================================= */}
        <div className="card" style={{ padding: "24px", border: activeEditStep === "step3" ? "2px solid var(--primary)" : "1px solid var(--border-light)" }}>
          <div className="card-title-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-light)", paddingBottom: "14px", marginBottom: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ background: "var(--primary)", color: "white", width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "14px" }}>3</div>
              <Coins size={20} style={{ color: "var(--primary)" }} />
              <h2 style={{ fontSize: "17px", fontWeight: "800" }}>Bước 3: Chi phí phát sinh chuyến ({expenses.length})</h2>
            </div>
            
            {activeEditStep !== "step3" ? (
              <button className="secondary-button" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "13px" }} onClick={startEditingStep3}>
                <Plus size={14} /> Thêm & Quản lý Chi phí
              </button>
            ) : (
              <button className="secondary-button" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "13px", color: "var(--danger)" }} onClick={() => setActiveEditStep(null)}>
                <Check size={14} /> Hoàn tất quản lý
              </button>
            )}
          </div>

          {activeEditStep === "step3" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* CURRENT EXPENSES WITH ACTION BUTTONS */}
              <div>
                <h3 style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "10px", color: "var(--primary)" }}>Danh sách các chi phí đã ghi nhận</h3>
                {expenses.length === 0 ? (
                  <div className="empty-state" style={{ padding: "20px" }}>Chưa có chi phí phát sinh nào.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Loại chi phí</th>
                          <th>Mô tả</th>
                          <th style={{ textAlign: "right" }}>Số tiền (VND)</th>
                          <th>Bên nhận</th>
                          <th>Thanh toán</th>
                          <th style={{ textAlign: "center" }}>Hành động</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((exp) => (
                          <tr key={exp.id}>
                            <td style={{ fontWeight: "700" }}>{expenseTypeLabels[exp.type] || exp.type}</td>
                            <td>{exp.description || "-"}</td>
                            <td style={{ textAlign: "right", fontWeight: "bold", color: "var(--danger)" }}>{formatMoney(exp.amount)}</td>
                            <td>{exp.party_name || "-"}</td>
                            <td>
                              <span className={`badge ${exp.payment_status === "paid" ? "badge-completed" : exp.payment_status === "partial" ? "badge-selling" : "badge-cancelled"}`} style={{ fontSize: "11px" }}>
                                {paymentStatusLabels[exp.payment_status]}
                              </span>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                                <button type="button" className="icon-button" style={{ padding: "4px" }} aria-label="Sửa chi phí" onClick={() => startEditExpenseRow(exp)}>
                                  <Edit2 size={14} />
                                </button>
                                <button type="button" className="icon-button" style={{ padding: "4px", color: "var(--danger)" }} aria-label="Xóa chi phí" onClick={() => void deleteExpense(exp.id)}>
                                  <Trash2 size={14} />
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

              {/* EXPENSE FORM */}
              <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: "18px", background: "var(--primary-soft)" }}>
                <h3 style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "14px" }}>
                  {expenseForm.id ? "✍️ Cập nhật chi phí phát sinh" : "➕ Thêm chi phí phát sinh mới"}
                </h3>
                
                <form onSubmit={saveExpense} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div className="field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                    <label className="field">
                      <span>Loại chi phí <span className="text-danger">*</span></span>
                      <select value={expenseForm.type} onChange={(e) => setExpenseForm({ ...expenseForm, type: e.target.value as TripExpenseType })}>
                        {Object.entries(expenseTypeLabels).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>Số tiền chi phí (VND) <span className="text-danger">*</span></span>
                      <input type="number" value={expenseForm.amount || ""} onChange={(e) => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })} required placeholder="VD: 500000" />
                    </label>

                    <label className="field">
                      <span>Ngày chi</span>
                      <input type="date" value={expenseForm.expense_date} onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} />
                    </label>
                  </div>

                  <div className="field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                    <label className="field">
                      <span>Bên nhận / Tên chủ chi</span>
                      <input type="text" value={expenseForm.party_name} onChange={(e) => setExpenseForm({ ...expenseForm, party_name: e.target.value })} placeholder="VD: Nhà máy sấy Chánh Đức, Ông Tư..." />
                    </label>

                    <label className="field">
                      <span>Mô tả cụ thể</span>
                      <input type="text" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} placeholder="VD: Trả tiền dầu ghe, bốc xếp..." />
                    </label>

                    <label className="field">
                      <span>Trạng thái thanh toán</span>
                      <select value={expenseForm.payment_status} onChange={(e) => setExpenseForm({ ...expenseForm, payment_status: e.target.value as PaymentStatus })}>
                        <option value="unpaid">Chưa trả</option>
                        <option value="partial">Trả một phần</option>
                        <option value="paid">Đã trả</option>
                      </select>
                    </label>
                  </div>

                  <label className="field">
                    <span>Ghi chú thêm</span>
                    <input type="text" value={expenseForm.note} onChange={(e) => setExpenseForm({ ...expenseForm, note: e.target.value })} placeholder="Chi tiết phụ khác..." />
                  </label>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "4px" }}>
                    {expenseForm.id && (
                      <button type="button" className="secondary-button" onClick={() => setExpenseForm({ id: "", type: "other", description: "", amount: 0, expense_date: trip.start_date || "", payment_status: "unpaid", party_name: "", note: "" })}>
                        Hủy cập nhật
                      </button>
                    )}
                    <button type="submit" className="primary-button" disabled={savingExpense} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      {savingExpense ? <Loader2 className="spinning" size={16} /> : <Check size={16} />} 
                      {expenseForm.id ? "Cập nhật chi phí" : "Thêm chi phí"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            <div>
              {expenses.length === 0 ? (
                <div className="empty-state" style={{ padding: "30px", background: "rgba(0,0,0,0.01)", border: "1px dashed var(--border-light)" }}>
                  Chưa ghi nhận chi phí phát sinh nào.
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Loại chi phí</th>
                        <th>Mô tả</th>
                        <th style={{ textAlign: "right" }}>Số tiền</th>
                        <th>Ngày chi</th>
                        <th>Thanh toán</th>
                        <th>Bên nhận</th>
                        <th>Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((expense) => (
                        <tr key={expense.id}>
                          <td style={{ fontWeight: "700" }}>{expenseTypeLabels[expense.type] || expense.type}</td>
                          <td>{expense.description || "-"}</td>
                          <td style={{ textAlign: "right", fontWeight: "bold", color: "var(--danger)" }}>{formatMoney(expense.amount)}</td>
                          <td>{expense.expense_date ? formatDate(expense.expense_date) : "-"}</td>
                          <td>
                            <span className={`badge ${expense.payment_status === "paid" ? "badge-completed" : expense.payment_status === "partial" ? "badge-selling" : "badge-cancelled"}`} style={{ fontSize: "12px" }}>
                              {paymentStatusLabels[expense.payment_status]}
                            </span>
                          </td>
                          <td>{expense.party_name || "-"}</td>
                          <td style={{ fontSize: "13px", color: "var(--text-muted)" }}>{expense.note || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* BƯỚC 4: NHẬT KÝ SẤY LÚA */}
        {/* ========================================================================= */}
        <div className="card" style={{ padding: "24px", border: activeEditStep === "step4" ? "2px solid var(--primary)" : "1px solid var(--border-light)" }}>
          <div className="card-title-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-light)", paddingBottom: "14px", marginBottom: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ background: "var(--primary)", color: "white", width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "14px" }}>4</div>
              <Calendar size={20} style={{ color: "var(--primary)" }} />
              <h2 style={{ fontSize: "17px", fontWeight: "800" }}>Bước 4: Nhật ký Sấy lúa</h2>
            </div>
            
            {activeEditStep !== "step4" ? (
              <button className="secondary-button" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "13px" }} onClick={startEditingStep4}>
                <Plus size={14} /> Thêm & Sửa đợt sấy
              </button>
            ) : (
              <button className="secondary-button" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "13px", color: "var(--danger)" }} onClick={() => setActiveEditStep(null)}>
                <Check size={14} /> Hoàn tất sấy
              </button>
            )}
          </div>

          {activeEditStep === "step4" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* CURRENT DRYING RECORDS */}
              <div>
                <h3 style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "10px", color: "var(--primary)" }}>Đợt sấy đã ghi nhận</h3>
                {dryingRecords.length === 0 ? (
                  <div className="empty-state" style={{ padding: "20px" }}>Chưa ghi nhận đợt sấy nào cho chuyến này.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                    {dryingRecords.map((record) => {
                      const factory = factoryMap.get(record.factory_id);
                      return (
                        <div key={record.id} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: "14px", background: "var(--bg-app)", position: "relative" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", borderBottom: "1px solid var(--border-light)", paddingBottom: "6px" }}>
                            <strong style={{ fontSize: "14px", color: "var(--primary)" }}>{factory?.name || "Nhà máy sấy"}</strong>
                            <div style={{ display: "flex", gap: "6px" }}>
                              <button type="button" className="icon-button" aria-label="Sửa sấy" onClick={() => startEditDryingRow(record)}>
                                <Edit2 size={13} />
                              </button>
                              <button type="button" className="icon-button" style={{ color: "var(--danger)" }} aria-label="Xóa sấy" onClick={() => void deleteDryingRecord(record)}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                          
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", fontSize: "12.5px" }}>
                            <div>Lúa tươi: <strong>{formatNumber(record.input_weight_kg)} kg</strong></div>
                            <div>Lúa khô: <strong>{formatNumber(record.output_weight_kg)} kg</strong></div>
                            <div>Hao sấy: <strong className="profit-negative">{formatNumber(record.loss_weight_kg)} kg ({formatNumber(record.loss_percent)}%)</strong></div>
                            <div>Đơn giá sấy: <strong>{formatMoney(record.unit_price)}/kg</strong></div>
                            <div style={{ gridColumn: "1 / -1" }}>Thành tiền: <strong style={{ color: "var(--danger)" }}>{formatMoney(record.total_cost)}</strong></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* DRYING FORM */}
              <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: "18px", background: "var(--primary-soft)" }}>
                <h3 style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "14px" }}>
                  {dryingForm.id ? "✍️ Cập nhật thông tin sấy lúa" : "➕ Thêm nhật ký sấy lúa mới"}
                </h3>

                <form onSubmit={saveDryingRecord} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div className="field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                    <label className="field">
                      <span>Nhà máy / Lò sấy <span className="text-danger">*</span></span>
                      <select value={dryingForm.factory_id} onChange={(e) => setDryingForm({ ...dryingForm, factory_id: e.target.value })} required>
                        <option value="">-- Chọn lò sấy --</option>
                        {factories.filter((f) => f.type === "drying" || !f.type).map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>Khối lượng lúa tươi vào sấy (kg) <span className="text-danger">*</span></span>
                      <input type="number" value={dryingForm.input_weight_kg || ""} onChange={(e) => setDryingForm({ ...dryingForm, input_weight_kg: Number(e.target.value) })} required placeholder="VD: 25000" />
                    </label>

                    <label className="field">
                      <span>Khối lượng lúa khô thu hoạch (kg) <span className="text-danger">*</span></span>
                      <input type="number" value={dryingForm.output_weight_kg || ""} onChange={(e) => setDryingForm({ ...dryingForm, output_weight_kg: Number(e.target.value) })} required placeholder="VD: 20000" />
                    </label>
                  </div>

                  <div className="field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                    <label className="field">
                      <span>Đơn giá dịch vụ sấy (đ/kg lúa khô)</span>
                      <input type="number" value={dryingForm.unit_price || ""} onChange={(e) => setDryingForm({ ...dryingForm, unit_price: Number(e.target.value) })} placeholder="VD: 350" />
                    </label>

                    <label className="field">
                      <span>Thành tiền sấy (VND - Tự tính)</span>
                      <input type="number" value={dryingForm.total_cost || ""} onChange={(e) => setDryingForm({ ...dryingForm, total_cost: Number(e.target.value) })} placeholder="Auto-calculated" />
                    </label>

                    <label className="field">
                      <span>Ngày sấy xong</span>
                      <input type="date" value={dryingForm.processed_date} onChange={(e) => setDryingForm({ ...dryingForm, processed_date: e.target.value })} />
                    </label>
                  </div>

                  <div className="field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                    <label className="field">
                      <span>Thanh toán sấy</span>
                      <select value={dryingForm.payment_status} onChange={(e) => setDryingForm({ ...dryingForm, payment_status: e.target.value as PaymentStatus })}>
                        <option value="unpaid">Chưa trả</option>
                        <option value="partial">Trả một phần</option>
                        <option value="paid">Đã trả</option>
                      </select>
                    </label>

                    <label className="field">
                      <span>Ghi chú thêm đợt sấy</span>
                      <input type="text" value={dryingForm.note} onChange={(e) => setDryingForm({ ...dryingForm, note: e.target.value })} placeholder="VD: Đợt sấy bị mưa nhẹ..." />
                    </label>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "4px" }}>
                    {dryingForm.id && (
                      <button type="button" className="secondary-button" onClick={() => setDryingForm({ id: "", factory_id: "", processed_date: trip.start_date || "", input_weight_kg: 0, output_weight_kg: 0, unit_price: 0, total_cost: 0, payment_status: "unpaid", note: "" })}>
                        Hủy cập nhật
                      </button>
                    )}
                    <button type="submit" className="primary-button" disabled={savingDrying} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      {savingDrying ? <Loader2 className="spinning" size={16} /> : <Check size={16} />}
                      {dryingForm.id ? "Cập nhật sấy lúa" : "Ghi nhận đợt sấy"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            <div>
              {dryingRecords.length === 0 ? (
                <div className="empty-state" style={{ padding: "30px", background: "rgba(0,0,0,0.01)", border: "1px dashed var(--border-light)" }}>
                  Không ghi nhận dữ liệu sấy lúa cho chuyến này.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {dryingRecords.map((record) => {
                    const factory = factoryMap.get(record.factory_id);
                    return (
                      <div key={record.id} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: "16px", background: "var(--bg-app)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "1px solid var(--border-light)", paddingBottom: "8px" }}>
                          <strong style={{ fontSize: "15px", color: "var(--primary)" }}>{factory?.name || "Nhà máy sấy"}</strong>
                          <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>Ngày thực hiện: {formatDate(record.processed_date)}</span>
                        </div>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "12px 20px", fontSize: "13.5px" }}>
                          <div>Lúa tươi đầu vào: <strong>{formatNumber(record.input_weight_kg)} kg</strong></div>
                          <div>Lúa khô đầu ra: <strong>{formatNumber(record.output_weight_kg)} kg</strong></div>
                          <div>Đơn giá sấy: <strong>{formatMoney(record.unit_price)}/kg</strong></div>
                          <div>Thành tiền sấy: <strong style={{ color: "var(--danger)" }}>{formatMoney(record.total_cost)}</strong></div>
                          <div>
                            Hao hụt sấy: 
                            <strong className="profit-negative" style={{ marginLeft: "6px" }}>
                              {formatNumber(record.loss_weight_kg)} kg ({formatNumber(record.loss_percent)}%)
                            </strong>
                          </div>
                          <div>
                            Trạng thái thanh toán:
                            <span className={`badge ${record.payment_status === "paid" ? "badge-completed" : record.payment_status === "partial" ? "badge-selling" : "badge-cancelled"}`} style={{ fontSize: "11px", marginLeft: "8px", padding: "2px 6px" }}>
                              {paymentStatusLabels[record.payment_status]}
                            </span>
                          </div>
                        </div>
                        {record.note && (
                          <div style={{ marginTop: "10px", background: "var(--bg-card)", border: "1px solid var(--border-light)", padding: "8px 12px", borderRadius: "var(--radius-xs)", fontSize: "12px", color: "var(--text-muted)" }}>
                            Ghi chú lò sấy: {record.note}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* BƯỚC 5: NHẬP KHO (LÚA KHÔ SAU SẤY) */}
        {/* ========================================================================= */}
        <div className="card" style={{ padding: "24px", border: activeEditStep === "step5" ? "2px solid var(--primary)" : "1px solid var(--border-light)" }}>
          <div className="card-title-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-light)", paddingBottom: "14px", marginBottom: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ background: "var(--primary)", color: "white", width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "14px" }}>5</div>
              <Package size={20} style={{ color: "var(--primary)" }} />
              <h2 style={{ fontSize: "17px", fontWeight: "800" }}>Bước 5: Nhập kho (lúa khô sau sấy)</h2>
            </div>

            {canEnterWarehouse && remainingDriedKg > 0 && activeEditStep !== "step5" ? (
              <button
                className="primary-button"
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", fontSize: "13px" }}
                onClick={startEditingStep5}
              >
                <Package size={14} /> Nhập toàn bộ ({formatTonFromKg(remainingDriedKg)} tấn)
              </button>
            ) : canEnterWarehouse && activeEditStep !== "step5" ? (
              <button className="secondary-button" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "13px" }} onClick={startEditingStep5}>
                <Edit2 size={14} /> Xem nhập kho
              </button>
            ) : activeEditStep === "step5" ? (
              <button className="secondary-button" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "13px", color: "var(--danger)" }} onClick={() => setActiveEditStep(null)}>
                <Check size={14} /> Đóng nhập kho
              </button>
            ) : null}
          </div>

          {tripCompletedViaWarehouse ? (
            <div className="badge badge-completed" style={{ marginBottom: "14px", display: "inline-block", padding: "6px 12px" }}>
              Chuyến đã nhập kho và hoàn tất
            </div>
          ) : null}

          {!canEnterWarehouse && dryingRecords.length === 0 ? (
            <div className="empty-state" style={{ padding: "24px", background: "rgba(0,0,0,0.01)", border: "1px dashed var(--border-light)" }}>
              Cần ghi nhận sấy lúa (Bước 4) trước khi nhập kho.
            </div>
          ) : !canEnterWarehouse && millingRecords.length > 0 ? (
            <div className="empty-state" style={{ padding: "24px", background: "rgba(0,0,0,0.01)", border: "1px dashed var(--border-light)" }}>
              Chuyến đã xay xát — nhập kho lúa khô chỉ áp dụng khi chưa xay sát.
            </div>
          ) : activeEditStep === "step5" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div style={{ background: "var(--bg-app)", padding: "12px 14px", borderRadius: "var(--radius-sm)", border: "1px dashed var(--border-light)", fontSize: "13px" }}>
                Lúa khô sau sấy: <strong>{formatNumber(suggestedDriedKg)} kg</strong>
                {inventoriedKg > 0 ? (
                  <span style={{ marginLeft: "12px" }}>
                    Đã nhập: <strong>{formatNumber(inventoriedKg)} kg</strong>
                  </span>
                ) : null}
                <div style={{ marginTop: "6px", color: "var(--text-muted)" }}>
                  Nhập kho sẽ đánh dấu chuyến hàng <strong>Hoàn tất</strong> (không cần xay xát/bán trên chuyến này).
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "10px", color: "var(--primary)" }}>Phiếu nhập kho đã ghi</h3>
                {inventoryTransactions.length === 0 ? (
                  <div className="empty-state" style={{ padding: "20px" }}>Chưa có phiếu nhập kho cho chuyến này.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                    {inventoryTransactions.map((tx) => (
                      <div key={tx.id} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: "14px", background: "var(--bg-app)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", borderBottom: "1px solid var(--border-light)", paddingBottom: "6px" }}>
                          <strong style={{ fontSize: "14px", color: "var(--primary)" }}>{warehouseMap.get(tx.warehouse_id)?.name || "Kho"}</strong>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button type="button" className="icon-button" aria-label="Sửa nhập kho" onClick={() => startEditInventoryRow(tx)}>
                              <Edit2 size={13} />
                            </button>
                            <button type="button" className="icon-button" style={{ color: "var(--danger)" }} aria-label="Xóa nhập kho" onClick={() => void deleteInventoryRecord(tx)}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", fontSize: "12.5px" }}>
                          <div>Loại hàng: <strong>{formatInventoryItemType(tx.item_type)}</strong></div>
                          <div>Khối lượng: <strong>{formatNumber(Math.abs(tx.quantity_kg))} kg</strong></div>
                          <div style={{ gridColumn: "1 / -1" }}>Ngày nhập: <strong>{formatDate(tx.transaction_date)}</strong></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: "18px", background: "var(--primary-soft)" }}>
                <h3 style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "14px" }}>
                  {inventoryForm.id ? "✍️ Cập nhật phiếu nhập kho" : "➕ Nhập toàn bộ lúa khô vào kho"}
                </h3>

                <form onSubmit={saveInventoryRecord} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {!inventoryForm.id ? (
                    <>
                      <div
                        style={{
                          background: "var(--bg-app)",
                          padding: "12px 14px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-light)",
                          fontSize: "13.5px",
                        }}
                      >
                        <div>
                          Khối lượng nhập:{" "}
                          <strong style={{ color: "var(--primary)", fontSize: "15px" }}>
                            {formatNumber(remainingDriedKg)} kg ({formatTonFromKg(remainingDriedKg)} tấn)
                          </strong>
                        </div>
                        <div style={{ marginTop: "4px", color: "var(--text-muted)", fontSize: "12.5px" }}>
                          Tự lấy toàn bộ lúa khô sau sấy (tổng {formatNumber(suggestedDriedKg)} kg
                          {inventoriedKg > 0 ? `, đã nhập ${formatNumber(inventoriedKg)} kg` : ""}).
                        </div>
                      </div>

                      <div className="field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                        <label className="field">
                          <span>Kho nhập <span className="text-danger">*</span></span>
                          <select
                            value={inventoryForm.warehouse_id}
                            onChange={(e) => setInventoryForm({ ...inventoryForm, warehouse_id: e.target.value })}
                            required
                          >
                            <option value="">-- Chọn kho --</option>
                            {warehouses.map((warehouse) => (
                              <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="field">
                          <span>Ngày nhập kho <span className="text-danger">*</span></span>
                          <input
                            type="date"
                            value={inventoryForm.transaction_date}
                            onChange={(e) => setInventoryForm({ ...inventoryForm, transaction_date: e.target.value })}
                            required
                          />
                        </label>
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "4px" }}>
                        <button type="button" className="secondary-button" onClick={() => setActiveEditStep(null)}>
                          Hủy
                        </button>
                        <button
                          type="submit"
                          className="primary-button"
                          disabled={savingInventory || remainingDriedKg <= 0}
                          style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                        >
                          {savingInventory ? <Loader2 className="spinning" size={16} /> : <Check size={16} />}
                          Nhập toàn bộ & hoàn tất chuyến
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                        <label className="field">
                          <span>Kho nhập <span className="text-danger">*</span></span>
                          <select value={inventoryForm.warehouse_id} onChange={(e) => setInventoryForm({ ...inventoryForm, warehouse_id: e.target.value })} required>
                            <option value="">-- Chọn kho --</option>
                            {warehouses.map((warehouse) => (
                              <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="field">
                          <span>Loại hàng</span>
                          <select value={inventoryForm.item_type} onChange={(e) => setInventoryForm({ ...inventoryForm, item_type: e.target.value as InventoryItemType })}>
                            <option value="paddy">Lúa (khô sau sấy)</option>
                            <option value="rice">Gạo</option>
                            <option value="byproduct">Phụ phẩm</option>
                          </select>
                        </label>

                        <label className="field">
                          <span>Khối lượng nhập (kg) <span className="text-danger">*</span></span>
                          <input
                            type="number"
                            value={inventoryForm.quantity_kg || ""}
                            onChange={(e) => setInventoryForm({ ...inventoryForm, quantity_kg: Number(e.target.value) })}
                            required
                          />
                        </label>

                        <label className="field">
                          <span>Ngày nhập kho</span>
                          <input type="date" value={inventoryForm.transaction_date} onChange={(e) => setInventoryForm({ ...inventoryForm, transaction_date: e.target.value })} />
                        </label>
                      </div>

                      <label className="field">
                        <span>Ghi chú</span>
                        <input type="text" value={inventoryForm.note} onChange={(e) => setInventoryForm({ ...inventoryForm, note: e.target.value })} placeholder="Ghi chú phiếu nhập kho" />
                      </label>

                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "4px" }}>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            setInventoryForm({
                              id: "",
                              warehouse_id: "",
                              quantity_kg: remainingDriedKg,
                              transaction_date: defaultInventoryDate,
                              item_type: "paddy",
                              note: "Nhập toàn bộ lúa khô sau sấy",
                            })
                          }
                        >
                          Hủy cập nhật
                        </button>
                        <button type="submit" className="primary-button" disabled={savingInventory} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          {savingInventory ? <Loader2 className="spinning" size={16} /> : <Check size={16} />}
                          Cập nhật nhập kho
                        </button>
                      </div>
                    </>
                  )}
                </form>
              </div>
            </div>
          ) : (
            <div>
              {inventoryTransactions.length === 0 ? (
                <div className="empty-state" style={{ padding: "30px", background: "rgba(0,0,0,0.01)", border: "1px dashed var(--border-light)" }}>
                  Chưa nhập kho. Sau khi sấy xong, có thể nhập lúa khô vào kho để kết thúc chuyến (không cần xay xát).
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {inventoryTransactions.map((tx) => (
                    <div key={tx.id} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: "16px", background: "var(--bg-app)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "1px solid var(--border-light)", paddingBottom: "8px" }}>
                        <strong style={{ fontSize: "15px", color: "var(--primary)" }}>{warehouseMap.get(tx.warehouse_id)?.name || "Kho"}</strong>
                        <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>Ngày nhập: {formatDate(tx.transaction_date)}</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "12px 20px", fontSize: "13.5px" }}>
                        <div>Loại hàng: <strong>{formatInventoryItemType(tx.item_type)}</strong></div>
                        <div>Khối lượng nhập: <strong>{formatNumber(Math.abs(tx.quantity_kg))} kg</strong></div>
                      </div>
                      {tx.note ? (
                        <div style={{ marginTop: "10px", background: "var(--bg-card)", border: "1px solid var(--border-light)", padding: "8px 12px", borderRadius: "var(--radius-xs)", fontSize: "12px", color: "var(--text-muted)" }}>
                          Ghi chú: {tx.note}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* BƯỚC 6: NHẬT KÝ XAY XÁT GẠO */}
        {/* ========================================================================= */}
        <div className="card" style={{ padding: "24px", border: activeEditStep === "step6" ? "2px solid var(--primary)" : "1px solid var(--border-light)" }}>
          <div className="card-title-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-light)", paddingBottom: "14px", marginBottom: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ background: "var(--primary)", color: "white", width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "14px" }}>6</div>
              <Percent size={20} style={{ color: "var(--primary)" }} />
              <h2 style={{ fontSize: "17px", fontWeight: "800" }}>Bước 6: Nhật ký Xay xát gạo</h2>
            </div>
            
            {activeEditStep !== "step6" ? (
              <button className="secondary-button" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "13px" }} onClick={startEditingStep6}>
                <Plus size={14} /> Thêm & Sửa đợt xay
              </button>
            ) : (
              <button className="secondary-button" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "13px", color: "var(--danger)" }} onClick={() => setActiveEditStep(null)}>
                <Check size={14} /> Hoàn tất xay xát
              </button>
            )}
          </div>

          {activeEditStep === "step6" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* CURRENT MILLING RECORDS */}
              <div>
                <h3 style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "10px", color: "var(--primary)" }}>Đợt xay xát đã ghi nhận</h3>
                {millingRecords.length === 0 ? (
                  <div className="empty-state" style={{ padding: "20px" }}>Chưa ghi nhận đợt xay xát nào cho chuyến này.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                    {millingRecords.map((record) => {
                      const factory = factoryMap.get(record.factory_id);
                      const recovery = record.input_weight_kg > 0 ? round2((record.output_weight_kg / record.input_weight_kg) * 100) : 0;
                      return (
                        <div key={record.id} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: "14px", background: "var(--bg-app)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", borderBottom: "1px solid var(--border-light)", paddingBottom: "6px" }}>
                            <strong style={{ fontSize: "14px", color: "var(--primary)" }}>{factory?.name || "Nhà máy xay"}</strong>
                            <div style={{ display: "flex", gap: "6px" }}>
                              <button type="button" className="icon-button" aria-label="Sửa xay" onClick={() => startEditMillingRow(record)}>
                                <Edit2 size={13} />
                              </button>
                              <button type="button" className="icon-button" style={{ color: "var(--danger)" }} aria-label="Xóa xay" onClick={() => void deleteMillingRecord(record)}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                          
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", fontSize: "12.5px" }}>
                            <div>Lúa vào xay: <strong>{formatNumber(record.input_weight_kg)} kg</strong></div>
                            <div>Gạo thu hồi: <strong>{formatNumber(record.output_weight_kg)} kg</strong></div>
                            <div>Tỷ lệ thu hồi: <strong className="profit-positive">{recovery}%</strong></div>
                            <div>Đơn giá xay: <strong>{formatMoney(record.unit_price)}/kg</strong></div>
                            <div style={{ gridColumn: "1 / -1" }}>Thành tiền: <strong style={{ color: "var(--danger)" }}>{formatMoney(record.total_cost)}</strong></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* MILLING FORM */}
              <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: "18px", background: "var(--primary-soft)" }}>
                <h3 style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "14px" }}>
                  {millingForm.id ? "✍️ Cập nhật thông tin xay xát" : "➕ Thêm nhật ký xay xát lúa mới"}
                </h3>

                <form onSubmit={saveMillingRecord} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div className="field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                    <label className="field">
                      <span>Nhà máy xay xát <span className="text-danger">*</span></span>
                      <select value={millingForm.factory_id} onChange={(e) => setMillingForm({ ...millingForm, factory_id: e.target.value })} required>
                        <option value="">-- Chọn nhà máy xay xát --</option>
                        {factories.filter((f) => f.type === "milling" || !f.type).map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>Lúa khô đưa vào máy xay (kg) <span className="text-danger">*</span></span>
                      <input type="number" value={millingForm.input_weight_kg || ""} onChange={(e) => setMillingForm({ ...millingForm, input_weight_kg: Number(e.target.value) })} required placeholder="VD: 20000" />
                    </label>

                    <label className="field">
                      <span>Gạo thành phẩm thu hồi (kg) <span className="text-danger">*</span></span>
                      <input type="number" value={millingForm.output_weight_kg || ""} onChange={(e) => setMillingForm({ ...millingForm, output_weight_kg: Number(e.target.value) })} required placeholder="VD: 13500" />
                    </label>
                  </div>

                  <div style={{ background: "var(--bg-app)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px dashed var(--border-light)", fontSize: "13px" }}>
                    Tỷ lệ thu hồi gạo ước tính: <strong className="profit-positive">{millingForm.input_weight_kg > 0 ? round2((millingForm.output_weight_kg / millingForm.input_weight_kg) * 100) : 0} %</strong>
                  </div>

                  <div className="field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                    <label className="field">
                      <span>Đơn giá xay xát (đ/kg lúa đầu vào)</span>
                      <input type="number" value={millingForm.unit_price || ""} onChange={(e) => setMillingForm({ ...millingForm, unit_price: Number(e.target.value) })} placeholder="VD: 150" />
                    </label>

                    <label className="field">
                      <span>Thành tiền xay xát (VND - Tự tính)</span>
                      <input type="number" value={millingForm.total_cost || ""} onChange={(e) => setMillingForm({ ...millingForm, total_cost: Number(e.target.value) })} placeholder="Auto-calculated" />
                    </label>

                    <label className="field">
                      <span>Ngày xay xát</span>
                      <input type="date" value={millingForm.processed_date} onChange={(e) => setMillingForm({ ...millingForm, processed_date: e.target.value })} />
                    </label>
                  </div>

                  <div className="field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                    <label className="field">
                      <span>Thanh toán dịch vụ xay</span>
                      <select value={millingForm.payment_status} onChange={(e) => setMillingForm({ ...millingForm, payment_status: e.target.value as PaymentStatus })}>
                        <option value="unpaid">Chưa trả</option>
                        <option value="partial">Trả một phần</option>
                        <option value="paid">Đã trả</option>
                      </select>
                    </label>

                    <label className="field">
                      <span>Ghi chú thêm xay xát</span>
                      <input type="text" value={millingForm.note} onChange={(e) => setMillingForm({ ...millingForm, note: e.target.value })} placeholder="VD: Bù cám, tấm..." />
                    </label>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "4px" }}>
                    {millingForm.id && (
                      <button type="button" className="secondary-button" onClick={() => setMillingForm({ id: "", factory_id: "", processed_date: trip.start_date || "", input_weight_kg: 0, output_weight_kg: 0, unit_price: 0, total_cost: 0, payment_status: "unpaid", note: "" })}>
                        Hủy cập nhật
                      </button>
                    )}
                    <button type="submit" className="primary-button" disabled={savingMilling} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      {savingMilling ? <Loader2 className="spinning" size={16} /> : <Check size={16} />}
                      {millingForm.id ? "Cập nhật xay xát" : "Ghi nhận xay xát"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            <div>
              {millingRecords.length === 0 ? (
                <div className="empty-state" style={{ padding: "30px", background: "rgba(0,0,0,0.01)", border: "1px dashed var(--border-light)" }}>
                  Không ghi nhận dữ liệu xay xát cho chuyến này.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {millingRecords.map((record) => {
                    const factory = factoryMap.get(record.factory_id);
                    const recoveryRate = record.input_weight_kg > 0 ? round2((record.output_weight_kg / record.input_weight_kg) * 100) : 0;
                    return (
                      <div key={record.id} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: "16px", background: "var(--bg-app)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "1px solid var(--border-light)", paddingBottom: "8px" }}>
                          <strong style={{ fontSize: "15px", color: "var(--primary)" }}>{factory?.name || "Nhà máy xay xát"}</strong>
                          <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>Ngày thực hiện: {formatDate(record.processed_date)}</span>
                        </div>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "12px 20px", fontSize: "13.5px" }}>
                          <div>Lúa đầu vào xay: <strong>{formatNumber(record.input_weight_kg)} kg</strong></div>
                          <div>Gạo thu hồi đầu ra: <strong>{formatNumber(record.output_weight_kg)} kg</strong></div>
                          <div>Tỷ lệ thu hồi gạo: <strong className="profit-positive">{formatNumber(recoveryRate)} %</strong></div>
                          <div>Đơn giá xay xát: <strong>{formatMoney(record.unit_price)}/kg</strong></div>
                          <div>Thành tiền xay xát: <strong style={{ color: "var(--danger)" }}>{formatMoney(record.total_cost)}</strong></div>
                          <div>
                            Thanh toán:
                            <span className={`badge ${record.payment_status === "paid" ? "badge-completed" : record.payment_status === "partial" ? "badge-selling" : "badge-cancelled"}`} style={{ fontSize: "11px", marginLeft: "8px", padding: "2px 6px" }}>
                              {paymentStatusLabels[record.payment_status]}
                            </span>
                          </div>
                        </div>
                        {record.note && (
                          <div style={{ marginTop: "10px", background: "var(--bg-card)", border: "1px solid var(--border-light)", padding: "8px 12px", borderRadius: "var(--radius-xs)", fontSize: "12px", color: "var(--text-muted)" }}>
                            Ghi chú xay xát: {record.note}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* BƯỚC 7: BÁN GẠO & DOANH THU */}
        {/* ========================================================================= */}
        <div className="card" style={{ padding: "24px", border: activeEditStep === "step7" ? "2px solid var(--primary)" : "1px solid var(--border-light)" }}>
          <div className="card-title-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-light)", paddingBottom: "14px", marginBottom: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ background: "var(--primary)", color: "white", width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "14px" }}>7</div>
              <TrendingUp size={20} style={{ color: "var(--primary)" }} />
              <h2 style={{ fontSize: "17px", fontWeight: "800" }}>Bước 7: Giao dịch Bán gạo & Doanh thu</h2>
            </div>
            
            {activeEditStep !== "step7" ? (
              <button className="secondary-button" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "13px" }} onClick={startEditingStep7}>
                <Plus size={14} /> Thêm & Sửa giao dịch bán
              </button>
            ) : (
              <button className="secondary-button" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "13px", color: "var(--danger)" }} onClick={() => setActiveEditStep(null)}>
                <Check size={14} /> Hoàn tất bán hàng
              </button>
            )}
          </div>

          {activeEditStep === "step7" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* CURRENT SALES */}
              <div>
                <h3 style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "10px", color: "var(--primary)" }}>Danh sách giao dịch gạo đã bán</h3>
                {sales.length === 0 ? (
                  <div className="empty-state" style={{ padding: "20px" }}>Chưa ghi nhận giao dịch bán gạo nào.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                    {sales.map((sale) => (
                      <div key={sale.id} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: "14px", background: "var(--bg-app)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", borderBottom: "1px solid var(--border-light)", paddingBottom: "6px" }}>
                          <strong style={{ fontSize: "14px", color: "var(--success)" }}>{sale.buyer_name || "Khách mua"}</strong>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button type="button" className="icon-button" aria-label="Sửa đơn bán" onClick={() => startEditSaleRow(sale)}>
                              <Edit2 size={13} />
                            </button>
                            <button type="button" className="icon-button" style={{ color: "var(--danger)" }} aria-label="Xóa đơn bán" onClick={() => void deleteSaleRecord(sale.id)}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", fontSize: "12.5px" }}>
                          <div>Khối lượng bán: <strong>{formatNumber(sale.rice_weight_kg)} kg</strong></div>
                          <div>Đơn giá gạo: <strong>{formatMoney(sale.unit_price)}/kg</strong></div>
                          <div style={{ gridColumn: "1 / -1" }}>Tổng doanh thu: <strong style={{ color: "var(--success)" }}>{formatMoney(sale.total_amount)}</strong></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SALES FORM */}
              <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: "18px", background: "var(--primary-soft)" }}>
                <h3 style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "14px" }}>
                  {saleForm.id ? "✍️ Cập nhật đơn bán gạo" : "➕ Thêm giao dịch bán gạo mới"}
                </h3>

                <form onSubmit={saveSaleRecord} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div className="field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                    <label className="field">
                      <span>Tên khách hàng / Người mua <span className="text-danger">*</span></span>
                      <input type="text" value={saleForm.buyer_name} onChange={(e) => setSaleForm({ ...saleForm, buyer_name: e.target.value })} required placeholder="VD: Công ty Cỏ May, Kho gạo miền Tây..." />
                    </label>

                    <label className="field">
                      <span>Khối lượng gạo xuất bán (kg) <span className="text-danger">*</span></span>
                      <input type="number" value={saleForm.rice_weight_kg || ""} onChange={(e) => setSaleForm({ ...saleForm, rice_weight_kg: Number(e.target.value) })} required placeholder="VD: 15000" />
                    </label>

                    <label className="field">
                      <span>Đơn giá bán gạo (đ/kg) <span className="text-danger">*</span></span>
                      <input type="number" value={saleForm.unit_price || ""} onChange={(e) => setSaleForm({ ...saleForm, unit_price: Number(e.target.value) })} required placeholder="VD: 12500" />
                    </label>
                  </div>

                  <div className="field-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
                    <label className="field">
                      <span>Tổng doanh thu (VND - Tự tính)</span>
                      <input type="number" value={saleForm.total_amount || ""} onChange={(e) => setSaleForm({ ...saleForm, total_amount: Number(e.target.value) })} placeholder="Auto-calculated" />
                    </label>

                    <label className="field">
                      <span>Ngày bán gạo</span>
                      <input type="date" value={saleForm.sale_date} onChange={(e) => setSaleForm({ ...saleForm, sale_date: e.target.value })} />
                    </label>

                    <label className="field">
                      <span>Thanh toán của khách</span>
                      <select value={saleForm.payment_status} onChange={(e) => setSaleForm({ ...saleForm, payment_status: e.target.value as PaymentStatus })}>
                        <option value="unpaid">Chưa trả</option>
                        <option value="partial">Trả một phần</option>
                        <option value="paid">Đã trả</option>
                      </select>
                    </label>
                  </div>

                  <label className="field">
                    <span>Ghi chú thêm giao dịch bán</span>
                    <input type="text" value={saleForm.note} onChange={(e) => setSaleForm({ ...saleForm, note: e.target.value })} placeholder="VD: Giao tại kho..." />
                  </label>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "4px" }}>
                    {saleForm.id && (
                      <button type="button" className="secondary-button" onClick={() => setSaleForm({ id: "", buyer_name: "", sale_date: trip.start_date || "", rice_weight_kg: 0, unit_price: 0, total_amount: 0, payment_status: "unpaid", note: "" })}>
                        Hủy cập nhật
                      </button>
                    )}
                    <button type="submit" className="primary-button" disabled={savingSale} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      {savingSale ? <Loader2 className="spinning" size={16} /> : <Check size={16} />}
                      {saleForm.id ? "Cập nhật đơn bán" : "Ghi nhận đơn bán"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            <div>
              {sales.length === 0 ? (
                <div className="empty-state" style={{ padding: "30px", background: "rgba(0,0,0,0.01)", border: "1px dashed var(--border-light)" }}>
                  Chưa ghi nhận giao dịch bán gạo nào cho chuyến này.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {sales.map((sale) => (
                    <div key={sale.id} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: "16px", background: "var(--bg-app)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "1px solid var(--border-light)", paddingBottom: "8px" }}>
                        <strong style={{ fontSize: "15px", color: "var(--success)" }}>{sale.buyer_name || "Khách hàng mua gạo"}</strong>
                        <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>Ngày thực hiện: {formatDate(sale.sale_date)}</span>
                      </div>
                      
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "12px 20px", fontSize: "13.5px" }}>
                        <div>Khối lượng gạo bán: <strong>{formatNumber(sale.rice_weight_kg)} kg</strong></div>
                        <div>Đơn giá gạo bán: <strong>{formatMoney(sale.unit_price)}/kg</strong></div>
                        <div>Doanh thu xuất bán: <strong style={{ color: "var(--success)", fontSize: "14.5px" }}>{formatMoney(sale.total_amount)}</strong></div>
                        <div>
                          Khách hàng thanh toán:
                          <span className={`badge ${sale.payment_status === "paid" ? "badge-completed" : sale.payment_status === "partial" ? "badge-selling" : "badge-cancelled"}`} style={{ fontSize: "11px", marginLeft: "8px", padding: "2px 6px" }}>
                            {paymentStatusLabels[sale.payment_status]}
                          </span>
                        </div>
                      </div>
                      {sale.note && (
                        <div style={{ marginTop: "10px", background: "var(--bg-card)", border: "1px solid var(--border-light)", padding: "8px 12px", borderRadius: "var(--radius-xs)", fontSize: "12px", color: "var(--text-muted)" }}>
                          Ghi chú hóa đơn: {sale.note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </section>
  );
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(new Date(`${value}T00:00:00`));
  } catch (e) {
    return value;
  }
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

function formatNullableMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return formatMoney(value);
}

function formatInventoryItemType(value: InventoryItemType) {
  const labels: Record<InventoryItemType, string> = {
    paddy: "Lúa",
    rice: "Gạo",
    byproduct: "Phụ phẩm",
  };
  return labels[value] ?? value;
}
