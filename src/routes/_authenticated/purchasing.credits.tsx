import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataModulePage } from "@/components/data-module-page";
import { ApplySupplierCreditDialog } from "@/components/apply-supplier-credit-dialog";
import { supplierCreditNoteFields } from "@/lib/module-field-definitions";

function SupplierCreditsPage() {
  const [applyOpen, setApplyOpen] = useState(false);

  return (
    <>
      <DataModulePage
        title="Supplier Credits"
        description="Credits from suppliers to apply on future bills."
        table="supplier_credit_notes"
        fields={supplierCreditNoteFields}
        entityLabel="Supplier Credit"
        attachments={true}
        searchColumn="number"
        rowHref={(r) => `/purchasing/credits/${r.id}`}
        createHref="/purchasing/credits/new"
        writeRoles={["tenant_admin", "purchasing", "accounting", "finance_clerk"]}
        permissionModule="purchasing"
        headerActions={
          <Button variant="outline" size="sm" onClick={() => setApplyOpen(true)}>
            <Wallet className="mr-1.5 h-4 w-4" /> Apply Credit
          </Button>
        }
      />
      <ApplySupplierCreditDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </>
  );
}

export const Route = createFileRoute("/_authenticated/purchasing/credits")({
  component: SupplierCreditsPage,
  head: () => ({
    meta: [
      { title: "Supplier Credits | AURORA ERP" },
      {
        name: "description",
        content: "Track supplier credits and apply them across outstanding bills.",
      },
      { property: "og:title", content: "Supplier Credits | AURORA ERP" },
      {
        property: "og:description",
        content: "Track supplier credits and apply them across outstanding bills.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
