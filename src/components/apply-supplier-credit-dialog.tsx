import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { db } from "@/lib/typed-db";

type CreditNote = {
  id: string;
  number: string | null;
  supplier_id: string;
  currency: string;
  total: number;
  applied: number;
  available: number;
};

type BillRow = {
  id: string;
  number: string | null;
  date: string | null;
  due_date: string | null;
  currency: string;
  outstanding: number;
};

const money = (value: number, currency: string) =>
  `${currency} ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function ApplySupplierCreditDialog({
  open,
  onOpenChange,
  creditNoteId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select a credit note (used from the credit detail page). */
  creditNoteId?: string;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(creditNoteId ?? "");
  const [values, setValues] = useState<Record<string, string>>({});

  const activeId = creditNoteId ?? selectedId;

  const { data: notes = [], isLoading: loadingNotes } = useQuery({
    queryKey: ["supplier_credit_notes", "available"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db
        .from("supplier_credit_notes")
        .select("id,number,supplier_id,currency,total")
        .eq("status", "Posted")
        .is("deleted_at", null)
        .is("voided_at", null)
        .order("date", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Record<string, any>[];
      const { data: apps, error: appsError } = await db
        .from("supplier_credit_note_applications")
        .select("credit_note_id,amount")
        .is("deleted_at", null);
      if (appsError) throw appsError;
      const used = new Map<string, number>();
      for (const app of (apps ?? []) as Record<string, any>[]) {
        used.set(app.credit_note_id, (used.get(app.credit_note_id) ?? 0) + Number(app.amount ?? 0));
      }
      return rows
        .map((row) => {
          const total = Number(row.total ?? 0);
          const applied = used.get(row.id) ?? 0;
          return {
            id: row.id,
            number: row.number,
            supplier_id: row.supplier_id,
            currency: row.currency ?? "USD",
            total,
            applied,
            available: Math.max(0, Math.round((total - applied) * 100) / 100),
          } as CreditNote;
        })
        .filter((note) => note.id === creditNoteId || note.available > 0);
    },
  });

  const note = notes.find((row) => row.id === activeId);

  const { data: bills = [], isLoading: loadingBills } = useQuery({
    queryKey: ["bills", "credit-applicable", note?.supplier_id, note?.currency],
    enabled: open && Boolean(note?.supplier_id),
    queryFn: async () => {
      const { data, error } = await db
        .from("bills")
        .select("id,number,date,due_date,grand_total,currency,status")
        .eq("supplier_id", note!.supplier_id)
        .eq("currency", note!.currency)
        .is("deleted_at", null)
        .is("voided_at", null)
        .not("status", "in", "(Cancelled,Voided)")
        .order("due_date", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Record<string, any>[];
      const enriched = await Promise.all(
        rows.map(async (bill) => {
          const summary = await db.rpc("get_supplier_bill_payment_summary", { _bill_id: bill.id });
          if (summary.error) throw summary.error;
          const row = (Array.isArray(summary.data) ? summary.data[0] : summary.data) as any;
          const credits = await db
            .from("supplier_credit_note_applications")
            .select("amount")
            .eq("bill_id", bill.id)
            .is("deleted_at", null);
          const creditTotal = ((credits.data ?? []) as Record<string, any>[]).reduce(
            (sum, app) => sum + Number(app.amount ?? 0),
            0,
          );
          const outstanding =
            Math.round((Number(row?.outstanding ?? 0) - creditTotal) * 100) / 100;
          return {
            id: bill.id,
            number: bill.number,
            date: bill.date,
            due_date: bill.due_date,
            currency: bill.currency ?? note!.currency,
            outstanding,
          } as BillRow;
        }),
      );
      return enriched.filter((bill) => bill.outstanding > 0);
    },
  });

  const allocations = useMemo(
    () =>
      bills
        .map((bill) => ({
          bill_id: bill.id,
          amount: Math.round((parseFloat(values[bill.id] ?? "0") || 0) * 100) / 100,
        }))
        .filter((row) => row.amount > 0),
    [bills, values],
  );
  const allocatedTotal = allocations.reduce((sum, row) => sum + row.amount, 0);

  const apply = useMutation({
    mutationFn: async () => {
      if (!note) throw new Error("Select a supplier credit");
      if (allocations.length === 0) throw new Error("Enter at least one amount to apply");
      if (allocatedTotal > note.available + 0.005)
        throw new Error("Amounts exceed the available credit");
      for (const allocation of allocations) {
        const { error } = await db.rpc("apply_supplier_credit_note", {
          _credit_note_id: note.id,
          _bill_id: allocation.bill_id,
          _amount: allocation.amount,
        });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success(
        `Credit applied to ${allocations.length} bill${allocations.length === 1 ? "" : "s"}`,
      );
      setValues({});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["supplier_credit_notes"] }),
        queryClient.invalidateQueries({ queryKey: ["bills"] }),
        queryClient.invalidateQueries({ queryKey: ["payments_made"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ]);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || "Could not apply the credit"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Apply Supplier Credit
          </DialogTitle>
          <DialogDescription>
            Settle one or more outstanding bills with a single supplier credit.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {!creditNoteId && (
            <div className="grid gap-1.5">
              <Label>Supplier Credit</Label>
              <Select
                value={selectedId}
                onValueChange={(value) => {
                  setSelectedId(value);
                  setValues({});
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={loadingNotes ? "Loading credits…" : "Select a supplier credit…"}
                  />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {notes.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.number ?? row.id.slice(0, 8)} — {money(row.available, row.currency)}{" "}
                      available
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!loadingNotes && notes.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No posted supplier credits with an available balance.
                </p>
              )}
            </div>
          )}

          {note && (
            <div className="grid grid-cols-3 gap-3 rounded-md border bg-muted/30 p-3 text-sm">
              <Metric label="Credit Total" value={note.total} currency={note.currency} />
              <Metric label="Already Applied" value={note.applied} currency={note.currency} />
              <Metric
                label="Available"
                value={Math.max(0, note.available - allocatedTotal)}
                currency={note.currency}
              />
            </div>
          )}

          {note && (
            <div className="grid gap-2">
              <Label>
                Apply to outstanding bills
                {loadingBills && (
                  <Loader2 className="ml-2 inline h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </Label>
              {!loadingBills && bills.length === 0 ? (
                <div className="rounded-md border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                  This supplier has no outstanding bills in {note.currency}.
                </div>
              ) : (
                <div className="max-h-[45vh] overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-[11px] uppercase text-muted-foreground">
                      <tr>
                        <th className="p-2">Bill #</th>
                        <th className="p-2">Bill Date</th>
                        <th className="p-2">Due Date</th>
                        <th className="p-2 text-right">Outstanding</th>
                        <th className="p-2 text-right">Amount to Apply</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bills.map((bill) => (
                        <tr key={bill.id} className="border-t">
                          <td className="p-2 font-mono text-xs font-semibold text-primary">
                            {bill.number ?? "—"}
                          </td>
                          <td className="p-2 text-xs">{bill.date ?? "—"}</td>
                          <td className="p-2 text-xs">{bill.due_date ?? "—"}</td>
                          <td className="p-2 text-right font-mono text-xs tabular-nums">
                            {money(bill.outstanding, bill.currency)}
                          </td>
                          <td className="p-2 text-right">
                            <Input
                              className="ml-auto h-8 w-28 text-right text-xs"
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder={bill.outstanding.toFixed(2)}
                              value={values[bill.id] ?? ""}
                              onChange={(event) =>
                                setValues((current) => ({
                                  ...current,
                                  [bill.id]: event.target.value,
                                }))
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t pt-3">
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-sm">
              Applying:{" "}
              <span className="font-mono text-primary">
                {money(allocatedTotal, note?.currency ?? "USD")}
              </span>
              {allocations.length > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  across {allocations.length} bill{allocations.length === 1 ? "" : "s"}
                </span>
              )}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={apply.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => apply.mutate()}
                disabled={apply.isPending || allocations.length === 0}
              >
                {apply.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Apply Credit
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metric({
  label,
  value,
  currency,
}: {
  label: string;
  value: number;
  currency: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-semibold">{money(value, currency)}</div>
    </div>
  );
}
