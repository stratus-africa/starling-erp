import { createFileRoute } from "@tanstack/react-router";
import { DocumentEditor } from "@/components/document-editor";

export const Route = createFileRoute("/_authenticated/sales/orders/$id")({
  component: SalesOrderDetailPage,
});

function SalesOrderDetailPage() {
  const { id } = Route.useParams();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DocumentEditor kind="order" id={id} />
    </div>
  );
}
