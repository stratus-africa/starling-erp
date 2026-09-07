import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  documentTypeFromTitle,
  getDocumentTemplate,
  type DocumentTemplateStyle,
  type DocumentTemplateType,
} from "@/lib/document-template-types";

export interface PdfLine {
  description: string;
  quantity: number;
  unit_price?: number;
  discount_pct?: number;
  tax_pct?: number;
  line_total?: number;
}

export interface PdfBranding {
  accentColor?: string | null;
  logoUrl?: string | null;
  showLogo?: boolean;
  companyAddress?: string | null;
  footerText?: string | null;
  terms?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  taxId?: string | null;
  legalName?: string | null;
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
  branding?: PdfBranding | null;
  documentType?: DocumentTemplateType;
  templateStyle?: DocumentTemplateStyle;
  amountPaid?: number;
  balanceDue?: number;
}

const fmt = (n: number) =>
  (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function hexToRgb(hex?: string | null): [number, number, number] {
  const fallback: [number, number, number] = [30, 41, 59];
  if (!hex) return fallback;
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return fallback;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return fallback;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function buildDocumentPdf(input: PdfDocInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const style = getDocumentTemplate(input.documentType ?? documentTypeFromTitle(input.title), input.templateStyle);
  const margin = style === "compact" ? 32 : style === "corporate" ? 38 : 44;
  const brand = input.branding ?? {};
  const accent = hexToRgb(brand.accentColor ?? (style === "modern" ? "#0668FF" : "#0B2A63"));
  const navy: [number, number, number] = [11, 42, 99];
  const border: [number, number, number] = [220, 230, 242];
  const lightBlue: [number, number, number] = [244, 248, 253];

  if (style === "modern") {
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.rect(0, 0, pageWidth, 8, "F");
  } else if (style === "corporate") {
    doc.setFillColor(navy[0], navy[1], navy[2]);
    doc.rect(0, 0, pageWidth, 20, "F");
  } else {
    doc.setDrawColor(border[0], border[1], border[2]);
    doc.line(margin, 28, pageWidth - margin, 28);
  }

  let headerLeft = margin;
  if (brand.showLogo !== false && brand.logoUrl && brand.logoUrl.startsWith("data:image")) {
    try {
      doc.addImage(brand.logoUrl, "PNG", margin, 26, 90, 34);
      headerLeft = margin + 102;
    } catch { /* ignore malformed logo */ }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(style === "compact" ? 14 : 18);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text(input.companyName, headerLeft, 54);
  doc.setTextColor(20);

  if (brand.companyAddress) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(doc.splitTextToSize(brand.companyAddress, 240), headerLeft, 66);
    doc.setTextColor(20);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(style === "compact" ? 15 : 20);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text(input.title.toUpperCase(), pageWidth - margin, 54, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(input.number || "—", pageWidth - margin, 70, { align: "right" });


  doc.setDrawColor(border[0], border[1], border[2]);
  doc.line(margin, 84, pageWidth - margin, 84);

  doc.setFontSize(style === "compact" ? 8 : 9);
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

  const startY = Math.max(y, style === "compact" ? 128 : 140);

  if (brand.phone || brand.email || brand.website || brand.taxId) {
    const contact = [brand.phone, brand.email, brand.website, brand.taxId ? `Tax ID: ${brand.taxId}` : null].filter(Boolean).join(" · ");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(contact, headerLeft, 96);
  }

  if (input.quantityOnly) {
    autoTable(doc, {
      startY,
      head: [["#", "Description", "Qty"]],
      body: input.lines.map((l, i) => [String(i + 1), l.description || "—", String(l.quantity ?? 0)]),
      styles: { fontSize: style === "compact" ? 8 : 9, cellPadding: style === "compact" ? 4 : 6, lineColor: border, lineWidth: 0.25 },
      headStyles: { fillColor: style === "corporate" ? navy : lightBlue, textColor: style === "corporate" ? 255 : navy },

      columnStyles: { 0: { cellWidth: 28 }, 2: { halign: "right", cellWidth: 70 } },
      margin: { left: margin, right: margin },
    });
  } else {
    autoTable(doc, {
      startY,
      head: [["#", "Item / Description", "Qty", "Unit Price", "Disc %", "Tax %", "Amount"]],
      body: input.lines.map((l, i) => [
        String(i + 1),
        l.description || "—",
        String(l.quantity ?? 0),
        fmt(l.unit_price ?? 0),
        String(l.discount_pct ?? 0),
        String(l.tax_pct ?? 0),
        fmt(l.line_total ?? 0),
      ]),
      styles: { fontSize: style === "compact" ? 8 : 9, cellPadding: style === "compact" ? 4 : 6, lineColor: border, lineWidth: 0.25 },
      headStyles: { fillColor: style === "corporate" ? navy : lightBlue, textColor: style === "corporate" ? 255 : navy },
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
    doc.setFontSize(style === "compact" ? 9 : 10);
    for (const [label, value] of rows) {
      doc.setTextColor(120);
      doc.text(label, pageWidth - margin - 180, cursor);
      doc.setTextColor(20);
      doc.text(value, pageWidth - margin, cursor, { align: "right" });
      cursor += 16;
    }
    doc.setDrawColor(border[0], border[1], border[2]);
    doc.line(pageWidth - margin - 200, cursor - 8, pageWidth - margin, cursor - 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(style === "compact" ? 10 : 12);
    doc.text("Grand Total", pageWidth - margin - 180, cursor + 6);
    doc.text(`${input.currency} ${fmt(input.totals.grand_total)}`, pageWidth - margin, cursor + 6, { align: "right" });
    doc.setFont("helvetica", "normal");
    cursor += 30;
  }

  if (input.amountPaid != null || input.balanceDue != null) {
    const paid = input.amountPaid ?? 0;
    const balance = input.balanceDue ?? Math.max(0, (input.totals?.grand_total ?? 0) - paid);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text("Amount Paid", pageWidth - margin - 180, cursor);
    doc.setTextColor(20);
    doc.text(`${input.currency} ${fmt(paid)}`, pageWidth - margin, cursor, { align: "right" });
    cursor += 14;
    doc.setFont("helvetica", "bold");
    doc.text("Balance Due", pageWidth - margin - 180, cursor);
    doc.text(`${input.currency} ${fmt(balance)}`, pageWidth - margin, cursor, { align: "right" });
    doc.setFont("helvetica", "normal");
    cursor += 24;
  }

  if (input.notes) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("Notes", margin, cursor);
    doc.setTextColor(40);
    const wrapped = doc.splitTextToSize(input.notes, pageWidth - margin * 2);
    doc.text(wrapped, margin, cursor + 14);
    cursor += 14 + wrapped.length * 11 + 12;
  }

  if (brand.terms) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("Terms & Conditions", margin, cursor);
    doc.setTextColor(60);
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(brand.terms, pageWidth - margin * 2), margin, cursor + 13);
  }

  if (brand.footerText) {
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(doc.splitTextToSize(brand.footerText, pageWidth - margin * 2), pageWidth / 2, pageHeight - 30, { align: "center" });
  }
  const footer = () => {
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`${input.number || input.title} · NimbusERP`, margin, pageHeight - 18);
    doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - margin, pageHeight - 18, { align: "right" });
  };
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    footer();
  }
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(0, pageHeight - 5, pageWidth, 5, "F");

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
