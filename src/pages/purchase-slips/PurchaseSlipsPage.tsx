import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, FileDown, FileText, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { exportExcel, exportPdf } from "../../lib/export";
import { supabase } from "../../lib/supabase";
import type { Enums, Tables } from "../../types/database";

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

export function PurchaseSlipsPage() {
  const [items, setItems] = useState<SlipRow[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [transportTrips, setTransportTrips] = useState<TransportTrip[]>([]);
  const [riceTypes, setRiceTypes] = useState<RiceType[]>([]);
  const [authorizationLetters, setAuthorizationLetters] = useState<AuthorizationLetter[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<SlipRow | null>(null);

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
  const totalAmount = round2((watchedWeight || 0) * (watchedUnitPrice || 0));
  const brokerCommissionTotal = round2((watchedWeight || 0) * (watchedCommission || 0));

  const filteredItems = useMemo(() => {
    const keyword = normalize(search);
    if (!keyword) return items;

    return items.filter((item) =>
      [
        item.farmer?.name,
        item.farmer?.phone,
        item.broker?.name,
        item.broker?.phone,
        item.transportTrip?.code,
        item.riceType?.name,
        item.note,
      ].some((value) => normalize(value).includes(keyword)),
    );
  }, [items, search]);

  const formTitle = editingItem ? "Sửa phiếu mua" : "Thêm phiếu mua";

  async function loadData() {
    setLoading(true);
    setError(null);

    const [
      slipsResult,
      seasonsResult,
      farmersResult,
      brokersResult,
      transportTripsResult,
      riceTypesResult,
      authorizationLettersResult,
    ] = await Promise.all([
      supabase.from("purchase_slips").select("*").order("purchase_date", { ascending: false }),
      supabase.from("seasons").select("*").order("from_date", { ascending: false }),
      supabase.from("farmers").select("*").order("name", { ascending: true }),
      supabase.from("brokers").select("*").order("name", { ascending: true }),
      supabase.from("transport_trips").select("*").order("trip_date", { ascending: false }),
      supabase.from("rice_types").select("*").order("name", { ascending: true }),
      supabase.from("authorization_letters").select("*").order("created_at", { ascending: false }),
    ]);

    const firstError =
      slipsResult.error ??
      seasonsResult.error ??
      farmersResult.error ??
      brokersResult.error ??
      transportTripsResult.error ??
      riceTypesResult.error ??
      authorizationLettersResult.error;

    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const seasonRows = seasonsResult.data ?? [];
    const farmerRows = farmersResult.data ?? [];
    const brokerRows = brokersResult.data ?? [];
    const transportTripRows = transportTripsResult.data ?? [];
    const riceTypeRows = riceTypesResult.data ?? [];
    const authorizationLetterRows = authorizationLettersResult.data ?? [];
    const seasonMap = new Map(seasonRows.map((season) => [season.id, season]));
    const farmerMap = new Map(farmerRows.map((farmer) => [farmer.id, farmer]));
    const brokerMap = new Map(brokerRows.map((broker) => [broker.id, broker]));
    const transportTripMap = new Map(transportTripRows.map((trip) => [trip.id, trip]));
    const riceTypeMap = new Map(riceTypeRows.map((riceType) => [riceType.id, riceType]));
    const authorizationLetterMap = new Map(
      authorizationLetterRows.map((letter) => [letter.id, letter]),
    );

    setSeasons(seasonRows);
    setFarmers(farmerRows);
    setBrokers(brokerRows);
    setTransportTrips(transportTripRows);
    setRiceTypes(riceTypeRows);
    setAuthorizationLetters(authorizationLetterRows);
    setItems(
      (slipsResult.data ?? []).map((slip) => ({
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
    );
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

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
  }

  function clearForm() {
    setEditingItem(null);
    reset(emptyValues);
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
      setError(result.error.message);
    } else {
      clearForm();
      await loadData();
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
      setError(deleteError.message);
    } else {
      if (editingItem?.id === item.id) clearForm();
      await loadData();
    }

    setDeletingId(null);
  }

  function generateAuthorizationLetter(item: SlipRow) {
    if (!item.authorizedReceiverBroker) return;

    exportPdf({
      title: "Giay uy quyen nhan tien mua lua",
      fileName: `authorization-letter-${item.purchase_date}-${item.id.slice(0, 8)}.pdf`,
      details: [
        `Ngay mua: ${formatDate(item.purchase_date)}`,
        "Noi dung: Nong dan uy quyen cho nguoi nhan tien theo phieu mua lua.",
      ],
      tables: [
        {
          title: "Thong tin uy quyen",
          headers: ["Noi dung", "Gia tri"],
          rows: [
            ["Nong dan", item.farmer?.name ?? "-"],
            ["CCCD nong dan", item.farmer?.citizen_id ?? "-"],
            ["Dia chi nong dan", item.farmer?.address ?? "-"],
            ["Nguoi nhan uy quyen", item.authorizedReceiverBroker.name],
            ["CCCD nguoi nhan", item.authorizedReceiverBroker.citizen_id ?? "-"],
            ["Ngay mua", formatDate(item.purchase_date)],
            ["Loai lua", item.riceType?.name ?? "-"],
            ["Khoi luong", `${formatNumber(item.weight_kg)} kg`],
            ["Thanh tien", formatMoney(item.total_amount)],
            ["Ghi chu", item.note ?? "-"],
          ],
        },
        {
          title: "Chu ky",
          headers: ["Ben uy quyen", "Nguoi nhan uy quyen", "Nguoi lap phieu"],
          rows: [["Ky va ghi ro ho ten", "Ky va ghi ro ho ten", "Ky va ghi ro ho ten"]],
        },
      ],
    });
  }

  function exportSlipPdf(item: SlipRow) {
    exportPdf({
      title: `Purchase slip ${formatDate(item.purchase_date)}`,
      fileName: `purchase-slip-${item.purchase_date}-${item.id.slice(0, 8)}.pdf`,
      tables: [buildSlipExportTable(item)],
    });
  }

  function exportSlipExcel(item: SlipRow) {
    exportExcel({
      fileName: `purchase-slip-${item.purchase_date}-${item.id.slice(0, 8)}.xlsx`,
      sheets: [buildSlipExportTable(item)],
    });
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Phiếu mua</h1>
          <p>Ghi nhận từng lần mua lúa theo nông dân, cò lúa, mùa vụ và chuyến ghe nếu có.</p>
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

          <div className="field-grid">
            <label className="field">
              <span>Ngày mua</span>
              <input type="date" {...register("purchase_date")} />
              {errors.purchase_date ? <small>{errors.purchase_date.message}</small> : null}
            </label>
            <label className="field">
              <span>Mùa vụ</span>
              <select {...register("season_id")}>
                <option value="">Chọn mùa vụ</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
              {errors.season_id ? <small>{errors.season_id.message}</small> : null}
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Nông dân</span>
              <select {...register("farmer_id")}>
                <option value="">Chọn nông dân</option>
                {farmers.map((farmer) => (
                  <option key={farmer.id} value={farmer.id}>
                    {farmer.name}
                  </option>
                ))}
              </select>
              {errors.farmer_id ? <small>{errors.farmer_id.message}</small> : null}
            </label>
            <label className="field">
              <span>Cò lúa</span>
              <select
                {...register("broker_id", {
                  onChange: (event) => applyBrokerDefaultCommission(event.target.value),
                })}
              >
                <option value="">Chọn cò lúa</option>
                {brokers.map((broker) => (
                  <option key={broker.id} value={broker.id}>
                    {broker.name}
                  </option>
                ))}
              </select>
              {errors.broker_id ? <small>{errors.broker_id.message}</small> : null}
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Loại lúa</span>
              <select {...register("rice_type_id")}>
                <option value="">Chọn loại lúa</option>
                {riceTypes.map((riceType) => (
                  <option key={riceType.id} value={riceType.id}>
                    {riceType.name}
                  </option>
                ))}
              </select>
              {errors.rice_type_id ? <small>{errors.rice_type_id.message}</small> : null}
            </label>
            <label className="field">
              <span>Chuyến ghe</span>
              <select {...register("transport_trip_id")}>
                <option value="">Không chọn</option>
                {transportTrips.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.code} - {formatDate(trip.trip_date)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Giấy ủy quyền</span>
            <select {...register("authorization_letter_id")}>
              <option value="">Không chọn</option>
              {authorizationLetters.map((letter) => (
                <option key={letter.id} value={letter.id}>
                  {formatAuthorizationLetter(letter, farmers, brokers)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Cò nhận ủy quyền</span>
            <select {...register("authorized_receiver_broker_id")}>
              <option value="">Không chọn</option>
              {brokers.map((broker) => (
                <option key={broker.id} value={broker.id}>
                  {broker.name}
                </option>
              ))}
            </select>
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

          {error ? <div className="alert error-alert">{error}</div> : null}

          {loading ? (
            <div className="state-box">Đang tải phiếu mua...</div>
          ) : filteredItems.length === 0 ? (
            <div className="state-box">Không có phiếu mua phù hợp.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table extra-wide-table">
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Nông dân</th>
                    <th>Cò lúa</th>
                    <th>Mùa vụ</th>
                    <th>Loại lúa</th>
                    <th>Kg</th>
                    <th>Thành tiền</th>
                    <th>Hoa hồng</th>
                    <th>Thanh toán</th>
                    <th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.purchase_date)}</td>
                      <td>{item.farmer?.name || "-"}</td>
                      <td>
                        <div>{item.broker?.name || "-"}</div>
                        {item.authorizedReceiverBroker ? (
                          <span className="muted-text">Nhận UQ: {item.authorizedReceiverBroker.name}</span>
                        ) : null}
                      </td>
                      <td>{item.season?.name || "-"}</td>
                      <td>{item.riceType?.name || "-"}</td>
                      <td>{formatNumber(item.weight_kg)}</td>
                      <td>{formatMoney(item.total_amount)}</td>
                      <td>{formatMoney(item.broker_commission_total)}</td>
                      <td>{formatPaymentStatus(item.payment_status)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            type="button"
                            onClick={() => exportSlipPdf(item)}
                            aria-label="Xuất PDF"
                            title="Xuất PDF"
                          >
                            <FileDown size={17} aria-hidden="true" />
                          </button>
                          <button
                            className="icon-button"
                            type="button"
                            onClick={() => exportSlipExcel(item)}
                            aria-label="Xuất Excel"
                            title="Xuất Excel"
                          >
                            <FileDown size={17} aria-hidden="true" />
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => generateAuthorizationLetter(item)}
                            disabled={!item.authorizedReceiverBroker}
                            title={
                              item.authorizedReceiverBroker
                                ? "Tạo giấy ủy quyền"
                                : "Chọn cò nhận ủy quyền trước"
                            }
                          >
                            <FileText size={17} aria-hidden="true" />
                            Tạo giấy ủy quyền
                          </button>
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

function buildSlipExportTable(item: SlipRow) {
  return {
    title: "Purchase slip",
    headers: ["Field", "Value"],
    rows: [
      ["Purchase date", formatDate(item.purchase_date)],
      ["Season", item.season?.name ?? "-"],
      ["Farmer", item.farmer?.name ?? "-"],
      ["Broker", item.broker?.name ?? "-"],
      ["Authorized receiver broker", item.authorizedReceiverBroker?.name ?? "-"],
      ["Rice type", item.riceType?.name ?? "-"],
      ["Transport trip", item.transportTrip?.code ?? "-"],
      ["Weight kg", item.weight_kg],
      ["Unit price", item.unit_price],
      ["Total amount", item.total_amount],
      ["Broker commission per kg", item.broker_commission_per_kg],
      ["Broker commission total", item.broker_commission_total],
      ["Payment status", formatPaymentStatus(item.payment_status)],
      ["Note", item.note ?? "-"],
    ],
  };
}

function formatPaymentStatus(value: PaymentStatus) {
  return paymentStatusOptions.find((option) => option.value === value)?.label ?? value;
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
