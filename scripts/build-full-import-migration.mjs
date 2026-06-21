import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFileName = "FILE HĐ MUA LÚA FULL TỚI 04.05.2026.xlsx";
const workbookPath = path.join(rootDir, "public", "templates", sourceFileName);
const outputPath = path.join(
  rootDir,
  "supabase",
  "migrations",
  "202606210002_import_excel_purchase_data.sql",
);

const citizenIdOverrides = new Map([
  ["TRỊNH VĂN HAI", "087064012200"],
  ["ĐINH CÔNG BÉ", "087064012201"],
  ["ĐINH THỊ THU NGÂN", "087164012202"],
]);

function text(value) {
  return String(value ?? "").trim().normalize("NFC");
}

function normalizeName(value) {
  return text(value).toLocaleUpperCase("vi-VN").replace(/\s+/g, " ");
}

function parseNumber(value) {
  const number = Number(text(value).replaceAll(",", ""));
  if (!Number.isFinite(number)) throw new Error(`Số không hợp lệ: ${value}`);
  return number;
}

function parseDate(value) {
  const match = text(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new Error(`Ngày không hợp lệ: ${value}`);
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function keyPart(value) {
  return normalizeName(value).replace(/\s+/g, "-");
}

const workbook = XLSX.read(await fs.readFile(workbookPath), { type: "buffer" });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const [headers, ...rawRows] = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  defval: "",
  raw: false,
});
const rows = rawRows.filter((row) => row.some((value) => text(value).length > 0));
const farmerSequences = new Map();

