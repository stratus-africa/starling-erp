import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, X } from "lucide-react";
import { db } from "@/lib/typed-db";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type StatusLine = {
  order_line_id: string;
  item_name?: string | null;
  description?: string | null;
  sku?: string | null;
  ordered_quantity: number;
  already_invoiced_quantity: number;
  remaining_quantity: number;
  unit_price: number;
  discount_pct: number;
  tax_pct: number;
};

type InvoicingStatus = {
  order_number?: string;
  currency?: string;
  order_status?: string;
  lines: StatusLine[];
};

export function CreateInvoiceFromOrderDialog({
  open,
  onOpenChange,
  orderId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  onCreated?: (invoiceId: string) => void;
}) {
  const qc = useQueryClient();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const { data: status, isLoading } = useQuery({
    queryKey: ["sales_orders", orderId, "invoicing-status"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db.rpc("get_sales_order_invoicing_status", {
        _order_id: orderId,
      });
      if (error) throw error;
      return data as InvoicingStatus | null;
    },
  });

  useEffect(() => {
    if (!open || !status) return;
    setQuantities(
      Object.fromEntries(
        status.lines.map((line) => [
          line.order_line_id,
          line.remaining_quantity > 0 ? String(line.remaining_quantity) : "0",
        ]),
      ),
    );
  }, [open, status]);

  const selected = useMemo(
    () =>
      (status?.lines ?? [])
        .map((line) => ({
          order_line_id: line.order_line_id,
          quantity: Number(quantities[line.order_line_id] ?? 0),
        }))
        .filter((line) => line.quantity > 0),
    [quantities, status],
  );
  const remainingLines = (status?.lines ?? []).filter((line) => line.remaining_quantity > 0);
  const invalid = (status?.lines ?? []).some(
    (line) =>
      Number(quantities[line.order_line_id] ?? 0) < 0 ||
      Number(quantities[line.order_line_id] ?? 0) > Number(line.remaining_quantity),
  );
  const create = useMutation({
    mutationFn: async () => {
      if (!selected.length || invalid) throw new Error("Enter valid invoice quantities");
      const { data, error } = await db.rpc("create_invoice_from_sales_order", {
        _order_id: orderId,
        _lines: selected,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (invoiceId) => {
      toast.success("Draft invoice created");
      qc.invalidateQueries({ queryKey: ["sales_orders", orderId] });
      qc.invalidateQueries({ queryKey: ["sales_orders", orderId, "invoicing-status"] });
      onOpenChange(false);
      onCreated?.(invoiceId);
    },
    onError: (error: Error) => toast.error(error.message || "Invoice creation failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Create Invoice from {status?.order_number ?? "Sales Order"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          ) : !remainingLines.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No remaining quantities to invoice.
            </p>
          ) : (
            <>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setQuantities(
                      Object.fromEntries(
                        remainingLines.map((line) => [
                          line.order_line_id,
                          String(line.remaining_quantity),
                        ]),
                      ),
                    )
                  }
                >
                  <Check className="mr-1.5 h-4 w-4" /> Select All Remaining
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setQuantities(
                      Object.fromEntries(remainingLines.map((line) => [line.order_line_id, "0"])),
                    )
                  }
                >
                  <X className="mr-1.5 h-4 w-4" /> Clear
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="p-3 text-left">Product</th>
                      <th className="p-3 text-right">Ordered</th>
                      <th className="p-3 text-right">Already Invoiced</th>
                      <th className="p-3 text-right">Remaining</th>
                      <th className="p-3 text-right">Invoice Quantity</th>
                      <th className="p-3 text-right">Unit Price</th>
                      <th className="p-3 text-right">Tax</th>
                      <th className="p-3 text-right">Discount</th>
                      <th className="p-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {remainingLines.map((line) => {
                      const quantity = Number(quantities[line.order_line_id] ?? 0);
                      const lineTotal =
                        quantity *
                        Number(line.unit_price) *
                        (1 - Number(line.discount_pct ?? 0) / 100) *
                        (1 + Number(line.tax_pct ?? 0) / 100);
                      return (
                        <tr className="border-t" key={line.order_line_id}>
                          <td className="p-3">
                            <p className="font-medium">
                              {line.item_name ?? line.description ?? "Item"}
                            </p>
                            <p className="text-xs text-muted-foreground">{line.sku ?? ""}</p>
                          </td>
                          <td className="p-3 text-right">{line.ordered_quantity}</td>
                          <td className="p-3 text-right">{line.already_invoiced_quantity}</td>
                          <td className="p-3 text-right">{line.remaining_quantity}</td>
                          <td className="p-3 text-right">
                            <Input
                              className={`ml-auto w-28 text-right ${quantity > line.remaining_quantity ? "border-destructive" : ""}`}
                              type="number"
                              min="0"
                              max={line.remaining_quantity}
                              step="0.01"
                              value={quantities[line.order_line_id] ?? "0"}
                              onChange={(event) =>
                                setQuantities((current) => ({
                                  ...current,
                                  [line.order_line_id]: event.target.value,
                                }))
                              }
                            />
                          </td>
                          <td className="p-3 text-right font-mono">
                            {formatMoney(line.unit_price, status?.currency)}
                          </td>
                          <td className="p-3 text-right">{line.tax_pct}%</td>
                          <td className="p-3 text-right">{line.discount_pct}%</td>
                          <td className="p-3 text-right font-mono">
                            {formatMoney(lineTotal, status?.currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || isLoading || invalid || selected.length === 0}
          >
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Draft
            Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatMoney(value: number, currency = "KES") {
  return `${currency} ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
