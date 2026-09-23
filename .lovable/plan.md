# Mobile-only Field Sales navigation

## Goal
Make Field Sales the automatic experience only on portrait phones, while landscape tablets and desktop open the regular office ERP. Remove Field Sales from the office sidebar.

## Changes
- Remove the “Field Sales (mobile)” entry from the shared sidebar navigation and office search/navigation sources.
- Update the authenticated entry behavior so users whose only role is Field Sales are redirected to `/field` only on portrait phone-sized screens; wider or landscape screens stay in the permission-limited office app.
- Restyle the Field Sales bottom menu using the StratusPOS pattern: a raised rounded navigation dock, elevated active icon, clear active label, safe-area spacing, and a dedicated More action.
- Keep the existing five destinations and all current permission/module filtering unchanged.
- Hide the Field Sales interface outside portrait mobile view and return those users to the office app.

## Validation
- Verify portrait phone navigation and active states at 390 × 844.
- Verify landscape/tablet and desktop open the office ERP without a Field Sales sidebar item.
- Confirm direct `/field` access on non-portrait layouts returns to the office app.
- Run the project’s automatic checks and inspect browser errors.

## Technical details
- Use a hydration-safe media-query hook for `(max-width: 767px) and (orientation: portrait)`.
- Reuse the existing TanStack routes, permissions, and Field Sales pages; no backend or data changes.
- Use existing semantic color tokens and button components.
