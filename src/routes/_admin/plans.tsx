import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Check } from "lucide-react";

const PLANS = [
  { name: "Starter", price: 29, users: 5, storage: "5 GB", features: ["CRM","Sales","Inventory","Basic reports"] },
  { name: "Growth", price: 99, users: 25, storage: "50 GB", features: ["Everything in Starter","Purchasing","Manufacturing","Advanced reports","API access"], popular: true },
  { name: "Enterprise", price: 299, users: -1, storage: "500 GB", features: ["Everything in Growth","SAML SSO","Priority support","Dedicated CSM","Custom modules"] },
];

function PlansPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2 text-slate-100">
          <CreditCard className="h-5 w-5" /> Subscription Plans
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">Plans available to tenants signing up on the platform.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
          <Card key={p.name} className={`p-6 bg-slate-900 border-slate-800 text-slate-100 relative ${p.popular ? "ring-1 ring-amber-500/50" : ""}`}>
            {p.popular && <Badge className="absolute -top-2 left-4 bg-amber-500 text-slate-950 border-0">Most popular</Badge>}
            <div className="text-lg font-semibold">{p.name}</div>
            <div className="mt-2"><span className="text-3xl font-bold">${p.price}</span><span className="text-sm text-slate-400">/mo</span></div>
            <div className="text-xs text-slate-400 mt-3">{p.users === -1 ? "Unlimited" : p.users} users · {p.storage} storage</div>
            <ul className="mt-4 space-y-2 text-sm">
              {p.features.map((f) => <li key={f} className="flex items-start gap-2"><Check className="h-4 w-4 text-emerald-400 mt-0.5" /><span>{f}</span></li>)}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_admin/plans")({ component: PlansPage });
