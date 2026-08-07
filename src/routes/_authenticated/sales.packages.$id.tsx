import { createFileRoute } from "@tanstack/react-router";
import { PackageEditor } from "@/components/package-editor";

export const Route = createFileRoute("/_authenticated/sales/packages/$id")({
  validateSearch: (s: Record<string, unknown>) => ({ order: typeof s.order === "string" ? s.order : undefined }),
  component: () => {
    const { id } = Route.useParams();
    return <PackageEditor id={id} />;
  },
});
