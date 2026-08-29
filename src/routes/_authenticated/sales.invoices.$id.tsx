import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DocViewPanel } from "@/components/doc-view-panel";

export const Route = createFileRoute("/_authenticated/sales/invoices/$id")({
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DocViewPanel
        kind="invoice"
        id={id}
        onClose={() => nav({ to: "/sales/invoices" as any })}
        onSaved={(newId) => nav({ to: "/sales/invoices/$id" as any, params: { id: newId } as any })}
      />
    </div>
  );
}
