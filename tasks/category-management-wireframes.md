# Category Management - Visual Wireframes & Component Specs

## Screen 1: Category Management Page (Expense Categories Tab - Active)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ← Settings                                                    [User Menu] │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  📊 Category Management                                                    │
│  Manage expense and COGS categories for AI-powered document classification │
│                                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                                                                     │  │
│  │  ┏━━━━━━━━━━━━━━━━━━━━┓  ┌─────────────────────┐                  │  │
│  │  ┃ Expense Categories ┃  │ COGS Categories     │                  │  │
│  │  ┗━━━━━━━━━━━━━━━━━━━━┛  └─────────────────────┘                  │  │
│  │                                                                     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                                                                     │  │
│  │  🔍 Search categories...                    [+ Add Category] (Blue)│  │
│  │                                                                     │  │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐     │  │
│  │  │ 💰 Travel        │ │ 🍽️  Meals        │ │ 📦 Office       │     │  │
│  │  │ TRAVEL-001       │ │ MEALS-001       │ │ OFFICE-001      │     │  │
│  │  │                  │ │                  │ │                  │     │  │
│  │  │ Business travel  │ │ Client meals &  │ │ Supplies and    │     │  │
│  │  │ and transport    │ │ entertainment   │ │ equipment       │     │  │
│  │  │                  │ │                  │ │                  │     │  │
│  │  │ 💵 Deductible    │ │ 💵 Partial      │ │ 💵 Deductible   │     │  │
│  │  │ 📄 Receipt req.  │ │ 📄 Receipt req. │ │ 📄 Receipt >$50 │     │  │
│  │  │ ✅ Approval req. │ │ ✅ Approval req.│ │ ⚪ No approval  │     │  │
│  │  │ 💰 Limit: $5000  │ │ 💰 Limit: $2000 │ │ 💰 Limit: $500  │     │  │
│  │  │                  │ │                  │ │                  │     │  │
│  │  │ Keywords: flight,│ │ Keywords: lunch,│ │ Keywords: paper,│     │  │
│  │  │ taxi, uber...    │ │ dinner, coffee  │ │ pens, toner...  │     │  │
│  │  │                  │ │                  │ │                  │     │  │
│  │  │ [Edit] [Delete]  │ │ [Edit] [Delete] │ │ [Edit] [Delete] │     │  │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────┘     │  │
│  │                                                                     │  │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐     │  │
│  │  │ 🏥 Healthcare    │ │ 📚 Training     │ │ 🖥️  IT Expense  │     │  │
│  │  │ HEALTH-001       │ │ TRAIN-001       │ │ IT-EXP-001      │     │  │
│  │  │ [Default]        │ │                  │ │                  │     │  │
│  │  │ ...              │ │ ...             │ │ ...             │     │  │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────┘     │  │
│  │                                                                     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
└───────────────────────────────────────────────────────────────────────────┘

COLOR SCHEME (Expense Tab):
- Active tab background: #2563eb (blue-600)
- Card accents: Blue borders
- Action buttons: Blue primary
```

---

## Screen 2: Category Management Page (COGS Categories Tab - Active)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ← Settings                                                    [User Menu] │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  📊 Category Management                                                    │
│  Manage expense and COGS categories for AI-powered document classification │
│                                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                                                                     │  │
│  │  ┌─────────────────────┐  ┏━━━━━━━━━━━━━━━━━┓                     │  │
│  │  │ Expense Categories  │  ┃ COGS Categories ┃                     │  │
│  │  └─────────────────────┘  ┗━━━━━━━━━━━━━━━━━┛                     │  │
│  │                                                                     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                                                                     │  │
│  │  🔍 Search categories...                   [+ Add Category] (Orange)│  │
│  │                                                                     │  │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐     │  │
│  │  │ 🔧 Materials     │ │ 👷 Subcontractor │ │ 🖥️  IT Services  │     │  │
│  │  │ COGS-MAT-001     │ │ COGS-SUB-001    │ │ COGS-IT-001     │     │  │
│  │  │ GL: 5000         │ │ GL: 5100        │ │ GL: 5200        │     │  │
│  │  │                  │ │                  │ │                  │     │  │
│  │  │ Raw materials &  │ │ Outsourced labor│ │ Software &      │     │  │
│  │  │ inventory        │ │ & contractors   │ │ tech support    │     │  │
│  │  │                  │ │                  │ │                  │     │  │
│  │  │ 🎯 Direct Cost   │ │ 🎯 Direct Cost  │ │ ⚪ Indirect Cost│     │  │
│  │  │ ✅ Approval >$10k│ │ ✅ Approval >$5k│ │ ✅ Approval >$2k│     │  │
│  │  │ 📊 Project Link  │ │ 📊 Project Link │ │ ⚪ No Project   │     │  │
│  │  │                  │ │                  │ │                  │     │  │
│  │  │ Keywords: steel, │ │ Keywords: labor,│ │ Keywords: cloud,│     │  │
│  │  │ wood, cement...  │ │ freelance...    │ │ hosting, SaaS   │     │  │
│  │  │                  │ │                  │ │                  │     │  │
│  │  │ [Edit] [Delete]  │ │ [Edit] [Delete] │ │ [Edit] [Delete] │     │  │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────┘     │  │
│  │                                                                     │  │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐     │  │
│  │  │ 🚚 Shipping      │ │ 🔌 Utilities    │ │ 🏢 Rent         │     │  │
│  │  │ COGS-SHIP-001    │ │ COGS-UTIL-001   │ │ COGS-RENT-001   │     │  │
│  │  │ [Default]        │ │                  │ │                  │     │  │
│  │  │ ...              │ │ ...             │ │ ...             │     │  │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────┘     │  │
│  │                                                                     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
└───────────────────────────────────────────────────────────────────────────┘

COLOR SCHEME (COGS Tab):
- Active tab background: #ea580c (orange-600)
- Card accents: Orange borders
- Action buttons: Orange primary
```

