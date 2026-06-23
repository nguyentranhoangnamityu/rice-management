import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import * as XLSX from "xlsx";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateDir = path.join(rootDir, "public", "templates");
const outputDir = path.join(rootDir, "samples", "document-preview");
const workbookPath = path.join(templateDir, "FILE HĐ MUA LÚA FULL TỚI 04.05.2026.xlsx");

const citizenIdOverrides = new Map([
  ["TRỊNH VĂN HAI", "087064012200"],
  ["ĐINH CÔNG BÉ", "087064012201"],
  ["ĐINH THỊ THU NGÂN", "087164012202"],
]);

function normalizeName(value) {
  return String(value ?? "").trim().normalize("NFC").toLocaleUpperCase("vi-VN");
}

function parseNumber(value) {
  const parsed = Number(String(value ?? "").replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value) {
  if (value instanceof Date) {
    return {
      iso: [
        value.getFullYear(),
        String(value.getMonth() + 1).padStart(2, "0"),
        String(value.getDate()).padStart(2, "0"),
      ].join("-"),
      day: String(value.getDate()).padStart(2, "0"),
      month: String(value.getMonth() + 1).padStart(2, "0"),
      year: String(value.getFullYear()),
    };
  }

  const [day = "", month = "", year = ""] = String(value ?? "").split("/");
  return {
    iso: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
    day: day.padStart(2, "0"),
    month: month.padStart(2, "0"),
    year,
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

function formatMoney(value) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value);
}

function readTriplet(number) {
  const units = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  const hundred = Math.floor(number / 100);
  const ten = Math.floor((number % 100) / 10);
  const unit = number % 10;
  const parts = [];

  if (hundred > 0) parts.push(`${units[hundred]} trăm`);
  if (ten > 1) {
    parts.push(`${units[ten]} mươi`);
    if (unit === 1) parts.push("mốt");
    else if (unit === 5) parts.push("lăm");
    else if (unit > 0) parts.push(units[unit]);
  } else if (ten === 1) {
    parts.push("mười");
    if (unit === 5) parts.push("lăm");
    else if (unit > 0) parts.push(units[unit]);
  } else if (unit > 0) {
    if (hundred > 0) parts.push("lẻ");
    parts.push(units[unit]);
  }
  return parts.join(" ");
}

function moneyToVietnameseWords(value) {
  const scales = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
  let remaining = Math.round(value);
  if (remaining === 0) return "Không đồng";

  const groups = [];
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const words = [];
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    if (groups[index] === 0) continue;
    words.push(readTriplet(groups[index]));
    if (scales[index]) words.push(scales[index]);
  }
  const text = words.join(" ").replace(/\s+/g, " ").trim();
  return `${text.charAt(0).toLocaleUpperCase("vi-VN")}${text.slice(1)} đồng`;
}

async function renderDocx(templateName, data, outputName) {
  const template = await fs.readFile(path.join(templateDir, templateName));
  const doc = new Docxtemplater(new PizZip(template), {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    nullGetter: () => "",
  });
  doc.render(data);
  const output = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  await fs.writeFile(path.join(outputDir, outputName), output);
}

const workbook = XLSX.read(await fs.readFile(workbookPath), { type: "buffer" });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const [headers, ...rows] = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  defval: "",
  raw: false,
});
const sourceRows = rows.filter((row) => row.some((value) => value !== "")).slice(0, 2);
const dailySequences = new Map();

await fs.mkdir(outputDir, { recursive: true });

