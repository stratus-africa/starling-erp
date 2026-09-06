import { useState } from "react";
import { Lightbulb, ExternalLink, X, Check, ArrowRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Link } from "@tanstack/react-router";
import type { EligibleQuote, EligibleOrder } from "@/hooks/use-source-documents";

interface SourceDocumentSuggestionBannerProps {
  kind: "order" | "invoice";
  eligibleQuotes?: EligibleQuote[];
  eligibleOrders?: EligibleOrder[];
  fallbackQuotes?: EligibleQuote[];
  onIncludeQuote?: (quote: EligibleQuote) => void;
  onIncludeOrder?: (order: EligibleOrder) => void;
  onUnlink?: () => void;
  linkedQuoteId?: string | null;
  linkedQuoteNumber?: string | null;
  linkedOrderId?: string | null;
  linkedOrderNumber?: string | null;
}

export function SourceDocumentSuggestionBanner({
  kind,
  eligibleQuotes = [],
  eligibleOrders = [],
  fallbackQuotes = [],
  onIncludeQuote,
  onIncludeOrder,
  onUnlink,
  linkedQuoteId,
  linkedQuoteNumber,
  linkedOrderId,
  linkedOrderNumber,
}: SourceDocumentSuggestionBannerProps) {
  // Session dismissals per document ID
  const [dismissed, setDismissed] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>("");
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");

  // 1. If already linked, show the source reference badge / chip
  if (linkedQuoteId) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs text-foreground">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary">
            <Check className="h-3 w-3" />
          </div>
          <span>
            Items imported from <span className="font-semibold text-primary">Quote {linkedQuoteNumber ?? linkedQuoteId.slice(0, 8)}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
            <Link to={`/sales/quotes/${linkedQuoteId}` as any} target="_blank">
              View Quote <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
          </Button>
          {onUnlink && (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-destructive" onClick={onUnlink}>
              Unlink
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (linkedOrderId) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs text-foreground">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary">
            <Check className="h-3 w-3" />
          </div>
          <span>
            Items imported from <span className="font-semibold text-primary">Sales Order {linkedOrderNumber ?? linkedOrderId.slice(0, 8)}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
            <Link to={`/sales/orders/${linkedOrderId}` as any} target="_blank">
              View Sales Order <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
          </Button>
          {onUnlink && (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-destructive" onClick={onUnlink}>
              Unlink
            </Button>
          )}
        </div>
      </div>
    );
  }

  // If dismissed, render nothing
  if (dismissed) return null;

  // ── SALES ORDER WORKFLOW: Check Quotes ──
  if (kind === "order") {
    if (eligibleQuotes.length === 0) return null;

    // Single accepted quote
    if (eligibleQuotes.length === 1) {
      const q = eligibleQuotes[0];
      return (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 transition-all dark:border-amber-500/20 dark:bg-amber-500/5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400">
                <Lightbulb className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-400">
                  Existing Accepted Quote
                </p>
                <p className="text-sm text-foreground">
                  There is an accepted quote for this customer. Would you like to add its items to this Sales Order?
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <span className="font-mono font-medium text-foreground">{q.number}</span>
                  <span>·</span>
                  <span>{q.itemCount} {q.itemCount === 1 ? "item" : "items"}</span>
                  {q.date && (
                    <>
                      <span>·</span>
                      <span>{new Date(q.date).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</span>
                    </>
                  )}
                  <span>·</span>
                  <span className="font-semibold text-foreground">
                    {q.currency} {q.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss suggestion"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="mt-3.5 flex items-center gap-2 pt-1">
            <Button
              size="sm"
              className="h-8 bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700"
              onClick={() => onIncludeQuote?.(q)}
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" /> Include Quote Items
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setDismissed(true)}
            >
              Not now
            </Button>
          </div>
        </div>
      );
    }

    // Multiple accepted quotes
    const activeQuoteId = selectedQuoteId || eligibleQuotes[0]?.id;
    const chosenQuote = eligibleQuotes.find((q) => q.id === activeQuoteId) ?? eligibleQuotes[0];

    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 transition-all dark:border-amber-500/20 dark:bg-amber-500/5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <Lightbulb className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-400">
                Multiple Accepted Quotes Available
              </p>
              <p className="text-sm text-foreground">
                This customer has {eligibleQuotes.length} accepted quotes. Select one to include its items into this Sales Order:
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss suggestion"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          <RadioGroup value={activeQuoteId} onValueChange={setSelectedQuoteId} className="gap-2">
            {eligibleQuotes.map((q) => (
              <div
                key={q.id}
                onClick={() => setSelectedQuoteId(q.id)}
                className={`flex cursor-pointer items-center justify-between rounded-md border p-2.5 text-xs transition-colors ${
                  activeQuoteId === q.id
                    ? "border-amber-500 bg-background shadow-sm"
                    : "border-border/60 bg-background/50 hover:bg-background"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <RadioGroupItem value={q.id} id={`q-${q.id}`} />
                  <Label htmlFor={`q-${q.id}`} className="cursor-pointer space-y-0.5">
                    <span className="font-mono font-semibold text-foreground">{q.number}</span>
                    <div className="text-[11px] text-muted-foreground">
                      {q.itemCount} {q.itemCount === 1 ? "item" : "items"}
                      {q.date && (
                        <span> · {new Date(q.date).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</span>
                      )}
                    </div>
                  </Label>
                </div>
                <div className="font-semibold text-foreground tabular-nums">
                  {q.currency} {q.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="mt-3.5 flex items-center gap-2 pt-1">
          <Button
            size="sm"
            className="h-8 bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700"
            onClick={() => chosenQuote && onIncludeQuote?.(chosenQuote)}
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" /> Include Selected Quote
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setDismissed(true)}
          >
            Not now
          </Button>
        </div>
      </div>
    );
  }

  // ── INVOICE WORKFLOW: Priority 1: Open Sales Orders ──
  if (kind === "invoice" && eligibleOrders.length > 0) {
    if (eligibleOrders.length === 1) {
      const o = eligibleOrders[0];
      return (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 transition-all dark:border-blue-500/20 dark:bg-blue-500/5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/20 text-blue-600 dark:text-blue-400">
                <Lightbulb className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-400">
                  Open Sales Order Available
                </p>
                <p className="text-sm text-foreground">
                  This customer has an open Sales Order available. Would you like to include its items on this Invoice?
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <span className="font-mono font-medium text-foreground">{o.number}</span>
                  <span>·</span>
                  <Badge variant="outline" className="text-[10px] font-normal uppercase py-0 px-1.5">
                    {o.status}
                  </Badge>
                  <span>·</span>
                  <span>{o.remainingItemsCount} {o.remainingItemsCount === 1 ? "line with remaining qty" : "lines with remaining qty"}</span>
                  <span>·</span>
                  <span className="font-semibold text-foreground">
                    {o.currency} {o.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss suggestion"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="mt-3.5 flex items-center gap-2 pt-1">
            <Button
              size="sm"
              className="h-8 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
              onClick={() => onIncludeOrder?.(o)}
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" /> Include Sales Order
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setDismissed(true)}
            >
              Not now
            </Button>
          </div>
        </div>
      );
    }

    // Multiple open sales orders
    const activeOrderId = selectedOrderId || eligibleOrders[0]?.id;
    const chosenOrder = eligibleOrders.find((o) => o.id === activeOrderId) ?? eligibleOrders[0];

    return (
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 transition-all dark:border-blue-500/20 dark:bg-blue-500/5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/20 text-blue-600 dark:text-blue-400">
              <Lightbulb className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-400">
                Multiple Open Sales Orders
              </p>
              <p className="text-sm text-foreground">
                This customer has {eligibleOrders.length} open Sales Orders. Select an order to bill its remaining items:
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss suggestion"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          <RadioGroup value={activeOrderId} onValueChange={setSelectedOrderId} className="gap-2">
            {eligibleOrders.map((o) => (
              <div
                key={o.id}
                onClick={() => setSelectedOrderId(o.id)}
                className={`flex cursor-pointer items-center justify-between rounded-md border p-2.5 text-xs transition-colors ${
                  activeOrderId === o.id
                    ? "border-blue-500 bg-background shadow-sm"
                    : "border-border/60 bg-background/50 hover:bg-background"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <RadioGroupItem value={o.id} id={`o-${o.id}`} />
                  <Label htmlFor={`o-${o.id}`} className="cursor-pointer space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-foreground">{o.number}</span>
                      <Badge variant="outline" className="text-[10px] uppercase py-0 px-1 font-normal">
                        {o.status}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {o.remainingItemsCount} {o.remainingItemsCount === 1 ? "line remaining" : "lines remaining"}
                      {o.date && (
                        <span> · {new Date(o.date).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</span>
                      )}
                    </div>
                  </Label>
                </div>
                <div className="font-semibold text-foreground tabular-nums">
                  {o.currency} {o.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="mt-3.5 flex items-center gap-2 pt-1">
          <Button
            size="sm"
            className="h-8 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
            onClick={() => chosenOrder && onIncludeOrder?.(chosenOrder)}
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" /> Include Selected Sales Order
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setDismissed(true)}
          >
            Not now
          </Button>
        </div>
      </div>
    );
  }

  // ── INVOICE WORKFLOW: Priority 2: Fallback to Quote if NO Open Sales Orders ──
  if (kind === "invoice" && eligibleOrders.length === 0 && fallbackQuotes.length > 0) {
    const q = fallbackQuotes[0];
    return (
      <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-4 transition-all dark:border-indigo-500/20 dark:bg-indigo-500/5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-500/20 text-indigo-600 dark:text-indigo-400">
              <Lightbulb className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-800 dark:text-indigo-400">
                Accepted Quote Available
              </p>
              <p className="text-sm text-foreground">
                No open sales order found, but this customer has an accepted quote. Would you like to bill this quote directly?
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                <span className="font-mono font-medium text-foreground">{q.number}</span>
                <span>·</span>
                <span>{q.itemCount} {q.itemCount === 1 ? "item" : "items"}</span>
                <span>·</span>
                <span className="font-semibold text-foreground">
                  {q.currency} {q.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss suggestion"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mt-3.5 flex items-center gap-2 pt-1">
          <Button
            size="sm"
            className="h-8 bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700"
            onClick={() => onIncludeQuote?.(q)}
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" /> Include Quote
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setDismissed(true)}
          >
            Not now
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
