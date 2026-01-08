# Quickstart: UX/UI Theme Consistency & Layout Shift Prevention

**Feature**: 005-uiux-theme-cls
**Date**: 2026-01-07

## Overview

This guide provides step-by-step instructions for converting hardcoded Tailwind colors to semantic tokens and adding skeleton loaders to prevent CLS.

---

## Prerequisites

1. Branch checked out: `005-uiux-theme-cls`
2. Dependencies installed: `npm install`
3. Design system docs read:
   - `src/components/ui/CLAUDE.md`
   - `src/app/CLAUDE.md`

---

## Quick Reference: Color Conversion

### Background Colors

```tsx
// ❌ BEFORE
<div className="bg-gray-700">
<div className="bg-gray-800">
<div className="bg-white">

// ✅ AFTER
<div className="bg-card">
<div className="bg-card">
<div className="bg-card">
```

### Text Colors

```tsx
// ❌ BEFORE
<span className="text-white">
<span className="text-black">
<span className="text-gray-400">

// ✅ AFTER (depends on context)
<span className="text-foreground">           // On bg-card/bg-background
<span className="text-primary-foreground">   // On bg-primary
<span className="text-muted-foreground">     // Secondary text
```

### Border Colors

```tsx
// ❌ BEFORE
<div className="border border-gray-600">
<div className="border border-gray-700">

// ✅ AFTER
<div className="border border-border">
```

### Button/Action Backgrounds

```tsx
// ❌ BEFORE
<button className="bg-blue-600 hover:bg-blue-700 text-white">
<button className="bg-green-600 hover:bg-green-700 text-white">

// ✅ AFTER
<button className="bg-primary hover:bg-primary/90 text-primary-foreground">
<button className="bg-action-view hover:bg-action-view-hover text-action-view-foreground">
```

---

## Quick Reference: Badge Patterns

### Status Badges

```tsx
// ✅ Standard badge pattern
const badgeClasses = {
  approved: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30',
  pending: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30',
  rejected: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30',
  draft: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30',
  default: 'bg-muted text-muted-foreground border border-border'
}

<Badge className={badgeClasses[status]}>{status}</Badge>
```

---

## Quick Reference: Skeleton Loaders

### Adding Skeleton to Loading State

```tsx
import { Skeleton } from '@/components/ui/skeleton'

// ❌ BEFORE - causes CLS
if (isLoading) {
  return <div>Loading...</div>
}

// ✅ AFTER - preserves layout
if (isLoading) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[72px] w-full" />
      <Skeleton className="h-[72px] w-full" />
      <Skeleton className="h-[72px] w-full" />
    </div>
  )
}
```

### Card Skeleton Pattern

```tsx
// Match your card's typical height
const CardSkeleton = () => (
  <Card className="bg-card border-border">
    <CardContent className="p-6">
      <div className="space-y-3">
        <Skeleton className="h-6 w-1/3" />        {/* Title */}
        <Skeleton className="h-4 w-full" />       {/* Description line 1 */}
        <Skeleton className="h-4 w-2/3" />        {/* Description line 2 */}
      </div>
    </CardContent>
  </Card>
)
```

### Dashboard Summary Skeleton

```tsx
const DashboardSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    {[1, 2, 3].map((i) => (
      <Card key={i} className="bg-card border-border">
        <CardContent className="p-6">
          <Skeleton className="h-4 w-24 mb-2" />    {/* Label */}
          <Skeleton className="h-8 w-32" />          {/* Value */}
        </CardContent>
      </Card>
    ))}
  </div>
)
```

---

## Step-by-Step Workflow

### 1. Find Hardcoded Patterns

```bash
# Scan for hardcoded colors in a specific file
grep -n "bg-gray-\|text-white\|border-gray-" src/components/ui/badge.tsx

# Scan entire domain
grep -rn "bg-gray-\|text-white\|border-gray-" src/domains/expense-claims/
```

### 2. Convert Each Pattern

1. Open the file in your editor
2. For each hardcoded pattern:
   - Identify the context (card bg? button? text?)
   - Apply the appropriate semantic token from the reference above
3. Save the file

### 3. Verify Theme Compatibility

```bash
# Run dev server
npm run dev

# In browser:
# 1. Navigate to the component
# 2. Toggle theme (light ↔ dark)
# 3. Verify no visual anomalies
```

### 4. Build Validation

```bash
# After each batch of changes
npm run build

# Must succeed with no errors
```

### 5. Run Lighthouse (for CLS)

```bash
# After adding skeleton loaders
npm run perf:lighthouse

# Check CLS score < 0.1
```

---

## Common Gotchas

### 1. `text-white` Context Matters

```tsx
// On bg-primary → use text-primary-foreground
<button className="bg-primary text-primary-foreground">

// On bg-card with no special background → use text-foreground
<div className="bg-card text-foreground">
```

### 2. Dark Mode Overrides

```tsx
// ❌ DON'T do manual dark: overrides with semantic tokens
<div className="bg-card dark:bg-gray-800">  // Wrong!

// ✅ Semantic tokens auto-adapt
<div className="bg-card">  // Correct - adapts automatically
```

### 3. Skeleton Heights Must Match

```tsx
// ❌ Wrong - skeleton shorter than content
<Skeleton className="h-10" />  // But card is 72px

// ✅ Correct - measure actual content height
<Skeleton className="h-[72px]" />  // Matches card height
```

---

## Validation Checklist

After completing each file:

- [ ] No `bg-gray-` patterns remain
- [ ] No `text-white` or `text-black` remain (except on semantic backgrounds)
- [ ] No `border-gray-` patterns remain
- [ ] Light mode looks correct
- [ ] Dark mode looks correct
- [ ] `npm run build` succeeds

After completing all skeleton additions:

- [ ] All major loading states have skeletons
- [ ] Skeleton heights match content heights
- [ ] Lighthouse CLS < 0.1

---

## Related Documentation

- **Design System**: `src/components/ui/CLAUDE.md`
- **App Patterns**: `src/app/CLAUDE.md`
- **Token Definitions**: `src/app/globals.css`
- **Analysis Report**: `.pm/product/uxui-analysis.md`
- **Feature Spec**: `specs/005-uiux-theme-cls/spec.md`
- **Research**: `specs/005-uiux-theme-cls/research.md`
