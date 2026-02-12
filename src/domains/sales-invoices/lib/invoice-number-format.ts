/**
 * Invoice Number Formatting Utilities
 *
 * Handles invoice number generation with the pattern: {prefix}-{YYYY}-{NNN}
 * and due date computation from payment terms.
 */

import type { PaymentTerms } from "../types";
import { PAYMENT_TERMS_DAYS } from "../types";

/**
 * Format an invoice number from components
 *
 * @param prefix - Invoice number prefix (default: "INV")
 * @param year - 4-digit year
 * @param sequence - Sequential number
 * @param padLength - Zero-padding length (default: 3)
 * @returns Formatted invoice number, e.g., "INV-2026-001"
 */
export function formatInvoiceNumber(
  prefix: string = "INV",
  year: number,
  sequence: number,
  padLength: number = 3
): string {
  const paddedSequence = String(sequence).padStart(padLength, "0");
  return `${prefix}-${year}-${paddedSequence}`;
}

/**
 * Compute due date from invoice date and payment terms
 *
 * @param invoiceDate - Invoice date in ISO YYYY-MM-DD format
 * @param paymentTerms - Payment terms enum value
 * @param customDueDate - Custom due date (used when paymentTerms is "custom")
 * @returns Due date in ISO YYYY-MM-DD format
 */
export function computeDueDate(
  invoiceDate: string,
  paymentTerms: PaymentTerms,
  customDueDate?: string
): string {
  if (paymentTerms === "custom" && customDueDate) {
    return customDueDate;
  }

  const days = PAYMENT_TERMS_DAYS[paymentTerms] ?? 30;
  const date = new Date(invoiceDate + "T00:00:00");
  date.setDate(date.getDate() + days);

  return date.toISOString().split("T")[0];
}

/**
 * Parse an invoice number into components
 *
 * @param invoiceNumber - e.g., "INV-2026-001"
 * @returns Parsed components or null if invalid
 */
export function parseInvoiceNumber(invoiceNumber: string): {
  prefix: string;
  year: number;
  sequence: number;
} | null {
  const match = invoiceNumber.match(/^(.+)-(\d{4})-(\d+)$/);
  if (!match) return null;

  return {
    prefix: match[1],
    year: parseInt(match[2], 10),
    sequence: parseInt(match[3], 10),
  };
}
