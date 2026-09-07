import { Input } from "@/components/ui/input";

export function ReceiptQuantityEditor({ accepted, rejected, remaining, onAcceptedChange, onRejectedChange }: { accepted: string; rejected: string; remaining: number; onAcceptedChange: (value: string) => void; onRejectedChange: (value: string) => void }) {
  return <div className="flex items-center justify-end gap-2"><Input className="h-8 w-24" type="number" min="0" max={remaining} step="0.01" value={accepted} onChange={(event) => onAcceptedChange(event.target.value)} placeholder="Accepted" /><Input className="h-8 w-24" type="number" min="0" step="0.01" value={rejected} onChange={(event) => onRejectedChange(event.target.value)} placeholder="Rejected" /></div>;
}