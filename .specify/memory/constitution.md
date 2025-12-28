<!--
╔═══════════════════════════════════════════════════════════════════════════════╗
║                         SYNC IMPACT REPORT                                     ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║ Version Change: N/A → 1.0.0 (Initial ratification)                            ║
║                                                                               ║
║ Added Principles:                                                             ║
║   I. Domain-Driven Architecture                                               ║
║   II. Semantic Design System                                                  ║
║   III. Build Validation (Non-Negotiable)                                      ║
║   IV. Simplicity First                                                        ║
║   V. Background Job Architecture                                              ║
║                                                                               ║
║ Added Sections:                                                               ║
║   - Technology Standards                                                       ║
║   - Development Workflow                                                       ║
║   - Governance                                                                 ║
║                                                                               ║
║ Templates Requiring Updates:                                                   ║
║   ✅ plan-template.md - Constitution Check section aligned                    ║
║   ✅ spec-template.md - No conflicts                                          ║
║   ✅ tasks-template.md - No conflicts                                         ║
║                                                                               ║
║ Follow-up TODOs: None                                                          ║
╚═══════════════════════════════════════════════════════════════════════════════╝
-->

# FinanSEAL Constitution

## Core Principles

### I. Domain-Driven Architecture

All code MUST be organized around business domains, not technical concerns.

**Non-Negotiable Rules:**
- Feature code lives in `src/domains/{domain-name}/` with components, hooks, services, and types
- Each domain MUST be self-contained with its own `CLAUDE.md` documentation
- API routes follow `src/app/api/v1/{domain}/` structure
- Shared utilities only in `src/lib/` for genuine cross-domain needs
- No circular dependencies between domains

**Rationale:** Domain isolation enables parallel development, clearer ownership, and prevents monolithic coupling. A domain can be understood, tested, and modified without understanding the entire codebase.

### II. Semantic Design System

All UI components MUST use the Layer 1-2-3 semantic token system. Hardcoded colors are forbidden.

**Non-Negotiable Rules:**
- NEVER use hardcoded colors (`bg-gray-700`, `text-white`, `border-gray-600`)
- ALWAYS use semantic tokens (`bg-card`, `text-foreground`, `border-border`)
- Follow layer hierarchy: `bg-background` → `bg-surface` → `bg-card` → `bg-muted`
- Badge pattern: `bg-{color}-500/10 text-{color}-600 dark:text-{color}-400 border border-{color}-500/30`
- Check existing components in `src/components/ui/` before creating new ones
- Reference `src/app/globals.css` for all available CSS variables

**Rationale:** Semantic tokens ensure automatic light/dark mode support, WCAG AA accessibility compliance (4.5:1 contrast), and consistent visual language. Hardcoded colors break theming and accessibility.

### III. Build Validation (Non-Negotiable)

Every code change MUST pass `npm run build` before completion. No exceptions.

**Non-Negotiable Rules:**
- Run `npm run build` after every significant code change
- Fix ALL TypeScript errors before reporting task completion
- Fix ALL ESLint errors before reporting task completion
- The build-fix loop continues until zero errors
- Never commit code that fails the build

**Rationale:** Build validation catches type errors, import issues, and configuration problems before they reach production. A failing build is a blocking issue, not a warning.

### IV. Simplicity First

Every change MUST be the minimum necessary to achieve the goal. Avoid over-engineering.

**Non-Negotiable Rules:**
- Only make changes directly requested or clearly necessary
- No feature flags for non-production code
- No abstractions for single-use operations
- No "improvements" beyond what was asked
- No docstrings/comments for unchanged code
- Delete unused code completely (no `_unused` variables, no `// removed` comments)
- Three similar lines of code is better than a premature abstraction

**Rationale:** Complexity has compounding costs in maintenance, testing, and onboarding. Every abstraction must earn its existence through proven reuse, not hypothetical future needs.

### V. Background Job Architecture

Long-running tasks MUST use Trigger.dev v3 with proper task orchestration.

**Non-Negotiable Rules:**
- Use `@trigger.dev/sdk` v4 syntax (NEVER `client.defineJob`)
- Tasks defined in `src/trigger/` directory
- Python scripts for ML/CV workloads in `src/python/` with `requirements.txt`
- Fire-and-forget pattern: API returns 202 Accepted, task runs in background
- Use `tasks.trigger<typeof taskName>()` for type-safe triggers
- Downstream task orchestration via `triggerAndWait()` for dependent workflows
- Max duration: 600 seconds default, override per-task when justified

**Rationale:** Background jobs prevent API timeouts, enable retry logic, and allow Python runtime for specialized workloads (OCR, computer vision). The fire-and-forget pattern keeps the UI responsive.

## Technology Standards

**Stack Requirements:**
- **Framework**: Next.js 15+ with App Router
- **Language**: TypeScript 5.9+ with strict mode
- **Styling**: Tailwind CSS 3.4+ with semantic tokens from globals.css
- **Components**: Radix UI primitives with CVA (class-variance-authority)
- **Database**: Supabase PostgreSQL with Row Level Security (RLS)
- **Authentication**: Clerk for user management
- **Background Jobs**: Trigger.dev v3 with Python extension
- **Testing**: Vitest for unit tests, Playwright for E2E

**API Design:**
- All routes under `/api/v1/` namespace
- Domain-specific endpoints (`/api/v1/expense-claims/`, `/api/v1/invoices/`)
- JSON request/response with Zod validation
- Proper HTTP status codes (200, 201, 202, 400, 401, 403, 404, 500)

## Development Workflow

**Before Starting Work:**
1. Read relevant domain `CLAUDE.md` files
2. Check existing components before creating new ones
3. Understand the semantic token system for UI work

**During Development:**
1. Follow domain boundaries strictly
2. Use semantic tokens for all styling
3. Run `npm run build` frequently to catch errors early
4. Keep changes minimal and focused

**Before Completion:**
1. `npm run build` MUST pass with zero errors
2. Verify light AND dark mode for UI changes
3. Test affected user flows manually
4. Document non-obvious decisions in code comments

**Code Review Gates:**
- [ ] Build passes (`npm run build`)
- [ ] No hardcoded colors in UI code
- [ ] Changes are within appropriate domain boundaries
- [ ] No over-engineering or unnecessary abstractions
- [ ] Background tasks use Trigger.dev patterns correctly

## Governance

This constitution supersedes all other development practices. When in conflict, constitution principles take precedence.

**Amendment Process:**
1. Propose amendment with rationale
2. Document the change with before/after comparison
3. Update version number following semantic versioning
4. Update dependent templates if principles change

**Compliance:**
- All PRs MUST verify compliance with constitution principles
- Violations require explicit justification in PR description
- Complexity additions require documented rationale

**Version Policy:**
- MAJOR: Backward-incompatible principle changes or removals
- MINOR: New principles or significant guidance expansion
- PATCH: Clarifications, wording improvements, typo fixes

**Version**: 1.0.0 | **Ratified**: 2025-12-27 | **Last Amended**: 2025-12-27
