import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, Check, ChevronsUpDown, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export function TenantSwitcher() {
  const { tenant, roles, switchTenant } = useAuth();
  const isSuper = roles.includes("super_admin");

  const { data: tenants = [] } = useQuery({
    queryKey: ["tenants", "list", isSuper],
    enabled: isSuper,
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants")
        .select("id,name,slug,status").is("deleted_at", null).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!isSuper) {
    return tenant ? (
      <div className="hidden md:flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1 text-xs">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{tenant.name}</span>
      </div>
    ) : null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span className="max-w-[160px] truncate">{tenant?.name ?? "Select tenant"}</span>
          <ChevronsUpDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-h-96 overflow-auto">
        <DropdownMenuLabel className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5" /> Switch tenant (super admin)
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tenants.length === 0 && <div className="px-2 py-4 text-xs text-muted-foreground text-center">No tenants</div>}
        {tenants.map((t: any) => (
          <DropdownMenuItem key={t.id} onClick={async () => {
            try { await switchTenant(t.id); toast.success(`Switched to ${t.name}`); }
            catch (e: any) { toast.error(e.message ?? "Switch failed"); }
          }}>
            <div className="flex items-center gap-2 w-full">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{t.name}</div>
                <div className="text-[10px] text-muted-foreground">{t.slug}</div>
              </div>
              {tenant?.id === t.id && <Check className="h-3.5 w-3.5 text-primary" />}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
