import { createFileRoute } from "@tanstack/react-router";
import { ExpensePage } from "@/components/expense-page";

export const Route = createFileRoute("/_authenticated/purchasing/expenses/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <ExpensePage id={id} />;
  },
});
