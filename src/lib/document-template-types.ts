export type DocumentTemplateStyle = "modern" | "corporate" | "compact";
export type DocumentTemplateType = "quote" | "order" | "invoice" | "po" | "requisition" | "bill" | "statement" | "package" | "shipment";

export const DOCUMENT_TEMPLATE_CONFIG: Record<DocumentTemplateType, DocumentTemplateStyle> = {
  quote: "modern",
  order: "modern",
  invoice: "corporate",
  po: "corporate",
  bill: "corporate",
  requisition: "compact",
  statement: "compact",
  package: "compact",
  shipment: "compact",
};

export function getDocumentTemplate(type: DocumentTemplateType, override?: DocumentTemplateStyle | null) {
  return override ?? DOCUMENT_TEMPLATE_CONFIG[type] ?? "corporate";
}

export function documentTypeFromTitle(title: string): DocumentTemplateType {
  const normalized = title.toLowerCase();
  if (normalized.includes("quote") || normalized.includes("quotation")) return "quote";
  if (normalized.includes("sales order")) return "order";
  if (normalized.includes("purchase order")) return "po";
  if (normalized.includes("requisition")) return "requisition";
  if (normalized === "bill" || normalized.includes("bill")) return "bill";
  if (normalized.includes("statement")) return "statement";
  if (normalized.includes("packing") || normalized.includes("shipment")) return "package";
  return "invoice";
}
