import { createFileRoute } from "@tanstack/react-router";
import { CustomerEditor } from "@/components/customer-editor";
import { Party360Page } from "@/components/party-360-page";
import { customerFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/crm/customers/$id")({
  component: () => {
    const { id } = Route.useParams();
    return id === "new" ? <CustomerEditor id={id} fields={customerFields} /> : <Party360Page id={id} kind="customer" fields={customerFields} />;
  },
});
