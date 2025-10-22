# UI Components Design System Documentation

## Layer 1-2-3 Semantic Design System

FinanSEAL implements a **3-layer semantic design system** that ensures consistent theming across light and dark modes while maintaining design flexibility and maintainability.

### Design Standards

- **Design Language**: Material Design 3 inspired with Google-style clean aesthetics
- **Accessibility**: WCAG AA compliant contrast ratios (4.5:1 minimum)
- **Color System**: HSL-based semantic tokens with automatic light/dark mode adaptation
- **Typography**: Optimized scale (10% smaller for space efficiency)
- **Border Radius**: Material Design rounded corners (`0.75rem` standard)

## Layer System Architecture

### **Layer 1: Core Semantic Tokens**
Foundation tokens defined in `src/app/globals.css` that adapt automatically to light/dark themes:

```css
/* Core Background Tokens */
--background: 0 0% 98%;        /* Main app background */
--surface: 0 0% 100%;          /* Elevated surfaces */
--card: 0 0% 100%;             /* Card backgrounds */
--muted: 220 14% 96%;          /* Muted/disabled backgrounds */
--input: 220 13% 91%;          /* Form input backgrounds */

/* Core Text Tokens */
--foreground: 222 47% 11%;     /* Primary text */
--muted-foreground: 220 9% 46%; /* Secondary text */

/* Core Border Tokens */
--border: 220 13% 91%;         /* Standard borders */
--ring: 221 83% 53%;           /* Focus rings */
```

### **Layer 2: Component Semantic Classes**
Component-specific classes using Layer 1 tokens:

```typescript
// Card Components
.bg-card         → hsl(var(--card))
.bg-muted        → hsl(var(--muted))
.text-foreground → hsl(var(--foreground))
.border-border   → hsl(var(--border))

// Status Components
.text-primary         → hsl(var(--primary))
.bg-destructive       → hsl(var(--destructive))
.text-muted-foreground → hsl(var(--muted-foreground))
```

### **Layer 3: Context-Specific Implementations**
Domain-specific component implementations using Layer 1 & 2:

```typescript
// Expense Form Cards
<Card className="bg-card border-border">
  <CardTitle className="text-foreground">Expense Details</CardTitle>
  <p className="text-muted-foreground">Supporting text</p>
</Card>

// Status Badges
<Badge className="bg-primary/10 text-primary border border-primary/30">
  Active
</Badge>
```

---

## Component Conversion Methodology

### **MANDATORY: Always Check Existing Components First**

Before creating new components, **always check existing implementations**:

1. **Search existing components**: `src/components/ui/`
2. **Check globals.css**: Available semantic tokens
3. **Review tailwind.config.js**: Custom utilities and extensions
4. **Look for similar patterns**: In other domain components

### **Conversion Pattern**

**Step 1: Identify Hardcoded Colors**
```typescript
// ❌ BEFORE (hardcoded dark mode)
<div className="bg-gray-700 text-white border border-gray-600">
  <button className="bg-blue-600 hover:bg-blue-700 text-white">
    Submit
  </button>
</div>
```

**Step 2: Map to Semantic Tokens**
```typescript
// ✅ AFTER (semantic tokens)
<div className="bg-card text-foreground border border-border">
  <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
    Submit
  </Button>
</div>
```

**Step 3: Validate Light/Dark Mode**
```typescript
// Ensure both modes work correctly:
// Light mode: Clean Google-style whites and grays
// Dark mode: Material Design dark surfaces with proper contrast
```

---

## Core Component Standards

### **Button Component**
**Location**: `src/components/ui/button.tsx`

**Semantic Variants**:
```typescript
// Primary Actions (Create, Submit, Save)
<Button variant="default" className="bg-primary text-primary-foreground">
  Create Expense
</Button>

// Secondary Actions (Cancel, Back)
<Button variant="secondary" className="bg-secondary text-secondary-foreground">
  Cancel
</Button>

// Destructive Actions (Delete, Remove)
<Button variant="destructive" className="bg-destructive text-destructive-foreground">
  Delete
</Button>

// Ghost Actions (Close, Minimize)
<Button variant="ghost" className="text-foreground hover:bg-muted">
  <X className="w-4 h-4" />
</Button>
```

### **Badge Component**
**Location**: `src/components/ui/badge.tsx`

**Light/Dark Mode Pattern**:
```typescript
// Standard Pattern for All Badge Colors
<Badge className="bg-{color}-500/10 text-{color}-600 dark:text-{color}-400 border border-{color}-500/30">
  Status Text
</Badge>

// Examples:
// Success: bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30
// Warning: bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30
// Error: bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30
```

### **Card Component**
**Location**: `src/components/ui/card.tsx`

**Layer System for Elevation**:
```typescript
// Primary Cards (Main content)
<Card className="bg-card border-border">
  <CardHeader className="border-b border-border">
    <CardTitle className="text-foreground">Title</CardTitle>
  </CardHeader>
  <CardContent className="text-muted-foreground">
    Content
  </CardContent>
</Card>

// Secondary Cards (Nested content)
<Card className="bg-muted border-border">
  <CardContent className="text-foreground">
    Nested Content
  </CardContent>
</Card>
```

---

## Creating New UI Components

### **Step 1: Component Structure**
```bash
# Create component file
touch src/components/ui/new-component.tsx
```

### **Step 2: TypeScript Configuration**
```typescript
// Add to tsconfig.json paths if needed
"@/components/ui/*": ["src/components/ui/*"]
```

