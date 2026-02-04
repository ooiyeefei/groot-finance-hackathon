# Quickstart: Leave & Time-Off Management

**Branch**: `001-leave-management`
**Last Updated**: 2026-02-03

## Prerequisites

- Node.js 20.x
- npm 10.x
- Convex CLI (`npm install -g convex`)
- Access to Convex dashboard

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start Convex dev server

```bash
npx convex dev
```

### 3. Start Next.js dev server

```bash
npm run dev
```

### 4. Seed test data (optional)

```bash
npx convex run migrations:seedLeaveTypes
npx convex run migrations:seedPublicHolidays
```

---

## Key Files

### Domain Structure

```
src/domains/leave-management/
├── types/index.ts           # Type definitions
├── hooks/
│   ├── use-leave-requests.ts    # Request CRUD
│   ├── use-leave-balances.ts    # Balance queries
│   └── use-team-calendar.ts     # Calendar data
├── lib/
│   ├── leave-workflow.ts        # Status transitions
│   ├── day-calculator.ts        # Business day calc
│   └── data-access.ts           # Convex wrappers
└── components/
    ├── leave-request-form.tsx   # Submit form
    ├── leave-balance-widget.tsx # Dashboard widget
    ├── team-calendar.tsx        # Manager calendar
    └── leave-type-settings.tsx  # Admin config
```

### Convex Functions

```
convex/functions/
├── leaveRequests.ts     # CRUD + approval workflow
├── leaveBalances.ts     # Balance queries + updates
├── leaveTypes.ts        # Leave type config
└── publicHolidays.ts    # Holiday management
```

---

## Common Tasks

### Create a leave request (employee)

```typescript
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'

const createRequest = useMutation(api.functions.leaveRequests.create)

await createRequest({
  businessId: 'xxx',
  leaveTypeId: 'yyy',
  startDate: '2026-02-10',
  endDate: '2026-02-12',
  notes: 'Family vacation'
})
```

### Get employee balance

```typescript
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

const balances = useQuery(api.functions.leaveBalances.getByUser, {
  userId: 'xxx',
  year: 2026
})
```

### Approve a request (manager)

```typescript
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'

const approve = useMutation(api.functions.leaveRequests.approve)

await approve({
  id: 'requestId',
  notes: 'Approved, enjoy your vacation!'
})
```

### Calculate business days

```typescript
import { calculateBusinessDays } from '@/domains/leave-management/lib/day-calculator'

const days = calculateBusinessDays(
  new Date('2026-02-10'),
  new Date('2026-02-14'),
  [new Date('2026-02-11')], // holidays
  true // exclude weekends
)
// Returns: 3 (Mon, Wed, Thu - excludes holiday and weekend)
```

---

## Testing

### Run unit tests

```bash
npm run test
```

### Run specific domain tests

```bash
npm run test -- src/domains/leave-management
```

### Run E2E tests

```bash
npm run test:e2e
```

### Test files to create

```
src/domains/leave-management/
├── __tests__/
│   ├── day-calculator.test.ts     # Unit tests
│   └── leave-workflow.test.ts     # Workflow tests
└── ...

tests/e2e/
└── leave-management.spec.ts       # E2E user journeys
```

---

## Development Workflow

### 1. Schema changes

Edit `convex/schema.ts`, then:

```bash
npx convex dev  # Auto-syncs in dev
npx convex deploy --yes  # Manual for prod
```

### 2. New Convex function

Create in `convex/functions/`, export in `convex/_generated/api.ts` automatically.

### 3. New component

Follow domain pattern:
1. Define types in `types/index.ts`
2. Create hook in `hooks/`
3. Implement component in `components/`
4. Add tests in `__tests__/`

### 4. Build verification

```bash
npm run build  # Must pass before commit
```

---

## Environment Variables

No new env vars required. Uses existing:

- `CONVEX_DEPLOYMENT` - Convex project
- `NEXT_PUBLIC_CONVEX_URL` - Convex API URL
- `NEXT_PUBLIC_CLERK_*` - Clerk auth

---

## Troubleshooting

### Convex sync issues

```bash
npx convex dev --clear  # Clear cache and resync
```

### Type errors after schema change

```bash
npx convex codegen  # Regenerate types
```

### Balance not updating

Check that approval mutation includes balance update:

```typescript
// In leaveRequests.approve mutation
await ctx.db.patch(balanceId, {
  used: currentUsed + request.totalDays,
  lastUpdated: Date.now()
})
```

---

## Related Documentation

- [Spec](./spec.md) - Feature specification
- [Data Model](./data-model.md) - Entity definitions
- [API Contracts](./contracts/leave-api.yaml) - OpenAPI schema
- [Research](./research.md) - Technical decisions
