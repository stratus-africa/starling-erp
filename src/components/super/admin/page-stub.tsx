/**
 * PageStub — placeholder for super-admin pages not yet implemented.
 * Shows the page title, required permission, and a clear "coming soon" note.
 * Replace this with the real implementation when building each page.
 */

import { Construction } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PlatformPermission } from "@/lib/platform-permissions";

interface Props {
  title:       string;
  description: string;
  permission:  PlatformPermission;
}

export function PageStub({ title, description, permission }: Props) {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            Coming soon
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center border rounded-xl bg-muted/20">
        <Construction className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium">This page is under construction</p>
          <p className="text-xs text-muted-foreground mt-1">
            Required permission:{" "}
            <code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">{permission}</code>
          </p>
        </div>
      </div>
    </div>
  );
}
