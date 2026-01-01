/**
 * Stripe Product Catalog Service
 *
 * Fetches plan configuration dynamically from Stripe Product Catalog.
 * Stripe becomes the single source of truth for pricing.
 *
 * Product Metadata Expected:
 * - plan_key: 'starter' | 'pro' | 'enterprise'
 * - ocr_limit: number (-1 for unlimited)
 * - team_limit: number (-1 for unlimited)
 * - features: JSON string array
 * - is_custom_pricing: 'true' | 'false'
 *
 * @see https://docs.stripe.com/products-prices/how-products-and-prices-work
 */

import { getStripe } from './client'
import type Stripe from 'stripe'

// Plan types
export type PlanKey = 'trial' | 'starter' | 'pro' | 'enterprise'

export interface PlanConfig {
  name: string
  planKey: PlanKey
  priceId: string | null
  productId: string | null
  price: number // In display currency (not cents)
  currency: string
  ocrLimit: number // -1 for unlimited
  teamLimit: number // -1 for unlimited
  features: string[]
  isCustomPricing: boolean
  interval: 'month' | 'year' | null
}

export interface CatalogData {
  plans: Record<PlanKey, PlanConfig>
  lastFetched: number
}

// In-memory cache with TTL (1 hour)
const CACHE_TTL_MS = 60 * 60 * 1000
let catalogCache: CatalogData | null = null

// Default trial plan (not in Stripe)
// Trial gives access to Starter-level features
const TRIAL_PLAN: PlanConfig = {
  name: 'Trial',
  planKey: 'trial',
  priceId: null,
  productId: null,
  price: 0,
  currency: 'MYR',
  ocrLimit: 50,
  teamLimit: 3,
  features: [
    '14-day free trial',
    'Custom business categories',
    'AI auto categorization',
    'Advanced approval workflow',
    'Multi-currency tracking',
    'Role-based access control',
    '50 OCR scans during trial',
    'Up to 3 team members',
  ],
  isCustomPricing: false,
  interval: null,
}

// Fallback plans when Stripe is unreachable (exported for legacy compatibility)
export const FALLBACK_PLANS: Record<PlanKey, PlanConfig> = {
  trial: TRIAL_PLAN,
  starter: {
    name: 'Starter',
    planKey: 'starter',
    priceId: null,
    productId: null,
    price: 99,
    currency: 'MYR',
    ocrLimit: 30,
    teamLimit: 5,
    features: [
      'Custom business categories',
      'AI auto categorization',
      'Advanced approval workflow',
      'Multi-currency tracking',
      'Role-based access control',
      '30 OCR scans/month',
      'Up to 5 team members',
    ],
    isCustomPricing: false,
    interval: 'month',
  },
  pro: {
    name: 'Pro',
    planKey: 'pro',
    priceId: null,
    productId: null,
    price: 299,
    currency: 'MYR',
    ocrLimit: 100,
    teamLimit: 13,
    features: [
      'Everything in Starter',
      'AI chat assistant',
      '100 OCR scans/month',
      'Multi-tenancy support',
      'Up to 13 team members',
    ],
    isCustomPricing: false,
    interval: 'month',
  },
  enterprise: {
    name: 'Enterprise',
    planKey: 'enterprise',
    priceId: null,
    productId: null,
    price: 0,
    currency: 'MYR',
    ocrLimit: -1,
    teamLimit: -1,
    features: [
      'Everything in Pro',
      'Unlimited OCR scans',
      'Dedicated account manager',
      'Custom integrations',
      'SLA guarantee',
      'On-premise option',
    ],
    isCustomPricing: true,
    interval: null,
  },
}

/**
 * Parse product metadata into PlanConfig
 */
function parseProductMetadata(
  product: Stripe.Product,
  price: Stripe.Price | null
): PlanConfig | null {
  const metadata = product.metadata

  // Require plan_key metadata to identify the plan
  const planKey = metadata.plan_key as PlanKey | undefined
  if (!planKey || !['starter', 'pro', 'enterprise'].includes(planKey)) {
    console.warn(`Product ${product.id} missing valid plan_key metadata`)
    return null
  }

  // Parse features from JSON or use empty array
  let features: string[] = []
  if (metadata.features) {
    try {
      features = JSON.parse(metadata.features)
    } catch {
      console.warn(`Product ${product.id} has invalid features JSON`)
      features = []
    }
  }

  // Parse numeric limits
  const ocrLimit = metadata.ocr_limit ? parseInt(metadata.ocr_limit, 10) : -1
  const teamLimit = metadata.team_limit ? parseInt(metadata.team_limit, 10) : -1
  const isCustomPricing = metadata.is_custom_pricing === 'true'

  // Extract price info
  const priceAmount = price?.unit_amount ? price.unit_amount / 100 : 0
  const currency = price?.currency?.toUpperCase() || 'MYR'
  const interval = price?.recurring?.interval as 'month' | 'year' | null

  return {
    name: product.name,
    planKey,
    priceId: price?.id || null,
    productId: product.id,
    price: priceAmount,
    currency,
    ocrLimit,
    teamLimit,
    features,
    isCustomPricing,
    interval,
  }
}

/**
 * Fetch products and prices from Stripe
 */
