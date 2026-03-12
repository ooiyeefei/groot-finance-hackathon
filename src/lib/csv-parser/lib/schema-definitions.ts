import type { SchemaField, SchemaType } from "../types";

export const SALES_STATEMENT_FIELDS: SchemaField[] = [
  {
    name: "orderReference",
    label: "Order Reference",
    type: "string",
    required: true,
    aliases: [
      "order id",
      "order no",
      "order number",
      "transaction id",
      "ref no",
      "reference",
      "invoice no",
      "receipt no",
    ],
  },
  {
    name: "orderDate",
    label: "Order Date",
    type: "date",
    required: true,
    aliases: [
      "order date",
      "transaction date",
      "date",
      "created date",
      "sale date",
    ],
  },
  {
    name: "productName",
    label: "Product Name",
    type: "string",
    required: false,
    aliases: [
      "item name",
      "product",
      "description",
      "item description",
      "product name",
      "product title",
    ],
  },
  {
    name: "productCode",
    label: "Product Code",
    type: "string",
    required: false,
    aliases: [
      "sku",
      "seller sku",
      "item code",
      "product code",
      "barcode",
      "upc",
    ],
  },
  {
    name: "quantity",
    label: "Quantity",
    type: "number",
    required: false,
    aliases: ["qty", "quantity", "units", "count", "no of items"],
  },
  {
    name: "unitPrice",
    label: "Unit Price",
    type: "number",
    required: false,
    aliases: [
      "unit price",
      "price",
      "item price",
      "selling price",
      "rate",
    ],
  },
  {
    name: "grossAmount",
    label: "Gross Amount",
    type: "number",
    required: true,
    aliases: [
      "total",
      "gross",
      "amount",
      "order total",
      "gross amount",
      "subtotal",
      "total amount",
      "order amount",
    ],
  },
  {
    name: "platformFee",
    label: "Platform Fee",
    type: "number",
    required: false,
    aliases: [
      "commission",
      "fee",
      "service charge",
      "platform fee",
      "marketplace fee",
      "seller fee",
      "transaction fee",
    ],
  },
  {
    name: "netAmount",
    label: "Net Amount",
    type: "number",
    required: false,
    aliases: [
      "net",
      "settlement",
      "payout",
      "net amount",
      "seller proceeds",
      "net payout",
    ],
  },
  {
    name: "currency",
    label: "Currency",
    type: "string",
    required: false,
    aliases: ["currency", "ccy", "currency code"],
  },
  {
    name: "customerName",
    label: "Customer Name",
    type: "string",
    required: false,
    aliases: [
      "customer",
      "buyer",
      "customer name",
      "buyer name",
      "client",
    ],
  },
  {
    name: "paymentMethod",
    label: "Payment Method",
    type: "string",
    required: false,
    aliases: [
      "payment type",
      "payment method",
      "method",
      "pay method",
      "payment mode",
    ],
  },
  {
    name: "commissionFee",
    label: "Commission Fee",
    type: "number",
    required: false,
    aliases: [
      "commission",
      "commission fee",
      "seller commission",
      "marketplace commission",
      "referral fee",
    ],
  },
  {
    name: "shippingFee",
    label: "Shipping Fee",
    type: "number",
    required: false,
    aliases: [
      "shipping",
      "shipping fee",
      "delivery fee",
      "postage",
      "freight",
      "shipping cost",
    ],
  },
  {
    name: "marketingFee",
    label: "Marketing Fee",
    type: "number",
    required: false,
    aliases: [
      "marketing",
      "marketing fee",
      "ads fee",
      "advertising",
      "promo fee",
      "sponsored fee",
    ],
  },
  {
    name: "refundAmount",
    label: "Refund Amount",
    type: "number",
    required: false,
    aliases: [
      "refund",
      "refund amount",
      "return amount",
      "credit back",
      "reimbursement",
    ],
  },
];

export const BANK_STATEMENT_FIELDS: SchemaField[] = [
  {
    name: "transactionDate",
    label: "Transaction Date",
    type: "date",
    required: true,
    aliases: [
      "transaction date",
      "date",
      "value date",
      "posting date",
      "txn date",
    ],
  },
  {
    name: "description",
    label: "Description",
    type: "string",
    required: true,
    aliases: [
      "description",
      "narrative",
      "details",
      "particulars",
      "transaction description",
      "remarks",
    ],
  },
  {
    name: "debitAmount",
    label: "Debit Amount",
    type: "number",
    required: false,
    aliases: [
      "debit",
      "withdrawal",
      "debit amount",
      "dr",
      "outflow",
      "payment",
    ],
  },
  {
    name: "creditAmount",
    label: "Credit Amount",
    type: "number",
    required: false,
    aliases: [
      "credit",
      "deposit",
      "credit amount",
      "cr",
      "inflow",
      "receipt",
    ],
  },
  {
    name: "balance",
    label: "Balance",
    type: "number",
    required: false,
    aliases: [
      "balance",
      "running balance",
      "closing balance",
      "available balance",
      "ledger balance",
    ],
  },
  {
    name: "reference",
    label: "Reference",
    type: "string",
    required: false,
    aliases: [
      "reference",
      "ref no",
      "cheque no",
      "check no",
      "transaction ref",
      "trace no",
    ],
  },
  {
    name: "transactionType",
    label: "Transaction Type",
    type: "string",
    required: false,
    aliases: [
      "type",
      "transaction type",
      "txn type",
      "trf",
      "category",
      "channel",
    ],
  },
];

export function getSchemaFields(schemaType: SchemaType): SchemaField[] {
  return schemaType === "sales_statement"
    ? SALES_STATEMENT_FIELDS
    : BANK_STATEMENT_FIELDS;
}

export function getRequiredFields(schemaType: SchemaType): SchemaField[] {
  return getSchemaFields(schemaType).filter((f) => f.required);
}

export function getAllFieldNames(schemaType: SchemaType): string[] {
  return getSchemaFields(schemaType).map((f) => f.name);
}
