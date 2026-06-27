import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
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

function replaceCellParagraph(cellXml, replacement, alignment = "left") {
  const encodedText = encodeXmlText(replacement);
  const runProperties = [
    '<w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>',
    '<w:color w:val="000000"/>',
    '<w:sz w:val="18"/>',
    '<w:szCs w:val="18"/>',
  ].join("");

  return cellXml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/, (paragraph) => {
    const openingTag = paragraph.match(/^<w:p(?:\s[^>]*)?>/)?.[0] ?? "<w:p>";
    let paragraphProperties = paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "<w:pPr/>";
    const justification = `<w:jc w:val="${alignment}"/>`;

    if (paragraphProperties === "<w:pPr/>") {
      paragraphProperties = `<w:pPr>${justification}</w:pPr>`;
    } else if (/<w:jc\b[^>]*\/>/.test(paragraphProperties)) {
      paragraphProperties = paragraphProperties.replace(/<w:jc\b[^>]*\/>/, justification);
    } else {
      paragraphProperties = paragraphProperties.replace("</w:pPr>", `${justification}</w:pPr>`);
    }

    return `${openingTag}${paragraphProperties}<w:r><w:rPr>${runProperties}</w:rPr><w:t xml:space="preserve">${encodedText}</w:t></w:r></w:p>`;
  });
}

function replaceFirstBlankPurchaseRow(xml, replacements) {
  let tableFound = false;
  let rowReplaced = false;

  const nextXml = xml.replace(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g, (table) => {
    if (tableFound || !decodeXmlText(table).includes("Ngày tháng năm mua hàng")) return table;
    tableFound = true;

    return table.replace(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g, (row) => {
      if (rowReplaced || !/<w:trHeight\b/.test(row)) return row;

      const cells = row.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) ?? [];
      if (cells.length !== replacements.length) return row;
      if (cells.some((cell) => decodeXmlText(cell).trim().length > 0)) return row;

      let cellIndex = 0;
      const replacedRow = row.replace(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g, (cell) => {
        const current = replacements[cellIndex];
        cellIndex += 1;
        return replaceCellParagraph(cell, current.text, current.alignment);
      });
      rowReplaced = true;
      return replacedRow;
    });
  });

  if (!tableFound) throw new Error("Không tìm thấy bảng dữ liệu trong mẫu bảng kê.");
  if (!rowReplaced) throw new Error("Không tìm thấy dòng trống để gắn tag bảng kê.");
  return nextXml;
}

function applyTimesNewRomanToPlaceholderRuns(xml) {
  const fontProperties =
    '<w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';

  return xml.replace(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g, (run) => {
    if (!decodeXmlText(run).includes("{{")) return run;

    if (/<w:rPr>[\s\S]*?<\/w:rPr>/.test(run)) {
      return run.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, (runProperties) => {
        if (/<w:rFonts\b[^>]*\/>/.test(runProperties)) {
          return runProperties.replace(/<w:rFonts\b[^>]*\/>/, fontProperties);
        }
        return runProperties.replace("<w:rPr>", `<w:rPr>${fontProperties}`);
      });
    }

    return run.replace(/^(<w:r(?:\s[^>]*)?>)/, `$1<w:rPr>${fontProperties}</w:rPr>`);
  });
}

async function patchTemplate(fileName, patcher) {
  const filePath = path.join(templateDir, fileName);
  const input = await fs.readFile(filePath);
  const zip = new PizZip(input);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error(`${fileName} không có word/document.xml`);

  const originalXml = documentFile.asText();
  const patchedXml = patcher(originalXml);
  if (patchedXml === originalXml) return;

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

await patchTemplate("bang-ke.docx", (inputXml) => {
  if (inputXml.includes("{{procurement_address}}")) {
    const plainText = decodeXmlText(inputXml);
    let patchedXml = inputXml;

    if (plainText.includes("Ngày …. tháng")) {
      patchedXml = replaceParagraph(
        patchedXml,
        (text) =>
          text.trim() ===
          "Ngày {{statement_day}} tháng {{statement_month}} năm {{statement_year}}",
        "Ngày tháng năm mua hàng",
      );
      patchedXml = replaceParagraph(
        patchedXml,
        (text) => text.trim().startsWith("Ngày ….") && text.includes("tháng") && text.includes("năm"),
        "Ngày {{statement_day}} tháng {{statement_month}} năm {{statement_year}}",
      );
    }

    patchedXml = patchedXml.replaceAll("{{note}}", "");
    return applyTimesNewRomanToPlaceholderRuns(patchedXml);
  }

  let xml = inputXml;
  xml = replaceParagraph(
    xml,
    (text) => text.trim().startsWith("(Ngày") && text.includes("tháng") && text.includes("năm"),
    "(Ngày {{statement_day}} tháng {{statement_month}} năm {{statement_year}})",
  );
  xml = replaceParagraph(
    xml,
    (text) => text.trim().startsWith("- Địa chỉ nơi tổ chức thu mua:"),
    "- Địa chỉ nơi tổ chức thu mua: {{procurement_address}}",
  );
  xml = replaceFirstBlankPurchaseRow(xml, [
    { text: "{{purchase_date}}", alignment: "center" },
    { text: "{{farmer_name}}", alignment: "left" },
    { text: "{{farmer_permanent_address}}", alignment: "left" },
    { text: "{{farmer_citizen_id}}", alignment: "center" },
    { text: "{{farmer_phone}}", alignment: "center" },
    { text: "{{rice_type}}", alignment: "left" },
    { text: "{{quantity}}", alignment: "center" },
    { text: "{{unit_price}}", alignment: "right" },
    { text: "{{total_amount}}", alignment: "right" },
    { text: "", alignment: "left" },
  ]);
  xml = replaceParagraph(
    xml,
    (text) => text.trim().startsWith("- Tổng giá trị hàng") && text.includes("Số tiền bằng chữ"),
    "- Tổng giá trị hàng hóa, dịch vụ mua vào: {{total_amount}} (Số tiền bằng chữ: {{total_amount_words}})",
  );
  xml = replaceParagraph(
    xml,
    (text) =>
      text.trim().startsWith("Ngày ….") && text.includes("tháng") && text.includes("năm"),
    "Ngày {{statement_day}} tháng {{statement_month}} năm {{statement_year}}",
  );
  return applyTimesNewRomanToPlaceholderRuns(xml);
});

execFileSync(process.execPath, ["scripts/fix-authorization-signature-layout.mjs"], {
  cwd: rootDir,
  stdio: "inherit",
});

console.log("Đã cập nhật 4 mẫu DOCX.");