async function fetchCatalogFromStripe(): Promise<Record<PlanKey, PlanConfig>> {
  const stripe = getStripe()

  // Fetch active products with metadata
  const products = await stripe.products.list({
    active: true,
    limit: 100,
  })

  // Fetch active recurring prices
  const prices = await stripe.prices.list({
    active: true,
    type: 'recurring',
    limit: 100,
  })

  // Create price lookup by product
  const pricesByProduct = new Map<string, Stripe.Price>()
  for (const price of prices.data) {
    const productId = typeof price.product === 'string' ? price.product : price.product.id
    // Use the first active recurring price for each product
    // You can add logic to prefer default_price or specific intervals
    if (!pricesByProduct.has(productId)) {
      pricesByProduct.set(productId, price)
    }
  }

  // Build plans from products
  const plans: Record<PlanKey, PlanConfig> = {
    trial: TRIAL_PLAN, // Trial is always hardcoded
    starter: FALLBACK_PLANS.starter,
    pro: FALLBACK_PLANS.pro,
    enterprise: FALLBACK_PLANS.enterprise,
  }

  for (const product of products.data) {
    const price = pricesByProduct.get(product.id) || null
    const config = parseProductMetadata(product, price)

    if (config && config.planKey !== 'trial') {
      plans[config.planKey] = config
    }
  }

  return plans
}

/**
 * Get catalog with caching
 * Returns cached data if fresh, otherwise fetches from Stripe
 */
export async function getCatalog(): Promise<CatalogData> {
  const now = Date.now()

  // Return cached data if still fresh
  if (catalogCache && now - catalogCache.lastFetched < CACHE_TTL_MS) {
    return catalogCache
  }

  try {
    const plans = await fetchCatalogFromStripe()
    catalogCache = {
      plans,
      lastFetched: now,
    }
    return catalogCache
  } catch (error) {
    console.error('Failed to fetch Stripe catalog:', error)

    // Return cached data even if stale
    if (catalogCache) {
      console.warn('Using stale catalog cache')
      return catalogCache
    }

    // Return fallback if no cache
    console.warn('Using fallback plans')
    return {
      plans: FALLBACK_PLANS,
      lastFetched: now,
    }
  }
}

/**
 * Force refresh the catalog cache
 */
export async function refreshCatalog(): Promise<CatalogData> {
  catalogCache = null
  return getCatalog()
}

/**
 * Get a specific plan configuration
 */
export async function getPlan(planKey: PlanKey | string): Promise<PlanConfig> {
  const normalizedKey = normalizePlanKey(planKey)
  const catalog = await getCatalog()
  return catalog.plans[normalizedKey]
}

/**
 * Get all paid plans for pricing display
 */
export async function getPaidPlans(): Promise<PlanConfig[]> {
  const catalog = await getCatalog()
  return [catalog.plans.starter, catalog.plans.pro, catalog.plans.enterprise]
}

/**
 * Get plan from Stripe price ID
 */
export async function getPlanFromPriceId(priceId: string): Promise<PlanKey> {
  const catalog = await getCatalog()

  for (const [key, plan] of Object.entries(catalog.plans)) {
    if (plan.priceId === priceId) {
      return key as PlanKey
    }
  }

  return 'trial' // Default
}

/**
 * Get plan from Stripe product ID
 */
export async function getPlanFromProductId(productId: string): Promise<PlanKey> {
  const catalog = await getCatalog()

  for (const [key, plan] of Object.entries(catalog.plans)) {
    if (plan.productId === productId) {
      return key as PlanKey
    }
  }

  return 'trial' // Default
}

// ============================================
// Sync utility functions (for components that can't be async)
// These use the cache directly and fallback to defaults
// ============================================

/**
 * Normalize plan key - handles legacy 'free' value
 */
function normalizePlanKey(key: string): PlanKey {
  // Map legacy 'free' to 'trial'
  if (key === 'free') return 'trial'
  // Validate known plan keys
  if (['trial', 'starter', 'pro', 'enterprise'].includes(key)) {
    return key as PlanKey
  }
  // Default to trial for unknown values
  console.warn(`Unknown plan key: ${key}, defaulting to trial`)
  return 'trial'
}

/**
 * Get plan synchronously (uses cache or fallback)
 * Use this in components where async isn't possible
 */
export function getPlanSync(planKey: PlanKey | string): PlanConfig {
  const normalizedKey = normalizePlanKey(planKey)
  if (catalogCache) {
    return catalogCache.plans[normalizedKey]
  }
  return FALLBACK_PLANS[normalizedKey]
}

/**
 * Get OCR limit synchronously
 */
export function getOcrLimitSync(planKey: PlanKey | string): number {
  return getPlanSync(planKey).ocrLimit
}

/**
 * Get team limit synchronously
 */
export function getTeamLimitSync(planKey: PlanKey | string): number {
  return getPlanSync(planKey).teamLimit
}

/**
 * Check if OCR usage is within limit
 */
export function canUseOcr(planKey: PlanKey | string, currentUsage: number): boolean {
  const limit = getOcrLimitSync(planKey)
  if (limit === -1) return true
  return currentUsage < limit
}

/**
 * Get usage percentage
 */
export function getUsagePercentage(planKey: PlanKey | string, currentUsage: number): number {
  const limit = getOcrLimitSync(planKey)
  if (limit === -1) return 0
  return Math.min(100, Math.round((currentUsage / limit) * 100))
}

/**
 * Check if a new team member can be added
 */
export function canAddTeamMember(planKey: PlanKey | string, currentTeamSize: number): boolean {
  const limit = getTeamLimitSync(planKey)
  if (limit === -1) return true
  return currentTeamSize < limit
}

/**
 * Get remaining team member slots
 */
export function getRemainingTeamSlots(planKey: PlanKey | string, currentTeamSize: number): number {
  const limit = getTeamLimitSync(planKey)
  if (limit === -1) return -1
  return Math.max(0, limit - currentTeamSize)
}