### **Step 3: CVA Variants Setup**
```typescript
import { cva, type VariantProps } from "class-variance-authority"

const componentVariants = cva(
  // Base classes (semantic tokens)
  "inline-flex items-center rounded-md border border-border bg-card text-foreground",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
)

export interface ComponentProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof componentVariants> {}

export const Component = React.forwardRef<HTMLDivElement, ComponentProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <div
        className={cn(componentVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
```

### **Step 4: Export from Index**
```typescript
// Add to src/components/ui/index.ts
export { Component, type ComponentProps } from "./new-component"
```

---

## Color System Reference

### **Primary Color Palette**
```css
/* Material Blue - Primary Actions */
--primary: 221 83% 53%;           /* #3B82F6 */
--primary-foreground: 0 0% 100%;  /* White text */
--primary-hover: 221 83% 48%;     /* Darker blue */
--primary-muted: 221 83% 95%;     /* Very light blue */
```

### **Semantic Status Colors**
```css
/* Success (Green) */
--success: 142 76% 36%;           /* #059669 */
--success-foreground: 0 0% 100%;  /* White text */

/* Warning (Amber) */
--warning: 32 95% 44%;            /* #F59E0B */
--warning-foreground: 0 0% 100%;  /* White text */

/* Danger (Red) */
--danger: 0 84% 60%;              /* #EF4444 */
--danger-foreground: 0 0% 100%;   /* White text */

/* Info (Blue) */
--info: 221 83% 53%;              /* Same as primary */
--info-foreground: 0 0% 100%;     /* White text */
```

### **Neutral Grays**
```css
/* Text Hierarchy */
--foreground: 222 47% 11%;        /* Primary text - #1F2937 */
--muted-foreground: 220 9% 46%;   /* Secondary text - #6B7280 */

/* Background Hierarchy */
--background: 0 0% 98%;           /* App background - #FAFAFA */
--surface: 0 0% 100%;             /* Card surface - #FFFFFF */
--muted: 220 14% 96%;             /* Muted background - #F3F4F6 */
```

---

## Form Component Patterns

### **Input Fields**
```typescript
<Input
  className="bg-input border-border text-foreground focus:ring-ring focus:border-ring"
  placeholder="Enter value..."
/>
```

### **Select Dropdowns**
```typescript
<Select>
  <SelectTrigger className="bg-input border-border text-foreground">
    <SelectValue placeholder="Select option..." />
  </SelectTrigger>
  <SelectContent className="bg-card border-border">
    <SelectItem className="text-foreground hover:bg-muted">Option 1</SelectItem>
  </SelectContent>
</Select>
```

### **Form Labels & Descriptions**
```typescript
<Label className="text-foreground font-medium">Field Label</Label>
<p className="text-muted-foreground text-sm">Supporting description</p>
```

---

## Testing & Validation

### **Visual Testing Checklist**
- [ ] Component renders correctly in light mode
- [ ] Component renders correctly in dark mode
- [ ] All text meets WCAG AA contrast requirements
- [ ] Hover states work in both themes
- [ ] Focus states are visible and accessible
- [ ] Component scales properly on mobile devices

### **Code Quality Checklist**
- [ ] No hardcoded colors (bg-gray-700, text-white, etc.)
- [ ] All classes use semantic tokens (bg-card, text-foreground, etc.)
- [ ] TypeScript interfaces properly defined
- [ ] CVA variants configured for theming
- [ ] Component exported from ui/index.ts
- [ ] Build passes without errors (`npm run build`)

---

## Common Anti-Patterns to Avoid

### **❌ Don't Use Hardcoded Colors**
```typescript
// Never do this:
<div className="bg-gray-700 text-white border border-gray-600">
<button className="bg-blue-600 hover:bg-blue-700">
<Badge className="bg-green-100 text-green-800">
```

### **❌ Don't Skip Component Reuse**
```typescript
// Don't create custom buttons when Button component exists:
<button className="px-4 py-2 bg-primary text-primary-foreground rounded">

// Use the existing Button component instead:
<Button variant="default">Submit</Button>
```

### **❌ Don't Ignore Layer Hierarchy**
```typescript
// Don't use same background for nested content:
<Card className="bg-card">           // Layer 1
  <Card className="bg-card">         // Should be bg-muted (Layer 2)
    <div className="bg-card">        // Should be bg-input (Layer 3)
```

### **✅ Follow Semantic Patterns**
```typescript
// Always use semantic tokens:
<div className="bg-card text-foreground border border-border">
<Button variant="primary">Submit</Button>
<Badge className="bg-green-500/10 text-green-600 dark:text-green-400">Success</Badge>
```

---

## Integration with Existing Codebase

### **Domain Component Integration**
When working in domain components (`src/domains/*/components/`):

1. **Import UI components**: `import { Button, Card, Badge } from '@/components/ui'`
2. **Use semantic classes**: Apply Layer 1-2 tokens consistently
3. **Follow Layer 3 patterns**: Create domain-specific implementations
4. **Test both themes**: Verify light/dark mode compatibility

### **Performance Considerations**
- **Semantic tokens compile to CSS variables**: No runtime overhead
- **CVA variants tree-shake**: Only used variants included in bundle
- **Component reuse reduces bundle size**: Shared Button/Card/Badge components
- **Cache-friendly**: Consistent class names improve CSS caching

---

This documentation should be the **single source of truth** for all UI component development. Always refer to this guide before creating or modifying components to ensure consistency with our semantic design system.