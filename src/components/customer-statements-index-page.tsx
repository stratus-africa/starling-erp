import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, FileText } from "lucide-react";
import { db } from "@/lib/typed-db";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type Customer = { id: string; name: string; code: string | null; currency: string | null };

export function CustomerStatementsIndexPage() {
  const [search, setSearch] = useState("");
  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["sales", "statement-customers", search],
    queryFn: async () => {
      let query = db
        .from("customers")
        .select("id,name,code,currency")
        .is("deleted_at", null)
        .order("name")
        .limit(50);
      if (search.trim()) query = query.ilike("name", `%${search.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });
  return (
    <div className="min-h-full bg-muted/20 p-4 md:p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <header>
          <p className="text-xs text-muted-foreground">Reports / Sales</p>
          <h1 className="mt-1 text-2xl font-bold">Customer Statements</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a customer to view their statement.
          </p>
        </header>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search customers"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Card className="divide-y overflow-hidden">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading customers...</p>
          ) : customers.length ? (
            customers.map((customer) => (
              <a
                className="flex items-center justify-between p-4 hover:bg-muted/30"
                href={`/reports/sales/customer-statements/${customer.id}`}
                key={customer.id}
              >
                <span>
                  <span className="font-medium">{customer.name}</span>
                  <span className="ml-3 text-xs text-muted-foreground">{customer.code ?? ""}</span>
                </span>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </a>
            ))
          ) : (
            <p className="p-6 text-sm text-muted-foreground">No customers found.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
