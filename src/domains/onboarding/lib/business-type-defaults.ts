/**
 * Business Type Defaults Configuration
 *
 * Maps business types to suggested COGS and expense categories with IFRS-aligned GL codes.
 *
 * GL Code Structure (IFRS/IAS standard, adopted by MIA, ACCA, CPA):
 *   1xxx = Assets, 2xxx = Liabilities, 3xxx = Equity, 4xxx = Revenue
 *   5xxx = Cost of Goods Sold / Cost of Sales
 *   6xxx = Operating Expenses
 *   7xxx = Other Income/Expenses, 8xxx = Finance Costs, 9xxx = Tax
 *
 * This 5xxx/6xxx structure is the de facto standard across:
 * Xero, QuickBooks, MYOB, SQL Accounting MY, AutoCount, Sage.
 */

export interface CategoryDefault {
  name: string
  glCode: string
}

export interface BusinessTypeConfig {
  label: string
  description: string
  suggestedCOGS: readonly CategoryDefault[]
  suggestedExpenses: readonly CategoryDefault[]
}

export const BUSINESS_TYPE_CONFIG = {
  fnb: {
    label: 'Food & Beverage',
    description: 'Restaurants, cafes, food stalls, catering services',
    suggestedCOGS: [
      { name: 'Food Ingredients', glCode: '5100' },
      { name: 'Beverages & Drinks', glCode: '5110' },
      { name: 'Packaging & Takeaway', glCode: '5120' },
      { name: 'Kitchen Supplies & Consumables', glCode: '5130' },
      { name: 'Condiments & Sauces', glCode: '5140' },
      { name: 'Frozen & Imported Goods', glCode: '5150' },
      { name: 'Bakery & Pastry Ingredients', glCode: '5160' },
      { name: 'Other COGS', glCode: '5000' },
    ],
    suggestedExpenses: [
      { name: 'Staff Meals & Welfare', glCode: '6350' },
      { name: 'Kitchen Equipment & Smallware', glCode: '6450' },
      { name: 'Delivery & Logistics', glCode: '6410' },
      { name: 'Cleaning & Hygiene Supplies', glCode: '6310' },
      { name: 'Marketing & Promotions', glCode: '6550' },
      { name: 'Rental & Lease', glCode: '6100' },
      { name: 'Utilities', glCode: '6250' },
      { name: 'Repairs & Maintenance', glCode: '6430' },
      { name: 'Licenses & Permits', glCode: '6710' },
      { name: 'Other Expenses', glCode: '6900' },
    ],
  },

  retail: {
    label: 'Retail',
    description: 'Stores, shops, e-commerce, merchandise sales',
    suggestedCOGS: [
      { name: 'Merchandise & Inventory', glCode: '5100' },
      { name: 'Packaging & Wrapping', glCode: '5120' },
      { name: 'Shipping & Freight', glCode: '5200' },
      { name: 'Import Duties & Taxes', glCode: '5210' },
      { name: 'Warehouse & Storage', glCode: '5300' },
      { name: 'Returns & Damages', glCode: '5400' },
      { name: 'Seasonal & Promotional Stock', glCode: '5110' },
      { name: 'Other COGS', glCode: '5000' },
    ],
    suggestedExpenses: [
      { name: 'Store Rental', glCode: '6100' },
      { name: 'Point of Sale & Systems', glCode: '6700' },
      { name: 'Marketing & Advertising', glCode: '6550' },
      { name: 'Staff Welfare', glCode: '6350' },
      { name: 'Utilities', glCode: '6250' },
      { name: 'Security & Surveillance', glCode: '6440' },
      { name: 'Store Maintenance', glCode: '6430' },
      { name: 'Insurance', glCode: '6200' },
      { name: 'Delivery & Logistics', glCode: '6410' },
      { name: 'Other Expenses', glCode: '6900' },
    ],
  },

  services: {
    label: 'Professional Services',
    description: 'Consulting, agencies, freelancing, professional firms',
    suggestedCOGS: [
      { name: 'Subcontractors & Freelancers', glCode: '5300' },
      { name: 'Software & Cloud Services', glCode: '5100' },
      { name: 'Project Materials & Supplies', glCode: '5110' },
      { name: 'Research & Data Services', glCode: '5200' },
      { name: 'Outsourced Services', glCode: '5310' },
      { name: 'Tools & Platform Fees', glCode: '5120' },
      { name: 'Client Deliverables', glCode: '5130' },
      { name: 'Other COGS', glCode: '5000' },
    ],
    suggestedExpenses: [
      { name: 'Office Supplies & Stationery', glCode: '6300' },
      { name: 'Client Entertainment & Meals', glCode: '6500' },
      { name: 'Travel & Transportation', glCode: '6400' },
      { name: 'Professional Development', glCode: '6800' },
      { name: 'IT & Software Subscriptions', glCode: '6700' },
      { name: 'Marketing & Business Dev', glCode: '6550' },
      { name: 'Office Rental', glCode: '6100' },
      { name: 'Professional Fees & Licenses', glCode: '6600' },
      { name: 'Telecommunications', glCode: '6260' },
      { name: 'Other Expenses', glCode: '6900' },
    ],
  },

  manufacturing: {
    label: 'Manufacturing',
    description: 'Factories, production facilities, assembly operations',
    suggestedCOGS: [
      { name: 'Raw Materials', glCode: '5100' },
      { name: 'Components & Parts', glCode: '5110' },
      { name: 'Machinery & Equipment Parts', glCode: '5120' },
      { name: 'Packaging Materials', glCode: '5130' },
      { name: 'Direct Labour', glCode: '5200' },
      { name: 'Factory Supplies', glCode: '5140' },
      { name: 'Quality Control & Testing', glCode: '5300' },
      { name: 'Freight & Inbound Logistics', glCode: '5210' },
      { name: 'Other COGS', glCode: '5000' },
    ],
    suggestedExpenses: [
      { name: 'Factory Rental & Lease', glCode: '6100' },
      { name: 'Equipment Maintenance & Repair', glCode: '6430' },
      { name: 'Safety Equipment & PPE', glCode: '6440' },
      { name: 'Utilities & Energy', glCode: '6250' },
      { name: 'Transport & Logistics', glCode: '6400' },
      { name: 'Office & Admin Supplies', glCode: '6300' },
      { name: 'Insurance & Compliance', glCode: '6200' },
      { name: 'Staff Welfare & Training', glCode: '6800' },
      { name: 'Marketing & Sales', glCode: '6550' },
      { name: 'Other Expenses', glCode: '6900' },
    ],
  },

  other: {
    label: 'Other',
    description: 'Other business types requiring custom category setup',
    suggestedCOGS: [
      { name: 'Direct Costs', glCode: '5100' },
      { name: 'Outsourced Services', glCode: '5300' },
      { name: 'Materials & Supplies', glCode: '5110' },
      { name: 'Delivery & Shipping', glCode: '5200' },
      { name: 'Platform & Service Fees', glCode: '5120' },
      { name: 'Other COGS', glCode: '5000' },
    ],
    suggestedExpenses: [
      { name: 'Travel & Transportation', glCode: '6400' },
      { name: 'Office Supplies', glCode: '6300' },
      { name: 'Entertainment & Hospitality', glCode: '6500' },
      { name: 'IT & Software', glCode: '6700' },
      { name: 'Professional Fees', glCode: '6600' },
      { name: 'Utilities', glCode: '6250' },
      { name: 'Rental & Lease', glCode: '6100' },
      { name: 'Training & Development', glCode: '6800' },
      { name: 'Insurance', glCode: '6200' },
      { name: 'Other Expenses', glCode: '6900' },
    ],
  },
} as const;

