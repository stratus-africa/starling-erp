import { BusinessEventTimeline } from "@/components/business-event-timeline";

export function SupplierPaymentTimeline({ paymentId }: { paymentId: string }) {
  return <BusinessEventTimeline entityType="payments.made" entityId={paymentId} />;
}