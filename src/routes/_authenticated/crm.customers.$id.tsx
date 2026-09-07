import { createFileRoute } from "@tanstack/react-router";
import { CustomerCreateEditWindow } from "@/components/customer-create-edit-window";
import { Party360Page } from "@/components/party-360-page";
import { customerFields } from "@/lib/module-field-definitions";

export const Route = createFileRoute("/_authenticated/crm/customers/$id")({
  component: () => {
    const { id } = Route.useParams();
    return id === "new" ? (
      <CustomerCreateEditWindow
        id="new"
        fields={customerFields}
        onOpenChange={(open) => {
          if (!open) window.history.back();
        }}
        onSaved={(newId) => window.history.replaceState({}, "", `/crm/customers/${newId}`)}
      />
    ) : (
      <Party360Page id={id} kind="customer" fields={customerFields} />
    );
  },
});
