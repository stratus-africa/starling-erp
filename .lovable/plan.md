# Remove fake Super Admin data

## Goal
Make every Super Admin screen display only records and measurements returned by the live backend. Empty systems should show an honest empty state, never sample tenants, invented totals, simulated health checks, or unfinished placeholders.

## Changes
- Remove the invented workspace overview rows, fixed invoice/payment totals, stock variance, and permission-coverage percentages from the Super Admin dashboard.
- Replace those dashboard sections with live workspace, billing, permission, and operational summaries already available from the platform database; omit a metric when the platform does not record it.
- Remove simulated System Health fallback values and simulated successful probes. Failed reads or probes will show a clear unavailable/error state instead of fabricated healthy data.
- Convert Roles & Permissions from the fixed in-code reference matrix to the platform roles, permissions, and role assignments stored in the database.
- Remove unused placeholder UI and remove or redirect navigation entries that do not have a distinct live data source.
- Review every Super Admin route for hardcoded sample rows or figures, preserving only legitimate labels, status options, and configuration choices.
- Add consistent loading, empty, error, and retry states where the removal of fake data exposes an empty result.

## Verification
- Check the current backend values against the dashboard and the main Super Admin lists.
- Open all sidebar destinations and confirm no sample tenants, fabricated metrics, “coming soon,” or under-construction screens remain.
- Confirm the app reports a clean build and no new browser errors.

## Technical details
- Reuse existing protected platform RPCs and row-level security policies; no client-side admin bypasses.
- Add a migration only if a missing aggregate cannot be produced safely from existing protected platform data.
- Keep static UI metadata such as column labels, status filters, and permission names only when it represents actual supported configuration rather than runtime data.
