import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDownAZ, ArrowUpAZ, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type SortOption<T> = { value: string; label: string; get: (row: T) => string | number | null | undefined };

type Options<T> = {
  rows: T[];
  searchText: (row: T) => (string | number | null | undefined)[];
  getDate?: (row: T) => string | null | undefined;
  sorts: SortOption<T>[];
  defaultSort?: string;
  defaultDir?: "asc" | "desc";
  pageSize?: number;
};

export function useReportTable<T>({ rows, searchText, getDate, sorts, defaultSort, defaultDir = "desc", pageSize: initialPageSize = 50 }: Options<T>) {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState(defaultSort ?? sorts[0]?.value ?? "");
  const [dir, setDir] = useState<"asc" | "desc">(defaultDir);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const sorter = sorts.find((s) => s.value === sort);
    const out = rows.filter((row) => {
      if (term && !searchText(row).filter((v) => v != null).some((v) => String(v).toLowerCase().includes(term))) return false;
      if (getDate && (from || to)) {
        const d = (getDate(row) ?? "").slice(0, 10);
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      return true;
    });
    if (sorter) {
      out.sort((a, b) => {
        const av = sorter.get(a);
        const bv = sorter.get(b);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
        return dir === "asc" ? c : -c;
      });
    }
    return out;
  }, [rows, search, from, to, sort, dir, sorts, searchText, getDate]);

  useEffect(() => setPage(1), [search, from, to, sort, dir, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return {
    search, setSearch, from, setFrom, to, setTo, sort, setSort, dir, setDir,
    page: safePage, setPage, pageSize, setPageSize, pageCount,
    filtered, pageRows, sorts, hasDate: !!getDate,
    reset: () => { setSearch(""); setFrom(""); setTo(""); },
  };
}

type TableState = ReturnType<typeof useReportTable<any>>;

export function ReportToolbar({ table, placeholder, onExport, children }: { table: TableState; placeholder?: string; onExport?: () => void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2 print:hidden">
      <div className="relative w-full max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder={placeholder ?? "Search…"} value={table.search} onChange={(e) => table.setSearch(e.target.value)} className="h-8 bg-background pl-8 text-sm" />
      </div>
      {table.hasDate && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>From</span>
          <Input type="date" value={table.from} onChange={(e) => table.setFrom(e.target.value)} className="h-8 w-36 bg-background" />
          <span>to</span>
          <Input type="date" value={table.to} onChange={(e) => table.setTo(e.target.value)} className="h-8 w-36 bg-background" />
        </div>
      )}
      {children}
      <div className="ml-auto flex items-center gap-2">
        <Select value={table.sort} onValueChange={table.setSort}>
          <SelectTrigger className="h-8 w-44 bg-background text-sm"><SelectValue placeholder="Sort by" /></SelectTrigger>
          <SelectContent>
            {table.sorts.map((s) => <SelectItem key={s.value} value={s.value}>Sort: {s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 w-8 p-0" title={table.dir === "asc" ? "Ascending" : "Descending"} onClick={() => table.setDir(table.dir === "asc" ? "desc" : "asc")}>
          {table.dir === "asc" ? <ArrowUpAZ className="h-3.5 w-3.5" /> : <ArrowDownAZ className="h-3.5 w-3.5" />}
        </Button>
        {(table.search || table.from || table.to) && (
          <Button variant="ghost" size="sm" className="h-8" onClick={table.reset}>Clear</Button>
        )}
        {onExport && (
          <Button variant="outline" size="sm" className="h-8" onClick={onExport}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
          </Button>
        )}
      </div>
    </div>
  );
}

export function ReportPagination({ table, label = "rows" }: { table: TableState; label?: string }) {
  const total = table.filtered.length;
  const start = total === 0 ? 0 : (table.page - 1) * table.pageSize + 1;
  const end = Math.min(total, table.page * table.pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground print:hidden">
      <span>{start}–{end} of {total} {label}</span>
      <div className="flex items-center gap-2">
        <Select value={String(table.pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
          <SelectTrigger className="h-7 w-24 bg-background text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[25, 50, 100, 250].map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
          </SelectContent>
        </Select>
        <span>Page {table.page} of {table.pageCount}</span>
        <Button variant="outline" size="sm" className="h-7" disabled={table.page <= 1} onClick={() => table.setPage(table.page - 1)}><ChevronLeft className="h-3 w-3" /></Button>
        <Button variant="outline" size="sm" className="h-7" disabled={table.page >= table.pageCount} onClick={() => table.setPage(table.page + 1)}><ChevronRight className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}

export function downloadCsv(filename: string, header: string[], body: (string | number | null | undefined)[][]) {
  const csv = [header, ...body].map((line) => line.map((c) => `"${String(c ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
