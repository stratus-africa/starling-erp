import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/typed-db";

export type SupplierPaymentAllocationInput = { bill_id: string; amount: number };

const paymentKeys = ["payments_made"];

export function useSupplierPayment(id?: string) {
  return useQuery({
    queryKey: [...paymentKeys, id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await db
        .from("payments_made")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return data as Record<string, any>;
    },
  });
}

export function useSupplierPaymentAllocationSummary(id?: string) {
  return useQuery({
    queryKey: [...paymentKeys, id, "allocation-summary"],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await db.rpc("get_supplier_payment_allocation_summary", {
        _payment_id: id,
      });
      if (error) throw error;
      return (data?.[0] ?? data) as Record<string, any>;
    },
  });
}

export function useSupplierPaymentAllocations(id?: string) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: paymentKeys }),
      queryClient.invalidateQueries({ queryKey: ["bills"] }),
      queryClient.invalidateQueries({ queryKey: ["suppliers"] }),
      queryClient.invalidateQueries({ queryKey: ["accounting"] }),
    ]);
  };

  const allocations = useQuery({
    queryKey: ["supplier_payment_allocations", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await db
        .from("supplier_payment_allocations")
        .select("id,bill_id,amount,allocation_date,created_at,deleted_at")
        .eq("payment_id", id)
        .is("deleted_at", null)
        .order("allocation_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Record<string, any>[];
    },
  });

  const allocate = useMutation({
    mutationFn: async ({ paymentId, allocations }: { paymentId: string; allocations: SupplierPaymentAllocationInput[] }) => {
      const { data, error } = await db.rpc("allocate_supplier_payment", {
        _payment_id: paymentId,
        _allocations: allocations,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: invalidate,
  });

  const unallocate = useMutation({
    mutationFn: async (allocationId: string) => {
      const { data, error } = await db.rpc("unallocate_supplier_payment", {
        _allocation_id: allocationId,
      });
      if (error) throw error;
      return String(data);
    },
    onSuccess: invalidate,
  });

  return { ...allocations, allocate, unallocate };
}

export function useSupplierPaymentActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: paymentKeys });

  const create = useMutation({
    mutationFn: async (input: {
      supplierId: string;
      amount: number;
      date: string;
      currency: string;
      bankAccountId?: string | null;
      paymentMethod?: string | null;
      reference?: string | null;
      notes?: string | null;
    }) => {
      const { data, error } = await db.rpc("create_supplier_payment", {
        _supplier_id: input.supplierId,
        _amount: input.amount,
        _date: input.date,
        _currency: input.currency,
        _bank_account_id: input.bankAccountId ?? null,
        _payment_method: input.paymentMethod ?? null,
        _reference: input.reference ?? null,
        _notes: input.notes ?? null,
      });
      if (error) throw error;
      return String(data);
    },
    onSuccess: invalidate,
  });

  const post = useMutation({
    mutationFn: async (paymentId: string) => {
      const { data, error } = await db.rpc("transition_supplier_payment", {
        _payment_id: paymentId,
        _new_status: "Posted",
        _reason: "Supplier payment posted",
      });
      if (error) throw error;
      return String(data);
    },
    onSuccess: invalidate,
  });

  const voidPayment = useMutation({
    mutationFn: async ({ paymentId, reason }: { paymentId: string; reason?: string }) => {
      const { data, error } = await db.rpc("transition_supplier_payment", {
        _payment_id: paymentId,
        _new_status: "Voided",
        _reason: reason ?? "Supplier payment voided",
      });
      if (error) throw error;
      return String(data);
    },
    onSuccess: invalidate,
  });

  return { create, post, voidPayment };
}