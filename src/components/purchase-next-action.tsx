import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function PurchaseNextAction({ status, href }: { status?: string | null; href?: string }) {
  const action = status === "Draft" ? "Complete document" : status === "Pending Approval" ? "Review & approve" : status === "Approved" ? "Continue procurement" : status === "Acknowledged" ? "Receive goods" : status === "Partially Received" ? "Receive remaining" : status === "Posted" ? "Pay or allocate payment" : status === "Paid" ? "Complete" : "Review document";
  return <Card className="flex items-center justify-between gap-3 border-primary/20 bg-primary/5 p-4"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Next action</p><p className="mt-1 text-sm font-semibold">{action}</p></div>{href && <Button size="sm" asChild><Link to={href as never}>Open</Link></Button>}</Card>;
}
