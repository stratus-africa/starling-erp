import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { db } from "@/lib/typed-db";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PurchaseReceiptDialog } from "@/components/purchase-receipt-dialog";

export function PurchaseReceiptsListPage() {
  const [open, setOpen] = useState(false);
  const { data: receipts = [], isLoading } = useQuery({ queryKey: ["goods_receipts", "list"], queryFn: async () => { const { data, error } = await db.from("goods_receipts").select("id,receipt_number,receipt_date,status,receiving_status,receipt_type,warehouse_id,purchase_order_id,supplier_id").is("deleted_at", null).order("receipt_date", { ascending: false }); if (error) throw error; return (data ?? []) as Record<string, any>[]; } });
  return <div className="h-full overflow-auto bg-background p-6"><div className="mx-auto max-w-7xl space-y-5"><div className="flex items-center justify-between"><div><h1 className="text-xl font-semibold">Purchase Receipts</h1><p className="text-sm text-muted-foreground">Goods receipts and service confirmations from purchase orders.</p></div><Button onClick={() => setOpen(true)}>New Receipt</Button></div><Card className="overflow-hidden"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="p-3">Receipt Number</th><th className="p-3">Date</th><th className="p-3">Type</th><th className="p-3">PO</th><th className="p-3">Warehouse</th><th className="p-3">Status</th></tr></thead><tbody>{isLoading ? <tr><td className="p-6 text-center" colSpan={6}>Loading...</td></tr> : receipts.map((receipt) => <tr className="border-t" key={receipt.id}><td className="p-3"><Link className="text-primary hover:underline" to="/purchases/receipts/$id" params={{ id: receipt.id }}>{receipt.receipt_number ?? receipt.id.slice(0, 8)}</Link></td><td className="p-3">{receipt.receipt_date}</td><td className="p-3">{receipt.receipt_type}</td><td className="p-3 font-mono text-xs">{receipt.purchase_order_id}</td><td className="p-3">{receipt.warehouse_id ?? "Service"}</td><td className="p-3">{receipt.status} · {receipt.receiving_status}</td></tr>)}</tbody></table></Card></div><PurchaseReceiptDialog open={open} onOpenChange={setOpen} /></div>;
}