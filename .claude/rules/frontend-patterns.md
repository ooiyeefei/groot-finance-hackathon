---
paths:
  - "src/app/**"
  - "src/domains/*/components/**"
  - "src/components/**"
---
# Frontend Patterns

## Page Layout Pattern (MANDATORY)

- **All pages under `src/app/[locale]/`** must include `<Sidebar />` and `<HeaderWithUser />`
- Pages must be **server components** (no `'use client'`) that wrap client content components
- Pattern: `export const dynamic = 'force-dynamic'` -> `auth()` check -> `<ClientProviders>` -> `<Sidebar />` + `<HeaderWithUser>` + `<main>` -> `<ClientComponent />`
- **Never create standalone client-only pages** without the app shell (sidebar + header)
- Reference: `expense-claims/page.tsx`

## Design System

- **Use semantic tokens**: `bg-card`, `text-foreground`, `bg-primary`
- **Never hardcode colors**: No `bg-gray-700`, `text-white`
- **Layer hierarchy**: `bg-background` -> `bg-surface` -> `bg-card` -> `bg-muted`
- **Check first**: `src/components/ui/`, `src/app/globals.css`

## Button Styling (MANDATORY)

- **Action buttons** (Save, Submit, Confirm, Create, Post): `bg-primary hover:bg-primary/90 text-primary-foreground`
- **Destructive buttons** (Delete, Remove, Reverse): `bg-destructive hover:bg-destructive/90 text-destructive-foreground`
- **Cancel/Neutral buttons** (Cancel, Close, Draft): `bg-secondary hover:bg-secondary/80 text-secondary-foreground`
- **Never use `variant="outline"` or `variant="ghost"` for visible action/cancel buttons** -- ghost only for small inline icon-only buttons (table row actions)
- Never use gray/secondary styling for action buttons

## Feature Info Drawer Pattern (MANDATORY)

Every new feature page/tab MUST include a "How It Works" info drawer:
- **Trigger**: Ghost `Info` icon button in page header
- **Component**: `Sheet` from `@/components/ui/sheet` (slides from right)
- **Content**: Title -> Description -> Numbered steps -> Status badges/legend -> Tips -> Settings link
- **Reference**: `documents-inbox-client.tsx` (`HowItWorksDrawer`), `documents-container.tsx` (`EInvoiceHowItWorksDrawer`)
