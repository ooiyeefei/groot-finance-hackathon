# FinanSEAL Post-Refactor Todo List

## Context Summary

After completing a major domain-driven architecture (DDD) refactoring, migrating from component-based to domain-based structure and updating all API endpoints from legacy paths to `/api/v1/` pattern. The build is currently passing and core functionality has been preserved, but several optimization and validation tasks remain to ensure production readiness.

## Priority 1: Critical Validation Tasks

###  Completed Tasks
- [x] Update documentation to reflect domain architecture
- [x] Create domain interaction diagrams for new structure
- [x] Update onboarding docs for new developers
- [x] Fix all legacy API endpoint references
- [x] Verify build passes after major refactoring

### =% Task 1: Dead Code Audit & Cleanup

**Context**: During API migration, we discovered unused code paths that weren't caught during development. Need systematic detection and removal.

**Actions Required**:
```bash
# Install dead code detection tools
npm install --save-dev ts-prune @typescript-eslint/eslint-plugin webpack-bundle-analyzer

# Run analysis
npx ts-prune | tee dead-exports.log
npm run build -- --analyze  # If configured for bundle analysis
```

**Focus Areas**:
- Remove unused exports found by ts-prune
- Clean up legacy `/src/components/` paths missed in migration
- Validate all imports in expense-claims, applications, invoices domains
- Remove duplicate or unused React components

**Files to Audit** (known suspects):
- `src/domains/expense-claims/components/expense-approval-dashboard.tsx` - Had unused imports
- `src/domains/applications/components/application-detail-container.tsx` - Multiple image-url calls
- Any remaining files in old `/src/components/` structure
- Check for unused API route files

**Success Criteria**:
- ts-prune shows minimal unused exports
- Bundle size doesn't increase significantly post-cleanup
- All ESLint unused import warnings resolved

### =% Task 2: API v1 Endpoint Production Verification

**Context**: All endpoints migrated to v1, but need to verify they work correctly in production environment.

**Actions Required**:
1. **Create API Test Suite**:
   ```bash
   # Test all migrated endpoints
   curl -X GET $API_BASE/api/v1/expense-claims
   curl -X GET $API_BASE/api/v1/applications
   curl -X GET $API_BASE/api/v1/invoices
   curl -X POST $API_BASE/api/v1/expense-claims -d '{test_data}'
   ```

2. **End-to-End Workflow Testing**:
   - Expense submission � DSPy extraction � Manager approval � Accounting entry creation
   - Invoice upload � OCR processing � Transaction creation
   - Application workflow � Document processing � Status updates

3. **Error Handling Validation**:
   - Test authentication failures
   - Test RLS policy enforcement
   - Verify proper HTTP status codes
   - Check error message clarity

**Files to Monitor**:
- All `/src/app/api/v1/` route handlers
- Trigger.dev background job endpoints
- Frontend API client calls in domain components

**Success Criteria**:
- All v1 endpoints return expected responses
- Authentication and authorization work correctly
- Background jobs trigger successfully
- Frontend error handling displays correctly

### =� Task 3: Performance Impact Assessment

**Context**: Major refactoring may have introduced performance regressions. Need baseline measurement.

**Actions Required**:
1. **Bundle Analysis**:
   ```bash
   npm run build
   npx webpack-bundle-analyzer .next/static/chunks/*.js
   ```

2. **Performance Metrics**:
   - Page load times for main routes
   - Hot reload speed in development
   - Build time comparison (before/after refactor)
   - Memory usage during development

3. **Load Testing**:
   ```bash
   # Test API endpoints under load
   npm install -g artillery
   artillery quick --count 10 --num 5 http://localhost:3000/api/v1/expense-claims
   ```

**Key Metrics to Track**:
- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- Bundle size by domain
- API response times
- Database query performance

**Success Criteria**:
- No significant performance regression (>20% slower)
- Bundle size increase <10% from baseline
- Hot reload remains under 5 seconds
- API response times <500ms for simple queries

## Priority 2: Code Quality & Type Safety

### = Task 4: Type Safety Audit

**Context**: Rapid refactoring may have introduced `any` types or loose typing. Need strict type safety.

**Actions Required**:
```bash
# Enable strict TypeScript checking
npx tsc --noEmit --strict

# Check for any types
grep -r "any" src/domains/ --include="*.ts" --include="*.tsx"
```

**Focus Areas**:
- Review all domain interfaces and types
- Ensure API contracts match between frontend/backend
- Validate Supabase type definitions are current
- Check Trigger.dev payload types

