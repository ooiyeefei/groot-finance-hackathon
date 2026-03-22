# Quickstart: Debtor Self-Service Information Update

## Prerequisites
- Groot Finance dev environment running
- Convex deployment access (`npx convex deploy --yes`)
- SES domain configured (`notifications.hellogroot.com`)

## Implementation Order

### P1: Core (must ship together)
1. **Schema** — Add `debtor_update_tokens` + `debtor_change_log` tables to `convex/schema.ts`
2. **Convex Functions** — Token CRUD, form data query, submit mutation, change log, revert
3. **Public Form Page** — `/[locale]/debtor-update/[token]` with middleware public route
4. **Public Form Component** — Pre-filled customer form with submit → auto-apply
5. **Change Log UI** — Section on debtor detail page with diff view + revert button
6. **Action Center Alert** — Create alert on each submission

### P2: Distribution Channels
7. **QR Code on Invoice PDF** — Add to both templates, gated by business toggle
8. **Invoice Settings Toggle** — `enableDebtorSelfServiceQr` in settings form
9. **Email Request Button** — On debtor detail page, sends SES email with link
10. **API Route** — `/api/v1/debtor-info-request` for email sending

### P3: Bulk & Management
11. **Bulk Email** — Multi-select in debtor list + bulk send API
12. **Token Management** — Status display, regenerate/copy link on debtor detail

## Key Files to Create
```
src/app/[locale]/debtor-update/[token]/page.tsx          # Public form page
src/domains/sales-invoices/components/public-debtor-form.tsx  # Public form component
src/domains/sales-invoices/components/debtor-change-log.tsx   # Change history UI
src/domains/sales-invoices/components/debtor-qr-code.tsx      # QR code generator
convex/functions/debtorSelfService.ts                     # All Convex functions
src/app/api/v1/debtor-info-request/route.ts               # Email send API
```

## Key Files to Modify
```
convex/schema.ts                              # Add 2 new tables + invoiceSettings field
src/middleware.ts                              # Add public route
src/domains/sales-invoices/components/debtor-detail.tsx    # Add change log + token management + email button
src/domains/sales-invoices/components/debtor-list.tsx      # Add bulk selection + action
src/domains/sales-invoices/components/invoice-templates/pdf-document.tsx    # Add QR code
src/domains/sales-invoices/components/invoice-templates/template-modern.tsx # Add QR code
src/domains/sales-invoices/components/invoice-templates/template-classic.tsx # Add QR code
src/domains/sales-invoices/components/invoice-settings-form.tsx # Add toggle
```

## Verification
```bash
# After schema changes:
npx convex deploy --yes

# After all changes:
npm run build  # Must pass

# Manual testing:
# 1. Create a token via Convex dashboard or test script
# 2. Visit /en/debtor-update/{token} — form should load
# 3. Submit update — customer record should change, change log entry created
# 4. Check Action Center — alert should appear
# 5. Generate invoice PDF — QR code should appear in footer
# 6. Scan QR — should open form
```
