/**
 * Sales Invoice Types & Zod Validation Schemas
 *
 * Type definitions for the sales invoice generation domain.
 * Zod schemas provide runtime validation for form inputs.
 */

import { z } from "zod";
import type { Id } from "../../../../convex/_generated/dataModel";

// ============================================
// ENUMS & CONSTANTS
// ============================================

export const SALES_INVOICE_STATUSES = {
  DRAFT: "draft",
  SENT: "sent",
  PARTIALLY_PAID: "partially_paid",
  PAID: "paid",
  OVERDUE: "overdue",
  VOID: "void",
} as const;

export type SalesInvoiceStatus = typeof SALES_INVOICE_STATUSES[keyof typeof SALES_INVOICE_STATUSES];

export const PAYMENT_TERMS = {
  DUE_ON_RECEIPT: "due_on_receipt",
  NET_15: "net_15",
  NET_30: "net_30",
  NET_60: "net_60",
  CUSTOM: "custom",
} as const;

export type PaymentTerms = typeof PAYMENT_TERMS[keyof typeof PAYMENT_TERMS];

export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  due_on_receipt: "Due on Receipt",
  net_15: "Net 15",
  net_30: "Net 30",
  net_60: "Net 60",
  custom: "Custom",
};

export const PAYMENT_TERMS_DAYS: Record<string, number> = {
  due_on_receipt: 0,
  net_15: 15,
  net_30: 30,
  net_60: 60,
};

export const TAX_MODES = {
  EXCLUSIVE: "exclusive",
  INCLUSIVE: "inclusive",
} as const;

export type TaxMode = typeof TAX_MODES[keyof typeof TAX_MODES];

export const DISCOUNT_TYPES = {
  PERCENTAGE: "percentage",
  FIXED: "fixed",
} as const;

export type DiscountType = typeof DISCOUNT_TYPES[keyof typeof DISCOUNT_TYPES];

export const RECURRING_FREQUENCIES = {
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  YEARLY: "yearly",
} as const;

export type RecurringFrequency = typeof RECURRING_FREQUENCIES[keyof typeof RECURRING_FREQUENCIES];

export const CUSTOMER_STATUSES = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;

export type CustomerStatus = typeof CUSTOMER_STATUSES[keyof typeof CUSTOMER_STATUSES];

export const CATALOG_ITEM_STATUSES = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;

export type CatalogItemStatus = typeof CATALOG_ITEM_STATUSES[keyof typeof CATALOG_ITEM_STATUSES];

// ============================================
// NOTE & PAYMENT INSTRUCTION TEMPLATES
// ============================================

export const NOTE_TEMPLATES: Array<{ label: string; text: string }> = [
  {
    label: "Thank you",
    text: "Thank you for your business. We appreciate your prompt payment.",
  },
  {
    label: "Late payment",
    text: "Please note that a late payment fee of 1.5% per month will be applied to overdue invoices.",
  },
  {
    label: "Warranty",
    text: "All goods/services are covered by our standard warranty terms. Please refer to our terms and conditions for details.",
  },
  {
    label: "Tax note",
    text: "This invoice includes applicable taxes. Please retain for your tax records.",
  },
  {
    label: "Enquiries",
    text: "For any questions regarding this invoice, please contact our accounts department at the email or phone number listed above.",
  },
];

export const PAYMENT_INSTRUCTION_TEMPLATES: Array<{ label: string; text: string }> = [
  {
    label: "Bank transfer",
    text: "Bank: [Bank Name]\nAccount Name: [Company Name]\nAccount Number: [Account Number]\nSwift Code: [SWIFT]",
  },
  {
    label: "PayNow (SG)",
    text: "PayNow UEN: [UEN Number]\nPayNow QR available upon request.",
  },
  {
    label: "Multi-method",
    text: "Accepted payment methods:\n- Bank transfer (details above)\n- Cheque payable to [Company Name]\n- Credit card (please contact us)",
  },
];

export const INVOICE_TEMPLATES = {
  MODERN: "modern",
  CLASSIC: "classic",
} as const;

export type InvoiceTemplate = typeof INVOICE_TEMPLATES[keyof typeof INVOICE_TEMPLATES];

export const SUPPORTED_CURRENCIES = [
  "SGD", "MYR", "THB", "IDR", "PHP", "VND", "USD", "EUR", "CNY",
] as const;

export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export const PAYMENT_METHODS = [
  "bank_transfer", "cash", "card", "cheque", "other",
] as const;

export type PaymentMethod = typeof PAYMENT_METHODS[number];

// ============================================
// LINE ITEM TYPES
// ============================================

export interface LineItem {
  lineOrder: number;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  taxAmount?: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount?: number;
  totalAmount: number;
  currency: string;
  itemCode?: string;
  unitMeasurement?: string;
  catalogItemId?: string;
}

