# Roles and permission matrices

## What will change

- Remove **Cashier** from role cards, user assignment controls, permission columns, and all application role choices.
- Remove Cashier grants and assignments from the database, then rebuild the role enum without the Cashier value so it cannot be assigned again.
- Reorganize **Roles & Permissions** into three tabs:
  1. **All Roles**
  2. **Accounting Permission Matrix**
  3. **Other Module Matrix**
- Replace the static matrix indicators with checkboxes backed by live permission data.
- Let tenant administrators and super administrators grant or revoke permissions for non-administrator roles. Administrator access remains protected because those roles intentionally have full-access overrides.

## Permission behavior

- Store edits as tenant-specific overrides so one workspace cannot change permissions for another workspace.
- An unchecked permission explicitly denies that permission for the selected role in the current workspace; a checked permission grants it.
- Existing global role grants remain the default until an administrator changes a cell.
- Refresh the signed-in user's effective permissions after saves so access changes take effect promptly.

## Technical details

- Add a tenant-scoped role-permission override table with strict tenant isolation, explicit grants, and administrator-only write rules.
- Update `has_permission` and `get_my_permissions` to apply tenant overrides before global defaults.
- Add an authenticated administrator function for atomic permission toggles and prevent changes to `super_admin` and `tenant_admin`.
- Safely replace the role enum while preserving and restoring dependent access policies/functions, then regenerate application database types.
- Build the matrices from the live permission catalogue, grouping accounting permissions separately from all other modules.
- Show saving/error feedback, disabled administrator cells, and horizontally scrollable tables on smaller screens.

## Verification

- Confirm Cashier no longer exists in role data, assignments, generated types, or role screens.
- Verify a tenant administrator can grant and revoke a permission and that another workspace is unaffected.
- Verify all three tabs render and matrices remain usable on desktop and mobile.
