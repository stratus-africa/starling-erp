import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CreatePaymentDialog } from "@/components/create-payment-dialog";

export const Route = createFileRoute("/_authenticated/purchasing/payments_/new")({
  head: () => ({ meta: [{ title: "New Payment Made — Stratus ERP" }] }),
  component: NewPaymentPage,
});

function NewPaymentPage() {
  const navigate = useNavigate();
  return (
    <CreatePaymentDialog
      open
      variant="page"
      kind="made"
      onOpenChange={(o) => { if (!o) navigate({ to: "/purchasing/payments" }); }}
    />
  );
}
