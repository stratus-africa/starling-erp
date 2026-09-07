import { createFileRoute } from "@tanstack/react-router";
import { ExpensePage } from "@/components/expense-page";

export const Route = createFileRoute("/_authenticated/expenses/$id")({ component: () => <ExpensePage id={Route.useParams().id} /> });