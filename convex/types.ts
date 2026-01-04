// convex/types.ts
import { Doc, Id } from "./_generated/dataModel";

// Re-export generated types for convenience
export type User = Doc<"users">;
export type Business = Doc<"businesses">;
export type BusinessMembership = Doc<"business_memberships">;
export type AccountingEntry = Doc<"accounting_entries">;
export type ExpenseClaim = Doc<"expense_claims">;
export type Invoice = Doc<"invoices">;
export type Conversation = Doc<"conversations">;
export type Message = Doc<"messages">;
export type Vendor = Doc<"vendors">;
export type StripeEvent = Doc<"stripe_events">;
export type OcrUsage = Doc<"ocr_usage">;

// Embedded types (not separate tables)
export type LineItem = NonNullable<AccountingEntry["lineItems"]>[number];

// ID types
export type UserId = Id<"users">;
export type BusinessId = Id<"businesses">;
export type AccountingEntryId = Id<"accounting_entries">;
export type ExpenseClaimId = Id<"expense_claims">;
export type InvoiceId = Id<"invoices">;
export type ConversationId = Id<"conversations">;
export type MessageId = Id<"messages">;
// Storage paths are strings (S3 keys), not Convex storage IDs
export type StoragePath = string;  // e.g., "{businessId}/{userId}/{docType}/{docId}/{stage}/{filename}"

// Enums
export type UserRole = "owner" | "admin" | "manager" | "employee";
export type MembershipStatus = "active" | "suspended" | "pending";
export type TransactionType = "Income" | "Cost of Goods Sold" | "Expense";
export type TransactionStatus = "pending" | "paid" | "cancelled" | "overdue";
export type ExpenseStatus = "draft" | "submitted" | "approved" | "rejected" | "reimbursed";
export type DocumentType = "invoice" | "receipt" | "contract";
export type ProcessingStatus = "pending" | "processing" | "completed" | "failed";
export type MessageRole = "user" | "assistant" | "system";
