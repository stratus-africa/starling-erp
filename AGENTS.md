<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Super Admin screens must render live platform records only; absent data uses an empty or error state, never simulated metrics or sample rows.
- Workspace membership additions use tenant invitations; direct user attachment is forbidden so email ownership is verified before access is granted.
- Protected platform lists use the shared all-page reader when calculating aggregates; paginated displays explicitly identify page-scoped counts, because a fetched slice is not a platform total.
- Health probes report only the service actually measured; querying application records cannot certify external service availability.
