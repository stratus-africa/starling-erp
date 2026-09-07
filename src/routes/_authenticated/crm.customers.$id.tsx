import { createFileRoute } from "@tanstack/react-router";
import { CustomerCreateEditWindow } from "@/components/customer-create-edit-window";
import { Party360Page } from "@/components/party-360-page";
import { customerFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/crm/customers/$id")({
  component: () => {
    const { id } = Route.useParams();
    const params = new URLSearchParams(window.location.search);
    const editOnly = params.get("edit") === "1" || params.get("edit") === "true";

    if (id === "new" || editOnly) {
      return (
        <CustomerCreateEditWindow
          id={id === "new" ? "new" : id}
          fields={customerFields}
          onOpenChange={(open) => {
            if (!open) {
              if (id === "new") window.history.back();
              else window.history.pushState({}, "", `${window.location.pathname}`);
            }
          }}
          onSaved={(newId) => {
            if (id === "new") window.history.replaceState({}, "", `/crm/customers/${newId}`);
            else window.history.replaceState({}, "", `${window.location.pathname}`);
          }}
        />
      );
    }

    return <Party360Page id={id} kind="customer" fields={customerFields} />;
  },
});
