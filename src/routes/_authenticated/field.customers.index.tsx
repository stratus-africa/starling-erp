import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FieldHeader, SearchBar, Chips, Row, Loading, Empty, ErrorBox, NoAccess, Fab, StatusPill, useFieldAccess, useCustomers, money } from "@/components/field/field-ui";
import { dbMinor } from "@/lib/field-money";

export const Route = createFileRoute("/_authenticated/field/customers/")({
  head: () => ({ meta: [{ title: "Customers — Field Sales" }] }),
  component: CustomersList,
});

type F = "all" | "active" | "inactive" | "balance" | "recent";
type S = "name" | "balance" | "newest";

function CustomersList() {
  const a = useFieldAccess();
  const [q, setQ] = useState("");
  const [f, setF] = useState<F>("all");
  const [sort, setSort] = useState<S>("name");
  const { data = [], isLoading, error, refetch } = useCustomers();
  const list = useMemo(() => {
    const s = q.toLowerCase();
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    let r = data.filter((c: any) => !s || [c.name, c.phone, c.email, c.code, c.tax_id].some((v) => v?.toLowerCase().includes(s)));
    if (f === "active") r = r.filter((c: any) => (c.status ?? "Active") === "Active");
    if (f === "inactive") r = r.filter((c: any) => c.status && c.status !== "Active");
    if (f === "balance") r = r.filter((c: any) => dbMinor(c.balance) > 0);
    if (f === "recent") r = r.filter((c: any) => (c.created_at ?? "") >= weekAgo);
    if (sort === "balance") r = [...r].sort((x: any, y: any) => dbMinor(y.balance) - dbMinor(x.balance));
    if (sort === "newest") r = [...r].sort((x: any, y: any) => (y.created_at ?? "").localeCompare(x.created_at ?? ""));
    return r;
  }, [data, q, f, sort]);
  if (!a.customers) return <><FieldHeader title="Customers" /><NoAccess what="customers" /></>;
  return (
    <div>
      <FieldHeader title="Customers" right={
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as S)} className="mr-2 h-10 rounded-lg border bg-card/80 px-2 text-sm">
          <option value="name">A–Z</option><option value="balance">Balance</option><option value="newest">Newest</option>
        </select>
      } />
      <div className="space-y-3 p-4">
        <SearchBar value={q} onChange={setQ} placeholder="Search name, phone, email, PIN" />
        <Chips value={f} onChange={setF} options={[{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "balance", label: "Owes money" }, { value: "recent", label: "New this week" }]} />
      </div>
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} retry={refetch} /> : list.length === 0 ? <Empty text="No customers found." /> : list.map((c: any) => (
        <Row key={c.id} to="/field/customers/$id" params={{ id: c.id }} title={c.name}
          subtitle={[c.code, c.phone, c.email].filter(Boolean).join(" · ")}
          right={<span className="font-medium tabular-nums">{money(c.balance, c.currency)}</span>}
          meta={<StatusPill status={c.status ?? "Active"} />} />
      ))}
      {a.customersCreate && <Fab to="/field/customers/new" label="Customer" />}
    </div>
  );
}
