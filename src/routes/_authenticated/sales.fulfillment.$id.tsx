import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FulfillmentWorkspacePage } from "@/components/fulfillment-workspace-page";
import { db } from "@/lib/typed-db";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/sales/fulfillment/$id")({ component: FulfillmentDetailPage });

function FulfillmentDetailPage() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const { can } = useAuth();
	const remove = useMutation({
		mutationFn: async () => {
			const { error } = await db.rpc("delete_sales_fulfillment", { _fulfillment_id: id });
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Fulfilment deleted");
			navigate({ to: "/sales/fulfillment" as never });
		},
		onError: (error: Error) => toast.error(error.message),
	});

	return (
		<div className="relative h-full">
			<FulfillmentWorkspacePage />
			{can("sales.delete") && (
				<Button
					className="absolute right-6 top-6"
					variant="destructive"
					size="sm"
					onClick={() => remove.mutate()}
					disabled={remove.isPending}
				>
					<Trash2 className="mr-2 h-4 w-4" />
					Delete Fulfilment
				</Button>
			)}
		</div>
	);
}