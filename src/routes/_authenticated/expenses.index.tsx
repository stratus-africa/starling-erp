import { createFileRoute } from "@tanstack/react-router";
import { ExpensesListPage } from "@/components/expenses-list-page";

export const Route = createFileRoute("/_authenticated/expenses/")({ component: ExpensesListPage });