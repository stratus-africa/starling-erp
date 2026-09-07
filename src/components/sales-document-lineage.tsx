import { ArrowDown, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type LineageNode = {
  type: string;
  number?: string | number | null;
  status?: string | null;
  amount?: number | null;
  currency?: string | null;
  date?: string | null;
  href?: string;
};

export function SalesDocumentLineage({ nodes }: { nodes: LineageNode[] }) {
  const visible = nodes.filter(Boolean);
  if (!visible.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Sales Document Lineage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {visible.map((node, index) => (
          <div key={`${node.type}-${node.number ?? index}`}>
            <a
              href={node.href}
              className={`flex items-center justify-between gap-3 rounded-md border p-3 transition-colors ${node.href ? "hover:border-primary/50 hover:bg-muted/30" : "pointer-events-none"}`}
            >
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {node.type}
                </p>
                <p className="truncate font-mono text-sm font-semibold">
                  {node.number ?? "Related document"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {node.date ? formatDate(node.date) : "Date not set"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-right">
                <div>
                  <Badge variant="outline">{node.status ?? "Related"}</Badge>
                  {node.amount != null && (
                    <p className="mt-1 font-mono text-xs">
                      {formatMoney(node.amount, node.currency ?? "KES")}
                    </p>
                  )}
                </div>
                {node.href && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            </a>
            {index < visible.length - 1 && (
              <ArrowDown className="mx-auto h-4 w-4 text-muted-foreground" />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function formatMoney(value: number, currency: string) {
  return `${currency} ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