const payload = rows.map((row, index) => {
  const source = Object.fromEntries(headers.map((header, column) => [header, row[column]]));
  const farmerName = text(source["TÊN NÔNG DÂN"]);
  const sourceFarmerCitizenId = text(source["CCCD NÔNG DÂN"]);
  const farmerCitizenId =
    citizenIdOverrides.get(normalizeName(farmerName)) ?? sourceFarmerCitizenId;
  const farmerIdentityKey = `farmer:${farmerCitizenId || keyPart(farmerName)}`;
  const contractSequence = (farmerSequences.get(farmerIdentityKey) ?? 0) + 1;
  farmerSequences.set(farmerIdentityKey, contractSequence);

  const authorizedName = text(source["TÊN NGƯỜI ĐƯỢC ỦY QUYỀN"]);
  const authorizedCitizenId = text(source["CCCD NGƯỜI ĐƯỢC ỦY QUYỀN"]);
  const authorizedIdentityKey = authorizedName
    ? `authorized:${authorizedCitizenId || keyPart(authorizedName)}`
    : null;
  const purchaseDate = parseDate(source["NGÀY"]);
  const fingerprint = createHash("sha256")
    .update(
      [
        index + 2,
        purchaseDate,
        farmerCitizenId,
        farmerName,
        text(source["KHỐI LƯỢNG"]),
        text(source["THÀNH TIỀN"]),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 20);

  return {
    source_row_number: index + 2,
    source_import_key: `excel-2026-${index + 2}-${fingerprint}`,
    purchase_date: purchaseDate,
    contract_sequence: contractSequence,
    farmer_identity_key: farmerIdentityKey,
    farmer_name: farmerName,
    farmer_citizen_id: farmerCitizenId,
    farmer_source_citizen_id:
      farmerCitizenId === sourceFarmerCitizenId ? null : sourceFarmerCitizenId,
    farmer_address: text(source["ĐỊA CHỈ NÔNG DÂN"]),
    farmer_bank_account_number: text(source["SỐ TÀI KHOẢN NÔNG DÂN"]) || null,
    farmer_bank_name: text(source["NGÂN HÀNG TÀI KHOẢN NÔNG DÂN"]) || null,
    authorized_identity_key: authorizedIdentityKey,
    authorized_name: authorizedName || null,
    authorized_citizen_id: authorizedCitizenId || null,
    authorized_address: text(source["ĐỊA CHỈ NGƯỜI ĐƯỢC ỦY QUYỀN"]) || null,
    authorized_bank_account_number:
      text(source["SỐ TÀI KHOẢN NGƯỜI ĐƯỢC ỦY QUYỀN"]) || null,
    authorized_bank_name:
      text(source["NGÂN HÀNG TÀI KHOẢN NGƯỜI ĐƯỢC ỦY QUYỀN"]) || null,
    rice_type: text(source["TÊN HÀNG HÓA"]),
    weight_kg: parseNumber(source["KHỐI LƯỢNG"]),
    source_unit: text(source["ĐƠN VỊ TÍNH"]),
    unit_price: parseNumber(source["ĐƠN GIÁ"]),
    total_amount: parseNumber(source["THÀNH TIỀN"]),
  };
});

const totalWeight = payload.reduce((sum, row) => sum + row.weight_kg, 0);
const totalAmount = payload.reduce((sum, row) => sum + row.total_amount, 0);
const uniqueFarmers = new Set(payload.map((row) => row.farmer_identity_key)).size;
const uniqueAuthorizedRecipients = new Set(
  payload.map((row) => row.authorized_identity_key).filter(Boolean),
).size;
const json = JSON.stringify(payload).replaceAll("$import$", "$ import $");

const sql = `-- Generated from ${sourceFileName}. Do not edit rows manually.
do $$
declare
  item jsonb;
  farmer_uuid uuid;
  recipient_uuid uuid;
  rice_type_uuid uuid;
  purchase_slip_uuid uuid;
  authorization_letter_uuid uuid;
  imported_farmers_count integer;
  imported_recipients_count integer;
  imported_slips_count integer;
  imported_weight numeric(16, 2);
  imported_amount numeric(18, 2);
begin
  for item in
    select value from jsonb_array_elements($import$${json}$import$::jsonb)
  loop
    insert into public.farmers (
      import_identity_key,
      name,
      citizen_id,
      permanent_address,
      address,
      bank_account_number,
      bank_name,
      bank_account_name,
      note
    )
    values (
      item->>'farmer_identity_key',
      item->>'farmer_name',
      item->>'farmer_citizen_id',
      item->>'farmer_address',
      item->>'farmer_address',
      item->>'farmer_bank_account_number',
      item->>'farmer_bank_name',
      item->>'farmer_name',
      case
        when item->>'farmer_source_citizen_id' is not null
          then 'CCCD nguồn đã được seed lại từ ' || (item->>'farmer_source_citizen_id')
        else 'Import từ ${sourceFileName}'
      end
    )
    on conflict (import_identity_key) where import_identity_key is not null
    do update set
      name = excluded.name,
      citizen_id = excluded.citizen_id,
      permanent_address = coalesce(nullif(excluded.permanent_address, ''), public.farmers.permanent_address),
      address = coalesce(nullif(excluded.address, ''), public.farmers.address),
      bank_account_number = coalesce(nullif(excluded.bank_account_number, ''), public.farmers.bank_account_number),
      bank_name = coalesce(nullif(excluded.bank_name, ''), public.farmers.bank_name),
      bank_account_name = coalesce(nullif(excluded.bank_account_name, ''), public.farmers.bank_account_name),
      note = case
        when excluded.note like 'CCCD nguồn%'
          then excluded.note
        else public.farmers.note
      end
    returning id into farmer_uuid;

    recipient_uuid := null;
    if item->>'authorized_identity_key' is not null then
      insert into public.authorized_recipients (
        import_identity_key,
        name,
        citizen_id,
        address,
        bank_account_number,
        bank_name,
        bank_account_name,
        note
      )
      values (
        item->>'authorized_identity_key',
        item->>'authorized_name',
        item->>'authorized_citizen_id',
        item->>'authorized_address',
        item->>'authorized_bank_account_number',
        item->>'authorized_bank_name',
        item->>'authorized_name',
        'Import từ ${sourceFileName}'
      )
      on conflict (import_identity_key) where import_identity_key is not null
      do update set
        name = excluded.name,
        citizen_id = coalesce(nullif(excluded.citizen_id, ''), public.authorized_recipients.citizen_id),
        address = coalesce(nullif(excluded.address, ''), public.authorized_recipients.address),
        bank_account_number = coalesce(
          nullif(excluded.bank_account_number, ''),
          public.authorized_recipients.bank_account_number
        ),
        bank_name = coalesce(nullif(excluded.bank_name, ''), public.authorized_recipients.bank_name),
        bank_account_name = coalesce(
          nullif(excluded.bank_account_name, ''),
          public.authorized_recipients.bank_account_name
        )
      returning id into recipient_uuid;
    end if;

    insert into public.rice_types (name, note)
    values (item->>'rice_type', 'Import từ ${sourceFileName}')
    on conflict (name)
    do update set name = excluded.name
    returning id into rice_type_uuid;

    authorization_letter_uuid := null;
    if recipient_uuid is not null then
      insert into public.authorization_letters (
        code,
        farmer_id,
        authorized_recipient_id,
        signed_date,
        valid_from,
        valid_to,
        status,
        source_import_key,
        note
      )
      values (
        'UQ-' || replace(item->>'purchase_date', '-', '') || '-' ||
          lpad((item->>'source_row_number')::text, 4, '0'),
        farmer_uuid,
        recipient_uuid,
        (item->>'purchase_date')::date,
        (item->>'purchase_date')::date,
        (item->>'purchase_date')::date,
        'active',
        'authorization-' || (item->>'source_import_key'),
        'Import từ ${sourceFileName}'
      )
      on conflict (source_import_key) where source_import_key is not null
      do update set
        farmer_id = excluded.farmer_id,
        authorized_recipient_id = excluded.authorized_recipient_id,
        signed_date = excluded.signed_date,
        valid_from = excluded.valid_from,
        valid_to = excluded.valid_to
      returning id into authorization_letter_uuid;
    end if;

    insert into public.purchase_slips (
      season_id,
      farmer_id,
      broker_id,
      rice_type_id,
      authorization_letter_id,
      authorized_recipient_id,
      purchase_date,
      weight_kg,
      unit_price,
      total_amount,
      payment_status,
      contract_sequence,
      source_import_key,
      source_row_number,
      source_unit,
      farmer_bank_account_number_snapshot,
      farmer_bank_name_snapshot,
      authorized_person_name_snapshot,
      authorized_person_citizen_id_snapshot,
      authorized_person_address_snapshot,
      authorized_person_bank_account_number_snapshot,
      authorized_person_bank_name_snapshot,
      note
    )
    values (
      null,
      farmer_uuid,
      null,
      rice_type_uuid,
      authorization_letter_uuid,
      recipient_uuid,
      (item->>'purchase_date')::date,
      (item->>'weight_kg')::numeric,
      (item->>'unit_price')::numeric,
      (item->>'total_amount')::numeric,
      'unpaid',
      (item->>'contract_sequence')::integer,
      item->>'source_import_key',
      (item->>'source_row_number')::integer,
      item->>'source_unit',
      item->>'farmer_bank_account_number',
      item->>'farmer_bank_name',
      item->>'authorized_name',
      item->>'authorized_citizen_id',
      item->>'authorized_address',
      item->>'authorized_bank_account_number',
      item->>'authorized_bank_name',
      'Import từ ${sourceFileName}, dòng ' || (item->>'source_row_number')
    )
    on conflict (source_import_key) where source_import_key is not null
    do update set
      farmer_id = excluded.farmer_id,
      rice_type_id = excluded.rice_type_id,
      authorization_letter_id = excluded.authorization_letter_id,
      authorized_recipient_id = excluded.authorized_recipient_id,
      purchase_date = excluded.purchase_date,
      weight_kg = excluded.weight_kg,
      unit_price = excluded.unit_price,
      total_amount = excluded.total_amount,
      contract_sequence = excluded.contract_sequence,
      source_row_number = excluded.source_row_number,
      source_unit = excluded.source_unit,
      farmer_bank_account_number_snapshot = excluded.farmer_bank_account_number_snapshot,
      farmer_bank_name_snapshot = excluded.farmer_bank_name_snapshot,
      authorized_person_name_snapshot = excluded.authorized_person_name_snapshot,
      authorized_person_citizen_id_snapshot = excluded.authorized_person_citizen_id_snapshot,
      authorized_person_address_snapshot = excluded.authorized_person_address_snapshot,
      authorized_person_bank_account_number_snapshot =
        excluded.authorized_person_bank_account_number_snapshot,
      authorized_person_bank_name_snapshot = excluded.authorized_person_bank_name_snapshot
    returning id into purchase_slip_uuid;

    if authorization_letter_uuid is not null then
      insert into public.authorization_letter_purchase_slips (
        authorization_letter_id,
        purchase_slip_id
      )
      values (authorization_letter_uuid, purchase_slip_uuid)
      on conflict do nothing;
    end if;
  end loop;

  select count(*) into imported_farmers_count
  from public.farmers
  where import_identity_key like 'farmer:%';

  select count(*) into imported_recipients_count
  from public.authorized_recipients
  where import_identity_key like 'authorized:%';

  select count(*), coalesce(sum(weight_kg), 0), coalesce(sum(total_amount), 0)
    into imported_slips_count, imported_weight, imported_amount
  from public.purchase_slips
  where source_import_key like 'excel-2026-%';

  if imported_farmers_count <> ${uniqueFarmers}
    or imported_recipients_count <> ${uniqueAuthorizedRecipients}
    or imported_slips_count <> ${payload.length}
    or imported_weight <> ${totalWeight}
    or imported_amount <> ${totalAmount}
  then
    raise exception
      'Import reconciliation failed: farmers %, recipients %, slips %, weight %, amount %',
      imported_farmers_count,
      imported_recipients_count,
      imported_slips_count,
      imported_weight,
      imported_amount;
  end if;

  insert into public.purchase_import_audits (
    source_file,
    source_rows,
    imported_farmers,
    imported_authorized_recipients,
    imported_purchase_slips,
    total_weight_kg,
    total_amount
  )
  values (
    '${sourceFileName}',
    ${payload.length},
    imported_farmers_count,
    imported_recipients_count,
    imported_slips_count,
    imported_weight,
    imported_amount
  )
  on conflict (source_file)
  do update set
    source_rows = excluded.source_rows,
    imported_farmers = excluded.imported_farmers,
    imported_authorized_recipients = excluded.imported_authorized_recipients,
    imported_purchase_slips = excluded.imported_purchase_slips,
    total_weight_kg = excluded.total_weight_kg,
    total_amount = excluded.total_amount,
    imported_at = now();
end
$$;
`;

await fs.writeFile(outputPath, sql);
console.log(
  JSON.stringify(
    {
      outputPath,
      sourceRows: payload.length,
      uniqueFarmers,
      uniqueAuthorizedRecipients,
      totalWeight,
      totalAmount,
    },
    null,
    2,
  ),
);
