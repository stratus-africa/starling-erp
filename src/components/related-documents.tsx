import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type RelatedDocument = {
  type: string;
  number?: string | number | null;
  status?: string | null;
  amount?: number | null;
  currency?: string | null;
  href?: string;
};
export function RelatedDocuments({ documents }: { documents: RelatedDocument[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Related Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {documents.length ? (
          documents.map((document, index) => (
            <a
              key={`${document.type}-${document.number ?? index}`}
              href={document.href}
              className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-muted/30"
            >
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                  {document.type}
                </p>
                <p className="font-mono text-sm font-semibold">{document.number ?? "Document"}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{document.status ?? "Related"}</Badge>
                {document.href && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            </a>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No related documents.</p>
        )}
      </CardContent>
    </Card>
  );
}
