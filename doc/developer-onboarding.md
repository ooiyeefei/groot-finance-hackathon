# Developer Onboarding Guide - FinanSEAL

Welcome to the FinanSEAL development team! This guide will help you get up to speed with our domain-driven architecture and development practices.

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- Git with SSH access to repository
- Supabase CLI (optional, for database management)
- VS Code with TypeScript and Tailwind CSS extensions

### Setup
```bash
# Clone repository
git clone <repository-url>
cd finanseal-invoice

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Configure your Supabase, Clerk, and Trigger.dev keys

# Start development server
npm run dev

# Verify build works
npm run build
```

## Architecture Overview

FinanSEAL uses **Domain-Driven Design (DDD)** architecture where business logic is organized into self-contained domains.

### Key Principles
1. **Domain Isolation**: Each domain is self-contained with its own components, hooks, and services
2. **API v1 Structure**: All new APIs use `/api/v1/{domain}/` pattern
3. **Type Safety**: Strict TypeScript with domain-specific types
4. **Build-First Development**: All changes must pass `npm run build` before completion

## Domain Structure

```
src/domains/
├── account-management/     # Business management, team invitations
├── analytics/              # Financial dashboards, real-time metrics
├── applications/           # Business application workflows
├── audit/                  # System audit logs, compliance
├── chat/                   # AI assistant, conversation management
├── expense-claims/         # Employee expense submission/approval
├── invoices/              # Document processing, OCR extraction
├── system/                # System configuration, webhooks
├── tasks/                 # Background job monitoring
├── users/                 # User profiles, team management
└── utilities/             # Shared utilities, currency conversion
```

Each domain follows this structure:
```
domain/
├── components/            # React components for this domain
├── hooks/                # Domain-specific React hooks
├── lib/                  # Business logic and data access
├── types/                # TypeScript interfaces
└── utils/                # Domain utilities
```

## Core Development Rules

### Rule 1: Prefer Modification Over Creation
Always try to update existing files before creating new ones. This maintains a clean project structure.

**Example**: Update existing `page.tsx` instead of creating new route files unless explicitly required.

### Rule 2: Build-Fix Loop (Mandatory)
After any code change:
1. Run `npm run build`
2. If build fails, fix the error
3. Repeat until build succeeds
4. Only then consider your task complete

### Rule 3: Domain Boundaries
- Keep domain logic within domain boundaries
- Use shared utilities in `/src/lib/` for cross-domain needs
- Import from other domains only through well-defined interfaces

## Working with Different Domains

### Financial Domains (expense-claims, invoices, applications)
These handle financial data processing and must maintain accounting compliance:

**Key Concepts**:
- **Expense Claims**: Only approved claims create accounting entries (IFRS compliance)
- **Invoices**: Document processing with OCR and transaction creation
- **Applications**: Business workflow management with document processing

**Important Files**:
```
expense-claims/
├── components/expense-submission-form.tsx    # Main submission UI
├── hooks/use-expense-form.ts                 # Form state management
├── lib/data-access.ts                        # Database operations
└── lib/expense-categorizer.ts                # Auto-categorization logic

invoices/
├── components/document-analysis-modal.tsx    # OCR results display
├── lib/data-access.ts                        # Document operations
└── types/invoice.ts                          # Invoice type definitions
```

### Supporting Domains

**Analytics Domain**:
- Real-time financial dashboards
- Cross-domain data aggregation
- Performance metrics

**Chat Domain**:
- AI assistant powered by LangGraph
- Document citations and context
- Multi-language support

**Users Domain**:
- Role-based access control (RBAC)
- Team management
- User profile management

## API Development Guidelines

### API v1 Pattern
All new APIs must follow the v1 pattern:
```typescript
// ✅ Correct
export async function GET(request: Request) {
  // Implementation
}

// File location: src/app/api/v1/{domain}/{endpoint}/route.ts
```

### Common Endpoints by Domain
```
/api/v1/expense-claims/
├── GET     /           # List expense claims
├── POST    /           # Create expense claim
├── PUT     /{id}       # Update status
├── GET     /analytics  # Dashboard data
└── GET     /categories # Category management

/api/v1/invoices/
├── GET     /           # List invoices
├── POST    /           # Create invoice
├── GET     /{id}/image-url  # Get document image
└── PUT     /{id}       # Update invoice

/api/v1/applications/
├── GET     /           # List applications
├── POST    /           # Create application
└── GET     /{id}       # Get application details
```

### Error Handling Pattern
```typescript
try {
  const result = await supabase
    .from('table')
    .select('*')
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(result)
} catch (error) {
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  )
}
```

## Database Integration

### Supabase with Row Level Security (RLS)
All database queries automatically enforce RLS policies based on user context.

**Key Tables**:
- `expense_claims`: Employee expense submissions
- `accounting_entries`: Posted financial transactions (only created when approved)
- `line_items`: Detailed transaction line items
- `documents`: Uploaded files with OCR status

### Example Query Pattern
```typescript
import { createClient } from '@/lib/supabase-server'

export async function getExpenseClaims(userId: string) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('expense_claims')
    .select(`
      id,
      status,
      total_amount,
      currency,
      vendor_name,
      created_at
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}
```

## Background Jobs with Trigger.dev

### Job Structure
```typescript
// src/trigger/example-job.ts
import { task } from "@trigger.dev/sdk/v3";