for (const [index, row] of sourceRows.entries()) {
  const source = Object.fromEntries(headers.map((header, column) => [header, row[column]]));
  const date = parseDate(source["NGÀY"]);
  const dateKey = date.iso;
  const dailySequence = (dailySequences.get(dateKey) ?? 0) + 1;
  dailySequences.set(dateKey, dailySequence);
  const documentCode = `${date.year}${date.day}${date.month}${String(dailySequence).padStart(2, "0")}`;
  const farmerName = String(source["TÊN NÔNG DÂN"]).trim();
  const citizenId =
    citizenIdOverrides.get(normalizeName(farmerName)) ?? String(source["CCCD NÔNG DÂN"]).trim();
  const contractNo = `${documentCode}-HĐMB/CLTV`;
  const receiptNo = documentCode;
  const weight = parseNumber(source["KHỐI LƯỢNG"]);
  const unitPrice = parseNumber(source["ĐƠN GIÁ"]);
  const totalAmount = parseNumber(source["THÀNH TIỀN"]);
  const authorizedPersonName = String(source["TÊN NGƯỜI ĐƯỢC ỦY QUYỀN"]).trim();
  const baseData = {
    contract_no: contractNo,
    receipt_no: receiptNo,
    contract_day: date.day,
    contract_month: date.month,
    contract_year: date.year,
    receipt_day: date.day,
    receipt_month: date.month,
    receipt_year: date.year,
    receipt_location: String(source["ĐỊA CHỈ NÔNG DÂN"]).trim(),
    location: String(source["ĐỊA CHỈ NÔNG DÂN"]).trim(),
    farmer_name: farmerName,
    farmer_permanent_address: String(source["ĐỊA CHỈ NÔNG DÂN"]).trim(),
    farmer_citizen_id: citizenId,
    farmer_citizen_id_issued_date: "....................",
    farmer_citizen_id_issued_place: "....................",
    farmer_date_of_birth: "....................",
    farmer_gender: "....................",
    farmer_phone: "....................",
    farmer_bank_name: String(source["NGÂN HÀNG TÀI KHOẢN NÔNG DÂN"]).trim() || "....................",
    farmer_bank_account_number:
      String(source["SỐ TÀI KHOẢN NÔNG DÂN"]).trim() || "....................",
    rice_type: String(source["TÊN HÀNG HÓA"]).trim(),
    weight_kg: formatNumber(weight),
    unit_price: formatMoney(unitPrice),
    total_amount: formatMoney(totalAmount),
    total_amount_words: moneyToVietnameseWords(totalAmount),
    delivery_note: "",
    authorization_day: date.day,
    authorization_month: date.month,
    authorization_year: date.year,
    authorization_location: String(source["ĐỊA CHỈ NÔNG DÂN"]).trim(),
    authorized_person_name: authorizedPersonName,
    authorized_person_date_of_birth: "....................",
    authorized_person_citizen_id: String(source["CCCD NGƯỜI ĐƯỢC ỦY QUYỀN"]).trim(),
    authorized_person_citizen_id_issued_date: "....................",
    authorized_person_citizen_id_issued_place: "....................",
    authorized_person_address: String(source["ĐỊA CHỈ NGƯỜI ĐƯỢC ỦY QUYỀN"]).trim(),
    authorized_person_bank_account_name: authorizedPersonName,
    authorized_person_bank_account_number: String(
      source["SỐ TÀI KHOẢN NGƯỜI ĐƯỢC ỦY QUYỀN"],
    ).trim(),
    authorized_person_bank_name: String(
      source["NGÂN HÀNG TÀI KHOẢN NGƯỜI ĐƯỢC ỦY QUYỀN"],
    ).trim(),
    payment_date: `${date.day}/${date.month}/${date.year}`,
  };
  const prefix = `${String(index + 1).padStart(2, "0")}-${farmerName
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()}`;

  await renderDocx("purchase-contract-template.docx", baseData, `${prefix}-hop-dong.docx`);
  await renderDocx("delivery-receipt-template.docx", baseData, `${prefix}-bien-ban.docx`);
  await renderDocx("GIAY_UY_QUYEN_CA_NHAN_TEMPLATE.docx", baseData, `${prefix}-uy-quyen.docx`);
}

await fs.writeFile(
  path.join(outputDir, "README.txt"),
  [
    "Bộ tài liệu thử từ 2 dòng đầu của file Excel.",
    "Mỗi dòng gồm: hợp đồng, biên bản giao nhận, giấy ủy quyền.",
    "Thành tiền được giữ nguyên từ Excel, không tính lại.",
  ].join("\n"),
);

console.log(`Đã tạo ${sourceRows.length * 3} tài liệu tại ${outputDir}`);
