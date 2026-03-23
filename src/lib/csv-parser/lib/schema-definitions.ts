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

export const PURCHASE_ORDER_FIELDS: SchemaField[] = [
  {
    name: "poNumber",
    label: "PO Number",
    type: "string",
    required: true,
    aliases: [
      "po number",
      "po no",
      "po #",
      "purchase order",
      "order number",
    ],
  },
  {
    name: "poDate",
    label: "PO Date",
    type: "date",
    required: false,
    aliases: [
      "po date",
      "order date",
      "date",
      "created date",
    ],
  },
  {
    name: "vendorName",
    label: "Vendor Name",
    type: "string",
    required: true,
    aliases: [
      "vendor",
      "supplier",
      "vendor name",
      "supplier name",
    ],
  },
  {
    name: "deliveryDate",
    label: "Delivery Date",
    type: "date",
    required: false,
    aliases: [
      "delivery date",
      "required date",
      "expected date",
      "due date",
    ],
  },
  {
    name: "lineDescription",
    label: "Line Description",
    type: "string",
    required: true,
    aliases: [
      "description",
      "item",
      "item description",
      "product",
      "line description",
    ],
  },
  {
    name: "itemCode",
    label: "Item Code",
    type: "string",
    required: false,
    aliases: [
      "item code",
      "sku",
      "product code",
      "part number",
      "material code",
    ],
  },
  {
    name: "quantity",
    label: "Quantity",
    type: "number",
    required: true,
    aliases: [
      "qty",
      "quantity",
      "ordered qty",
      "order quantity",
    ],
  },
  {
    name: "unitPrice",
    label: "Unit Price",
    type: "number",
    required: true,
    aliases: [
      "unit price",
      "price",
      "rate",
      "cost",
    ],
  },
  {
    name: "totalAmount",
    label: "Total Amount",
    type: "number",
    required: false,
    aliases: [
      "total",
      "amount",
      "line total",
      "extended amount",
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
    name: "unitMeasurement",
    label: "Unit of Measure",
    type: "string",
    required: false,
    aliases: [
      "uom",
      "unit",
      "unit of measure",
      "measure",
    ],
  },
];

export const GRN_FIELDS: SchemaField[] = [
  {
    name: "grnNumber",
    label: "GRN Number",
    type: "string",
    required: true,
    aliases: [
      "grn number",
      "grn no",
      "grn #",
      "delivery note",
      "dn number",
      "receipt number",
    ],
  },
  {
    name: "grnDate",
    label: "GRN Date",
    type: "date",
    required: false,
    aliases: [
      "grn date",
      "receipt date",
      "delivery date",
      "received date",
      "date",
    ],
  },
  {
    name: "vendorName",
    label: "Vendor Name",
    type: "string",
    required: true,
    aliases: [
      "vendor",
      "supplier",
      "vendor name",
      "supplier name",
    ],
  },
  {
    name: "poNumber",
    label: "PO Number",
    type: "string",
    required: false,
    aliases: [
      "po number",
      "po no",
      "po reference",
      "purchase order",
    ],
  },
  {
    name: "lineDescription",
    label: "Line Description",
    type: "string",
    required: true,
    aliases: [
      "description",
      "item",
      "item description",
      "product",
    ],
  },
  {
    name: "itemCode",
    label: "Item Code",
    type: "string",
    required: false,
    aliases: [
      "item code",
      "sku",
      "product code",
      "part number",
    ],
  },
  {
    name: "quantityOrdered",
    label: "Quantity Ordered",
    type: "number",
    required: false,
    aliases: [
      "qty ordered",
      "ordered",
      "order qty",
      "po qty",
    ],
  },
  {
    name: "quantityReceived",
    label: "Quantity Received",
    type: "number",
    required: true,
    aliases: [
      "qty received",
      "received",
      "received qty",
      "actual qty",
      "delivered qty",
    ],
  },
  {
    name: "quantityRejected",
    label: "Quantity Rejected",
    type: "number",
    required: false,
    aliases: [
      "qty rejected",
      "rejected",
      "reject qty",
      "damaged qty",
    ],
  },
  {
    name: "condition",
    label: "Condition",
    type: "string",
    required: false,
    aliases: [
      "condition",
      "status",
      "quality",
      "inspection result",
    ],
  },
];

// 034-leave-enhance: Leave balance import schema
export const LEAVE_BALANCE_FIELDS: SchemaField[] = [
  {
    name: "employeeEmail",
    label: "Employee Email",
    type: "string",
    required: true,
    aliases: [
      "email",
      "employee",
      "staff email",
      "emp email",
      "employee email",
      "e-mail",
    ],
  },
  {
    name: "leaveTypeCode",
    label: "Leave Type Code",
    type: "string",
    required: true,
    aliases: [
      "leave type",
      "type",
      "code",
      "leave code",
      "leave category",
      "al",
      "ml",
      "el",
    ],
  },
  {
    name: "year",
    label: "Year",
    type: "number",
    required: true,
    aliases: [
      "year",
      "period",
      "fiscal year",
      "leave year",
      "calendar year",
    ],
  },
  {
    name: "entitled",
    label: "Entitled Days",
    type: "number",
    required: true,
    aliases: [
      "entitled",
      "allocation",
      "total days",
      "annual entitlement",
      "entitled days",
      "days allocated",
    ],
  },
  {
    name: "used",
    label: "Used Days",
    type: "number",
    required: false,
    aliases: [
      "used",
      "taken",
      "consumed",
      "days used",
      "days taken",
    ],
  },
  {
    name: "carryover",
    label: "Carry Over Days",
    type: "number",
    required: false,
    aliases: [
      "carryover",
      "carry over",
      "brought forward",
      "bf",
      "carry forward",
    ],
  },
  {
    name: "adjustments",
    label: "Adjustments",
    type: "number",
    required: false,
    aliases: [
      "adjustment",
      "adj",
      "manual adjustment",
      "adjustments",
    ],
  },
];

export function getSchemaFields(schemaType: SchemaType): SchemaField[] {
  switch (schemaType) {
    case "sales_statement":
      return SALES_STATEMENT_FIELDS;
    case "bank_statement":
      return BANK_STATEMENT_FIELDS;
    case "purchase_order":
      return PURCHASE_ORDER_FIELDS;
    case "goods_received_note":
      return GRN_FIELDS;
    case "leave_balance":
      return LEAVE_BALANCE_FIELDS;
    default:
      return BANK_STATEMENT_FIELDS;
  }
}

export function getRequiredFields(schemaType: SchemaType): SchemaField[] {
  return getSchemaFields(schemaType).filter((f) => f.required);
}

export function getAllFieldNames(schemaType: SchemaType): string[] {
  return getSchemaFields(schemaType).map((f) => f.name);
}