---

## Screen 3: Add Expense Category Modal

```
┌───────────────────────────────────────────────────────────────┐
│                                                                │
│  ✕                        Add Expense Category                │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │  Category Name *                                          │ │
│  │  ┌──────────────────────────────────────────┐            │ │
│  │  │ Travel Expenses                          │            │ │
│  │  └──────────────────────────────────────────┘            │ │
│  │                                                           │ │
│  │  Category Code *                                          │ │
│  │  ┌──────────────────────────────────────────┐            │ │
│  │  │ TRAVEL-001                               │            │ │
│  │  └──────────────────────────────────────────┘            │ │
│  │                                                           │ │
│  │  Description                                              │ │
│  │  ┌──────────────────────────────────────────┐            │ │
│  │  │ Business travel including flights, taxis,│            │ │
│  │  │ and transportation                       │            │ │
│  │  └──────────────────────────────────────────┘            │ │
│  │                                                           │ │
│  │  Tax Treatment *                                          │ │
│  │  ○ Fully Deductible   ○ Non-Deductible   ○ Partial      │ │
│  │                                                           │ │
│  │  Receipt Requirements                                     │ │
│  │  ☑ Receipt Required                                      │ │
│  │  Threshold: [___$500___] (only if receipt required)      │ │
│  │                                                           │ │
│  │  Approval Settings                                        │ │
│  │  ☑ Manager Approval Required                             │ │
│  │  Policy Limit: [___$5000___]                             │ │
│  │                                                           │ │
│  │  AI Matching Keywords (comma-separated)                   │ │
│  │  ┌──────────────────────────────────────────┐            │ │
│  │  │ flight, airline, taxi, uber, grab, hotel │            │ │
│  │  └──────────────────────────────────────────┘            │ │
│  │                                                           │ │
│  │  Vendor Patterns (comma-separated)                        │ │
│  │  ┌──────────────────────────────────────────┐            │ │
│  │  │ Airlines, Hotels, Taxi Services          │            │ │
│  │  └──────────────────────────────────────────┘            │ │
│  │                                                           │ │
│  │  ☐ Set as default category                               │ │
│  │  ☑ Active                                                 │ │
│  │                                                           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  [Cancel]                             [Save Category] (Blue)  │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

---

## Screen 4: Add COGS Category Modal

```
┌───────────────────────────────────────────────────────────────┐
│                                                                │
│  ✕                        Add COGS Category                   │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │  Category Name *                                          │ │
│  │  ┌──────────────────────────────────────────┐            │ │
│  │  │ Raw Materials                            │            │ │
│  │  └──────────────────────────────────────────┘            │ │
│  │                                                           │ │
│  │  Category Code *                                          │ │
│  │  ┌──────────────────────────────────────────┐            │ │
│  │  │ COGS-MAT-001                             │            │ │
│  │  └──────────────────────────────────────────┘            │ │
│  │                                                           │ │
│  │  GL Account Code                                          │ │
│  │  ┌──────────────────────────────────────────┐            │ │
│  │  │ 5000                                     │            │ │
│  │  └──────────────────────────────────────────┘            │ │
│  │                                                           │ │
│  │  Description                                              │ │
│  │  ┌──────────────────────────────────────────┐            │ │
│  │  │ Raw materials and inventory purchases    │            │ │
│  │  │ for production                           │            │ │
│  │  └──────────────────────────────────────────┘            │ │
│  │                                                           │ │
│  │  Cost Type *                                              │ │
│  │  ● Direct Cost   ○ Indirect Cost                         │ │
│  │                                                           │ │
│  │  Approval Settings                                        │ │
│  │  ☑ Approval Required                                     │ │
│  │  Approval Threshold: [___$10,000___]                     │ │
│  │                                                           │ │
│  │  Project Linkage                                          │ │
│  │  ☑ Can be linked to projects/jobs                        │ │
│  │                                                           │ │
│  │  AI Matching Keywords (comma-separated)                   │ │
│  │  ┌──────────────────────────────────────────┐            │ │
│  │  │ steel, wood, cement, materials, supplies │            │ │
│  │  └──────────────────────────────────────────┘            │ │
│  │                                                           │ │
│  │  Vendor Patterns (comma-separated)                        │ │
│  │  ┌──────────────────────────────────────────┐            │ │
│  │  │ Building Supply, Hardware Store          │            │ │
│  │  └──────────────────────────────────────────┘            │ │
│  │                                                           │ │
│  │  ☐ Set as default category                               │ │
│  │  ☑ Active                                                 │ │
│  │                                                           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  [Cancel]                            [Save Category] (Orange) │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

