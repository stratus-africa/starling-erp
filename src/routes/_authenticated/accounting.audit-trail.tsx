import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AccountingAuditTrail } from "@/components/accounting-audit-trail";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, Search } from "lucide-react";

const ENTITY_TYPES = [
  { value: "invoice",          label: "Invoice" },
  { value: "bill",             label: "Bill" },
  { value: "credit_note",      label: "Credit Note" },
  { value: "expense",          label: "Expense" },
  { value: "payment_received", label: "Payment Received" },
  { value: "payment_made",     label: "Payment Made" },
  { value: "adjustment",       label: "Inventory Adjustment" },
  { value: "production_order", label: "Production Order" },
  { value: "journal_entry",    label: "Journal Entry" },
];

function AuditTrailPage() {
  const [entityType, setEntityType] = useState("invoice");
  const [entityId,   setEntityId]   = useState("");
  const [submitted,  setSubmitted]  = useState<{ type: string; id: string } | null>(null);

  const handleSearch = () => {
    const id = entityId.trim();
    if (!id) return;
    setSubmitted({ type: entityType, id });
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 border-b px-6 py-3">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-base font-semibold tracking-tight">Accounting Audit Trail</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Trace the complete accounting chain for any posted document — from source document
          through journal entries, GL lines, inventory movements, and reversals.
        </p>
      </div>

      {/* Search */}
      <div className="shrink-0 border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8 text-xs font-mono"
              placeholder="Paste document UUID…"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <Button size="sm" className="h-8" onClick={handleSearch} disabled={!entityId.trim()}>
            Load trail
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Tip: copy the document ID from the URL when viewing an invoice, bill, or journal.
          Document IDs are UUIDs (e.g. <span className="font-mono">a1b2c3d4-…</span>).
        </p>
      </div>

      {/* Trail */}
      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {submitted ? (
          <AccountingAuditTrail
            entityType={submitted.type}
            entityId={submitted.id}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <ShieldCheck className="h-10 w-10 opacity-20" />
            <p className="text-sm">Enter a document type and ID to load its full audit trail.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/accounting/audit-trail")({
  component: AuditTrailPage,
});
