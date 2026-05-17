import { zodResolver } from "@hookform/resolvers/zod";
import Docxtemplater from "docxtemplater";
import { saveAs } from "file-saver";
import { Edit2, FileText, Plus, Search, Trash2, X } from "lucide-react";
import PizZip from "pizzip";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { ModalShell } from "../../components/ui/ModalShell";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { useServerPagination } from "../../hooks/useServerPagination";
import type { PurchaseSlipNavigationState } from "../../lib/purchase-slip-navigation";
import { supabase } from "../../lib/supabase";
import type { Enums, Tables } from "../../types/database";
import { formatDbError } from "../../lib/db-errors";

type PurchaseSlip = Tables<"purchase_slips">;
type Season = Tables<"seasons">;
type Farmer = Tables<"farmers">;
type Broker = Tables<"brokers">;
type TransportTrip = Tables<"transport_trips">;
type RiceType = Tables<"rice_types">;
type AuthorizationLetter = Tables<"authorization_letters">;
type PaymentStatus = Enums<"payment_status">;

type SlipRow = PurchaseSlip & {
  season?: Season | null;
  farmer?: Farmer | null;
  broker?: Broker | null;
  transportTrip?: TransportTrip | null;
  riceType?: RiceType | null;
  authorizationLetter?: AuthorizationLetter | null;
  authorizedReceiverBroker?: Broker | null;
};

const paymentStatusOptions: { value: PaymentStatus; label: string }[] = [
  { value: "unpaid", label: "Chưa trả" },
  { value: "partial", label: "Trả một phần" },
  { value: "paid", label: "Đã trả" },
];

const slipSchema = z.object({
  season_id: z.string().min(1, "Vui lòng chọn mùa vụ"),
  farmer_id: z.string().min(1, "Vui lòng chọn nông dân"),
  broker_id: z.string().min(1, "Vui lòng chọn cò lúa"),
  transport_trip_id: z.string().optional(),
  rice_type_id: z.string().min(1, "Vui lòng chọn loại lúa"),
  authorization_letter_id: z.string().optional(),
  authorized_receiver_broker_id: z.string().optional(),
  purchase_date: z.string().min(1, "Vui lòng chọn ngày mua"),
  weight_kg: z.number().min(0, "Khối lượng không được âm"),
  unit_price: z.number().min(0, "Đơn giá không được âm"),
  broker_commission_per_kg: z.number().min(0, "Hoa hồng không được âm"),
  payment_status: z.enum(["unpaid", "partial", "paid"]),
  note: z.string().trim().optional(),
});

type SlipFormValues = z.infer<typeof slipSchema>;

const emptyValues: SlipFormValues = {
  season_id: "",
  farmer_id: "",
  broker_id: "",
  transport_trip_id: "",
  rice_type_id: "",
  authorization_letter_id: "",
  authorized_receiver_broker_id: "",
  purchase_date: new Date().toISOString().slice(0, 10),
  weight_kg: 0,
  unit_price: 0,
  broker_commission_per_kg: 0,
  payment_status: "unpaid",
  note: "",
};

const slipQueryOptions = {
  resolveSearchFilter: async (search: string) => {
    const term = search.trim();
    if (!term) return null;

    const escaped = term.replace(/[%_,]/g, "");
    if (!escaped) return null;

    const pattern = `%${escaped}%`;
    const [farmersResult, brokersResult] = await Promise.all([
      supabase.from("farmers").select("id").or(`name.ilike.${pattern},phone.ilike.${pattern}`),
      supabase.from("brokers").select("id").or(`name.ilike.${pattern},phone.ilike.${pattern}`),
    ]);

    const conditions = [`note.ilike.${pattern}`];
    const farmerIds = (farmersResult.data ?? []).map((farmer) => farmer.id);
    const brokerIds = (brokersResult.data ?? []).map((broker) => broker.id);

    if (farmerIds.length > 0) {
      conditions.push(`farmer_id.in.(${farmerIds.join(",")})`);
    }
    if (brokerIds.length > 0) {
      conditions.push(`broker_id.in.(${brokerIds.join(",")})`);
    }

    return conditions.join(",");
  },
};

