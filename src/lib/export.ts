import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

type ExportTable = {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
};

export function exportPdf({
  title,
  details = [],
  tables,
  fileName,
}: {
  title: string;
  details?: string[];
  tables: ExportTable[];
  fileName: string;
}) {
  const doc = new jsPDF();
  let y = 14;

  doc.setFontSize(14);
  doc.text(title, 14, y);
  y += 8;

  doc.setFontSize(10);
  for (const detail of details) {
    doc.text(detail, 14, y);
    y += 6;
  }

  for (const table of tables) {
    y += 3;
    doc.setFontSize(11);
    doc.text(table.title, 14, y);
    y += 2;

    autoTable(doc, {
      head: [table.headers],
      body: table.rows,
      startY: y + 2,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [47, 111, 78] },
    });

    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
  }

  doc.save(fileName);
}

export function exportExcel({
  sheets,
  fileName,
}: {
  sheets: ExportTable[];
  fileName: string;
}) {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows]);
    XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(sheet.title));
  }

  XLSX.writeFile(workbook, fileName);
}

function sanitizeSheetName(value: string) {
  return value.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";
}
