import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CreatePaymentDialog } from "@/components/create-payment-dialog";

export const Route = createFileRoute("/_authenticated/sales/payments_/new")({
  head: () => ({ meta: [{ title: "New Payment Received — Stratus ERP" }] }),
  component: NewPaymentPage,
});

function NewPaymentPage() {
  const navigate = useNavigate();
  return (
    <CreatePaymentDialog
      open
      variant="page"
      kind="received"
      onOpenChange={(o) => { if (!o) navigate({ to: "/sales/payments" }); }}
    />
  );
}
