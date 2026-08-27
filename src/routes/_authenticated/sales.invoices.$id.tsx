import { createFileRoute } from "@tanstack/react-router";
import { DocumentEditor } from "@/components/document-editor";

export const Route = createFileRoute("/_authenticated/sales/invoices/$id")({
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DocumentEditor kind="invoice" id={id} />
    </div>
  );
}
