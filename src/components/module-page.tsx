import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Filter, Download, Plus, Search, MoreHorizontal, Upload, Printer, Mail } from "lucide-react";
import type { ReactNode } from "react";

export interface Column { key: string; label: string; className?: string; render?: (v: any, row: any) => ReactNode }

interface Props {
  title: string;
  description: string;
  primaryAction?: string;
  columns: Column[];
  rows: Record<string, any>[];
  statusKey?: string;
  emptyHint?: string;
}

const statusVariant: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground",
  Sent: "bg-info/15 text-info",
  Accepted: "bg-success/15 text-success",
  Approved: "bg-success/15 text-success",
  Paid: "bg-success/15 text-success",
  Delivered: "bg-success/15 text-success",
  Completed: "bg-success/15 text-success",
  Active: "bg-success/15 text-success",
  Confirmed: "bg-info/15 text-info",
  Processing: "bg-info/15 text-info",
  "In Transit": "bg-info/15 text-info",
  Pending: "bg-warning/15 text-warning",
  Overdue: "bg-destructive/15 text-destructive",
  Rejected: "bg-destructive/15 text-destructive",
  Cancelled: "bg-destructive/15 text-destructive",
  Suspended: "bg-destructive/15 text-destructive",
  Trial: "bg-warning/15 text-warning",
};

export function ModulePage({ title, description, primaryAction, columns, rows, statusKey = "status" }: Props) {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm"><Upload className="h-4 w-4 mr-1.5" /> Import</Button>
          <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1.5" /> Export</Button>
          {primaryAction && (
            <Button size="sm" className="bg-primary text-primary-foreground shadow-sm">
              <Plus className="h-4 w-4 mr-1.5" /> {primaryAction}
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden border shadow-sm p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2 bg-muted/30">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search…" className="h-8 pl-8 text-sm bg-background" />
          </div>
          <Button variant="outline" size="sm" className="h-8"><Filter className="h-3.5 w-3.5 mr-1.5" /> Filters</Button>
          <div className="ml-auto text-xs text-muted-foreground">{rows.length} records</div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {columns.map((c) => (
                  <TableHead key={c.key} className={"text-xs font-semibold uppercase tracking-wider text-muted-foreground " + (c.className ?? "")}>
                    {c.label}
                  </TableHead>
                ))}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="text-center text-sm text-muted-foreground py-16">
                    No records yet.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row, i) => (
                <TableRow key={i} className="hover:bg-muted/30 cursor-pointer">
                  {columns.map((c) => {
                    const val = row[c.key];
                    return (
                      <TableCell key={c.key} className={"text-sm " + (c.className ?? "")}>
                        {c.render ? c.render(val, row)
                          : c.key === statusKey && typeof val === "string" ? (
                            <Badge variant="secondary" className={"font-medium " + (statusVariant[val] ?? "bg-muted text-muted-foreground")}>
                              {val}
                            </Badge>
                          ) : val}
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>View</DropdownMenuItem>
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        <DropdownMenuItem><Printer className="h-4 w-4 mr-2" /> Print</DropdownMenuItem>
                        <DropdownMenuItem><Mail className="h-4 w-4 mr-2" /> Email</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <div>Showing 1–{rows.length} of {rows.length}</div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7" disabled>Previous</Button>
            <Button variant="outline" size="sm" className="h-7" disabled>Next</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
