import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function DefaultError({ error }: { error?: any }) {
  console.error("Router error:", error);
  return (
    <div className="p-6 space-y-3">
      <p className="text-sm font-semibold text-destructive">This page could not be loaded.</p>
      {error?.message && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive font-mono whitespace-pre-wrap">
          {error.message}
        </div>
      )}
    </div>
  );
}

function DefaultNotFound() {
  return <p className="p-6 text-sm text-muted-foreground">Page not found.</p>;
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultError,
    defaultNotFoundComponent: DefaultNotFound,
  });

  return router;
};
