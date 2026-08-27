import { createFileRoute } from "@tanstack/react-router";
import { CustomerEditor } from "@/components/customer-editor";
import { customerFields } from "@/lib/module-validation-schemas";

export const Route = createFileRoute("/_authenticated/crm/customers/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <CustomerEditor id={id} fields={customerFields} />;
  },
});
