import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Settings2, Server, Globe, Mail, Shield } from "lucide-react";

const SECTIONS = [
  { icon: Server, title: "Infrastructure", desc: "Region, storage backend, cache and queues." },
  { icon: Globe, title: "Domains & routing", desc: "Custom domains, DNS, and vanity subdomains." },
  { icon: Mail, title: "Platform email", desc: "System-wide sender, DKIM, and email templates." },
  { icon: Shield, title: "Security", desc: "Password policy, MFA enforcement, and SSO defaults." },
];

function SystemSettingsPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2 text-slate-100">
          <Settings2 className="h-5 w-5" /> System Settings
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">Platform-wide configuration applied to every tenant.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((s) => (
          <Card key={s.title} className="p-5 bg-slate-900 border-slate-800 text-slate-100">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-md bg-slate-800 flex items-center justify-center"><s.icon className="h-4.5 w-4.5 text-amber-400" /></div>
              <div>
                <div className="font-semibold">{s.title}</div>
                <div className="text-sm text-slate-400 mt-1">{s.desc}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_admin/settings")({ component: SystemSettingsPage });
