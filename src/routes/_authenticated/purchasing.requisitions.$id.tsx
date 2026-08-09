import { createFileRoute } from "@tanstack/react-router";
import { DocumentEditor } from "@/components/document-editor";

export const Route = createFileRoute("/_authenticated/purchasing/requisitions/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <DocumentEditor kind="requisition" id={id} />;
  },
});
