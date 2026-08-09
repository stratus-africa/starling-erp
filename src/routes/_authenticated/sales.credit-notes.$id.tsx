import { createFileRoute } from "@tanstack/react-router";
import { DocumentEditor } from "@/components/document-editor";

export const Route = createFileRoute("/_authenticated/sales/credit-notes/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <DocumentEditor kind="credit_note" id={id} />;
  },
});
