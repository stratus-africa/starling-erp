import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function QueryLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function QueryEmpty({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
      <p>{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}

export function QueryError({
  error,
  retry,
  label = "Unable to load this page.",
}: {
  error: unknown;
  retry: () => void;
  label?: string;
}) {
  const detail =
    error instanceof Error ? error.message : "Please check your connection and try again.";
  return (
    <Card className="border-destructive/40 bg-destructive/5 p-6 text-center">
      <AlertCircle className="mx-auto h-5 w-5 text-destructive" />
      <p className="mt-2 text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      <Button className="mt-4" variant="outline" size="sm" onClick={retry}>
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        Retry
      </Button>
    </Card>
  );
}
