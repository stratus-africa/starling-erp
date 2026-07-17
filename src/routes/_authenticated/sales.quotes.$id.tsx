import { createFileRoute } from "@tanstack/react-router";
import { DocumentEditor } from "@/components/document-editor";

export const Route = createFileRoute("/_authenticated/sales/quotes/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <DocumentEditor kind="quote" id={id} />;
  },
});
