# Groot Finance -- Coding Rules & Guidelines

**Groot Finance**: AI financial co-pilot for Southeast Asian SMEs. Self-improving via DSPy + Mem0.
**Stack**: Next.js 15.5.7 + Convex 1.31.3 + AWS Lambda + Gemini 3.1 Flash-Lite + DSPy + Mem0
**Docs**: `docs/README.md` | **Vision**: `docs/product_vision.md`

## What Groot IS and IS NOT (CRITICAL)

**Groot is an AGENTIC AI company, not a SaaS accounting app.**
- The AI agent IS the product. Accounting, invoicing, and expense features EXIST TO SERVE the agent.
- Every feature should ask: "Can the user do this through the chat agent?" If not, build the agent capability first.
- The chat agent is the PRIMARY interface -- dashboards and pages are SECONDARY.
- We compete with Xero/QuickBooks the way Tesla competes with Toyota -- fundamentally different architecture.

**The moat**: Corrections -> DSPy training -> accuracy -> fewer corrections -> smarter system (flywheel).

## Workflow Rules

1. **Plan First**: Think through the problem, read relevant files, write plan to `tasks/todo.md`
2. **Get Approval**: Check in before implementing
3. **Track Progress**: Mark todo items complete as you go
4. **Keep It Simple**: Minimal changes, avoid complexity
5. **Prefer Modification Over Creation**: Check if existing files can be modified first

## Build & Deploy

```bash
npm run build              # MUST pass before task completion
npx convex deploy --yes    # MANDATORY after ANY Convex change (schema, functions, indexes)
cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2  # AWS infra
```

**Convex deployment is CRITICAL**: Forgetting to deploy causes "Could not find public function" errors in production. Deploy after ANY change to `convex/schema.ts`, `convex/functions/`, or query/mutation signatures.

## Git Rules (CRITICAL)

```bash
git config user.name "grootdev-ai"
git config user.email "dev@hellogroot.com"
```
All commits must use this identity -- Vercel deployments require it.

**NEVER use `gh pr merge`** -- GitHub PR merges create commits authored by the token owner, not local git config. Instead:
1. `git merge --ff-only <branch>` (fast-forward, no merge commit)
2. Or `git cherry-pick <commit>` then push directly to main

**No screenshots or binary files in git** -- `.png`, `.jpg`, `.gif` belong in GitHub issues, not source control.

## Critical Constraints

### Clerk Version Lock
- **Locked at exact `6.30.0`** (no caret in package.json)
- v6.34.0+ breaks middleware `auth()` on public routes -> infinite redirect loops
- If `npm install` resolves to newer: check `package-lock.json` diff before committing

### Convex Bandwidth (Free Plan: 2GB/month)
- **Never use reactive `query` for heavy aggregations** -- use `action` + `internalQuery`
- **Never `.collect()` without limits** -- use `.take(N)` or index range filters
- **EventBridge-first for scheduled jobs** reading >10 documents
- **NEVER run `convex dev` from worktrees** -- overwrites production
- See `.claude/rules/convex.md` for full bandwidth rules

### Security -- Least Privilege
- IAM: Scope to specific resource ARNs. Never use `*` resources.
- Convex: Use `internalMutation` for backend-only ops. Expose `mutation`/`query` only when frontend needs access.
- Secrets: AWS SSM SecureString (free). Never store in Convex (plain-text DB).
- Auth: Clerk for user-facing, internal service keys for backend-to-backend.

## Domain-Driven Design (MANDATORY)

**`src/domains/`** = business domains (user-navigable features)
**`src/lib/`** = shared capabilities (reusable infrastructure consumed by domains)

```
src/domains/{expense-claims,invoices,chat,analytics,users,...}/
src/lib/{csv-parser,ai,utils,hooks}/
```

**Rules:**
1. Business domain = something users navigate to -> `src/domains/<name>/`
2. Shared capability = something other features use -> `src/lib/<name>/`
3. Shared UI components -> `src/components/ui/` or `src/components/<feature>/`
4. Never create standalone pages for shared capabilities -- embed in consuming domain's UI
5. Shared capabilities return structured data; consuming domain handles persistence

