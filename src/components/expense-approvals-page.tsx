import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { db } from "@/lib/typed-db";
import { Card } from "@/components/ui/card";

export function ExpenseApprovalsPage() {
  const { data: requests = [], isLoading } = useQuery({ queryKey: ["approval_requests", "expenses"], queryFn: async () => { const { data, error } = await db.rpc("get_my_approval_inbox"); if (error) throw error; return ((data ?? []) as Record<string, any>[]).filter((row) => row.entity_type === "expense"); } });
  return <div className="h-full overflow-auto bg-background p-6"><div className="mx-auto max-w-6xl space-y-5"><div><h1 className="text-xl font-semibold">Expense Approvals</h1><p className="text-sm text-muted-foreground">Review employee-paid expenses awaiting approval.</p></div><Card className="divide-y">{isLoading ? <p className="p-6">Loading...</p> : requests.length ? requests.map((request) => <Link className="flex items-center justify-between p-4 hover:bg-muted/40" key={request.id} to="/expenses/$id" params={{ id: request.entity_id }}><div><div className="font-medium">Expense {request.entity_id}</div><div className="text-xs text-muted-foreground">{request.workflow_name} · Step {request.current_step}</div></div><span className="font-mono">{request.amount ?? "—"}</span></Link>) : <p className="p-6 text-sm text-muted-foreground">No expenses awaiting approval.</p>}</Card></div></div>;
}