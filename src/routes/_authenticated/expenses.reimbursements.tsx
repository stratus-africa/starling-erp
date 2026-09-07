import { createFileRoute } from "@tanstack/react-router";
import { ReimbursementsListPage } from "@/components/reimbursements-list-page";

export const Route = createFileRoute("/_authenticated/expenses/reimbursements")({ component: ReimbursementsListPage });