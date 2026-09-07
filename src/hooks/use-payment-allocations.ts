import { useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";

export type PaymentAllocationInput = {
  invoice_id: string;
  amount: number;
};

const paymentKeys = ["payments_received"];

export function usePaymentAllocations() {
  const queryClient = useQueryClient();

  const invalidateFinancialState = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: paymentKeys }),
      queryClient.invalidateQueries({ queryKey: ["invoices"] }),
      queryClient.invalidateQueries({ queryKey: ["customers"] }),
      queryClient.invalidateQueries({ queryKey: ["sales_orders"] }),
      queryClient.invalidateQueries({ queryKey: ["accounting"] }),
      queryClient.invalidateQueries({ queryKey: ["reports"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  };

  const allocate = useMutation({
    mutationFn: async ({
      paymentId,
      allocations,
    }: {
      paymentId: string;
      allocations: PaymentAllocationInput[];
    }) => {
      const { data, error } = await db.rpc("allocate_customer_payment", {
        _payment_id: paymentId,
        _allocations: allocations,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: invalidateFinancialState,
  });

  const unallocate = useMutation({
    mutationFn: async (allocationId: string) => {
      const { data, error } = await db.rpc("unallocate_customer_payment", {
        _allocation_id: allocationId,
      });
      if (error) throw error;
      return String(data);
    },
    onSuccess: invalidateFinancialState,
  });

  return { allocate, unallocate };
}
