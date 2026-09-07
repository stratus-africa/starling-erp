import { createFileRoute } from "@tanstack/react-router";
import { ExpenseApprovalsPage } from "@/components/expense-approvals-page";

export const Route = createFileRoute("/_authenticated/expenses/approvals")({ component: ExpenseApprovalsPage });