# Error Handling Improvement Plan

## Problem Statement

When Lambda processing fails early (e.g., Convex server error), the document gets stuck in "processing" state forever because:
1. The first Convex call fails → workflow exception thrown
2. Error handler tries `mark_as_failed()` → also fails (same Convex issue)
3. Document status never updates → frontend shows infinite spinner

## Solution: Multi-Layer Error Handling

### Layer 1: Lambda Error Patterns (types_def.py)
- [x] Add Convex-specific error patterns for user-friendly messages

### Layer 2: Frontend Timeout Detection (processing-step.tsx)
- [x] Add max polling duration (4 minutes already exists)
- [x] Add stuck detection: if status stays "processing" too long, show timeout error

### Layer 3: Dashboard Error Display
- [x] Show `errorMessage` field when status is 'failed' on personal dashboard

### Layer 4: Stale Processing Cleanup (Future - Optional)
- [ ] Scheduled Convex action to mark stale "processing" claims as failed
- [ ] Runs every 15 minutes, marks claims stuck >10 minutes

## Implementation

### T1: Add Convex error patterns to Lambda (types_def.py)
```python
# Add to TECHNICAL_ERROR_PATTERNS
("convex", "We're having trouble saving your data. Please try again."),
("server error", "A temporary server issue occurred. Please try again in a moment."),
("mutation", "We couldn't save the results. Please try again."),
```

### T2: Add "processing" timeout detection (processing-step.tsx)
- Track time in "processing" status during polling
- If >3 minutes in processing with no progress, show timeout error

### T3: Display error message on personal dashboard
- Show error reason when claim status is 'failed'
- Add retry button for failed claims

## Files to Modify
1. `src/lambda/document-processor-python/types_def.py` - Add error patterns
2. `src/domains/expense-claims/components/processing-step.tsx` - Add timeout
3. `src/domains/expense-claims/components/personal-expense-dashboard.tsx` - Show errors