export function PurchaseSlipsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const pendingFarmerDraftRef = useRef<PurchaseSlipNavigationState | null>(null);
  const [prefillFarmerName, setPrefillFarmerName] = useState<string | null>(null);
  const {
    items: slipRows,
    page,
    setPage,
    total,
    totalPages,
    search,
    setSearch,
    loading,
    error: listError,
    refresh,
  } = useServerPagination<PurchaseSlip>("purchase_slips", { queryOptions: slipQueryOptions });
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [transportTrips, setTransportTrips] = useState<TransportTrip[]>([]);
  const [riceTypes, setRiceTypes] = useState<RiceType[]>([]);
  const [authorizationLetters, setAuthorizationLetters] = useState<AuthorizationLetter[]>([]);
  const [referenceLoading, setReferenceLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [generatingContractId, setGeneratingContractId] = useState<string | null>(null);
  const [generatingDeliveryReceiptId, setGeneratingDeliveryReceiptId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<SlipRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [actionMenu, setActionMenu] = useState<{ id: string; top: number; left: number } | null>(null);

  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = useForm<SlipFormValues>({
    resolver: zodResolver(slipSchema),
    defaultValues: emptyValues,
  });

  const watchedWeight = watch("weight_kg");
  const watchedUnitPrice = watch("unit_price");
  const watchedCommission = watch("broker_commission_per_kg");
  const selectedSeasonId = watch("season_id");
  const selectedFarmerId = watch("farmer_id");
  const selectedBrokerId = watch("broker_id");
  const selectedTransportTripId = watch("transport_trip_id");
  const selectedRiceTypeId = watch("rice_type_id");
  const selectedAuthorizationLetterId = watch("authorization_letter_id");
  const selectedAuthorizedReceiverBrokerId = watch("authorized_receiver_broker_id");
  const totalAmount = round2((watchedWeight || 0) * (watchedUnitPrice || 0));
  const brokerCommissionTotal = round2((watchedWeight || 0) * (watchedCommission || 0));

  const seasonOptions = useMemo(
    () => seasons.map((season) => ({ value: season.id, label: season.name })),
    [seasons],
  );
  const farmerOptions = useMemo(
    () =>
      farmers.map((farmer) => ({
        value: farmer.id,
        label: farmer.citizen_id ? `${farmer.name} - CCCD: ${farmer.citizen_id}` : farmer.name,
      })),
    [farmers],
  );
  const brokerOptions = useMemo(
    () => brokers.map((broker) => ({ value: broker.id, label: broker.name })),
    [brokers],
  );
  const transportTripOptions = useMemo(
    () =>
      transportTrips.map((trip) => ({
        value: trip.id,
        label: `${trip.code} - ${formatDate(trip.trip_date)}`,
      })),
    [transportTrips],
  );
  const riceTypeOptions = useMemo(
    () => riceTypes.map((riceType) => ({ value: riceType.id, label: riceType.name })),
    [riceTypes],
  );
  const authorizationLetterOptions = useMemo(
    () =>
      authorizationLetters.map((letter) => ({
        value: letter.id,
        label: formatAuthorizationLetter(letter, farmers, brokers),
      })),
    [authorizationLetters, farmers, brokers],
  );

  useEffect(() => {
    if (!actionMenu) return;

    function closeMenu() {
      setActionMenu(null);
    }

    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [actionMenu]);

  function openActionMenu(itemId: string, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 172;
    const left = Math.min(window.innerWidth - menuWidth - 8, Math.max(8, rect.right - menuWidth));
    const preferredTop = rect.bottom + 6;
    const top = preferredTop + menuHeight > window.innerHeight
      ? Math.max(8, rect.top - menuHeight - 6)
      : preferredTop;

    setActionMenu({ id: itemId, top, left });
  }

  const seasonMap = useMemo(() => new Map(seasons.map((season) => [season.id, season])), [seasons]);
  const farmerMap = useMemo(() => new Map(farmers.map((farmer) => [farmer.id, farmer])), [farmers]);
  const brokerMap = useMemo(() => new Map(brokers.map((broker) => [broker.id, broker])), [brokers]);
  const transportTripMap = useMemo(
    () => new Map(transportTrips.map((trip) => [trip.id, trip])),
    [transportTrips],
  );
  const riceTypeMap = useMemo(
    () => new Map(riceTypes.map((riceType) => [riceType.id, riceType])),
    [riceTypes],
  );
  const authorizationLetterMap = useMemo(
    () => new Map(authorizationLetters.map((letter) => [letter.id, letter])),
    [authorizationLetters],
  );

  const items = useMemo<SlipRow[]>(
    () =>
      slipRows.map((slip) => ({
        ...slip,
        season: seasonMap.get(slip.season_id) ?? null,
        farmer: farmerMap.get(slip.farmer_id) ?? null,
        broker: brokerMap.get(slip.broker_id) ?? null,
        transportTrip: slip.transport_trip_id ? transportTripMap.get(slip.transport_trip_id) ?? null : null,
        riceType: riceTypeMap.get(slip.rice_type_id) ?? null,
        authorizationLetter: slip.authorization_letter_id
          ? authorizationLetterMap.get(slip.authorization_letter_id) ?? null
          : null,
        authorizedReceiverBroker: slip.authorized_receiver_broker_id
          ? brokerMap.get(slip.authorized_receiver_broker_id) ?? null
          : null,
      })),
    [
      slipRows,
      seasonMap,
      farmerMap,
      brokerMap,
      transportTripMap,
      riceTypeMap,
      authorizationLetterMap,
    ],
  );

  const formTitle = editingItem ? "Sửa phiếu mua" : "Thêm phiếu mua";

  async function loadReferenceData() {
    setReferenceLoading(true);

    const [
      seasonsResult,
      farmersResult,
      brokersResult,
      transportTripsResult,
      riceTypesResult,
      authorizationLettersResult,
    ] = await Promise.all([
      supabase.from("seasons").select("*").order("from_date", { ascending: false }),
      supabase.from("farmers").select("*").order("name", { ascending: true }),
      supabase.from("brokers").select("*").order("name", { ascending: true }),
      supabase.from("transport_trips").select("*").order("trip_date", { ascending: false }),
      supabase.from("rice_types").select("*").order("name", { ascending: true }),
      supabase.from("authorization_letters").select("*").order("created_at", { ascending: false }),
    ]);

    const firstError =
      seasonsResult.error ??
      farmersResult.error ??
      brokersResult.error ??
      transportTripsResult.error ??
      riceTypesResult.error ??
      authorizationLettersResult.error;

    if (firstError) {
      setError(formatDbError(firstError));
    } else {
      setSeasons(seasonsResult.data ?? []);
      setFarmers(farmersResult.data ?? []);
      setBrokers(brokersResult.data ?? []);
      setTransportTrips(transportTripsResult.data ?? []);
      setRiceTypes(riceTypesResult.data ?? []);
      setAuthorizationLetters(authorizationLettersResult.data ?? []);
    }

    setReferenceLoading(false);
  }

  useEffect(() => {
    void loadReferenceData();
  }, []);

  useEffect(() => {
    const state = location.state as PurchaseSlipNavigationState | null;
    if (!state?.farmerId) return;

    pendingFarmerDraftRef.current = state;
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (loading || referenceLoading || !pendingFarmerDraftRef.current) return;

    const draft = pendingFarmerDraftRef.current;
    pendingFarmerDraftRef.current = null;

    setEditingItem(null);
    setPrefillFarmerName(draft.farmerName ?? null);
    reset({
      ...emptyValues,
      farmer_id: draft.farmerId,
      purchase_date: new Date().toISOString().slice(0, 10),
    });
    setFormOpen(true);
  }, [loading, referenceLoading, reset]);

  function startEdit(item: SlipRow) {
    setEditingItem(item);
    reset({
      season_id: item.season_id,
      farmer_id: item.farmer_id,
      broker_id: item.broker_id,
      transport_trip_id: item.transport_trip_id ?? "",
      rice_type_id: item.rice_type_id,
      authorization_letter_id: item.authorization_letter_id ?? "",
      authorized_receiver_broker_id: item.authorized_receiver_broker_id ?? "",
      purchase_date: item.purchase_date,
      weight_kg: item.weight_kg,
      unit_price: item.unit_price,
      broker_commission_per_kg: item.broker_commission_per_kg,
      payment_status: item.payment_status,
      note: item.note ?? "",
    });
    setFormOpen(true);
  }

  function clearForm() {
    setEditingItem(null);
    setPrefillFarmerName(null);
    reset(emptyValues);
    setFormOpen(false);
  }

  function applyBrokerDefaultCommission(brokerId: string) {
    const broker = brokers.find((item) => item.id === brokerId);
    setValue("broker_commission_per_kg", broker?.default_commission_per_kg ?? 0, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  async function onSubmit(values: SlipFormValues) {
    setSaving(true);
    setError(null);

    const payload = {
      season_id: values.season_id,
      farmer_id: values.farmer_id,
      broker_id: values.broker_id,
      transport_trip_id: values.transport_trip_id || null,
      rice_type_id: values.rice_type_id,
      authorization_letter_id: values.authorization_letter_id || null,
      authorized_receiver_broker_id: values.authorized_receiver_broker_id || null,
      purchase_date: values.purchase_date,
      weight_kg: values.weight_kg,
      unit_price: values.unit_price,
      total_amount: round2(values.weight_kg * values.unit_price),
      broker_commission_per_kg: values.broker_commission_per_kg,
      broker_commission_total: round2(values.weight_kg * values.broker_commission_per_kg),
      payment_status: values.payment_status,
      note: toNullable(values.note),
    };

    const result = editingItem
      ? await supabase.from("purchase_slips").update(payload).eq("id", editingItem.id)
      : await supabase.from("purchase_slips").insert(payload);

    if (result.error) {
      setError(formatDbError(result.error));
    } else {
      clearForm();
      await refresh(editingItem ? page : 1);
    }

    setSaving(false);
  }

  async function deleteItem(item: SlipRow) {
    const confirmed = window.confirm(`Xóa phiếu mua ngày ${formatDate(item.purchase_date)}?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    const { error: deleteError } = await supabase
      .from("purchase_slips")
      .delete()
      .eq("id", item.id);

    if (deleteError) {
      setError(formatDbError(deleteError));
    } else {
      if (editingItem?.id === item.id) clearForm();
      await refresh(page);
    }

    setDeletingId(null);
  }

  async function generateContractDocx(item: SlipRow) {
    setGeneratingContractId(item.id);
    setError(null);

    try {
      const response = await fetch("/templates/purchase-contract-template.docx");
      if (!response.ok) {
        throw new Error("Không tìm thấy file mẫu hợp đồng tại /templates/purchase-contract-template.docx.");
      }

      const templateBuffer = await response.arrayBuffer();
      const doc = buildContractDoc(templateBuffer);

      doc.render(buildContractTemplateData(item));

      const blob = doc.getZip().generate({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      saveAs(blob, buildContractFileName(item));
    } catch (currentError) {
      const message = formatContractTemplateError(currentError);
      setError(message);
    } finally {
      setGeneratingContractId(null);
    }
  }

  async function generateDeliveryReceiptDocx(item: SlipRow) {
    setGeneratingDeliveryReceiptId(item.id);
    setError(null);

    try {
      const response = await fetch("/templates/delivery-receipt-template.docx");
      if (!response.ok) {
        throw new Error("Không tìm thấy file mẫu biên bản giao nhận tại /templates/delivery-receipt-template.docx.");
      }

      const templateBuffer = await response.arrayBuffer();
      const doc = buildContractDoc(templateBuffer);
      doc.render(buildDeliveryReceiptTemplateData(item));

      const blob = doc.getZip().generate({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      saveAs(blob, buildDeliveryReceiptFileName(item));
    } catch (currentError) {
      const message = currentError instanceof Error
        ? currentError.message
        : "Không thể tạo biên bản giao nhận DOCX. Vui lòng kiểm tra lại file mẫu.";
      setError(message);
    } finally {
      setGeneratingDeliveryReceiptId(null);
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Phiếu mua</h1>
          <p>Ghi nhận từng lần mua lúa theo nông dân, cò lúa, mùa vụ và chuyến ghe nếu có.</p>
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
            Thêm phiếu mua
          </button>
        </div>
      </header>

      <div className="crud-grid modal-crud-grid">
        {formOpen ? (
          <ModalShell wide onClose={clearForm}>
            <form className="form-card" onSubmit={handleSubmit(onSubmit)}>
          <div className="card-title-row">
            <h2>{formTitle}</h2>
            {editingItem ? (
              <button className="icon-button" type="button" onClick={clearForm} aria-label="Hủy sửa">
                <X size={18} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          {prefillFarmerName && !editingItem ? (
            <div className="farmer-scan-summary">
              <strong>Nông dân: {prefillFarmerName}</strong>
              <span>Đã chọn từ bước tạo nông dân — điền các thông tin còn lại.</span>
            </div>
          ) : null}

          <div className="field-grid">
            <label className="field">
              <span>Ngày mua</span>
              <input type="date" {...register("purchase_date")} />
              {errors.purchase_date ? <small>{errors.purchase_date.message}</small> : null}
            </label>
            <label className="field">
              <span>Mùa vụ</span>
              <SearchableSelect
                value={selectedSeasonId}
                onChange={(value) => setValue("season_id", value, { shouldDirty: true, shouldValidate: true })}
                options={seasonOptions}
                placeholder="Tìm mùa vụ"
                emptyLabel="Chọn mùa vụ"
              />
              {errors.season_id ? <small>{errors.season_id.message}</small> : null}
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Nông dân</span>
              <SearchableSelect
                value={selectedFarmerId}
                onChange={(value) => setValue("farmer_id", value, { shouldDirty: true, shouldValidate: true })}
                options={farmerOptions}
                placeholder="Tìm nông dân"
                emptyLabel="Chọn nông dân"
              />
              {errors.farmer_id ? <small>{errors.farmer_id.message}</small> : null}
            </label>
            <label className="field">
              <span>Cò lúa</span>
              <SearchableSelect
                value={selectedBrokerId}
                onChange={(value) => {
                  setValue("broker_id", value, { shouldDirty: true, shouldValidate: true });
                  applyBrokerDefaultCommission(value);
                }}
                options={brokerOptions}
                placeholder="Tìm cò lúa"
                emptyLabel="Chọn cò lúa"
              />
              {errors.broker_id ? <small>{errors.broker_id.message}</small> : null}
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Loại lúa</span>
              <SearchableSelect
                value={selectedRiceTypeId}
                onChange={(value) => setValue("rice_type_id", value, { shouldDirty: true, shouldValidate: true })}
                options={riceTypeOptions}
                placeholder="Tìm loại lúa"
                emptyLabel="Chọn loại lúa"
              />
              {errors.rice_type_id ? <small>{errors.rice_type_id.message}</small> : null}
            </label>
            <label className="field">
              <span>Chuyến ghe</span>
              <SearchableSelect
                value={selectedTransportTripId}
                onChange={(value) =>
                  setValue("transport_trip_id", value, { shouldDirty: true, shouldValidate: true })
                }
                options={transportTripOptions}
                placeholder="Tìm chuyến ghe"
                emptyLabel="Không chọn"
              />
            </label>
          </div>

          <label className="field">
            <span>Giấy ủy quyền</span>
            <SearchableSelect
              value={selectedAuthorizationLetterId}
              onChange={(value) =>
                setValue("authorization_letter_id", value, { shouldDirty: true, shouldValidate: true })
              }
              options={authorizationLetterOptions}
              placeholder="Tìm giấy ủy quyền"
              emptyLabel="Không chọn"
            />
          </label>

          <label className="field">
            <span>Cò nhận ủy quyền</span>
            <SearchableSelect
              value={selectedAuthorizedReceiverBrokerId}
              onChange={(value) =>
                setValue("authorized_receiver_broker_id", value, { shouldDirty: true, shouldValidate: true })
              }
              options={brokerOptions}
              placeholder="Tìm cò nhận ủy quyền"
              emptyLabel="Không chọn"
            />
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Khối lượng kg</span>
              <input type="number" min="0" step="0.01" {...register("weight_kg", { valueAsNumber: true })} />
              {errors.weight_kg ? <small>{errors.weight_kg.message}</small> : null}
            </label>
            <label className="field">
              <span>Đơn giá</span>
              <input type="number" min="0" step="1" {...register("unit_price", { valueAsNumber: true })} />
              {errors.unit_price ? <small>{errors.unit_price.message}</small> : null}
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Hoa hồng / kg</span>
              <input
                type="number"
                min="0"
                step="1"
                {...register("broker_commission_per_kg", { valueAsNumber: true })}
              />
              {errors.broker_commission_per_kg ? (
                <small>{errors.broker_commission_per_kg.message}</small>
              ) : null}
            </label>
            <label className="field">
              <span>Trạng thái thanh toán</span>
              <select {...register("payment_status")}>
                {paymentStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="calculation-box">
            <span>Thành tiền: {formatMoney(totalAmount)}</span>
            <span>Hoa hồng cò: {formatMoney(brokerCommissionTotal)}</span>
          </div>

          <label className="field">
            <span>Ghi chú</span>
            <textarea {...register("note")} rows={3} placeholder="Thông tin thêm nếu cần" />
          </label>

          <button className="primary-button" type="submit" disabled={saving}>
            <Plus size={18} aria-hidden="true" />
            {saving ? "Đang lưu..." : editingItem ? "Lưu thay đổi" : "Thêm phiếu mua"}
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
                placeholder="Tìm theo nông dân, cò, chuyến ghe, loại lúa"
              />
            </label>
          </div>

          {error ?? listError ? <div className="alert error-alert">{error ?? listError}</div> : null}

          {loading ? (
            <div className="state-box">Đang tải phiếu mua...</div>
          ) : items.length === 0 ? (
            <div className="state-box">Không có phiếu mua phù hợp.</div>
          ) : (
            <>
            <div className="table-wrap">
              <table className="data-table extra-wide-table">
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Nông dân</th>
                    <th>Cò lúa</th>
                    <th>Chuyến ghe</th>
                    <th>Loại lúa</th>
                    <th>Kg</th>
                    <th>Thành tiền</th>
                    <th>Hoa hồng</th>
                    <th>Thanh toán</th>
                    <th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.purchase_date)}</td>
                      <td>{item.farmer?.name || "-"}</td>
                      <td>
                        <div>{item.broker?.name || "-"}</div>
                        {item.authorizedReceiverBroker ? (
                          <span className="muted-text">Nhận UQ: {item.authorizedReceiverBroker.name}</span>
                        ) : null}
                      </td>
                      <td>{item.transportTrip?.code || "-"}</td>
                      <td>{item.riceType?.name || "-"}</td>
                      <td>{formatNumber(item.weight_kg)}</td>
                      <td>{formatMoney(item.total_amount)}</td>
                      <td>{formatMoney(item.broker_commission_total)}</td>
                      <td className="payment-status-cell">
                        <span className={`payment-status-chip ${getPaymentStatusClass(item.payment_status)}`}>
                          {formatPaymentStatus(item.payment_status)}
                        </span>
                      </td>
                      <td>
                        <div className="actions-menu-wrap">
                          <button
                            className="secondary-button compact-action-button"
                            type="button"
                            onMouseEnter={(event) => openActionMenu(item.id, event.currentTarget)}
                            onClick={(event) => {
                              if (actionMenu?.id === item.id) {
                                setActionMenu(null);
                              } else {
                                openActionMenu(item.id, event.currentTarget);
                              }
                            }}
                            aria-expanded={actionMenu?.id === item.id}
                          >
                            Actions
                          </button>
                          {actionMenu?.id === item.id
                            ? createPortal(
                            <div
                              className="actions-menu floating-actions-menu"
                              style={{ top: actionMenu.top, left: actionMenu.left }}
                              onMouseLeave={() => setActionMenu(null)}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setActionMenu(null);
                                  startEdit(item);
                                }}
                              >
                                <Edit2 size={16} aria-hidden="true" />
                                Sửa
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActionMenu(null);
                                  void deleteItem(item);
                                }}
                                disabled={deletingId === item.id}
                                className="danger"
                              >
                                <Trash2 size={16} aria-hidden="true" />
                                Xóa
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActionMenu(null);
                                  void generateContractDocx(item);
                                }}
                                disabled={generatingContractId === item.id}
                                title="Tạo hợp đồng DOCX"
                              >
                                <FileText size={16} aria-hidden="true" />
                                {generatingContractId === item.id ? "Đang tạo..." : "Tạo hợp đồng"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActionMenu(null);
                                  void generateDeliveryReceiptDocx(item);
                                }}
                                disabled={generatingDeliveryReceiptId === item.id}
                                title="Tạo biên bản giao nhận DOCX"
                              >
                                <FileText size={16} aria-hidden="true" />
                                {generatingDeliveryReceiptId === item.id
                                  ? "Đang tạo..."
                                  : "Tạo biên bản giao nhận"}
                              </button>
                            </div>,
                            document.body,
                          )
                            : null}
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

type SearchableOption = {
  value: string;
  label: string;
};

type SearchableSelectProps = {
  value?: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder: string;
  emptyLabel: string;
};

function SearchableSelect({ value = "", onChange, options, placeholder, emptyLabel }: SearchableSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const keyword = normalize(query);
    if (!keyword) return options;
    return options.filter((option) => normalize(option.label).includes(keyword));
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      setQuery(selected?.label ?? "");
    }
  }, [open, selected?.label]);

  function chooseOption(nextValue: string) {
    const nextOption = options.find((option) => option.value === nextValue);
    onChange(nextValue);
    setQuery(nextOption?.label ?? "");
    setOpen(false);
  }

  return (
    <div
      className="searchable-combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <div className="combobox-control">
        <input
          type="search"
          value={query}
          onFocus={(event) => {
            setOpen(true);
            event.currentTarget.select();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={open}
          autoComplete="off"
        />
        {value ? (
          <button
            type="button"
            onClick={() => chooseOption("")}
            aria-label="Bỏ chọn"
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="combobox-menu">
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseOption("")}>
            {emptyLabel}
          </button>
          {filteredOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={option.value === value ? "selected" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseOption(option.value)}
            >
              {option.label}
            </button>
          ))}
          {filteredOptions.length === 0 ? <span>Không có kết quả</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function formatAuthorizationLetter(letter: AuthorizationLetter, farmers: Farmer[], brokers: Broker[]) {
  const farmer = letter.farmer_id
    ? farmers.find((item) => item.id === letter.farmer_id)
    : null;
  const broker = letter.broker_id
    ? brokers.find((item) => item.id === letter.broker_id)
    : null;
  const date = letter.signed_date ? ` - ${formatDate(letter.signed_date)}` : "";
  return `${farmer?.name ?? "Nông dân"} / ${broker?.name ?? "Cò lúa"}${date}`;
}

function moneyToVietnameseWords(value: number) {
  const amount = Math.round(Math.abs(value));
  if (amount === 0) return "Không đồng";

  const unitLabels = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
  const groups: number[] = [];
  let remaining = amount;

  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const parts: string[] = [];
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    if (group === 0) continue;

    const words = readVietnameseNumberGroup(group, index < groups.length - 1);
    const unit = unitLabels[index] ?? "";
    parts.push([words, unit].filter(Boolean).join(" "));
  }

  const sentence = `${parts.join(" ")} đồng`.replace(/\s+/g, " ").trim();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function readVietnameseNumberGroup(value: number, full: boolean) {
  const digits = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  const hundred = Math.floor(value / 100);
  const ten = Math.floor((value % 100) / 10);
  const unit = value % 10;
  const words: string[] = [];

  if (hundred > 0) {
    words.push(digits[hundred], "trăm");
  } else if (full && (ten > 0 || unit > 0)) {
    words.push("không", "trăm");
  }

  if (ten > 1) {
    words.push(digits[ten], "mươi");
    if (unit === 1) words.push("mốt");
    else if (unit === 5) words.push("lăm");
    else if (unit > 0) words.push(digits[unit]);
  } else if (ten === 1) {
    words.push("mười");
    if (unit === 5) words.push("lăm");
    else if (unit > 0) words.push(digits[unit]);
  } else if (unit > 0) {
    if (hundred > 0 || full) words.push("linh");
    words.push(digits[unit]);
  }

  return words.join(" ");
}

function formatPaymentStatus(value: PaymentStatus) {
  return paymentStatusOptions.find((option) => option.value === value)?.label ?? value;
}

function getPaymentStatusClass(value: PaymentStatus) {
  if (value === "paid") return "paid";
  if (value === "partial") return "partial";
  return "unpaid";
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toNullable(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(
    new Date(`${value}T00:00:00`),
  );
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

function buildContractTemplateData(item: SlipRow) {
  const purchaseDateParts = getDateParts(item.purchase_date);
  const farmerDateOfBirth = formatDateOrFillLine(item.farmer?.date_of_birth);
  const farmerIssuedDate = formatDateOrFillLine(item.farmer?.citizen_id_issued_date);
  const farmerIssuedPlace = fillLine();

  return {
    farmer_name: toText(item.farmer?.name),
    farmer_full_name: toText(item.farmer?.name),
    farmer_gender: toTextOrFillLine(item.farmer?.gender),
    farmer_sex: toTextOrFillLine(item.farmer?.gender),
    farmer_citizen_id: toText(item.farmer?.citizen_id),
    farmer_id_number: toText(item.farmer?.citizen_id),
    farmer_date_of_birth: farmerDateOfBirth,
    farmer_birth_date: farmerDateOfBirth,
    farmer_dob: farmerDateOfBirth,
    farmer_citizen_id_issued_date: farmerIssuedDate,
    farmer_cccd_issued_date: farmerIssuedDate,
    farmer_citizen_id_issued_place: farmerIssuedPlace,
    farmer_cccd_issued_place: farmerIssuedPlace,
    farmer_phone: toTextOrFillLine(item.farmer?.phone),
    farmer_permanent_address: toTextOrFillLine(item.farmer?.permanent_address),
    farmer_address: toTextOrFillLine(item.farmer?.address),
    farmer_bank_name: toTextOrFillLine(item.farmer?.bank_name),
    farmer_bank_account_number: toTextOrFillLine(item.farmer?.bank_account_number),
    farmer_bank_account_name: toTextOrFillLine(item.farmer?.bank_account_name),
    rice_type: toText(item.riceType?.name),
    weight_kg: formatNumber(item.weight_kg),
    unit_price: formatMoney(item.unit_price),
    total_amount: formatMoney(item.total_amount),
    total_amount_words: moneyToVietnameseWords(item.total_amount),
    purchase_date: formatDateOrEmpty(item.purchase_date),
    purchase_day: purchaseDateParts.day,
    purchase_month: purchaseDateParts.month,
    purchase_year: purchaseDateParts.year,
    contract_day: purchaseDateParts.day,
    contract_month: purchaseDateParts.month,
    contract_year: purchaseDateParts.year,
    day: purchaseDateParts.day,
    month: purchaseDateParts.month,
    year: purchaseDateParts.year,
    broker_name: toText(item.broker?.name),
    note: toTextOrFillLine(item.note),
    transport_trip_code: toText(item.transportTrip?.code),
  };
}

function buildDeliveryReceiptTemplateData(item: SlipRow) {
  const purchaseDateParts = getDateParts(item.purchase_date);
  const contractNumber = toText(item.authorizationLetter?.code);

  return {
    receipt_no: buildDeliveryReceiptNumber(item),
    receipt_location: toTextOrFillLine(item.farmer?.permanent_address),
    receipt_day: purchaseDateParts.day,
    receipt_month: purchaseDateParts.month,
    receipt_year: purchaseDateParts.year,
    contract_no: contractNumber.length > 0 ? contractNumber : fillLine(),
    farmer_name: toTextOrFillLine(item.farmer?.name),
    farmer_citizen_id: toTextOrFillLine(item.farmer?.citizen_id),
    farmer_citizen_id_issued_date: formatDateOrFillLine(item.farmer?.citizen_id_issued_date),
    farmer_phone: toTextOrFillLine(item.farmer?.phone),
    farmer_permanent_address: toTextOrFillLine(item.farmer?.permanent_address),
    farmer_bank_account_number: toTextOrFillLine(item.farmer?.bank_account_number),
    farmer_bank_name: toTextOrFillLine(item.farmer?.bank_name),
    rice_type: toTextOrFillLine(item.riceType?.name),
    weight_kg: formatNumber(item.weight_kg),
    delivery_note: toTextOrFillLine(item.note),
  };
}

function buildContractDoc(templateBuffer: ArrayBuffer) {
  const templateDelimiters = [
    { start: "{{", end: "}}" },
    { start: "{", end: "}" },
  ];
  let latestError: unknown = null;

  for (const delimiters of templateDelimiters) {
    try {
      const zip = new PizZip(templateBuffer.slice(0));
      return new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters,
        nullGetter: () => "",
      });
    } catch (currentError) {
      latestError = currentError;
    }
  }

  throw latestError ?? new Error("Không thể đọc file mẫu hợp đồng DOCX.");
}

function formatContractTemplateError(error: unknown) {
  if (error && typeof error === "object") {
    const detail = error as {
      message?: unknown;
      properties?: {
        errors?: Array<{
          properties?: { explanation?: unknown };
        }>;
      };
    };
    const detailErrors = detail.properties?.errors ?? [];
    const explanations = detailErrors
      .map((item) => item.properties?.explanation)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (explanations.length > 0) {
      return `Mẫu hợp đồng DOCX đang sai định dạng tag: ${explanations[0]}`;
    }
    if (typeof detail.message === "string" && detail.message.trim().length > 0) {
      return detail.message;
    }
  }

  return "Không thể tạo hợp đồng DOCX. Vui lòng kiểm tra lại file mẫu.";
}

function formatDateOrEmpty(value: string | null | undefined) {
  if (!value) return "";
  return formatDate(value);
}

function toText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function formatDateOrFillLine(value: string | null | undefined) {
  if (!value) return fillLine();
  return formatDate(value);
}

function toTextOrFillLine(value: string | null | undefined) {
  const text = toText(value);
  return text.length > 0 ? text : fillLine();
}

function fillLine() {
  return "....................";
}

function buildContractFileName(item: SlipRow) {
  const fallbackName = "nong-dan";
  const rawName = item.farmer?.name?.trim() || fallbackName;
  const sanitizedName = rawName
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return `${sanitizedName || fallbackName}.docx`;
}

function buildDeliveryReceiptFileName(item: SlipRow) {
  const farmerName = sanitizeFileName(item.farmer?.name?.trim() || "nong-dan");
  return `bien-ban-giao-nhan-${farmerName}.docx`;
}

function buildDeliveryReceiptNumber(item: SlipRow) {
  const datePart = (item.purchase_date ?? "").replaceAll("-", "") || "00000000";
  return `BBGN-${datePart}-${item.id.slice(0, 6).toUpperCase()}`;
}

function getDateParts(value: string | null | undefined) {
  if (!value) {
    return {
      day: fillLine(),
      month: fillLine(),
      year: fillLine(),
    };
  }

  const [year = "", month = "", day = ""] = value.split("-");
  return {
    day: day || fillLine(),
    month: month || fillLine(),
    year: year || fillLine(),
  };
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