---

## Screen 5: Transition Notification (First Visit After Migration)

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  ℹ️  Category Management Has Moved                                 │  │
│  │                                                                     │  │
│  │  To better organize your financial settings, we've moved category  │  │
│  │  management to a centralized location. You'll now find:            │  │
│  │                                                                     │  │
│  │  • Expense Categories (for employee reimbursements)                │  │
│  │  • COGS Categories (for supplier invoices)                         │  │
│  │                                                                     │  │
│  │  Both are now in Settings > Category Management                    │  │
│  │                                                                     │  │
│  │  [Got It]  [Don't Show Again]                               [×]    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  (Rest of Category Management page content below)                         │
│                                                                            │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 6: Mobile Responsive View (375px width)

```
┌─────────────────────────────┐
│  ☰  Category Management   👤│
├─────────────────────────────┤
│ Manage categories for AI    │
│                              │
│ ┌─────────────┬────────────┐│
│ │ Expense     │ COGS       ││
│ │ Categories  │ Categories ││
│ └─────────────┴────────────┘│
│                              │
│ 🔍 [Search...]               │
│                              │
│ [+ Add Category]             │
│                              │
│ ┌──────────────────────────┐│
│ │ 💰 Travel                ││
│ │ TRAVEL-001               ││
│ │                          ││
│ │ Business travel          ││
│ │                          ││
│ │ 💵 Deductible            ││
│ │ 📄 Receipt required      ││
│ │ ✅ Approval required     ││
│ │                          ││
│ │ [Edit] [Delete]          ││
│ └──────────────────────────┘│
│                              │
│ ┌──────────────────────────┐│
│ │ 🍽️  Meals                 ││
│ │ MEALS-001                ││
│ │ ...                      ││
│ └──────────────────────────┘│
│                              │
└─────────────────────────────┘
```

---

## Component Hierarchy

```
CategoryManagementPage
├── Header
│   ├── Title: "Category Management"
│   └── Subtitle: "Manage expense and COGS categories..."
│
├── TabNavigation
│   ├── Tab: Expense Categories (Blue)
│   └── Tab: COGS Categories (Orange)
│
└── TabContent (conditional render based on active tab)
    │
    ├── ExpenseCategoriesTab
    │   ├── SearchBar
    │   ├── AddButton (Blue)
    │   ├── CategoriesGrid
    │   │   └── CategoryCard[] (Blue accent)
    │   │       ├── CategoryHeader
    │   │       ├── CategoryDetails
    │   │       └── CategoryActions
    │   └── CategoryFormModal (Expense-specific fields)
    │
    └── COGSCategoriesTab
        ├── SearchBar
        ├── AddButton (Orange)
        ├── CategoriesGrid
        │   └── CategoryCard[] (Orange accent)
        │       ├── CategoryHeader
        │       ├── CategoryDetails
        │       └── CategoryActions
        └── CategoryFormModal (COGS-specific fields)
```

---

## Interaction States

### Tab States
```
INACTIVE TAB:
- Background: bg-gray-800
- Text: text-gray-400
- Border: border-gray-700
- Hover: bg-gray-700

ACTIVE TAB (Expense):
- Background: bg-blue-600
- Text: text-white
- Border: border-blue-500
- No hover effect

ACTIVE TAB (COGS):
- Background: bg-orange-600
- Text: text-white
- Border: border-orange-500
- No hover effect
```

### Category Card States
```
DEFAULT:
- Background: bg-gray-800
- Border: border-gray-700 (2px)
- Hover: border-blue-600 (Expense) / border-orange-600 (COGS)

EXPENSE CARD:
- Accent color: blue-600
- Button primary: blue-600

COGS CARD:
- Accent color: orange-600
- Button primary: orange-600
```

### Button States
```
PRIMARY BUTTON (Expense context):
- Default: bg-blue-600 text-white
- Hover: bg-blue-700
- Active: bg-blue-800
- Disabled: bg-gray-600 text-gray-400

PRIMARY BUTTON (COGS context):
- Default: bg-orange-600 text-white
- Hover: bg-orange-700
- Active: bg-orange-800
- Disabled: bg-gray-600 text-gray-400

DANGER BUTTON (Delete):
- Default: bg-red-600 text-white
- Hover: bg-red-700
- Active: bg-red-800
```

---

## Animation Specifications

### Tab Switching
```typescript
// Tab content fade transition
{
  duration: 200ms
  easing: ease-in-out
  opacity: 0 → 1
  transform: translateY(8px) → translateY(0)
}
```

### Modal Open/Close
```typescript
// Backdrop
{
  duration: 150ms
  easing: ease-out
  opacity: 0 → 1
}

// Modal
{
  duration: 200ms
  easing: ease-out
  opacity: 0 → 1
  transform: scale(0.95) → scale(1)
}
```

### Category Card Hover
```typescript
{
  duration: 150ms
  easing: ease-in-out
  border-color: gray-700 → blue-600 / orange-600
  box-shadow: none → 0 4px 6px rgba(0,0,0,0.1)
}
```

### Notification Slide-In
```typescript
{
  duration: 300ms
  easing: ease-out
  transform: translateY(-100%) → translateY(0)
  opacity: 0 → 1
}
```

---

## Accessibility Annotations

### Keyboard Navigation Flow
```
1. Skip to main content link (optional)
2. Tab 1: Expense Categories tab (Space/Enter to activate)
3. Tab 2: COGS Categories tab (Arrow keys to switch, Space/Enter to activate)
4. Search input field (Focus visible)
5. Add Category button (Focus visible)
6. Category Card 1:
   - Edit button (Tab stop)
   - Delete button (Tab stop)
7. Category Card 2...
8. Category Card N...
```

### ARIA Attributes
```html
<!-- Tab Navigation -->
<div role="tablist" aria-label="Category type selection">
  <button
    role="tab"
    aria-selected="true"
    aria-controls="expense-panel"
    id="expense-tab"
  >
    Expense Categories
  </button>
  <button
    role="tab"
    aria-selected="false"
    aria-controls="cogs-panel"
    id="cogs-tab"
  >
    COGS Categories
  </button>
</div>

<!-- Tab Panel -->
<div
  role="tabpanel"
  id="expense-panel"
  aria-labelledby="expense-tab"
  tabindex="0"
>
  <!-- Content -->
</div>

<!-- Category Card -->
<article
  aria-label="Travel expense category"
  class="category-card"
>
  <h3 id="category-title-1">Travel</h3>
  <p aria-describedby="category-title-1">
    Business travel and transportation
  </p>
  <!-- Actions -->
</article>
```

### Screen Reader Announcements
```
// Tab switch
"Expense Categories tab selected, panel visible"

// Category added
"New category 'Travel' added successfully"

// Category deleted
"Category 'Travel' deleted"

// Search results
"6 categories found for 'travel'"
```

---

## Responsive Breakpoints

```typescript
// Tailwind breakpoints
sm: 640px   // Stack tabs vertically
md: 768px   // 2-column grid
lg: 1024px  // 3-column grid
xl: 1280px  // 3-column grid with more padding
```

### Grid Behavior
```
Mobile (< 640px):     1 column
Tablet (640-1023px):  2 columns
Desktop (>= 1024px):  3 columns
```

---

## Loading States

### Initial Page Load
```
┌───────────────────────────────────────┐
│ Category Management                   │
│                                        │
│ ┌────────┐ ┌────────┐                │
│ │░░░░░░░░│ │░░░░░░░░│  (Skeleton)    │
│ └────────┘ └────────┘                │
│                                        │
│ ┌──────────────────┐ ┌──────────────┐│
│ │░░░░░░░░░░░░░░░░░░│ │░░░░░░░░░░░░░░││
│ │░░░░░░░░░░░░░░░░░░│ │░░░░░░░░░░░░░░││
│ └──────────────────┘ └──────────────┘│
└───────────────────────────────────────┘
```

### Creating/Updating Category
```
[Save Category] → [⏳ Saving...]
```

### Deleting Category
```
[Delete] → Confirmation dialog →
"Are you sure? This cannot be undone."
[Cancel] [⏳ Deleting...]
```

---

**Document Status:** ✅ Ready for Development
**Companion Document:** category-management-ux-plan.md
**Last Updated:** 2025-10-06