**Files to Audit**:
- `src/domains/*/types/*.ts` - All domain type definitions
- `src/types/api-contracts.ts` - API interface definitions
- `src/domains/*/lib/data-access.ts` - Database query types
- `src/app/api/v1/*/route.ts` - API route parameter types

**Success Criteria**:
- Zero `any` types in production code
- All API calls properly typed
- Supabase queries have correct type inference
- Build passes with `--strict` mode

### >� Task 5: Integration Testing for Cross-Domain Interactions

**Context**: Domain isolation needs validation to ensure proper inter-domain communication.

**Actions Required**:
1. **Create Integration Test Suite**:
   ```bash
   mkdir -p src/__tests__/integration
   # Test cross-domain workflows
   ```

2. **Test Scenarios**:
   - Expense Claims � Analytics domain data aggregation
   - Chat domain � Financial data queries across domains
   - Users domain � Permission enforcement in other domains
   - Applications � Document processing � Analytics reporting

3. **Domain Boundary Testing**:
   - Verify no direct imports between domain internals
   - Test shared utilities work correctly
   - Validate RLS policies across domains

**Success Criteria**:
- All cross-domain workflows function correctly
- Domain boundaries are respected
- Shared utilities work without side effects
- RLS policies enforce proper data isolation

## Priority 3: Enhanced Monitoring & Developer Experience

### =� Task 6: Domain-Specific Monitoring Setup

**Context**: New domain architecture needs monitoring to track domain-specific metrics and errors.

**Actions Required**:
1. **Error Tracking by Domain**:
   ```typescript
   // Add domain tags to error reporting
   Sentry.setTag('domain', 'expense-claims')
   Sentry.captureException(error)
   ```

2. **Performance Monitoring**:
   - API response time by domain
   - Database query performance by domain
   - Background job success rates by domain
   - Frontend component render performance

3. **Business Metrics Tracking**:
   - Expense claim processing times
   - OCR accuracy rates by domain
   - User adoption rates by domain features

**Implementation Files**:
- Add monitoring to each domain's API routes
- Instrument key business workflows
- Set up domain-specific dashboards
- Configure alerting for domain failures

**Success Criteria**:
- Domain-specific error rates visible
- Performance metrics tracked per domain
- Business KPIs monitored
- Alert fatigue minimized

### =� Task 7: Development Experience Optimization

**Context**: Domain architecture requires updated tooling and scripts for optimal developer experience.

**Actions Required**:
1. **IDE Configuration Updates**:
   ```json
   // .vscode/settings.json updates for domain imports
   {
     "typescript.preferences.includePackageJsonAutoImports": "auto",
     "typescript.suggest.autoImports": true,
     "path-intellisense.mappings": {
       "@/domains": "${workspaceFolder}/src/domains"
     }
   }
   ```

2. **Domain-Specific Scripts**:
   ```bash
   # Add to package.json
   "scripts": {
     "test:domain:expense-claims": "jest src/domains/expense-claims",
     "build:domain:invoices": "next build --experimental-build-mode production",
     "lint:domains": "eslint src/domains/**/*.{ts,tsx}"
   }
   ```

3. **Hot Reload Optimization**:
   - Configure Next.js for faster domain-based reloads
   - Optimize import paths for development speed
   - Set up domain-specific test watchers

**Success Criteria**:
- IDE autocompletion works for domain imports
- Domain-specific scripts improve workflow
- Hot reload time improved for domain changes
- Developer onboarding time reduced

## Priority 4: Strategic Enhancements

### =� Task 8: Domain Architecture Leverage Opportunities

**Context**: Now that domains are properly separated, can implement advanced patterns.

**Enhancement Opportunities**:

1. **Domain-Specific Caching Strategies**:
   ```typescript
   // Implement per-domain caching
   const expenseClaimsCache = new Map()
   const invoicesCache = new Map()
   ```

2. **Feature Flag Organization by Domain**:
   ```typescript
   // Domain-scoped feature flags
   const expenseClaimsFlags = {
     advancedApprovalWorkflow: true,
     bulkProcessing: false
   }
   ```

3. **Micro-Frontend Preparation** (Optional):
   - Evaluate domains for micro-frontend splitting
   - Ensure domain boundaries support independent deployment
   - Test domain isolation for separate build pipelines

4. **Domain-Level User Permissions**:
   ```typescript
   // Fine-grained permissions by domain
   interface UserPermissions {
     expenseClaims: ['create', 'approve', 'reimburse']
     invoices: ['upload', 'process', 'categorize']
     analytics: ['view', 'export']
   }
   ```

