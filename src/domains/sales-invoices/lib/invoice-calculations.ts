/**
 * Invoice Calculation Utilities
 *
 * Pure functions for calculating invoice line totals, subtotals,
 * tax amounts, and grand totals. Supports both tax-inclusive
 * and tax-exclusive modes.
 */

import type { LineItem, TaxMode, DiscountType } from "../types";

/**
 * Calculate the discount amount for a line item
 */
export function calculateDiscountAmount(
  baseAmount: number,
  discountType?: DiscountType,
  discountValue?: number
): number {
  if (!discountType || !discountValue || discountValue <= 0) return 0;

  if (discountType === "percentage") {
    return Math.round(baseAmount * (discountValue / 100) * 100) / 100;
  }
  return Math.min(discountValue, baseAmount);
}

/**
 * Calculate the total for a single line item
 *
 * Tax-exclusive: total = (qty * price - discount) + tax
 * Tax-inclusive: total = qty * price - discount (tax is embedded)
 */
export function calculateLineTotal(
  quantity: number,
  unitPrice: number,
  taxRate: number = 0,
  taxMode: TaxMode = "exclusive",
  discountType?: DiscountType,
  discountValue?: number
): {
  lineSubtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
} {
  const grossAmount = Math.round(quantity * unitPrice * 100) / 100;
  const discountAmount = calculateDiscountAmount(grossAmount, discountType, discountValue);
  const afterDiscount = grossAmount - discountAmount;

  let taxAmount: number;
  let totalAmount: number;

  if (taxMode === "inclusive") {
    // Price already includes tax
    taxAmount = taxRate > 0
      ? Math.round((afterDiscount * taxRate / (1 + taxRate)) * 100) / 100
      : 0;
    totalAmount = Math.round(afterDiscount * 100) / 100;
  } else {
    // Tax added on top
    taxAmount = Math.round(afterDiscount * taxRate * 100) / 100;
    totalAmount = Math.round((afterDiscount + taxAmount) * 100) / 100;
  }

  return {
    lineSubtotal: grossAmount,
    discountAmount,
    taxAmount,
    totalAmount,
  };
}

/**
 * Recalculate a full line item with all derived fields
 */
export function recalculateLineItem(
  item: Partial<LineItem> & { quantity: number; unitPrice: number; currency: string },
  taxMode: TaxMode
): LineItem {
  const { lineSubtotal, discountAmount, taxAmount, totalAmount } = calculateLineTotal(
    item.quantity,
    item.unitPrice,
    item.taxRate ?? 0,
    taxMode,
    item.discountType,
    item.discountValue
  );

  return {
    lineOrder: item.lineOrder ?? 0,
    description: item.description ?? "",
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    taxRate: item.taxRate,
    taxAmount,
    discountType: item.discountType,
    discountValue: item.discountValue,
    discountAmount,
    totalAmount,
    currency: item.currency,
    itemCode: item.itemCode,
    unitMeasurement: item.unitMeasurement,
    catalogItemId: item.catalogItemId,
  };
}

/**
 * Calculate subtotal (sum of line qty * price before tax/discount)
 */
export function calculateSubtotal(lineItems: LineItem[]): number {
  return Math.round(
    lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * 100
  ) / 100;
}

/**
 * Calculate total tax across all line items
 */
export function calculateTotalTax(lineItems: LineItem[]): number {
  return Math.round(
    lineItems.reduce((sum, item) => sum + (item.taxAmount ?? 0), 0) * 100
  ) / 100;
}

/**
 * Calculate total discount across all line items
 */
export function calculateTotalLineDiscount(lineItems: LineItem[]): number {
  return Math.round(
    lineItems.reduce((sum, item) => sum + (item.discountAmount ?? 0), 0) * 100
  ) / 100;
}

/**
 * Apply an invoice-level discount to the subtotal
 */
export function applyInvoiceDiscount(
  subtotal: number,
  discountType?: DiscountType,
  discountValue?: number
): number {
  return calculateDiscountAmount(subtotal, discountType, discountValue);
}

/**
 * Calculate the complete invoice totals
 */
export function calculateInvoiceTotals(
  lineItems: LineItem[],
  taxMode: TaxMode,
  invoiceDiscountType?: DiscountType,
  invoiceDiscountValue?: number,
): {
  subtotal: number;
  totalLineDiscount: number;
  invoiceDiscount: number;
  totalDiscount: number;
  totalTax: number;
  totalAmount: number;
} {
  // Recalculate all lines first
  const recalculated = lineItems.map((item) => recalculateLineItem(item, taxMode));

  const subtotal = calculateSubtotal(recalculated);
  const totalLineDiscount = calculateTotalLineDiscount(recalculated);
  const totalTax = calculateTotalTax(recalculated);

  // Sum of line totals (after per-line discount and tax)
  const lineTotalsSum = Math.round(
    recalculated.reduce((sum, item) => sum + item.totalAmount, 0) * 100
  ) / 100;

  // Invoice-level discount applied to line totals sum
  const invoiceDiscount = applyInvoiceDiscount(lineTotalsSum, invoiceDiscountType, invoiceDiscountValue);
  const totalDiscount = totalLineDiscount + invoiceDiscount;

  const totalAmount = Math.round((lineTotalsSum - invoiceDiscount) * 100) / 100;

  return {
    subtotal,
    totalLineDiscount,
    invoiceDiscount,
    totalDiscount,
    totalTax,
    totalAmount: Math.max(0, totalAmount),
  };
}

/**
 * Get tax breakdown by rate (for display)
 */
export function getTaxBreakdown(lineItems: LineItem[]): Array<{ rate: number; amount: number }> {
  const breakdown = new Map<number, number>();

  for (const item of lineItems) {
    const rate = item.taxRate ?? 0;
    if (rate > 0 && (item.taxAmount ?? 0) > 0) {
      breakdown.set(rate, (breakdown.get(rate) ?? 0) + (item.taxAmount ?? 0));
    }
  }

  return Array.from(breakdown.entries())
    .map(([rate, amount]) => ({
      rate,
      amount: Math.round(amount * 100) / 100,
    }))
    .sort((a, b) => a.rate - b.rate);
}
