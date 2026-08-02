import { createFileRoute } from "@tanstack/react-router";
import { PackageEditor } from "@/components/package-editor";

export const Route = createFileRoute("/_authenticated/sales/packages/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <PackageEditor id={id} />;
  },
});