export const processDocument = task({
  id: "process-document",
  run: async (payload: { documentId: string }) => {
    // Job implementation
    console.log(`Processing document ${payload.documentId}`)

    // Return result
    return { success: true, documentId: payload.documentId }
  }
})
```

### Triggering Jobs
```typescript
import { tasks } from "@trigger.dev/sdk/v3";
import { processDocument } from "@/trigger/process-document";

// In your API route
const result = await tasks.trigger<typeof processDocument>(
  "process-document",
  { documentId }
);
```

## Frontend Development

### Component Patterns

**Domain Components**:
```typescript
// src/domains/expense-claims/components/expense-form.tsx
interface ExpenseFormProps {
  onSubmit: (data: ExpenseClaimData) => void
  initialData?: Partial<ExpenseClaimData>
}

export function ExpenseForm({ onSubmit, initialData }: ExpenseFormProps) {
  // Component implementation
}
```

**Shared UI Components**:
```typescript
// src/components/ui/button.tsx - Shared across all domains
import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline'
}
```

### State Management
Use React hooks for local state, with custom hooks for complex domain logic:

```typescript
// src/domains/expense-claims/hooks/use-expense-form.ts
export function useExpenseForm(initialData?: Partial<ExpenseClaimData>) {
  const [formData, setFormData] = useState(initialData || {})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submitExpense = async (data: ExpenseClaimData) => {
    setIsSubmitting(true)
    try {
      await apiClient.post('/api/v1/expense-claims', data)
      // Handle success
    } catch (error) {
      // Handle error
    } finally {
      setIsSubmitting(false)
    }
  }

  return { formData, setFormData, submitExpense, isSubmitting }
}
```

## Testing Guidelines

### Test Structure
```
src/domains/{domain}/
├── __tests__/
│   ├── components/      # Component tests
│   ├── hooks/           # Hook tests
│   └── lib/             # Business logic tests
```

### Example Component Test
```typescript
import { render, screen } from '@testing-library/react'
import { ExpenseForm } from '../expense-form'

describe('ExpenseForm', () => {
  it('renders form fields correctly', () => {
    render(<ExpenseForm onSubmit={jest.fn()} />)

    expect(screen.getByLabelText('Vendor Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Amount')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument()
  })
})
```

## Common Development Tasks

### Adding a New Feature to Expense Claims

1. **Create Component** in `src/domains/expense-claims/components/`
2. **Add Business Logic** in `src/domains/expense-claims/lib/`
3. **Create API Endpoint** in `src/app/api/v1/expense-claims/`
4. **Add Types** in `src/domains/expense-claims/types/`
5. **Write Tests** in `src/domains/expense-claims/__tests__/`
6. **Run Build** to verify no errors

### Creating a New Domain

1. **Create Directory Structure**:
   ```bash
   mkdir -p src/domains/new-domain/{components,hooks,lib,types,utils}
   ```

2. **Add API Routes**:
   ```bash
   mkdir -p src/app/api/v1/new-domain
   ```

3. **Update Domain Architecture** documentation

4. **Add to Import Paths** in `tsconfig.json` if needed

### Database Schema Changes

1. **Create Migration** using Supabase CLI or dashboard
2. **Update Types** to match new schema
3. **Update Data Access** functions
4. **Test with Build Verification**

## Debugging and Troubleshooting

### Common Issues

**Build Errors**:
- Check import paths - ensure they follow domain boundaries
- Verify TypeScript types are correctly defined
- Run `npm run type-check` for detailed type errors

**API Issues**:
- Check RLS policies if data isn't appearing
- Verify authentication context is properly passed
- Use Supabase dashboard to test queries directly

**Background Job Issues**:
- Check Trigger.dev dashboard for job status
- Verify environment variables are set correctly
- Use console.log for debugging job execution

### Development Tools

**VS Code Extensions**:
- TypeScript Hero (import organization)
- Tailwind CSS IntelliSense
- ES7+ React/Redux/React-Native snippets
- Thunder Client (API testing)

**Browser Extensions**:
- React Developer Tools
- Redux DevTools (if using Redux)

## Code Review Guidelines

### Before Submitting PR

1. **Build Check**: Ensure `npm run build` passes
2. **Type Check**: Run `npm run type-check`
3. **Lint Check**: Run `npm run lint`
4. **Test Coverage**: Add tests for new functionality
5. **Documentation**: Update relevant docs if needed

### Code Review Checklist

- [ ] Follows domain boundaries
- [ ] Uses correct API v1 patterns
- [ ] Proper error handling
- [ ] TypeScript types are accurate
- [ ] No circular dependencies
- [ ] Shared logic extracted appropriately
- [ ] Database queries use RLS correctly

## Getting Help

### Resources
1. **Architecture Documentation**: `doc/domain-architecture.md`
2. **API Documentation**: `doc/api-v1-endpoints.md`
3. **Test Cases**: `doc/test-cases-expense-claims.md`
4. **Main Project README**: `CLAUDE.md`

### Team Contacts
- **Architecture Questions**: Domain leads or senior developers
- **Database Issues**: Backend team
- **UI/UX Questions**: Frontend team lead
- **DevOps/Deployment**: Infrastructure team

### Development Workflow
1. Create feature branch from `main`
2. Implement changes following domain boundaries
3. Ensure build passes locally
4. Submit PR with clear description
5. Address review feedback
6. Merge to `main` after approval

## Next Steps

After completing this onboarding:

1. **Set up local environment** and verify all systems work
2. **Review existing code** in 1-2 domains to understand patterns
3. **Pick up first task** - usually a small bug fix or feature enhancement
4. **Ask questions** - the team is here to help you succeed!

Welcome to the team! 🚀