import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ServiceConfirmationForm({ values, onChange }: { values: { servicePeriodStart: string; servicePeriodEnd: string; acceptedBy: string; description: string }; onChange: (key: keyof typeof values, value: string) => void }) {
  return <div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1.5"><Label>Service Period Start</Label><Input type="date" value={values.servicePeriodStart} onChange={(event) => onChange("servicePeriodStart", event.target.value)} /></div><div className="grid gap-1.5"><Label>Service Period End</Label><Input type="date" value={values.servicePeriodEnd} onChange={(event) => onChange("servicePeriodEnd", event.target.value)} /></div><div className="grid gap-1.5"><Label>Accepted By</Label><Input value={values.acceptedBy} onChange={(event) => onChange("acceptedBy", event.target.value)} /></div><div className="grid gap-1.5 sm:col-span-2"><Label>Description</Label><Textarea value={values.description} onChange={(event) => onChange("description", event.target.value)} rows={2} /></div></div>;
}