# Architecture Decision Record (ADR)

### ADR-001: Hybrid Context Resolution for Performance
- **Date:** 2025-01-18
- **Context:** Critical TTFB of 5-9s was caused by an N+1 query problem in `getCurrentBusinessContext`. Attempts to cache in Edge Runtime middleware failed due to `unstable_cache` limitations.
- **Decision:** Implement a hybrid model. Middleware provides an uncached context via headers. The RSC page attempts to use this first. On failure, it falls back to a Node.js-level cached function (`getCurrentBusinessContext`).
- **Consequences:** TTFB reduced by 43% to ~800ms. The system is resilient to middleware failures. We now maintain two context functions: one for Edge, one for Node.js.

### ADR-002: Domain-Driven Structure
- **Date:** 2025-01-15
- **Context:** The previous component-based architecture made cross-cutting concerns and code ownership difficult to manage.
- **Decision:** Refactor the entire frontend into a domain-driven structure under `/src/domains/`. Each domain (e.g., `expense-claims`, `invoices`) is self-contained.
- **Consequences:** Improved code isolation and developer velocity. Requires careful management of shared utilities.