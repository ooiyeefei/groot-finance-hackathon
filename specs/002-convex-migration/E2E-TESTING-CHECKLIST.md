# End-to-End Testing Checklist - Convex Migration

## Overview
This checklist covers all domains after the Supabase → Convex migration.

---

## 1. Authentication & Business Context

### Login Flow
- [ ] Sign in with Clerk
- [ ] Verify user created/synced in Convex `users` table
- [ ] Business context loads correctly
- [ ] Business switching works (if multiple businesses)

### User Profile
- [ ] Profile data displays correctly
- [ ] Profile update saves to Convex
- [ ] Role and permissions reflect correctly

---

## 2. Account Management

### Business Settings
- [ ] View business profile
- [ ] Update business name/details
- [ ] Upload/change business logo (→ AWS S3)
- [ ] Currency settings saved

### Team Management
- [ ] View team members list
- [ ] Invite new member (email invitation)
- [ ] Change member role (admin/manager/employee)
- [ ] Assign manager hierarchy
- [ ] Remove team member

---

## 3. Expense Claims (Core Workflow)

### Create Expense
- [ ] Upload receipt image (→ AWS S3)
- [ ] AI classification runs (Trigger.dev)
- [ ] Data extraction completes
- [ ] Draft expense created in Convex

### Edit & Submit
- [ ] Edit extracted data
- [ ] Add business purpose
- [ ] Select expense category
- [ ] Submit for approval

### Approval Workflow
- [ ] Expense appears in manager's approval queue
- [ ] Approve expense → creates accounting entry
- [ ] Reject expense → returns to draft
- [ ] Reimbursement processing (admin)

### Real-time Updates
- [ ] Status changes reflect immediately (Convex subscription)
- [ ] Processing status updates in real-time

---

## 4. Invoices (Document Processing)

### Upload Invoice
- [ ] Upload PDF/image invoice (→ AWS S3)
- [ ] Classification validates document type
- [ ] OCR extraction runs

### Invoice Management
- [ ] View invoice details
- [ ] Edit extracted data
- [ ] Create accounting entry from invoice

### Error Handling
- [ ] Wrong document type → classification_failed
- [ ] LLM-generated error suggestions display

---

## 5. Accounting Entries

### CRUD Operations
- [ ] List accounting entries (with pagination)
- [ ] View entry details with line items
- [ ] Create manual entry
- [ ] Edit existing entry
- [ ] Delete draft entry

### Filters & Search
- [ ] Filter by date range
- [ ] Filter by type (Income/Expense)
- [ ] Filter by status (draft/posted/void)
- [ ] Search by vendor/description

---

## 6. AI Assistant (Chat)

### Conversations
- [ ] Start new conversation
- [ ] Send message → receive AI response
- [ ] Citations display correctly
- [ ] Conversation persists in Convex

### History
- [ ] Load conversation history
- [ ] Switch between conversations
- [ ] Delete conversation
- [ ] Real-time message updates

---

## 7. Analytics Dashboard

### Metrics
- [ ] Revenue/expense totals display
- [ ] Cash flow chart renders
- [ ] Category breakdown accurate
- [ ] Multi-currency handling

### Time Periods
- [ ] Daily/Weekly/Monthly views
- [ ] Custom date range

---

## 8. Vendors

### Management
- [ ] List vendors
- [ ] Create new vendor
- [ ] Edit vendor details
- [ ] Vendor auto-suggestions in forms

---

## 9. Billing (Stripe Integration)

### Subscription
- [ ] View current subscription
- [ ] Usage metrics display
- [ ] Upgrade/downgrade plan
- [ ] Billing portal access

### Webhooks
- [ ] Stripe events processed
- [ ] Subscription status synced

---

## 10. Background Jobs (Trigger.dev)

### Document Processing
- [ ] classify-document task completes
- [ ] extract-receipt-data task completes
- [ ] extract-invoice-data task completes
- [ ] PDF conversion works

### Status Updates
- [ ] Trigger.dev → Convex updates work
- [ ] Stuck records detected and recoverable

---

## 11. File Storage (AWS S3)

### Upload Operations
- [ ] Receipt upload → S3 success
- [ ] Invoice upload → S3 success
- [ ] Logo upload → S3 success

### Download/View
- [ ] Signed URLs generated correctly
- [ ] Images display in UI
- [ ] PDF preview works

---

## 12. Error Scenarios

### Network Errors
- [ ] Offline handling graceful
- [ ] Retry logic works
- [ ] Error messages user-friendly

### Permission Errors
- [ ] Unauthorized access blocked
- [ ] Role-based UI elements correct
- [ ] Cross-business access prevented

---

## Quick Smoke Test (5 minutes)

1. [ ] Login → Dashboard loads
2. [ ] Upload receipt → Processing starts
3. [ ] View expense claims list
4. [ ] Start AI chat → Get response
5. [ ] View accounting entries
6. [ ] Check team members list

---

## Notes

- All data now stored in Convex (no Supabase dependencies)
- File storage migrated to AWS S3
- Real-time updates via Convex subscriptions
- Trigger.dev tasks use Convex system functions

**Last Updated**: 2026-01-03