## Tiered Intelligence Architecture

All AI features follow a two-tier pattern:

| Tier | Engine | When |
|------|--------|------|
| **Tier 1** | Rule-based (regex, exact match, heuristics) | Runs first, handles 60-80% |
| **Tier 2** | DSPy / LLM (BootstrapFewShot, MIPROv2) | Handles Tier 1 leftovers |

**IFRS compliance mandatory**: Double-entry bookkeeping, proper Chart of Accounts (1xxx-6xxx), multi-currency per IFRS 21.

## Code Style

```typescript
import { formatNumber, formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
formatCurrency(1234.56, 'USD')     // "$1,234.56"
formatBusinessDate('2025-10-31')   // "Oct 31, 2025" (no timezone shift)
```

- **Use semantic tokens**: `bg-card`, `text-foreground`, `bg-primary` -- never hardcode colors
- See `.claude/rules/frontend-patterns.md` for button styling, page layout, info drawer patterns

### AI Model (Gemini 3.1 Flash-Lite)
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/openai` (in `ai-config.ts`)
- Model: `gemini-3.1-flash-lite-preview` | Key: `GEMINI_API_KEY` | Temp: 0.3
- **Never use `gemini-2.0-flash`** (deprecated, shuts down June 2026)
- See `.claude/rules/ai-systems.md` for full model selection rules

### Documentation Update Rule
After changes to any system, update the relevant CLAUDE.md docs to stay in sync with code.

## UAT Testing
- Credentials: refer to `.env.local` (`TEST_USER_ADMIN`, `TEST_USER_MANAGER`, `TEST_USER_EMPLOYEE` + `_PW`)
- Production URL: `https://finance.hellogroot.com`

## Quick References

| Resource | Location |
|----------|----------|
| Full Documentation | `docs/README.md` |
| UI Components | `src/components/ui/CLAUDE.md` |
| API Reference | `src/app/api/v1/CLAUDE.md` |
| Expense Claims | `src/domains/expense-claims/CLAUDE.md` |
| LHDN E-Invoice | `src/domains/expense-claims/einvoice/CLAUDE.md` |
| AI Agent & MCP | `src/lib/ai/CLAUDE.md` |
| App Patterns | `src/app/CLAUDE.md` |

## Domain Rule Files (`.claude/rules/`)

These load automatically when editing matching file paths:

| File | Loaded when editing | Content |
|------|-------------------|---------|
| `convex.md` | `convex/**` | Bandwidth rules, anti-patterns, EventBridge migration |
| `aws-infra.md` | `infra/**`, `src/lambda/**` | CDK stacks, IAM, MCP engine, cost optimization |
| `accounting.md` | `convex/functions/journal*`, `convex/lib/journal*` | Double-entry system, helpers, AP/AR subledger |
| `ai-systems.md` | `src/lib/ai/**`, `convex/functions/*Optimization*` | DSPy, Mem0, Action Center DSPy |
| `frontend-patterns.md` | `src/app/**`, `src/domains/*/components/**` | Page layout, buttons, info drawer |

---

## Testing Discipline

- **Tests accompany every code change.** No PR adds or modifies a function without a corresponding test. Only exception: pure documentation changes.
- **Write the test first when feasible (TDD).** Define expected behavior as a failing test, then implement until it passes. Mandatory for safety-critical code, data transformations, and API contracts.
- **Tests verify behavior, not implementation.** Test what the function returns, not how it works internally.
- **Validation tests for data transformations.** Any function that parses, extracts, filters, or transforms data must have a test verifying output shape and content against known input.
- **Integrity checks at boundaries.** When data flows between modules, each handoff should have a test verifying output of module A is valid input for module B.
- **After running tests, verify no synthetic contamination** -- check that test inputs come from committed fixtures or env-var paths to real data. If a test constructs input inline, it must be clearly marked as `# synthetic fixture` with a comment explaining why.
- **No manual mocking of pipeline data.** All pipeline inputs must come from automated extraction or real sources.

