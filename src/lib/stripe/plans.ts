/**
 * Plan Configuration
 *
 * Plans are fetched dynamically from Stripe Product Catalog.
 * This file re-exports from catalog.ts for convenience.
 *
 * Usage:
 *   // Async contexts (API routes, server components)
 *   import { getPlan, getPaidPlans, getCatalog } from '@/lib/stripe/plans'
 *   const plan = await getPlan('starter')
 *
 *   // Sync contexts (client components) - uses cache or fallback
 *   import { getPlanSync } from '@/lib/stripe/plans'
 *   const plan = getPlanSync('starter')
 *
 * @see ./catalog.ts for implementation details
 */

// Re-export everything from catalog
export {
  // Types
  type PlanKey,
  type PlanConfig,
  type CatalogData,
  // Async functions
  getCatalog,
  refreshCatalog,
  getPlan,
  getPaidPlans,
  getPlanFromPriceId,
  getPlanFromProductId,
  // Sync utilities (use cache or fallback)
  getPlanSync,
  getOcrLimitSync,
  getTeamLimitSync,
  canUseOcr,
  canAddTeamMember,
  getUsagePercentage,
  getRemainingTeamSlots,
  // Constants
  FALLBACK_PLANS,
  // Legacy aliases for backward compatibility
  getOcrLimitSync as getOcrLimit,
  getTeamLimitSync as getTeamLimit,
} from './catalog'

// Legacy type alias for backward compatibility
export type PlanName = import('./catalog').PlanKey
