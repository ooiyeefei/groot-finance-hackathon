# Task: Fix Currency Preference Settings UX Issues

## Problem Statement
Two critical issues identified:
1. Personal Settings page throws error when saving currency preferences
2. UX inconsistency between Personal Settings and Business Settings

## Root Causes

### Personal Settings (`src/domains/account-management/components/user-profile-section.tsx`)
- **Line 50**: Using `PUT` method, but API only supports `GET` and `PATCH`
- **Line 69**: Using browser `alert()` for error messages (poor UX)
- **Line 171-184**: Manual "Save Preferences" button required

### Business Settings (`src/domains/account-management/components/business-profile-settings.tsx`)
- **Line 148**: Correctly uses `PATCH` method ✅
- **Line 162-174**: Toast notifications for feedback ✅
- **Line 180-185**: Auto-save on currency change ✅

## Implementation Plan

### Task 1: Fix HTTP Method Error
**File**: `src/domains/account-management/components/user-profile-section.tsx`
**Changes**:
- [ ] Line 50: Change `method: 'PUT'` to `method: 'PATCH'`
- [ ] Verify request body matches API expectations

**Impact**: Fixes "Failed to save preferences" error

---

### Task 2: Add Toast Notification System
**File**: `src/domains/account-management/components/user-profile-section.tsx`
**Changes**:
- [ ] Line 6: Import `import { useToast } from '@/components/ui/toast'`
- [ ] Line 13-19: Add `const { addToast } = useToast()` hook
- [ ] Line 64-72: Replace success message state with toast notification
- [ ] Line 68-69: Replace `alert()` with `addToast()` for errors

**Example Implementation**:
```typescript
// Success case
addToast({
  type: 'success',
  title: 'Currency updated',
  description: `Preference changed to ${preferredCurrency}`
})

// Error case
addToast({
  type: 'error',
  title: 'Failed to update currency',
  description: error.message || 'Unable to save currency preference'
})
```

**Impact**: Professional error handling consistent with rest of app

---

### Task 3: Implement Auto-Save on Currency Change
**File**: `src/domains/account-management/components/user-profile-section.tsx`
**Changes**:
- [ ] Line 126-136: Add `onChange` handler that triggers save immediately
- [ ] Add debouncing/loading state during save
- [ ] Add visual feedback (spinner/timestamp) like Business Settings

**Pattern** (from Business Settings line 180-185):
```typescript
const handleCurrencyChange = async (newCurrency: SupportedCurrency) => {
  if (newCurrency === preferredCurrency) return

  setPreferredCurrency(newCurrency)
  await saveCurrencyPreference(newCurrency)
}
```

**Impact**: Consistent UX - no manual save button needed

---

### Task 4: Remove Manual Save Button
**File**: `src/domains/account-management/components/user-profile-section.tsx`
**Changes**:
- [ ] Line 161-185: Remove "Save Preferences" button section
- [ ] Line 17-18: Remove `saving` and `successMessage` state
- [ ] Add real-time save indicator (like Business Settings line 430-434)

**Impact**: Cleaner UI, consistent with Business Settings

---

### Task 5: Extract Currency Save Function
**File**: `src/domains/account-management/components/user-profile-section.tsx`
**Changes**:
- [ ] Refactor `handleSave()` into `saveCurrencyPreference()` function
- [ ] Add `isCurrencySaving` state for loading indicator
- [ ] Follow same pattern as Business Settings (line 143-178)

**Impact**: Better code organization, easier to maintain

---

## Testing Checklist

- [ ] **Test 1**: Change currency in Personal Settings → Should auto-save without button
- [ ] **Test 2**: Verify toast notification appears on success
- [ ] **Test 3**: Simulate API error → Verify user-friendly error message (no alert)
- [ ] **Test 4**: Verify currency persists after page refresh
- [ ] **Test 5**: Test in both light and dark mode
- [ ] **Test 6**: Run `npm run build` → Verify no TypeScript errors

---

## File Modifications Summary

### Modified Files:
1. `src/domains/account-management/components/user-profile-section.tsx` - Main component fix

### Lines to Change:
- Line 6: Add toast import
- Line 13: Add useToast hook
- Line 17-18: Remove old state variables
- Line 45-73: Refactor handleSave() → saveCurrencyPreference()
- Line 126-136: Add handleCurrencyChange with auto-save
- Line 161-185: Remove save button, add save indicator

### API Endpoint (No changes needed):
- `src/app/api/v1/users/profile/route.ts` - Already supports PATCH correctly ✅

---

## Expected Outcome

**Before:**
- ❌ Error when clicking "Save Preferences"
- ❌ Browser alert() for errors
- ❌ Inconsistent UX with Business Settings
- ❌ Manual save button required

**After:**
- ✅ Currency saves automatically on change
- ✅ Professional toast notifications
- ✅ Consistent UX across both settings pages
- ✅ No manual save button needed
- ✅ Real-time save indicator

---

## Review Section
(To be filled after implementation)

### Changes Made:


### Verification Results:


### Notes:


