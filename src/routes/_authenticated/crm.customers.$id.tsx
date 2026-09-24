import { createFileRoute } from "@tanstack/react-router";
import { CustomerCreateEditWindow } from "@/components/customer-create-edit-window";
import { Party360Page } from "@/components/party-360-page";
import { customerFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/crm/customers/$id")({
  validateSearch: (search: Record<string, unknown>): { edit?: boolean } => ({
    edit: search.edit === true || search.edit === "true" || search.edit === "1",
  }),
  component: CustomerRoute,
});

function CustomerRoute() {
    const { id } = Route.useParams();
    const { edit: editOnly } = Route.useSearch();
    const navigate = Route.useNavigate();

    if (id === "new" || editOnly) {
      return (
        <CustomerCreateEditWindow
          id={id === "new" ? "new" : id}
          fields={customerFields}
          onOpenChange={(open) => {
            if (!open) {
               if (id === "new") window.history.back();
               else navigate({ to: "/crm/customers/$id", params: { id }, search: {}, replace: true });
            }
          }}
          onSaved={(newId) => {
             navigate({ to: "/crm/customers/$id", params: { id: newId }, search: {}, replace: true });
          }}
        />
      );
    }

    return <Party360Page id={id} kind="customer" fields={customerFields} />;
}