export type BusinessType = keyof typeof BUSINESS_TYPE_CONFIG;

/**
 * Get the full configuration for a business type
 */
export function getBusinessTypeConfig(type: BusinessType): BusinessTypeConfig {
  return BUSINESS_TYPE_CONFIG[type];
}

/**
 * Get suggested category names (string array) for backward compatibility
 */
export function getSuggestedCategories(
  type: BusinessType,
  categoryType: 'cogs' | 'expense'
): readonly string[] {
  const config = BUSINESS_TYPE_CONFIG[type];
  const defaults = categoryType === 'cogs' ? config.suggestedCOGS : config.suggestedExpenses;
  return defaults.map(d => d.name);
}

/**
 * Get suggested categories with GL codes
 */
export function getSuggestedCategoriesWithGlCodes(
  type: BusinessType,
  categoryType: 'cogs' | 'expense'
): readonly CategoryDefault[] {
  const config = BUSINESS_TYPE_CONFIG[type];
  return categoryType === 'cogs' ? config.suggestedCOGS : config.suggestedExpenses;
}

/**
 * Look up a GL code for a category name from business type defaults.
 * Falls back to fuzzy matching against all known defaults.
 */
export function resolveGlCode(
  categoryName: string,
  categoryType: 'cogs' | 'expense',
  businessType?: BusinessType
): string {
  // First: exact match from specific business type
  if (businessType) {
    const defaults = categoryType === 'cogs'
      ? BUSINESS_TYPE_CONFIG[businessType].suggestedCOGS
      : BUSINESS_TYPE_CONFIG[businessType].suggestedExpenses;
    const exact = defaults.find(d => d.name.toLowerCase() === categoryName.toLowerCase());
    if (exact) return exact.glCode;
  }

  // Second: exact match across all business types
  for (const config of Object.values(BUSINESS_TYPE_CONFIG)) {
    const defaults = categoryType === 'cogs' ? config.suggestedCOGS : config.suggestedExpenses;
    const exact = defaults.find(d => d.name.toLowerCase() === categoryName.toLowerCase());
    if (exact) return exact.glCode;
  }

  // Third: fuzzy matching by keywords
  return fuzzyMatchGlCode(categoryName, categoryType);
}

