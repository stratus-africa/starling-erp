import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

export type PurchaseLineageNode = { label: string; id?: string | null; href?: string | null };

export function PurchaseDocumentLineage({ nodes }: { nodes: PurchaseLineageNode[] }) {
  return <Card className="p-4"><h2 className="mb-3 text-sm font-semibold">Purchase Document Lineage</h2><div className="flex flex-wrap items-center gap-2 text-sm">{nodes.map((node, index) => <span className="flex items-center gap-2" key={`${node.label}-${node.id ?? index}`}>{index > 0 && <span className="text-muted-foreground">↓</span>}{node.href && node.id ? <Link className="text-primary hover:underline" to={node.href as never}>{node.label}</Link> : <span className="text-muted-foreground">{node.label}</span>}</span>)}</div></Card>;
}