## Human Validation Outputs

**Every extraction, transformation, or analysis step MUST produce outputs a human can verify.** Do not rely solely on pass/fail test results.

**After completing ANY development task, always tell the user:**
1. **What** artifacts/outputs were generated and **where** (exact paths)
2. **How** to view them (exact commands)
3. **What to look for** when validating (expected patterns, value ranges)
4. **How to spot errors** (what wrong output looks like vs correct)

**After completing ANY test run, always report:**
1. Which tests used **real data** vs **synthetic fixtures**
2. Whether any hardcoded values or manual mocks were used (should be zero for integration tests)
3. A concrete **validation command** the user can run independently

## Branch & Worktree Development Rules

Worktrees are ephemeral -- they get cleaned up after merge. These rules prevent context loss.

### Memory: Write to main, not just the worktree
- **Strategic decisions** (architecture, conventions, model choices) MUST be saved to the **main repo memory** directory, NOT just the current worktree. Worktree memory dies when the worktree is cleaned up.
- **At conversation end:** If any decisions were made that future sessions need, write a summary to the main repo memory.
- **Tactical notes** (bug details, test results, temporary state) belong in code, commits, or issue trackers -- not memory.

### CLAUDE.md: Source of truth, always evolving
- **META-RULE:** When a design decision, naming convention, or architectural rule is agreed upon in conversation, CLAUDE.md MUST be updated in the same response. If it's not in CLAUDE.md, it doesn't exist as a rule.
- **Convention changes to shared files** (CLAUDE.md, core models, schemas) must be committed and pushed to main IMMEDIATELY -- never left as unstaged local changes in a worktree.
- **Worktree branches MUST `git pull origin main`** before final testing to pick up convention changes.
- **When resolving merge conflicts on CLAUDE.md:** NEVER blindly accept `--theirs` or `--ours`. Always manually merge, preserving both additions.

### Keeping CLAUDE.md dynamic yet authoritative
- When exceeding ~20K chars, restructure: move domain content to `.claude/rules/` with `paths:` frontmatter, keep universal rules in core.
- The `Active Technologies` section is the "living" part -- update as work progresses.
- Remove entries for completed/closed work older than 2 weeks.

## Execution-Mandatory Review Protocol

**Reading code is NOT reviewing. You MUST execute.**

1. **Run the tests** -- Execute the actual test command. Paste real output.
2. **Run the linter** -- Execute and report findings. Not "it should pass."
3. **Run stale reference checks** -- Grep for known anti-patterns.
4. **For data pipelines:** Run code against real inputs, verify non-zero output.

**A review without execution evidence is INCOMPLETE.**

### Confidence Scoring for Findings
- **1.0** -- Verified by execution (test failed, grep matched)
- **0.8-0.9** -- High certainty from code reading (type mismatch, wrong name)
- **0.5-0.7** -- Likely issue, needs verification
- **< 0.5** -- Do not report

### Self-Review (When AI Writes Code)
When you write code, review your own output before claiming completion:
1. Run the tests against your changes
2. Run the linter
3. If touching data transformations, run an empirical data trace
Do NOT claim "all tests pass" without actually running them.

---

## Active Technologies
- **Core**: TypeScript 5.9.3, Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Zod 3.23.8
- **AI**: Gemini 3.1 Flash-Lite (chat + all AI), DSPy 2.6+ (self-improving), LangGraph 0.4.5
- **MCP**: 36 tools on AWS Lambda (Node.js 20), API Gateway REST, CloudWatch alarms
- **Infrastructure**: AWS Lambda (Node.js 20 / Python 3.11), CDK v2, S3, CloudFront, SES, SSM, EventBridge
- **Frontend**: Radix UI, Tailwind CSS, Recharts, lucide-react, @react-pdf/renderer, sonner
- **Other**: Stripe SDK 20.1.0, papaparse, xlsx/SheetJS, Capacitor (iOS), Qdrant Cloud, Mem0
