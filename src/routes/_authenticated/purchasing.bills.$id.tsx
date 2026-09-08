import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { DocumentViewWindow } from "@/components/document-view-window";
import { DocViewPanel } from "@/components/doc-view-panel";

export const Route = createFileRoute("/_authenticated/purchasing/bills/$id")({ component: BillDetailPage });

function BillDetailPage() {
	const { id } = Route.useParams();
	const nav = useNavigate();

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<DocumentViewWindow
				kind="bill"
				title="Bills"
				description="Manage supplier bills, approvals, posting, and payments."
				table="bills"
				fields={[]}
				searchColumn="number"
				detailId={id}
				renderDetail={() => (
					<DocViewPanel
						kind="bill"
						id={id}
						embedded
						onClose={() => nav({ to: "/purchasing/bills" as any })}
						onSaved={(newId) => nav({ to: "/purchasing/bills/$id" as any, params: { id: newId } as any })}
					/>
				)}
			/>
		</div>
	);
}
