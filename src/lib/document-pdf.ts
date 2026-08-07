import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PdfLine {
  description: string;
  quantity: number;
  unit_price?: number;
  discount_pct?: number;
  tax_pct?: number;
  line_total?: number;
}

export interface PdfDocInput {
  title: string;
  number: string;
  companyName: string;
  partyLabel: string;
  partyName: string;
  currency: string;
  meta: { label: string; value: string }[];
  lines: PdfLine[];
  totals?: { subtotal: number; discount_total: number; tax_total: number; grand_total: number } | null;
  notes?: string | null;
  /** quantity-only documents such as packages */
  quantityOnly?: boolean;
}

const fmt = (n: number) =>
  (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildDocumentPdf(input: PdfDocInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(input.companyName, margin, 54);

  doc.setFontSize(20);
  doc.text(input.title.toUpperCase(), pageWidth - margin, 54, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(input.number || "—", pageWidth - margin, 70, { align: "right" });

  doc.setDrawColor(210);
  doc.line(margin, 84, pageWidth - margin, 84);

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(input.partyLabel.toUpperCase(), margin, 104);
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(input.partyName || "—", margin, 120);
  doc.setFont("helvetica", "normal");

  let y = 104;
  for (const m of input.meta) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(m.label, pageWidth - margin - 130, y);
    doc.setTextColor(20);
    doc.text(m.value || "—", pageWidth - margin, y, { align: "right" });
    y += 14;
  }

  const startY = Math.max(y, 140);

  if (input.quantityOnly) {
    autoTable(doc, {
      startY,
      head: [["#", "Description", "Qty"]],
      body: input.lines.map((l, i) => [String(i + 1), l.description || "—", String(l.quantity ?? 0)]),
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      columnStyles: { 0: { cellWidth: 28 }, 2: { halign: "right", cellWidth: 70 } },
      margin: { left: margin, right: margin },
    });
  } else {
    autoTable(doc, {
      startY,
      head: [["#", "Description", "Qty", "Unit Price", "Disc %", "Tax %", "Amount"]],
      body: input.lines.map((l, i) => [
        String(i + 1),
        l.description || "—",
        String(l.quantity ?? 0),
        fmt(l.unit_price ?? 0),
        String(l.discount_pct ?? 0),
        String(l.tax_pct ?? 0),
        fmt(l.line_total ?? 0),
      ]),
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 24 },
        2: { halign: "right", cellWidth: 44 },
        3: { halign: "right", cellWidth: 70 },
        4: { halign: "right", cellWidth: 48 },
        5: { halign: "right", cellWidth: 48 },
        6: { halign: "right", cellWidth: 78 },
      },
      margin: { left: margin, right: margin },
    });
  }

  let cursor = (doc as any).lastAutoTable?.finalY ?? startY;
  cursor += 24;

  if (input.totals) {
    const rows: [string, string][] = [
      ["Subtotal", `${input.currency} ${fmt(input.totals.subtotal)}`],
      ["Discount", `- ${input.currency} ${fmt(input.totals.discount_total)}`],
      ["Tax", `${input.currency} ${fmt(input.totals.tax_total)}`],
    ];
    doc.setFontSize(10);
    for (const [label, value] of rows) {
      doc.setTextColor(120);
      doc.text(label, pageWidth - margin - 180, cursor);
      doc.setTextColor(20);
      doc.text(value, pageWidth - margin, cursor, { align: "right" });
      cursor += 16;
    }
    doc.setDrawColor(210);
    doc.line(pageWidth - margin - 200, cursor - 8, pageWidth - margin, cursor - 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Grand Total", pageWidth - margin - 180, cursor + 6);
    doc.text(`${input.currency} ${fmt(input.totals.grand_total)}`, pageWidth - margin, cursor + 6, { align: "right" });
    doc.setFont("helvetica", "normal");
    cursor += 30;
  }

  if (input.notes) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("Notes", margin, cursor);
    doc.setTextColor(40);
    doc.text(doc.splitTextToSize(input.notes, pageWidth - margin * 2), margin, cursor + 14);
  }

  return doc;
}

export function downloadDocumentPdf(input: PdfDocInput) {
  const doc = buildDocumentPdf(input);
  doc.save(`${input.number || input.title}.pdf`);
}

export function documentPdfBase64(input: PdfDocInput): string {
  const doc = buildDocumentPdf(input);
  const uri = doc.output("datauristring");
  return uri.slice(uri.indexOf(",") + 1);
}
