import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLeads, LEAD_STATUSES } from "@/lib/field-leads";
import { FieldHeader, SearchBar, Chips, Row, Loading, Empty, ErrorBox, NoAccess, Fab, StatusPill, useFieldAccess } from "@/components/field/field-ui";

export const Route = createFileRoute("/_authenticated/field/leads/")({
  head: () => ({ meta: [{ title: "Leads — Field Sales" }] }),
  component: LeadsList,
});

function LeadsList() {
  const a = useFieldAccess();
  const [q, setQ] = useState("");
  const [st, setSt] = useState("all");
  const [sort, setSort] = useState<"activity" | "name">("activity");
  const { data = [], isLoading, error, refetch } = useLeads(a.leads);
  const list = useMemo(() => {
    const s = q.toLowerCase();
    let r = data.filter((l) => (st === "all" || l.status === st) && (!s || [l.name, l.company, l.phone, l.email].some((v: string | null) => v?.toLowerCase().includes(s))));
    if (sort === "name") r = [...r].sort((x, y) => x.name.localeCompare(y.name));
    return r;
  }, [data, q, st, sort]);
  if (!a.leads) return <><FieldHeader title="Leads" back="/field/more" /><NoAccess what="leads" /></>;
  return (
    <div>
      <FieldHeader title="Leads" back="/field/more" right={
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as never)} className="mr-2 h-10 rounded-md border bg-background px-2 text-sm">
          <option value="activity">Recent</option><option value="name">A–Z</option>
        </select>
      } />
      <div className="space-y-3 p-4">
        <SearchBar value={q} onChange={setQ} placeholder="Search leads" />
        <Chips value={st} onChange={setSt} options={[{ value: "all", label: "All" }, ...LEAD_STATUSES.map((s) => ({ value: s, label: s }))]} />
      </div>
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} retry={refetch} /> : list.length === 0 ? <Empty text="No leads yet." /> : list.map((l) => (
        <Row key={l.id} to="/field/leads/$id" params={{ id: l.id }} title={l.name}
          subtitle={[l.company, l.phone, l.source, l.assignee?.full_name ?? l.assignee?.email].filter(Boolean).join(" · ")}
          right={<StatusPill status={l.status} />}
          meta={<span className="text-[11px] text-muted-foreground">{new Date(l.last_activity_at).toLocaleDateString()}</span>} />
      ))}
      {a.leadsCreate && <Fab to="/field/leads/new" label="Lead" />}
    </div>
  );
}