export const lineItemSchema = z.object({
  lineOrder: z.number().int().min(0),
  description: z.string().min(1, "Description is required"),
  quantity: z.number().positive("Quantity must be greater than 0"),
  unitPrice: z.number().min(0, "Unit price must be non-negative"),
  taxRate: z.number().min(0).max(1).optional(),
  taxAmount: z.number().optional(),
  discountType: z.enum(["percentage", "fixed"]).optional(),
  discountValue: z.number().min(0).optional(),
  discountAmount: z.number().optional(),
  totalAmount: z.number(),
  currency: z.string().min(1),
  itemCode: z.string().optional(),
  unitMeasurement: z.string().optional(),
  catalogItemId: z.string().optional(),
});

// ============================================
// CUSTOMER SNAPSHOT
// ============================================

export interface CustomerSnapshot {
  businessName: string;
  contactPerson?: string;
  email: string;
  phone?: string;
  address?: string;
  taxId?: string;
}

export const customerSnapshotSchema = z.object({
  businessName: z.string().min(1, "Customer name is required"),
  contactPerson: z.string().optional(),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  address: z.string().optional(),
  taxId: z.string().optional(),
});

// ============================================
// SALES INVOICE
// ============================================

export interface SalesInvoice {
  _id: Id<"sales_invoices">;
  _creationTime: number;
  businessId: Id<"businesses">;
  userId: Id<"users">;
  invoiceNumber: string;
  customerId?: Id<"customers">;
  customerSnapshot: CustomerSnapshot;
  lineItems: LineItem[];
  subtotal: number;
  totalDiscount?: number;
  invoiceDiscountType?: DiscountType;
  invoiceDiscountValue?: number;
  totalTax: number;
  totalAmount: number;
  amountPaid?: number;
  balanceDue: number;
  currency: string;
  exchangeRate?: number;
  homeCurrencyAmount?: number;
  taxMode: TaxMode;
  invoiceDate: string;
  dueDate: string;
  sentAt?: number;
  paidAt?: string;
  voidedAt?: number;
  paymentTerms: PaymentTerms;
  status: SalesInvoiceStatus;
  notes?: string;
  paymentInstructions?: string;
  templateId?: string;
  signatureName?: string;
  recurringScheduleId?: string;
  isRecurringSource?: boolean;
  pdfStorageId?: string;
  accountingEntryId?: string;
  deletedAt?: number;
  updatedAt?: number;
}

// ============================================
// CUSTOMER
// ============================================

export interface Customer {
  _id: Id<"customers">;
  _creationTime: number;
  businessId: Id<"businesses">;
  businessName: string;
  contactPerson?: string;
  email: string;
  phone?: string;
  address?: string;
  taxId?: string;
  customerCode?: string;
  notes?: string;
  status: CustomerStatus;
  deletedAt?: number;
  updatedAt?: number;
}

export const customerFormSchema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  contactPerson: z.string().optional(),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  address: z.string().optional(),
  taxId: z.string().optional(),
  customerCode: z.string().optional(),
  notes: z.string().optional(),
});

// ============================================
// CATALOG ITEM
// ============================================

export interface CatalogItem {
  _id: Id<"catalog_items">;
  _creationTime: number;
  businessId: Id<"businesses">;
  name: string;
  description?: string;
  sku?: string;
  unitPrice: number;
  currency: string;
  unitMeasurement?: string;
  taxRate?: number;
  category?: string;
  status: CatalogItemStatus;
  deletedAt?: number;
  updatedAt?: number;
}

export const catalogItemFormSchema = z.object({
  name: z.string().min(1, "Item name is required"),
  description: z.string().optional(),
  sku: z.string().optional(),
  unitPrice: z.number().min(0, "Price must be non-negative"),
  currency: z.string().min(1, "Currency is required"),
  unitMeasurement: z.string().optional(),
  taxRate: z.number().min(0).max(1).optional(),
  category: z.string().optional(),
});

// ============================================
// INVOICE SETTINGS
// ============================================

export interface InvoiceSettings {
  logoStorageId?: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  registrationNumber?: string;
  taxId?: string;
  defaultCurrency?: string;
  invoiceNumberPrefix?: string;
  nextInvoiceNumber?: number;
  defaultPaymentTerms?: string;
  defaultPaymentInstructions?: string;
  selectedTemplate?: string;
}

export const invoiceSettingsSchema = z.object({
  logoStorageId: z.string().optional(),
  companyName: z.string().optional(),
  companyAddress: z.string().optional(),
  companyPhone: z.string().optional(),
  companyEmail: z.string().optional(),
  registrationNumber: z.string().optional(),
  taxId: z.string().optional(),
  defaultCurrency: z.string().optional(),
  invoiceNumberPrefix: z.string().optional(),
  defaultPaymentTerms: z.string().optional(),
  defaultPaymentInstructions: z.string().optional(),
  selectedTemplate: z.string().optional(),
});

// ============================================
// RECURRING INVOICE SCHEDULE
// ============================================