/**
 * Fuzzy match GL codes using keyword heuristics.
 * Used when exact match against templates fails (e.g., user-typed custom names).
 */
function fuzzyMatchGlCode(categoryName: string, categoryType: 'cogs' | 'expense'): string {
  const lower = categoryName.toLowerCase();

  if (categoryType === 'cogs') {
    const cogsRules: Array<{ keywords: string[]; glCode: string }> = [
      { keywords: ['subcontract', 'freelance', 'outsource', 'labour', 'labor'], glCode: '5300' },
      { keywords: ['material', 'ingredient', 'raw', 'component', 'parts'], glCode: '5100' },
      { keywords: ['shipping', 'freight', 'logistics', 'delivery'], glCode: '5200' },
      { keywords: ['packaging', 'wrapping'], glCode: '5120' },
      { keywords: ['software', 'license', 'cloud', 'platform', 'tool', 'saas'], glCode: '5100' },
    ];
    for (const rule of cogsRules) {
      if (rule.keywords.some(kw => lower.includes(kw))) return rule.glCode;
    }
    return '5000'; // General COGS
  }

  // Expense fuzzy matching
  const expenseRules: Array<{ keywords: string[]; glCode: string }> = [
    { keywords: ['travel', 'transport', 'parking', 'toll', 'petrol', 'mileage', 'fuel'], glCode: '6400' },
    { keywords: ['office', 'stationery', 'printing', 'postage', 'supplies'], glCode: '6300' },
    { keywords: ['entertainment', 'meal', 'dining', 'food', 'client gift', 'hospitality'], glCode: '6500' },
    { keywords: ['it ', 'software', 'tech', 'computer', 'hardware', 'subscription'], glCode: '6700' },
    { keywords: ['professional', 'training', 'development', 'conference', 'seminar'], glCode: '6800' },
    { keywords: ['insurance'], glCode: '6200' },
    { keywords: ['rental', 'rent', 'lease'], glCode: '6100' },
    { keywords: ['utilities', 'electricity', 'water', 'internet', 'phone', 'telecom'], glCode: '6250' },
    { keywords: ['marketing', 'advertising', 'promotion'], glCode: '6550' },
    { keywords: ['maintenance', 'repair'], glCode: '6430' },
    { keywords: ['security', 'safety', 'ppe'], glCode: '6440' },
    { keywords: ['professional fee', 'legal', 'audit', 'accounting', 'consultation'], glCode: '6600' },
    { keywords: ['delivery', 'courier', 'shipping'], glCode: '6410' },
    { keywords: ['cleaning', 'hygiene', 'sanitation'], glCode: '6310' },
    { keywords: ['staff', 'welfare', 'employee'], glCode: '6350' },
    { keywords: ['license', 'permit'], glCode: '6710' },
  ];
  for (const rule of expenseRules) {
    if (rule.keywords.some(kw => lower.includes(kw))) return rule.glCode;
  }
  return '6900'; // Miscellaneous Expenses
}

/**
 * Get all available business types
 */
export function getAllBusinessTypes(): BusinessType[] {
  return Object.keys(BUSINESS_TYPE_CONFIG) as BusinessType[];
}

/**
 * Check if a string is a valid business type
 */
export function isValidBusinessType(value: string): value is BusinessType {
  return value in BUSINESS_TYPE_CONFIG;
}