**Success Criteria**:
- Domain-specific optimizations implemented
- Feature flags organized logically
- Permission system scales with domains
- Architecture supports future micro-frontend migration

### = Task 9: Dependency Analysis & Cleanup

**Context**: Ensure domains don't have circular dependencies and shared utilities are properly organized.

**Actions Required**:
```bash
# Install dependency analysis tools
npm install --save-dev dependency-cruiser madge

# Analyze domain dependencies
npx madge --circular src/domains/
npx depcruiser --validate .dependency-cruiser.js src
```

**Focus Areas**:
- Map all inter-domain dependencies
- Identify shared utilities that should move to `/src/lib/shared/`
- Ensure no circular dependencies between domains
- Validate import patterns follow architecture rules

**Files to Create**:
- `.dependency-cruiser.js` - Rules for domain boundaries
- `src/lib/shared/` - Properly organized shared utilities
- Domain dependency documentation

**Success Criteria**:
- Zero circular dependencies detected
- Clear domain dependency hierarchy established
- Shared utilities properly categorized
- Architecture rules enforced by tooling

## Review Section

### Major Accomplishments 
- **Domain Architecture Migration**: Successfully migrated from component-based to domain-driven architecture
- **API v1 Migration**: All legacy API endpoints updated to v1 pattern
- **Build Stability**: Build passes consistently after major refactoring
- **Documentation**: Comprehensive docs created for new architecture
- **Dead Code Cleanup**: Initial cleanup of unused imports and endpoints completed

### Lessons Learned =�
- **Systematic Search**: Universal search for old API patterns caught issues that manual review missed
- **Build-First Approach**: Mandatory build validation prevented broken deployments
- **Domain Isolation**: Clear boundaries improved code organization and maintainability
- **Documentation Importance**: Comprehensive docs essential for team adoption

### Next Development Priorities <�
1. **Performance Validation** - Ensure refactor didn't introduce regressions
2. **Dead Code Elimination** - Systematic cleanup of unused code paths
3. **Monitoring Setup** - Domain-specific monitoring and alerting
4. **Developer Experience** - Optimized tooling for domain-based development

### Risk Assessment �
- **Performance Impact**: Large refactor may have hidden performance issues
- **Dead Code**: Unused code paths may cause confusion or security issues
- **Domain Boundaries**: Need validation that boundaries are properly enforced
- **Production Stability**: Need thorough testing before production deployment

---

**Last Updated**: 2025-01-15
**Status**: Post-Major Refactor Cleanup Phase
**Next Review**: After completing Priority 1 tasks

---

## Recent Fixes Completed (2025-01-15)

### Issues Resolved ✅

**1. Accounting Category Mapping Issue**
- **Problem**: Both CSV exports and monthly reports were showing "GENERAL_EXPENSES" instead of proper business accounting categories like "travel_expenses", "entertainment_meals", etc.
- **Root Cause**: The APIs were using hardcoded 'GENERAL_EXPENSES' as fallback instead of utilizing the existing `mapExpenseCategoryToAccounting()` function
- **Solution**:
  - Imported and used `mapExpenseCategoryToAccounting` function from `/src/domains/expense-claims/lib/expense-category-mapper.ts`
  - Replaced hardcoded fallbacks with proper category mapping in both APIs
  - Fixed 3 instances in `/src/app/api/v1/expense-claims/reports/route.ts` (lines 172, 193, 267)
  - Fixed 1 instance in `/src/app/api/v1/expense-claims/reports/export/route.ts` (lines 95, 139)

**2. UI Accessibility Issue**
- **Problem**: Category badges had light gray text (`text-gray-300`) with no proper hover contrast
- **Solution**: Added hover states with proper contrast:
  - `hover:bg-gray-200/90 hover:text-gray-900` for light background with dark text
  - Added `transition-colors` for smooth transitions
  - Added `cursor-default` for consistent UX

### Files Modified
1. `/src/app/api/v1/expense-claims/reports/route.ts` - Added proper category mapping
2. `/src/app/api/v1/expense-claims/reports/export/route.ts` - Fixed CSV export categories
3. `/src/domains/expense-claims/components/monthly-report-generator.tsx` - Enhanced badge accessibility

### Impact
- Monthly reports now display proper IFRS-compliant accounting categories
- CSV exports show accurate category classifications for compliance reporting
- Improved UI accessibility with proper text contrast on hover
- Build validation passed successfully

---

## Session 2 Fixes Completed (2025-01-15 Continuation)

