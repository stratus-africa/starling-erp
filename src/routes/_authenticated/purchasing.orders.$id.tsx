import { createFileRoute } from "@tanstack/react-router";
import { DocumentEditor } from "@/components/document-editor";

export const Route = createFileRoute("/_authenticated/purchasing/orders/$id")({
  component: PurchaseOrderDetailPage,
});

function PurchaseOrderDetailPage() {
  const { id } = Route.useParams();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DocumentEditor kind="po" id={id} />
    </div>
  );
}
