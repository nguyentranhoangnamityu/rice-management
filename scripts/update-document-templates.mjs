import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateDir = path.join(rootDir, "public", "templates");

function decodeXmlText(xml) {
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function encodeXmlText(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function replaceParagraph(xml, matcher, replacement) {
  let replaced = false;
  const nextXml = xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (replaced) return paragraph;

    const plainText = decodeXmlText(paragraph);
    if (!matcher(plainText)) return paragraph;

    const openingTag = paragraph.match(/^<w:p(?:\s[^>]*)?>/)?.[0] ?? "<w:p>";
    const paragraphProperties = paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
    const text = encodeXmlText(replacement);
    replaced = true;
    return `${openingTag}${paragraphProperties}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  });

  if (!replaced) {
    throw new Error(`Không tìm thấy đoạn cần thay: ${replacement}`);
  }

  return nextXml;
}

async function patchTemplate(fileName, patcher) {
  const filePath = path.join(templateDir, fileName);
  const input = await fs.readFile(filePath);
  const zip = new PizZip(input);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error(`${fileName} không có word/document.xml`);

  const patchedXml = patcher(documentFile.asText());
  zip.file("word/document.xml", patchedXml);

  const output = zip.generate({
    type: "nodebuffer",
    compression: "DEFLATE",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  await fs.writeFile(filePath, output);
}

await patchTemplate("purchase-contract-template.docx", (inputXml) =>
  inputXml.includes("{{contract_no}}")
    ? inputXml
    : replaceParagraph(
        inputXml,
        (text) => text.trim().startsWith("Số:") && text.includes("HĐMB/CLTV"),
        "Số: {{contract_no}}",
      ),
);

await patchTemplate("delivery-receipt-template.docx", (inputXml) => {
  let xml = inputXml;
  const contractTagCount = (xml.match(/\{\{contract_no\}\}/g) ?? []).length;
  if (contractTagCount < 1) {
    xml = replaceParagraph(xml, (text) => text.trim() === "Số:", "Số: {{contract_no}}");
  }
  if (contractTagCount < 2) {
    xml = replaceParagraph(
      xml,
      (text) => text.trim().startsWith("Căn cứ Hợp đồng mua bán số:"),
      "Căn cứ Hợp đồng mua bán số: {{contract_no}}",
    );
  }
  return xml;
});

await patchTemplate("GIAY_UY_QUYEN_CA_NHAN_TEMPLATE.docx", (inputXml) => {
  if (inputXml.includes("{{authorized_person_name}}")) return inputXml;

  let xml = inputXml;
  const replacements = [
    [
      (text) => text.trim().startsWith("Hôm nay, ngày"),
      "Hôm nay, ngày {{authorization_day}} tháng {{authorization_month}} năm {{authorization_year}}, tại {{authorization_location}}",
    ],
    [
      (text) =>
        text.includes("- Họ và tên:") &&
        text.includes("Số CCCD:") &&
        text.includes("................................"),
      "- Họ và tên: {{farmer_name}}    Ngày sinh: {{farmer_date_of_birth}} - Số CCCD: {{farmer_citizen_id}} cấp ngày {{farmer_citizen_id_issued_date}}",
    ],
    [
      (text) => text.trim().startsWith("- Nơi cấp:") && text.includes("..."),
      "- Nơi cấp: {{farmer_citizen_id_issued_place}}",
    ],
    [
      (text) => text.trim().startsWith("- Hộ khẩu thường trú:") && text.includes("..."),
      "- Hộ khẩu thường trú: {{farmer_permanent_address}}",
    ],
    [
      (text) =>
        text.includes("- Họ và tên:") &&
        text.includes("Số CCCD:") &&
        text.includes("................................"),
      "- Họ và tên: {{authorized_person_name}}    Ngày sinh: {{authorized_person_date_of_birth}} - Số CCCD: {{authorized_person_citizen_id}} cấp ngày {{authorized_person_citizen_id_issued_date}}",
    ],
    [
      (text) => text.trim().startsWith("- Nơi cấp:") && text.includes("..."),
      "- Nơi cấp: {{authorized_person_citizen_id_issued_place}}",
    ],
    [
      (text) => text.trim().startsWith("- Hộ khẩu thường trú:") && text.includes("..."),
      "- Hộ khẩu thường trú: {{authorized_person_address}}",
    ],
    [
      (text) => text.trim().startsWith("Tôi là") && text.includes("trực tiếp bán lúa"),
      "Tôi là {{farmer_name}}, là người trực tiếp bán {{rice_type}} cho Công ty TNHH Cửu Long Thịnh Vượng, nay ủy quyền cho {{authorized_person_name}} được thay mặt tôi nhận toàn bộ số tiền {{total_amount}} đồng (bằng chữ: {{total_amount_words}}) cho khối lượng {{weight_kg}} kg mà tôi đã bán.",
    ],
    [
      (text) => text.trim().startsWith("Người được ủy quyền được phép nhận tiền"),
      "Người được ủy quyền được phép nhận tiền qua tài khoản ngân hàng mang tên {{authorized_person_bank_account_name}} – số tài khoản: {{authorized_person_bank_account_number}} – tại {{authorized_person_bank_name}}, và được ký nhận, cung cấp thông tin, hoàn tất các thủ tục liên quan đến việc nhận tiền theo yêu cầu của công ty.",
    ],
    [
      (text) => text.trim().startsWith("Tôi cam kết toàn bộ số tiền này"),
      "Tôi cam kết toàn bộ số tiền này là của tôi, việc ủy quyền cho ông/bà {{authorized_person_name}} nhận thay chỉ nhằm mục đích thuận tiện trong thanh toán.",
    ],
    [
      (text) => text.trim().startsWith("Giấy ủy quyền này chỉ có hiệu lực"),
      "Giấy ủy quyền này chỉ có hiệu lực cho đợt thanh toán tiền lúa ngày {{payment_date}}, và tự chấm dứt hiệu lực sau khi việc nhận tiền hoàn tất.",
    ],
    [
      (text) => text.includes("........................................") && text.includes("\t"),
      "{{authorized_person_name}}\t\t\t\t\t{{farmer_name}}",
    ],
  ];

  for (const [matcher, replacement] of replacements) {
    xml = replaceParagraph(xml, matcher, replacement);
  }
  return xml;
});

console.log("Đã cập nhật 3 mẫu DOCX.");
