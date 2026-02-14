# Research: Stripe Product Catalog Sync

**Date**: 2026-02-14 | **Branch**: `014-stripe-catalog-sync`

## Decision 1: Stripe API Call Architecture

**Decision**: Use Convex actions to call the Stripe API server-side. Actions can import npm packages and make external HTTP calls.

**Rationale**: Convex queries and mutations cannot make external HTTP calls — only actions (`action()` / `internalAction()`) can. The `stripe` npm package (v20.1.0) is already installed and usable from Convex actions. This keeps the sync logic self-contained within Convex rather than routing through Next.js API routes.

**Alternatives considered**:
- Next.js API route as proxy: Would work but adds an unnecessary hop. The Stripe call happens in the API route, results are passed back to client, then client calls Convex mutation. Slower and more complex.
- Lambda function: Over-engineered for a simple list + upsert operation. No benefit over Convex actions.

## Decision 2: Stripe Secret Key Storage

**Decision**: Store the Stripe secret key in a dedicated `stripe_integrations` Convex table. The key is read only by internal actions (never exposed to client via public queries). A public query returns only the account name, connection status, and timestamps.

**Rationale**: Per-business keys cannot use environment variables (those are per-deployment, not per-tenant). Storing in the database is the standard SaaS pattern for tenant-specific integration credentials. Security is enforced by:
1. Only internal Convex functions read the key field
2. Public queries return a sanitized view (account name + status only)
3. Role-based access (owner-only for connection management)

**Alternatives considered**:
- Hash-only storage (like MCP API keys): Not viable — we need the actual key to make Stripe API calls, unlike MCP keys which only need hash comparison.
- External secrets manager (AWS Secrets Manager): Over-engineered for v1. The key is already server-side only and Convex functions run in a trusted environment.
- Encrypted field with application-level encryption: Would require an encryption key in env vars. Adds complexity without meaningful security improvement since the decryption key would be accessible to the same functions.

## Decision 3: Sync Progress Feedback

**Decision**: Use a Convex document-based progress pattern. The sync action writes progress to a `sync_progress` document, and the client subscribes to it via a reactive Convex query.

**Rationale**: Convex actions cannot send incremental updates to clients. But Convex queries are reactive — clients automatically receive updates when the underlying data changes. By writing progress to a document, we get real-time UI updates for free using Convex's existing subscription mechanism.

**Flow**:
1. Action creates/updates a `sync_progress` document: `{ businessId, total, processed, status: 'running' }`
2. Client subscribes to this document via `useQuery()`
3. Action updates `processed` count as it works through products
4. Client sees real-time progress bar updates
5. Action sets `status: 'completed'` or `'failed'` when done

**Alternatives considered**:
- Polling a status endpoint: Unnecessary when Convex provides real-time subscriptions.
- Server-Sent Events from Next.js API: Would bypass Convex's reactive system and add complexity.

## Decision 4: Product-to-Catalog Mapping

**Decision**: Fetch products with `expand: ['data.default_price']` to get product + price in a single API call. Map using the field mapping defined in FR-005.

**Rationale**: Expanding `default_price` avoids a separate `prices.list()` call for each product. Stripe's expand feature is designed for this use case.

**Price resolution order** (per spec edge case):
1. `product.default_price` (expanded) — primary choice
2. First active one-time price via `prices.list({ product: id, type: 'one_time', active: true, limit: 1 })` — fallback
3. First active recurring price (use `unit_amount`) — last resort
4. Price = 0 if no prices exist at all

**Currency handling**: Stripe stores amounts in smallest currency unit (cents). Divide by 100 for standard currencies. Currency code from price is uppercase to match existing catalog convention.

## Decision 5: Detecting Archived Products During Sync

**Decision**: Sync only fetches `active: true` products from Stripe. To detect archived products, compare local Stripe-synced items against the fetched set. Any local item whose `stripeProductId` is NOT in the fetched set gets deactivated.

**Rationale**: This is more efficient than fetching all Stripe products (active + archived) and checking each. It also handles the case where a product is deleted entirely from Stripe (not just archived).

**Alternatives considered**:
- Fetch all products and check `active` flag: Would download unnecessary data for archived products and doesn't handle deleted products.
- Webhook-based real-time sync: Out of scope for v1 (spec says manual sync only).

## Decision 6: Local Deactivation Tracking

**Decision**: Add a `locallyDeactivated` boolean field to catalog items. When a user deactivates a Stripe-synced item, set this to `true`. During sync, skip items where `locallyDeactivated === true`. The "Restore from Stripe" action clears this flag and re-syncs the item.

**Rationale**: This cleanly separates user-initiated deactivation from Stripe-driven deactivation. The sync logic only needs to check one flag to know whether to skip an item.

## Decision 7: Existing Stripe Client Reuse

**Decision**: Do NOT reuse the existing `src/lib/stripe/client.ts` singleton. That client uses a single global `STRIPE_SECRET_KEY` env var. For per-business sync, create a new Stripe client instance inside the Convex action using the business-specific key.

**Rationale**: The existing client is for billing/subscription operations using the platform's own Stripe account. Catalog sync uses each business's own Stripe account key, requiring a separate client instance per call.

## Technology Summary

| Component | Choice | Version |
|-----------|--------|---------|
| Stripe SDK | `stripe` (already installed) | ^20.1.0 |
| API version | `2025-12-15.clover` (already pinned) | - |
| Backend runtime | Convex actions | 1.31.3 |
| Key storage | Convex `stripe_integrations` table | - |
| Progress feedback | Convex reactive query on progress document | - |
| Pagination | Stripe SDK `autoPagingToArray()` | - |
| Key validation | `stripe.account.retrieve()` | - |