### Team Member Dropdown Investigation & Resolution ✅

**3. Admin Team Member Access Issue**
- **Problem**: Admin user's Employee dropdown in monthly report generator only showing "My Reports" instead of all business team members (3 total members expected)
- **Root Cause Analysis**:
  - Initial investigation revealed user was testing on personal dashboard (`/expense-claims`) instead of manager approvals dashboard (`/manager/approvals`)
  - Personal dashboard uses `<MonthlyReportGenerator personalOnly={true} />` which intentionally shows only "My Reports"
  - Manager dashboard uses `<MonthlyReportGenerator personalOnly={false} />` which should show all team members
- **Solution**:
  - Fixed team API endpoint permissions in `/src/app/api/v1/users/team/route.ts` to explicitly allow both admin and manager roles
  - Added comprehensive debug logging throughout the data flow for troubleshooting
  - Updated frontend data structure handling to properly access `result.data.users` instead of `result.data` as an array
  - Implemented extensive logging in monthly report generator component to trace API calls and responses

**4. Manager Dashboard UI Layout Overflow**
- **Problem**: Manager approvals dashboard had overflow issues with text and icons, user requested 2:1 column ratio with Company Analytics on left and Priority Approvals on right
- **Root Cause**: Original layout used `grid-cols-2` with equal spacing, causing overflow in compact Priority Approvals section
- **Solution**:
  - Restructured `ManagementOverviewContent` in `/src/domains/expense-claims/components/expense-approval-dashboard.tsx`
  - Changed from `grid-cols-2` to `grid-cols-3` layout system
  - Company Analytics: `lg:col-span-2` (2/3 width, left side)
  - Priority Approvals: `lg:col-span-1` (1/3 width, right side, more compact)
  - Added text truncation and smaller font sizes for compact display
  - Implemented overflow handling with `truncate` class and substring logic for long descriptions

### Technical Implementation Details

**Debug Logging Added:**
```typescript
// Frontend (monthly-report-generator.tsx)
console.log('[Monthly Report] 🚀 useEffect triggered - personalOnly:', personalOnly)
console.log('[Monthly Report] 🌐 Fetching team members from /api/v1/users/team')
console.log('[Monthly Report] 📊 Team API response:', result)
console.log('[Monthly Report] 👥 Team members processed:', teamMembers)

// Backend (team API route.ts)
console.log('[Team V1 API] 📊 User context:', { userId, businessId, role, permissions })
console.log('[Team V1 API] 🔍 Calling getTeamMembers with:', { userId, businessId })
console.log('[Team V1 API] 📋 Team data received:', { userCount, users })
```

**API Permission Fix:**
```typescript
// Before: Restrictive check
if (!userContext.permissions.manager) { ... }

// After: Explicit admin and manager support
if (!userContext.permissions.manager && !userContext.permissions.admin) {
  console.log('[Team V1 API] ❌ Permission denied - manager:', manager, 'admin:', admin)
  return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 })
}
```

**Layout Restructuring:**
```typescript
// Before: Equal columns with overflow
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

// After: 2:1 ratio with proper responsive handling
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div className="lg:col-span-2"> {/* Company Analytics - 2/3 width */}
  <div className="lg:col-span-1"> {/* Priority Approvals - 1/3 width, compact */}
```

### Files Modified
1. `/src/app/api/v1/users/team/route.ts` - Fixed admin permissions and added comprehensive debug logging
2. `/src/domains/expense-claims/components/monthly-report-generator.tsx` - Enhanced with debug logging and data structure fixes
3. `/src/domains/expense-claims/components/expense-approval-dashboard.tsx` - Restructured layout with 2:1 column ratio and overflow fixes

### Key Findings
- **Dashboard Context Matters**: Personal dashboard (`personalOnly={true}`) vs Manager dashboard (`personalOnly={false}`) have different behaviors by design
- **Permission Model Working**: Admin users have proper permissions, the issue was testing context and API endpoint restrictions
- **Debug Logging Value**: Comprehensive logging enabled rapid diagnosis and will help with future troubleshooting
- **UI Responsiveness**: 2:1 column layout provides better space utilization and prevents overflow issues

### Validation Results
- ✅ Build passes successfully with all changes
- ✅ Admin permissions properly configured for team API access
- ✅ Debug logging implemented throughout the data flow
- ✅ UI layout restructured with requested 2:1 ratio
- ✅ Text overflow issues resolved with truncation and compact design
- ✅ All changes maintain existing functionality while fixing identified issues