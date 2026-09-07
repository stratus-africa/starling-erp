import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DocViewPanel } from "@/components/doc-view-panel";
import { DocumentViewWindow } from "@/components/document-view-window";

export const Route = createFileRoute("/_authenticated/sales/invoices/$id")({
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DocumentViewWindow
        kind="invoice"
        title="Invoices"
        description="Customer invoices, payments and outstanding balances."
        table="invoices"
        fields={[]}
        searchColumn="number"
        detailId={id}
        renderDetail={() => <DocViewPanel kind="invoice" id={id} embedded onClose={() => nav({ to: "/sales/invoices" as any })} onSaved={(newId) => nav({ to: "/sales/invoices/$id" as any, params: { id: newId } as any })} />}
      />
    </div>
  );
}
