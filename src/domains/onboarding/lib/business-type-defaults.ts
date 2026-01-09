/**
 * Business Type Defaults Configuration
 *
 * Maps business types to suggested COGS and expense categories for the onboarding flow.
 * This helps new users quickly set up relevant categories based on their business type.
 *
 * @module business-type-defaults
 *
 * @example
 * ```typescript
 * import { getBusinessTypeConfig, getSuggestedCategories } from '@/domains/onboarding/lib/business-type-defaults';
 *
 * // Get full configuration for a business type
 * const config = getBusinessTypeConfig('fnb');
 * console.log(config.label); // "Food & Beverage"
 * console.log(config.suggestedCOGS); // ["Ingredients", "Beverages", ...]
 *
 * // Get only COGS or expense categories
 * const cogsSuggestions = getSuggestedCategories('retail', 'cogs');
 * const expenseSuggestions = getSuggestedCategories('services', 'expense');
 * ```
 */

/**
 * Business type configuration object
 *
 * Each business type includes:
 * - label: Display name for the business type
 * - description: Brief description of businesses that fit this type
 * - suggestedCOGS: Array of suggested Cost of Goods Sold category names
 * - suggestedExpenses: Array of suggested expense category names
 */
export const BUSINESS_TYPE_CONFIG = {
  /**
   * Food & Beverage businesses (restaurants, cafes, food stalls)
   */
  fnb: {
    label: 'Food & Beverage',
    description: 'Restaurants, cafes, food stalls, catering services',
    suggestedCOGS: [
      'Ingredients',
      'Beverages',
      'Packaging',
      'Kitchen Supplies',
      'Other',
    ],
    suggestedExpenses: [
      'Staff Meals',
      'Kitchen Equipment',
      'Food Delivery',
      'Cleaning Supplies',
      'Other',
    ],
  },

  /**
   * Retail businesses (stores, shops, e-commerce)
   */
  retail: {
    label: 'Retail',
    description: 'Stores, shops, e-commerce, merchandise sales',
    suggestedCOGS: [
      'Merchandise',
      'Packaging',
      'Shipping Materials',
      'Other',
    ],
    suggestedExpenses: [
      'Store Rent',
      'Point of Sale',
      'Inventory Storage',
      'Security',
      'Other',
    ],
  },

  /**
   * Professional Services (consulting, agencies, freelancing)
   */
  services: {
    label: 'Professional Services',
    description: 'Consulting, agencies, freelancing, professional firms',
    suggestedCOGS: [
      'Subcontractors',
      'Software Licenses',
      'Project Materials',
      'Other',
    ],
    suggestedExpenses: [
      'Office Supplies',
      'Client Entertainment',
      'Professional Development',
      'Travel',
      'Other',
    ],
  },

  /**
   * Manufacturing businesses (factories, production, assembly)
   */
  manufacturing: {
    label: 'Manufacturing',
    description: 'Factories, production facilities, assembly operations',
    suggestedCOGS: [
      'Raw Materials',
      'Components',
      'Machinery Parts',
      'Packaging',
      'Other',
    ],
    suggestedExpenses: [
      'Factory Rent',
      'Equipment Maintenance',
      'Safety Equipment',
      'Utilities',
      'Other',
    ],
  },

  /**
   * Other business types (custom setup)
   */
  other: {
    label: 'Other',
    description: 'Other business types requiring custom category setup',
    suggestedCOGS: ['Other'],
    suggestedExpenses: ['Other'],
  },
} as const;

/**
 * Business type union type
 *
 * Valid values: 'fnb' | 'retail' | 'services' | 'manufacturing' | 'other'
 */
export type BusinessType = keyof typeof BUSINESS_TYPE_CONFIG;

/**
 * Business type configuration structure
 */
export type BusinessTypeConfig = {
  label: string;
  description: string;
  suggestedCOGS: readonly string[];
  suggestedExpenses: readonly string[];
};

/**
 * Get the full configuration for a business type
 *
 * @param type - The business type key
 * @returns Configuration object with label, description, and suggested categories
 *
 * @example
 * ```typescript
 * const config = getBusinessTypeConfig('fnb');
 * console.log(config.label); // "Food & Beverage"
 * console.log(config.description); // "Restaurants, cafes, food stalls, catering services"
 * console.log(config.suggestedCOGS); // ["Ingredients", "Beverages", "Packaging", "Kitchen Supplies"]
 * ```
 */
export function getBusinessTypeConfig(type: BusinessType): BusinessTypeConfig {
  return BUSINESS_TYPE_CONFIG[type];
}

/**
 * Get suggested categories for a specific business type and category type
 *
 * @param type - The business type key
 * @param categoryType - Either 'cogs' for Cost of Goods Sold or 'expense' for expenses
 * @returns Array of suggested category names
 *
 * @example
 * ```typescript
 * // Get COGS suggestions for retail business
 * const cogsSuggestions = getSuggestedCategories('retail', 'cogs');
 * // Returns: ["Merchandise", "Packaging", "Shipping Materials"]
 *
 * // Get expense suggestions for services business
 * const expenseSuggestions = getSuggestedCategories('services', 'expense');
 * // Returns: ["Office Supplies", "Client Entertainment", "Professional Development", "Travel"]
 * ```
 */
export function getSuggestedCategories(
  type: BusinessType,
  categoryType: 'cogs' | 'expense'
): readonly string[] {
  const config = BUSINESS_TYPE_CONFIG[type];
  return categoryType === 'cogs' ? config.suggestedCOGS : config.suggestedExpenses;
}

/**
 * Get all available business types
 *
 * @returns Array of business type keys
 *
 * @example
 * ```typescript
 * const types = getAllBusinessTypes();
 * // Returns: ["fnb", "retail", "services", "manufacturing", "other"]
 * ```
 */
export function getAllBusinessTypes(): BusinessType[] {
  return Object.keys(BUSINESS_TYPE_CONFIG) as BusinessType[];
}

/**
 * Check if a string is a valid business type
 *
 * @param value - String to check
 * @returns True if the value is a valid business type
 *
 * @example
 * ```typescript
 * isValidBusinessType('fnb'); // true
 * isValidBusinessType('invalid'); // false
 * ```
 */
export function isValidBusinessType(value: string): value is BusinessType {
  return value in BUSINESS_TYPE_CONFIG;
}