export interface RecurringInvoiceSchedule {
  _id: Id<"recurring_invoice_schedules">;
  _creationTime: number;
  businessId: Id<"businesses">;
  sourceInvoiceId: Id<"sales_invoices">;
  frequency: RecurringFrequency;
  nextGenerationDate: string;
  endDate?: string;
  isActive: boolean;
  lastGeneratedAt?: number;
  generationCount?: number;
  deletedAt?: number;
  updatedAt?: number;
}

// ============================================
// INVOICE FORM INPUT (for create/update)
// ============================================

export const salesInvoiceFormSchema = z.object({
  customerSnapshot: customerSnapshotSchema,
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
  currency: z.enum(SUPPORTED_CURRENCIES as unknown as [string, ...string[]]),
  taxMode: z.enum(["exclusive", "inclusive"]),
  invoiceDate: z.string().min(1, "Invoice date is required"),
  paymentTerms: z.enum(["due_on_receipt", "net_15", "net_30", "net_60", "custom"]),
  dueDate: z.string().min(1, "Due date is required"),
  notes: z.string().optional(),
  paymentInstructions: z.string().optional(),
  templateId: z.string().optional(),
  signatureName: z.string().optional(),
  invoiceDiscountType: z.enum(["percentage", "fixed"]).optional(),
  invoiceDiscountValue: z.number().min(0).optional(),
  customerId: z.string().optional(),
});

export type SalesInvoiceFormInput = z.infer<typeof salesInvoiceFormSchema>;

// ============================================
// PAYMENT RECORDING
// ============================================

export const recordPaymentSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  paymentDate: z.string().min(1, "Payment date is required"),
  paymentMethod: z.string().optional(),
  paymentReference: z.string().optional(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

// ============================================
// LIST QUERY TYPES
// ============================================

export interface SalesInvoiceListSummary {
  totalDraft: number;
  totalSent: number;
  totalOverdue: number;
  totalPaid: number;
  totalOutstanding: number;
}

export interface SalesInvoiceListResult {
  invoices: SalesInvoice[];
  nextCursor: string | null;
  totalCount: number;
  summary: SalesInvoiceListSummary;
}

// ============================================
// PAYMENT TYPES (010-ar-debtor-management)
// ============================================

export const PAYMENT_TYPES = {
  PAYMENT: "payment",
  REVERSAL: "reversal",
} as const;

export type PaymentType = typeof PAYMENT_TYPES[keyof typeof PAYMENT_TYPES];

export interface PaymentAllocation {
  invoiceId: Id<"sales_invoices">;
  amount: number;
  allocatedAt: number;
}

export interface Payment {
  _id: Id<"payments">;
  _creationTime: number;
  businessId: Id<"businesses">;
  customerId: Id<"customers">;
  userId: Id<"users">;
  type: PaymentType;
  amount: number;
  currency: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  notes?: string;
  reversesPaymentId?: Id<"payments">;
  allocations: PaymentAllocation[];
  updatedAt?: number;
  deletedAt?: number;
}

// ============================================
// DEBTOR TYPES (010-ar-debtor-management)
// ============================================

export interface AgingBuckets {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
}

export interface DebtorSummary {
  customerId: Id<"customers">;
  customerName: string;
  openInvoiceCount: number;
  totalOutstanding: number;
  currency: string;
  oldestOverdueDays: number;
  aging: AgingBuckets;
}

export interface DebtorDetailSummary {
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  overdueCount: number;
  currency: string;
}

export interface RunningBalanceEntry {
  date: string;
  type: "invoice" | "payment" | "reversal";
  description: string;
  debit: number;
  credit: number;
  balance: number;
  referenceId: string;
}

export interface StatementTransaction {
  date: string;
  type: "invoice" | "payment" | "reversal";
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface DebtorStatement {
  customer: {
    _id: Id<"customers">;
    name: string;
    email?: string;
    address?: string;
  };
  business: {
    name: string;
    address?: string;
    registrationNumber?: string;
  };
  period: {
    from: string;
    to: string;
  };
  openingBalance: number;
  closingBalance: number;
  currency: string;
  transactions: StatementTransaction[];
  totals: {
    totalDebits: number;
    totalCredits: number;
  };
}

// ============================================
// AGING REPORT (010-ar-debtor-management)
// ============================================

export interface AgingReportDebtor {
  customerId: Id<"customers">;
  customerName: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  total: number;
}

export interface AgingReport {
  asOfDate: string;
  currency: string;
  summary: AgingBuckets & { total: number };
  debtors: AgingReportDebtor[];
}

// ============================================
// PAYMENT FORM SCHEMAS (010-ar-debtor-management)
// ============================================

export const recordPaymentWithAllocationsSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  paymentDate: z.string().min(1, "Payment date is required"),
  paymentMethod: z.string().min(1, "Payment method is required"),
  paymentReference: z.string().optional(),
  notes: z.string().optional(),
  allocations: z.array(z.object({
    invoiceId: z.string().min(1),
    amount: z.number().positive("Allocation amount must be greater than 0"),
  })).min(1, "At least one allocation is required"),
});

export type RecordPaymentWithAllocationsInput = z.infer<typeof recordPaymentWithAllocationsSchema>;
