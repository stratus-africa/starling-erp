import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { db } from "@/lib/typed-db";
import { logDocumentEvent } from "@/lib/document-events";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ShoppingCart } from "lucide-react";

interface ReqLine {
  item_id: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  tax_pct: number;
  line_total: number;
}

interface ConvertReqToPoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The requisition ID being converted */
  reqId: string;
  /** Requisition number (for display) */
  reqNumber?: string;
  /** Lines copied from the approved requisition */
  reqLines: ReqLine[];
  /** Default currency from the requisition */
  reqCurrency?: string;
  /** Requisition's required_date becomes the PO expected_date */
  reqRequiredDate?: string | null;
  /** Called after a successful conversion with the new PO's ID */
  onConverted?: (poId: string) => void;
}

export function ConvertReqToPoDialog({
  open,
  onOpenChange,
  reqId,
  reqNumber,
  reqLines,
  reqCurrency = "USD",
  reqRequiredDate,
  onConverted,
}: ConvertReqToPoDialogProps) {
  const { tenant, user, profile } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();

  const today = new Date().toISOString().slice(0, 10);

  const [supplierId, setSupplierId] = useState("");
  const [poDate, setPoDate] = useState(today);
  const [expectedDate, setExpectedDate] = useState(reqRequiredDate ?? "");
  const [currency, setCurrency] = useState(reqCurrency);
  const [notes, setNotes] = useState("");

  // Editable line prices (buyer can adjust during conversion)
  const [linePrices, setLinePrices] = useState<number[]>(
    reqLines.map((l) => l.unit_price),
  );

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", "po-convert-picker"],
    queryFn: async () => {
      const { data, error } = await db
        .from("suppliers")
        .select("id,name,currency")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; currency: string }[];
    },
    enabled: open,
    staleTime: 30_000,
  });

  const computeTotal = (lines: ReqLine[], prices: number[]) => {
    let subtotal = 0,
      discount_total = 0,
      tax_total = 0,
      grand_total = 0;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const price = prices[i] ?? l.unit_price;
      const gross = l.quantity * price;
      const disc = gross * ((l.discount_pct || 0) / 100);
      const afterDisc = gross - disc;
      const tax = afterDisc * ((l.tax_pct || 0) / 100);
      subtotal += gross;
      discount_total += disc;
      tax_total += tax;
      grand_total += afterDisc + tax;
    }
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discount_total: Math.round(discount_total * 100) / 100,
      tax_total: Math.round(tax_total * 100) / 100,
      grand_total: Math.round(grand_total * 100) / 100,
    };
  };

  const totals = computeTotal(reqLines, linePrices);

  const convert = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("No tenant context");
      if (!supplierId) throw new Error("Please select a supplier");
      if (reqLines.length === 0) throw new Error("Requisition has no line items");

      const number = `PO-${Date.now().toString().slice(-8)}`;

      // Create PO header
      const { data: po, error: poErr } = await db
        .from("purchase_orders")
        .insert({
          tenant_id: tenant.id,
          number,
          supplier_id: supplierId,
          date: poDate,
          expected_date: expectedDate || null,
          status: "Draft",
          currency,
          subtotal: totals.subtotal,
          discount_total: totals.discount_total,
          tax_total: totals.tax_total,
          grand_total: totals.grand_total,
          amount: totals.grand_total,
          notes: notes || null,
        })
        .select("id")
        .single();
      if (poErr) throw poErr;
      const poId = po.id;

      // Copy lines with (potentially adjusted) prices
      const linePayload = reqLines.map((l, i) => ({
        tenant_id: tenant.id,
        document_id: poId,
        line_no: i + 1,
        item_id: l.item_id || null,
        description: l.description || "",
        quantity: l.quantity,
        unit_price: linePrices[i] ?? l.unit_price,
        discount_pct: l.discount_pct || 0,
        tax_pct: l.tax_pct || 0,
        line_total:
          Math.round(
            l.quantity *
              (linePrices[i] ?? l.unit_price) *
              (1 - (l.discount_pct || 0) / 100) *
              (1 + (l.tax_pct || 0) / 100) *
              100,
          ) / 100,
      }));
      const { error: lineErr } = await db.from("purchase_order_lines").insert(linePayload);
      if (lineErr) throw lineErr;

      // Mark the requisition as Ordered and link to the PO
      await db
        .from("purchase_requisitions")
        .update({ status: "Ordered", converted_po_id: poId })
        .eq("id", reqId);

      // Write audit event
      if (tenant?.id) {
        await logDocumentEvent({
          tenantId: tenant.id,
          entityType: "requisition",
          entityId: reqId,
          status: "Ordered",
          note: `Converted to purchase order ${number} with supplier ${suppliers.find((s) => s.id === supplierId)?.name ?? supplierId}`,
          actorId: user?.id ?? null,
          actorEmail: profile?.email ?? null,
        });
      }

      return poId;
    },
    onSuccess: (poId) => {
      toast.success("Converted to Purchase Order successfully");
      qc.invalidateQueries();
      onOpenChange(false);
      if (onConverted) {
        onConverted(poId);
      } else {
        nav({ to: `/purchasing/orders/${poId}` as never });
      }
    },
    onError: (e: Error) => toast.error(e.message ?? "Conversion failed"),
  });

  // Auto-fill currency when supplier changes
  const handleSupplierChange = (id: string) => {
    setSupplierId(id);
    const s = suppliers.find((sup) => sup.id === id);
    if (s?.currency) setCurrency(s.currency);
  };

  const money = (n: number) =>
    (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Convert to Purchase Order
          </DialogTitle>
          <DialogDescription>
            {reqNumber ? `Requisition ${reqNumber}` : "Approved requisition"} → New Purchase Order.
            Select a supplier and confirm line prices before creating the PO.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* ── PO Header fields ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>
                Supplier <span className="text-destructive">*</span>
              </Label>
              <Select value={supplierId} onValueChange={handleSupplierChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier…" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>PO Date</Label>
              <Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
            </div>

            <div className="grid gap-1.5">
              <Label>Expected Delivery</Label>
              <Input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["USD", "EUR", "GBP", "KES", "AED", "EGP", "INR", "ZAR"].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                placeholder="Additional notes for the PO…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* ── Line items with editable prices ── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-sm font-semibold">Line Items</p>
              <span className="text-xs text-muted-foreground">
                — adjust unit prices to reflect negotiated supplier rates
              </span>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="text-left px-3 py-2 w-8">#</th>
                    <th className="text-left px-3 py-2">Description</th>
                    <th className="text-right px-3 py-2 w-20">Qty</th>
                    <th className="text-right px-3 py-2 w-32">Unit Price</th>
                    <th className="text-right px-3 py-2 w-24">Disc %</th>
                    <th className="text-right px-3 py-2 w-24">Tax %</th>
                    <th className="text-right px-3 py-2 w-28">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {reqLines.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-6 text-center text-xs text-muted-foreground"
                      >
                        No line items on this requisition.
                      </td>
                    </tr>
                  )}
                  {reqLines.map((l, i) => {
                    const price = linePrices[i] ?? l.unit_price;
                    const lineTotal =
                      Math.round(
                        l.quantity *
                          price *
                          (1 - (l.discount_pct || 0) / 100) *
                          (1 + (l.tax_pct || 0) / 100) *
                          100,
                      ) / 100;
                    return (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/10">
                        <td className="px-3 py-2 text-muted-foreground text-xs">{i + 1}</td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-sm leading-tight">
                            {l.description || "—"}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{l.quantity}</td>
                        <td className="px-2 py-1">
                          <Input
                            className="h-7 text-right text-xs w-28"
                            type="number"
                            step="any"
                            min={0}
                            value={price}
                            onChange={(e) =>
                              setLinePrices((prev) => {
                                const next = [...prev];
                                next[i] = Number(e.target.value);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                          {l.discount_pct ? `${l.discount_pct}%` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                          {l.tax_pct ? `${l.tax_pct}%` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums font-medium">
                          {currency} {money(lineTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mt-3">
              <div className="w-64 space-y-1 rounded-lg border bg-muted/20 px-4 py-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">{money(totals.subtotal)}</span>
                </div>
                {totals.discount_total > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Discount</span>
                    <span className="font-mono tabular-nums">
                      − {money(totals.discount_total)}
                    </span>
                  </div>
                )}
                {totals.tax_total > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax</span>
                    <span className="font-mono tabular-nums">{money(totals.tax_total)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Grand Total</span>
                  <span className="font-mono tabular-nums">
                    {currency} {money(totals.grand_total)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={convert.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => convert.mutate()}
            disabled={convert.isPending || !supplierId || reqLines.length === 0}
          >
            {convert.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4 mr-1.5" />
            )}
            Create Purchase Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
