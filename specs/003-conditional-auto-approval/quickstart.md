# Quickstart: Conditional Auto-Approval

## Verification Steps

1. **Schema**: `npx convex deploy --yes` after adding `matching_settings` table
2. **Build**: `npm run build` must pass
3. **UAT Flow**:
   - Navigate to AR Reconciliation → click gear icon → enable auto-approval (threshold 0.95, min cycles 2 for testing)
   - Import CSV with known customer aliases that have 3+ corrections
   - Verify high-confidence matches show "Verified by Groot" badge (auto-approved)
   - Click "Reverse Auto-Match" on one → verify reversal JE created + critical failure logged
   - Trigger 3 reversals → verify auto-approval auto-disables
