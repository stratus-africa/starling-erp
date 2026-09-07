import { Check, FileText, LayoutTemplate, Table2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DocumentTemplateStyle } from "@/lib/document-template-types";

const OPTIONS: { value: DocumentTemplateStyle; title: string; description: string; icon: typeof FileText }[] = [
  { value: "modern", title: "Nimbus Modern", description: "Clean and customer-friendly for quotes and sales orders.", icon: FileText },
  { value: "corporate", title: "Nimbus Corporate", description: "Formal and finance-focused for invoices, POs, and bills.", icon: LayoutTemplate },
  { value: "compact", title: "Nimbus Compact", description: "Dense and operational for requisitions and statements.", icon: Table2 },
];

export function DocumentTemplateSelector({ value, onChange, disabled = false }: { value: DocumentTemplateStyle; onChange: (value: DocumentTemplateStyle) => void; disabled?: boolean }) {
  return <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Document template">
    {OPTIONS.map((option) => {
      const Icon = option.icon;
      const selected = value === option.value;
      return <button key={option.value} type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={() => onChange(option.value)} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
        <Card className={cn("relative h-full p-4 transition-colors", selected ? "border-primary ring-1 ring-primary/20" : "hover:border-primary/40")}>
          {selected && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" />}
          <Icon className="h-5 w-5 text-primary" />
          <p className="mt-3 text-sm font-semibold">{option.title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{option.description}</p>
        </Card>
      </button>;
    })}
  </div>;
}
