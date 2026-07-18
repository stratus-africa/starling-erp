import { createFileRoute } from "@tanstack/react-router";
import { DocumentEditor } from "@/components/document-editor";

export const Route = createFileRoute("/_authenticated/purchasing/orders/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <DocumentEditor kind="po" id={id} />;
  },
});
