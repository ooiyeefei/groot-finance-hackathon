# App-Level Design System Implementation

## Semantic Design System in Next.js App Router

This document covers how to implement our Layer 1-2-3 semantic design system within Next.js app components, pages, and layouts.

---

## Page & Layout Components

### **Layout Implementation**
**Location**: `src/app/layout.tsx`

**Global Theme Setup**:
```typescript
import './globals.css'  // Contains all semantic tokens

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="light"> {/* Theme class */}
      <body className="bg-background text-foreground antialiased">
        {/* Semantic tokens automatically adapt */}
        <div className="min-h-screen bg-background">
          {children}
        </div>
      </body>
    </html>
  )
}
```

### **Page Component Patterns**
**Pattern for all pages**:
```typescript
// src/app/[locale]/expense-claims/page.tsx
export default function ExpenseClaimsPage() {
  return (
    <div className="bg-background min-h-screen">
      {/* Header - Layer 1 */}
      <header className="bg-surface border-b border-border">
        <h1 className="text-foreground text-2xl font-semibold">
          Expense Claims
        </h1>
      </header>

      {/* Main Content - Layer 2 */}
      <main className="bg-background p-6">
        <Card className="bg-card border-border">
          <CardContent className="text-foreground">
            Page content using semantic tokens
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
```

---

## Modal & Overlay Components

### **Modal Implementation Pattern**
Based on our resolved overlay implementation:

```typescript
// Expense Submission Flow Pattern
export default function ModalComponent({ onClose, children }) {
  return (
    <div
      className="fixed top-0 left-0 right-0 bottom-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
      style={{
        margin: 0,
        padding: 0,
        width: '100vw',
        height: '100vh',
        position: 'fixed'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      {/* Modal Content with margin for spacing */}
      <div className="bg-card rounded-lg w-full max-h-[96vh] overflow-hidden border border-border m-4 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-semibold text-foreground">Modal Title</h2>
          <Button onClick={onClose} variant="ghost" size="sm">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(96vh-180px)]">
          {children}
        </div>
      </div>
    </div>
  )
}
```

**Key Modal Requirements**:
- ✅ **Full coverage**: No padding on backdrop container
- ✅ **Semantic colors**: `bg-card`, `text-foreground`, `border-border`
- ✅ **Proper layering**: Modal content uses margin, not backdrop padding
- ✅ **Close patterns**: Ghost button with semantic hover states

---

## Form Components in App Context

### **Multi-Step Form Pattern**
**Example**: Expense Submission Flow

```typescript
// Step Indicator Component
const StepIndicator = ({ currentStep, steps }) => {
  return (
    <div className="flex items-center justify-center space-x-4 mb-6">
      {steps.map((step, index) => {
        const isActive = step.id === currentStep
        const isCompleted = index < getCurrentStepIndex()

        return (
          <div key={step.id} className="flex items-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
              isActive
                ? 'bg-primary text-primary-foreground ring-2 ring-primary/40'
                : isCompleted
                ? 'bg-green-600 dark:bg-green-500 text-white'
                : 'bg-muted text-muted-foreground'
            }`}>
              {index + 1}
            </div>

            <div className="text-center mt-1">
              <div className={`text-sm font-medium ${
                isActive ? 'text-primary' :
                isCompleted ? 'text-green-600 dark:text-green-400' :
                'text-muted-foreground'
              }`}>
                {step.label}
              </div>
              <div className="text-xs text-muted-foreground">
                {step.description}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

### **Form Field Patterns**
```typescript
// Consistent form field styling
const FormField = ({ label, description, error, children }) => {
  return (
    <div className="space-y-2">
      <Label className="text-foreground font-medium">
        {label}
      </Label>

      {description && (
        <p className="text-muted-foreground text-sm">
          {description}
        </p>
      )}

      {children}

      {error && (
        <p className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  )
}

// Usage in forms
<FormField
  label="Vendor Name"
  description="Enter the business or vendor name"
  error={errors.vendor}
>
  <Input
    className="bg-input border-border text-foreground focus:ring-ring"
    placeholder="Enter vendor name..."
    value={formData.vendor}
    onChange={(e) => setFormData({...formData, vendor: e.target.value})}
  />
</FormField>
```

---

## Status & Feedback Components

### **Badge Usage Patterns**
```typescript
// Status badges following our light/dark pattern
const StatusBadge = ({ status, children }) => {
  const getBadgeClasses = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30'
      case 'pending':
        return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30'
      case 'rejected':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30'
      case 'draft':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30'
      default:
        return 'bg-muted text-muted-foreground border border-border'
    }
  }

  return (
    <Badge className={getBadgeClasses(status)}>
      {children}
    </Badge>
  )
}
```

### **Loading States**
```typescript
// Semantic loading components
const LoadingSpinner = () => (
  <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
)

const LoadingSkeleton = () => (
  <div className="animate-pulse">
    <div className="bg-muted rounded h-4 w-full mb-2"></div>
    <div className="bg-muted rounded h-4 w-3/4 mb-2"></div>
    <div className="bg-muted rounded h-4 w-1/2"></div>
  </div>
)

const LoadingCard = () => (
  <Card className="bg-card border-border">
    <CardContent className="p-6">
      <LoadingSkeleton />
    </CardContent>
  </Card>
)
```

