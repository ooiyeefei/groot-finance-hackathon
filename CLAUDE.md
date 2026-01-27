# Coding Rules & Guidelines

Instructions for AI coding agents working on FinanSEAL.

## Workflow Rules

1. **Plan First**: Think through the problem, read relevant files, write plan to `tasks/todo.md`
2. **Get Approval**: Check in before implementing
3. **Track Progress**: Mark todo items complete as you go
4. **Explain Changes**: Give high-level explanation of each change
5. **Keep It Simple**: Minimal changes, avoid complexity
6. **Document Results**: Add review section to `tasks/todo.md` when done

## Project Context

**FinanSEAL**: Financial co-pilot for Southeast Asian SMEs
**Stack**: Next.js 15.4.6 + Convex + AWS Lambda + Gemini AI
**Docs**: See `docs/README.md` for full documentation

### Domain Structure
```
src/domains/
├── expense-claims/    # Expense submission & approval
├── invoices/         # Document processing & OCR
├── chat/             # AI assistant
├── analytics/        # Dashboards & metrics
├── users/            # Team management
└── ...               # See docs/architecture/overview.md
```

## Mandatory Rules

### Git Author (CRITICAL)
```bash
git config user.name "grootdev-ai"
git config user.email "dev@hellogroot.com"
```
**All commits must use this identity** - Vercel deployments require it.

### Build-Fix Loop
```bash
npm run build  # MUST pass before task completion
```
Fix errors and repeat until successful.

### Convex Deployment
- **Dev**: `npx convex dev` (auto-syncs)
- **Prod**: `npx convex deploy --yes` (manual after schema/function changes)
- **Common failure**: Forgetting to deploy to prod after Convex changes

### AWS CDK
```bash
cd infra
npx cdk deploy --profile groot-finanseal --region us-west-2
```
**Never make ad-hoc CLI changes** - all infrastructure via CDK.

### Prefer Modification Over Creation
- Do not create new files without approval
- Check if existing files can be modified first

## Code Style

### Design System
- **Use semantic tokens**: `bg-card`, `text-foreground`, `bg-primary`
- **Never hardcode colors**: No `bg-gray-700`, `text-white`
- **Layer hierarchy**: `bg-background` → `bg-surface` → `bg-card` → `bg-muted`
- **Check first**: `src/components/ui/`, `src/app/globals.css`

### Number Formatting
```typescript
import { formatNumber, formatCurrency } from '@/lib/utils/format-number'
formatCurrency(1234.56, 'USD')  // "$1,234.56"
```

### Date Handling
```typescript
import { formatBusinessDate } from '@/lib/utils'
formatBusinessDate('2025-10-31')  // "Oct 31, 2025" (no timezone shift)
```

### AI Model
**Always use Gemini 3 Flash Preview**:
- Python: `gemini/gemini-3-flash-preview`
- TypeScript: `gemini-3-flash-preview`
- Temperature: 0.1, Timeout: 60s+

## Quick References

| Resource | Location |
|----------|----------|
| Full Documentation | `docs/README.md` |
| UI Components | `src/components/ui/CLAUDE.md` |
| API Reference | `src/app/api/v1/CLAUDE.md` |
| Expense Claims | `src/domains/expense-claims/CLAUDE.md` |
| App Patterns | `src/app/CLAUDE.md` |