---

## Data Display Components

### **Table Patterns**
```typescript
const DataTable = ({ data, columns }) => {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="border-b border-border">
        <CardTitle className="text-foreground">Data Table</CardTitle>
      </CardHeader>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 text-left text-foreground font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {data.map((row, index) => (
              <tr key={index} className="border-b border-border hover:bg-muted/50">
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-3 text-foreground">
                    {row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
```

### **List Components**
```typescript
const ItemList = ({ items, onItemClick }) => {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Card
          key={item.id}
          className="bg-card border-border hover:bg-card-hover cursor-pointer transition-colors"
          onClick={() => onItemClick(item)}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-foreground font-medium">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.description}</p>
              </div>

              <StatusBadge status={item.status}>
                {item.status}
              </StatusBadge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

---

## Navigation Components

### **Sidebar Pattern**
```typescript
const Sidebar = ({ isCollapsed, items }) => {
  return (
    <div className={`bg-surface border-r border-border h-full transition-all ${
      isCollapsed ? 'w-16' : 'w-64'
    }`}>
      <div className="p-4">
        <h2 className={`text-foreground font-semibold ${
          isCollapsed ? 'hidden' : 'block'
        }`}>
          Navigation
        </h2>
      </div>

      <nav className="space-y-1 p-2">
        {items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex items-center px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          >
            <item.icon className="w-5 h-5 mr-3" />
            {!isCollapsed && (
              <span>{item.label}</span>
            )}
          </a>
        ))}
      </nav>
    </div>
  )
}
```

### **Header Pattern**
```typescript
const AppHeader = ({ user, onMenuToggle }) => {
  return (
    <header className="bg-surface border-b border-border">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center space-x-4">
          <Button onClick={onMenuToggle} variant="ghost" size="sm">
            <Menu className="w-5 h-5" />
          </Button>

          <h1 className="text-foreground text-xl font-semibold">
            Groot Finance
          </h1>
        </div>

        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm">
            <Bell className="w-5 h-5" />
          </Button>

          <div className="text-right">
            <p className="text-foreground font-medium">{user.name}</p>
            <p className="text-muted-foreground text-sm">{user.role}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
```

---

## Performance & Optimization

### **Theme Provider Setup**
```typescript
// src/app/theme-provider.tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light' | 'system'

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'vite-ui-theme',
}: {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}) {
  const [theme, setTheme] = useState<Theme>(defaultTheme)

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      root.classList.add(systemTheme)
      return
    }

    root.classList.add(theme)
  }, [theme])

  return (
    <ThemeProviderContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
```

### **CSS Variable Optimization**
Our semantic token system provides several performance benefits:

- **Compile-time optimization**: CSS variables resolve at runtime with no JS overhead
- **Bundle size reduction**: Reusable semantic classes reduce CSS duplication
- **Cache efficiency**: Consistent class names improve browser caching
- **Tree shaking**: Unused semantic tokens are automatically removed

---

## Testing App Components

### **Theme Testing Pattern**
```typescript
// Test both light and dark modes
describe('Component Theme Tests', () => {
  it('renders correctly in light mode', () => {
    document.documentElement.classList.add('light')
    render(<YourComponent />)

    // Verify semantic colors resolve correctly
    expect(screen.getByTestId('card')).toHaveClass('bg-card')
  })

  it('renders correctly in dark mode', () => {
    document.documentElement.classList.add('dark')
    render(<YourComponent />)

    // Same test, different theme resolution
    expect(screen.getByTestId('card')).toHaveClass('bg-card')
  })
})
```

### **Semantic Token Validation**
```typescript
// Ensure no hardcoded colors in production
const validateSemanticTokens = (component: HTMLElement) => {
  const hardcodedColors = [
    'bg-gray-', 'text-white', 'text-black', 'border-gray-',
    'bg-blue-6', 'bg-red-6', 'bg-green-6', 'bg-yellow-6'
  ]

  hardcodedColors.forEach(pattern => {
    expect(component.className).not.toContain(pattern)
  })
}
```

---

## Integration Checklist

When adding new app components:

- [ ] **Use semantic tokens**: No hardcoded colors (bg-gray-700, text-white)
- [ ] **Import UI components**: Reuse Button, Card, Badge from `@/components/ui`
- [ ] **Test both themes**: Verify light and dark mode rendering
- [ ] **Follow layer hierarchy**: bg-background → bg-surface → bg-card → bg-muted
- [ ] **Use proper typography**: text-foreground → text-muted-foreground hierarchy
- [ ] **Implement proper focus states**: ring-ring for keyboard navigation
- [ ] **Validate accessibility**: WCAG AA contrast ratios maintained
- [ ] **Build passes**: `npm run build` succeeds without errors

This ensures consistent theming across all app-level components while maintaining our semantic design system standards.