/**
 * Stripe Product Catalog Service
 *
 * Fetches plan configuration dynamically from Stripe Product Catalog.
 * Stripe becomes the single source of truth for pricing.
 *
 * Product Metadata Expected (30 keys per product):
 *
 * Identity & Limits:
 * - plan_key: 'starter' | 'pro'
 * - team_limit: number (-1 for unlimited)
 * - ocr_limit: number (-1 for unlimited)
 * - ai_message_limit: number (-1 for unlimited)
 * - invoice_limit: number (-1 for unlimited)
 * - einvoice_limit: number (-1 for unlimited)
 * - action_center_limit: number (-1 for unlimited)
 * - is_custom_pricing: 'true' | 'false'
 *
 * All-plan features (true on both Starter and Pro):
 * - feature_custom_categories, feature_ai_categorization,
 *   feature_approval_workflow, feature_multi_currency, feature_rbac,
 *   feature_ai_chat, feature_basic_invoicing, feature_batch_submissions,
 *   feature_leave_management, feature_basic_sst, feature_einvoice,
 *   feature_multilang_chat, feature_rag_compliance
 *
 * Tier-gated features (false on Starter, true on Pro):
 * - feature_duplicate_detection, feature_full_ar, feature_full_ap,
 *   feature_full_sst, feature_action_cards, feature_export_templates,
 *   feature_scheduled_exports, feature_audit_trail, feature_advanced_analytics
 *
 * @see docs/features/billing/groot-finance-pricing-strategy.md
 * @see https://docs.stripe.com/products-prices/how-products-and-prices-work
 */

import { getStripe } from './client'
import type Stripe from 'stripe'

// Plan types
export type PlanKey = 'starter' | 'pro' | 'enterprise'

export interface PlanConfig {
  name: string
  planKey: PlanKey
  priceId: string | null
  productId: string | null
  price: number // In display currency (not cents)
  currency: string
  currencyOptions: Record<string, number> // lowercase currency code → display amount
  ocrLimit: number // -1 for unlimited
  teamLimit: number // -1 for unlimited
  aiMessageLimit: number // -1 for unlimited
  invoiceLimit: number // -1 for unlimited
  einvoiceLimit: number // -1 for unlimited
  actionCenterLimit: number // -1 for unlimited
  features: string[]
  highlightFeatures: string[]
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

/**
 * Feature metadata key to display name mapping.
 * Keys match Stripe product metadata fields (feature_*).
 * Used to auto-generate pricing card bullet points.
 */
const FEATURE_METADATA_MAP: Record<string, string> = {
  // All-plan features
  feature_custom_categories: 'Custom business categories',
  feature_ai_categorization: 'AI auto categorization',
  feature_approval_workflow: 'Approval workflow',
  feature_multi_currency: 'Multi-currency tracking',
  feature_rbac: 'Role-based access control',
  feature_ai_chat: 'AI chat assistant',
  feature_basic_invoicing: 'Basic invoicing',
  feature_batch_submissions: 'Batch receipt submission',
  feature_leave_management: 'Leave management',
  feature_basic_sst: 'Basic SST tracking',
  feature_einvoice: 'LHDN e-Invoice',
  feature_multilang_chat: 'Multi-language chat',
  feature_rag_compliance: 'RAG regulatory compliance',
  // Tier-gated features (Pro-only)
  feature_duplicate_detection: 'Duplicate expense detection',
  feature_full_ar: 'Full AR management',
  feature_full_ap: 'Full AP management',
  feature_full_sst: 'Full SST management',
  feature_action_cards: 'Chat action cards',
  feature_export_templates: 'Export templates',
  feature_scheduled_exports: 'Scheduled exports',
  feature_audit_trail: 'Audit trail',
  feature_advanced_analytics: 'Advanced analytics',
}

/**
 * Country code to currency mapping for geo-IP detection.
 * Maps ISO 3166-1 alpha-2 country codes to ISO 4217 currency codes.
 */
export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  MY: 'MYR',
  SG: 'SGD',
  US: 'USD',
  GB: 'GBP',
  AU: 'AUD',
  TH: 'THB',
  ID: 'IDR',
  PH: 'PHP',
  VN: 'VND',
  IN: 'INR',
  CN: 'CNY',
  JP: 'JPY',
  HK: 'HKD',
  TW: 'TWD',
  KR: 'KRW',
}

/**
 * Currency symbols for display formatting.
 */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  MYR: 'RM',
  SGD: 'S$',
  USD: '$',
  GBP: '£',
  AUD: 'A$',
  THB: '฿',
  IDR: 'Rp',
  PHP: '₱',
  VND: '₫',
  INR: '₹',
  CNY: '¥',
  JPY: '¥',
  HKD: 'HK$',
  TWD: 'NT$',
  KRW: '₩',
}

/**
 * Resolve a plan's price for a given currency.
 * Falls back to the plan's default currency if requested currency is not available.
 */
export function resolvePlanPrice(
  plan: PlanConfig,
  currency: string
): { price: number; currency: string } {
  const lowerCurrency = currency.toLowerCase()
  if (plan.currencyOptions[lowerCurrency] !== undefined) {
    return { price: plan.currencyOptions[lowerCurrency], currency: currency.toUpperCase() }
  }
  // Fall back to default
  return { price: plan.price, currency: plan.currency }
}

/**
 * Get all available currencies across all plans in the catalog.
 */
export function getAvailableCurrencies(plans: Record<PlanKey, PlanConfig>): string[] {
  const currencies = new Set<string>()
  for (const plan of Object.values(plans)) {
    for (const cur of Object.keys(plan.currencyOptions)) {
      currencies.add(cur.toUpperCase())
    }
    if (plan.currency) {
      currencies.add(plan.currency.toUpperCase())
    }
  }
  return Array.from(currencies).sort()
}

// Fallback plans when Stripe is unreachable (exported for legacy compatibility)
export const FALLBACK_PLANS: Record<PlanKey, PlanConfig> = {
  starter: {
    name: 'Starter',
    planKey: 'starter',
    priceId: null,
    productId: null,
    price: 249,
    currency: 'MYR',
    currencyOptions: { myr: 249, sgd: 79 },
    ocrLimit: 150,
    teamLimit: 20,
    aiMessageLimit: 30,
    invoiceLimit: 10,
    einvoiceLimit: 100,
    actionCenterLimit: 0,
    features: [
      'Custom business categories',
      'AI auto categorization',
      'Approval workflow',
      'Multi-currency tracking',
      'Role-based access control',
      'AI chat assistant',
      'Basic invoicing',
      'Batch receipt submission',
      'Leave management',
      'Basic SST tracking',
      'LHDN e-Invoice',
      'Multi-language chat',
      'RAG regulatory compliance',
      '150 OCR scans/month',
      '30 AI chat messages/month',
      '10 sales invoices/month',
      '100 e-invoices/month',
      'Up to 20 team members',
    ],
    highlightFeatures: [
      'AI receipt scanning',
      'AI auto categorization',
      'AI chat assistant',
      'LHDN e-Invoice',
      'RAG regulatory compliance',
    ],
    isCustomPricing: false,
    interval: 'month',
  },
  pro: {
    name: 'Pro',
    planKey: 'pro',
    priceId: null,
    productId: null,
    price: 599,
    currency: 'MYR',
    currencyOptions: { myr: 599, sgd: 189 },
    ocrLimit: 500,
    teamLimit: 50,
    aiMessageLimit: 300,
    invoiceLimit: -1,
    einvoiceLimit: -1,
    actionCenterLimit: 15,
    features: [
      'Everything in Starter, plus:',
      'Duplicate expense detection',
      'Full AR management',
      'Full AP management',
      'Full SST management',
      'Chat action cards',
      'Export templates',
      'Scheduled exports',
      'Audit trail',
      'Advanced analytics',
      '500 OCR scans/month',
      '300 AI chat messages/month',
      'Unlimited sales invoices',
      'Unlimited e-invoices',
      '15 proactive insights/month',
      'Up to 50 team members',
    ],
    highlightFeatures: [
      'Everything in Starter, plus:',
      'AI proactive insights',
      'Duplicate expense detection',
      'Full AR & AP management',
      'Advanced analytics',
      'Audit trail',
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
    currencyOptions: { myr: 0, sgd: 0 },
    ocrLimit: -1,
    teamLimit: -1,
    aiMessageLimit: -1,
    invoiceLimit: -1,
    einvoiceLimit: -1,
    actionCenterLimit: -1,
    features: [
      'Everything in Pro, plus:',
      'Unlimited everything',
      'Cash flow forecasting',
      'Financial intelligence',
      'MCP Server / API access',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantee',
    ],
    highlightFeatures: [
      'Everything in Pro, plus:',
      'Unlimited everything',
      'Cash flow forecasting',
      'Financial intelligence',
      'MCP Server / API access',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantee',
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

  // Parse numeric limits
  const ocrLimit = metadata.ocr_limit ? parseInt(metadata.ocr_limit, 10) : -1
  const teamLimit = metadata.team_limit ? parseInt(metadata.team_limit, 10) : -1
  const aiMessageLimit = metadata.ai_message_limit ? parseInt(metadata.ai_message_limit, 10) : -1
  const invoiceLimit = metadata.invoice_limit ? parseInt(metadata.invoice_limit, 10) : -1
  const einvoiceLimit = metadata.einvoice_limit ? parseInt(metadata.einvoice_limit, 10) : -1
  const actionCenterLimit = metadata.action_center_limit ? parseInt(metadata.action_center_limit, 10) : -1

  // Build features array from individual metadata fields
  const features: string[] = []

  // Check each feature metadata field
  for (const [metadataKey, displayName] of Object.entries(FEATURE_METADATA_MAP)) {
    if (metadata[metadataKey] === 'true') {
      features.push(displayName)
    }
  }

  // Add dynamic features based on limits
  if (ocrLimit > 0) {
    features.push(`${ocrLimit} OCR scans/month`)
  } else if (ocrLimit === -1) {
    features.push('Unlimited OCR scans')
  }

  if (aiMessageLimit > 0) {
    features.push(`${aiMessageLimit} AI chat messages/month`)
  } else if (aiMessageLimit === -1) {
    features.push('Unlimited AI chat messages')
  }

  if (invoiceLimit > 0) {
    features.push(`${invoiceLimit} sales invoices/month`)
  } else if (invoiceLimit === -1) {
    features.push('Unlimited sales invoices')
  }

  if (einvoiceLimit > 0) {
    features.push(`${einvoiceLimit} e-invoices/month`)
  } else if (einvoiceLimit === -1) {
    features.push('Unlimited e-invoices')
  }

  if (actionCenterLimit > 0) {
    features.push(`${actionCenterLimit} proactive insights/month`)
  } else if (actionCenterLimit === -1) {
    features.push('Unlimited proactive insights')
  }

  if (teamLimit > 0) {
    features.push(`Up to ${teamLimit} team members`)
  } else if (teamLimit === -1) {
    features.push('Unlimited team members')
  }

  const isCustomPricing = metadata.is_custom_pricing === 'true'

  // Extract price info
  const priceAmount = price?.unit_amount ? price.unit_amount / 100 : 0
  const currency = price?.currency?.toUpperCase() || 'MYR'
  const interval = price?.recurring?.interval as 'month' | 'year' | null

  // Extract currency_options from the price object
  const currencyOptions: Record<string, number> = {}
  // Always include the default currency
  currencyOptions[currency.toLowerCase()] = priceAmount
  // Add any additional currency options from Stripe
  if (price?.currency_options) {
    for (const [cur, option] of Object.entries(price.currency_options)) {
      if (option.unit_amount != null) {
        currencyOptions[cur.toLowerCase()] = option.unit_amount / 100
      }
    }
  }

  // Generate curated highlight features per plan tier
  const highlightFeatures = FALLBACK_PLANS[planKey]?.highlightFeatures
    ?? features.slice(0, 6)

  return {
    name: product.name.replace(/Groot Finance/gi, 'Groot Finance'),
    planKey,
    priceId: price?.id || null,
    productId: product.id,
    price: priceAmount,
    currency,
    currencyOptions,
    ocrLimit,
    teamLimit,
    aiMessageLimit,
    invoiceLimit,
    einvoiceLimit,
    actionCenterLimit,
    features,
    highlightFeatures,
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

  // Fetch active recurring prices with currency_options expanded
  const prices = await stripe.prices.list({
    active: true,
    type: 'recurring',
    limit: 100,
    expand: ['data.currency_options'],
  })

  // Create price lookup by product, preferring monthly interval
  const pricesByProduct = new Map<string, Stripe.Price>()
  for (const price of prices.data) {
    const productId = typeof price.product === 'string' ? price.product : price.product.id
    const existing = pricesByProduct.get(productId)
    if (!existing) {
      pricesByProduct.set(productId, price)
    } else if (price.recurring?.interval === 'month' && existing.recurring?.interval !== 'month') {
      // Prefer monthly price for display
      pricesByProduct.set(productId, price)
    }
  }

  // Override with product's default_price when available
  for (const product of products.data) {
    if (product.default_price) {
      const defaultPriceId = typeof product.default_price === 'string'
        ? product.default_price
        : product.default_price.id
      const matchingPrice = prices.data.find(p => p.id === defaultPriceId)
      if (matchingPrice) {
        pricesByProduct.set(product.id, matchingPrice)
      }
    }
  }

  // Build plans from products
  const plans: Record<PlanKey, PlanConfig> = {
    starter: FALLBACK_PLANS.starter,
    pro: FALLBACK_PLANS.pro,
    enterprise: FALLBACK_PLANS.enterprise,
  }

  for (const product of products.data) {
    const price = pricesByProduct.get(product.id) || null
    const config = parseProductMetadata(product, price)

    if (config) {
      plans[config.planKey] = config
    }
  }

  // Deduplicate Pro features against Starter (show "Everything in Starter, plus:")
  // This mirrors how Enterprise already shows "Everything in Pro, plus:"
  if (plans.pro && plans.starter) {
    const starterFeatureSet = new Set(plans.starter.features)
    const proOnlyFeatures = plans.pro.features.filter(f => !starterFeatureSet.has(f))
    plans.pro.features = ['Everything in Starter, plus:', ...proOnlyFeatures]
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

  return 'starter' // Default
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

  return 'starter' // Default
}

// ============================================
// Sync utility functions (for components that can't be async)
// These use the cache directly and fallback to defaults
// ============================================

/**
 * Normalize plan key - handles legacy values
 */
function normalizePlanKey(key: string): PlanKey {
  // Map legacy values
  if (key === 'free' || key === 'trial') return 'starter'
  // Validate known plan keys
  if (['starter', 'pro', 'enterprise'].includes(key)) {
    return key as PlanKey
  }
  // Default to starter for unknown values
  console.warn(`Unknown plan key: ${key}, defaulting to starter`)
  return 'starter'
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
 * Get AI message limit synchronously
 */
export function getAiMessageLimitSync(planKey: PlanKey | string): number {
  return getPlanSync(planKey).aiMessageLimit
}

/**
 * Get invoice limit synchronously
 */
export function getInvoiceLimitSync(planKey: PlanKey | string): number {
  return getPlanSync(planKey).invoiceLimit
}

/**
 * Get e-invoice limit synchronously
 */
export function getEinvoiceLimitSync(planKey: PlanKey | string): number {
  return getPlanSync(planKey).einvoiceLimit
}

/**
 * Get action center limit synchronously
 */
export function getActionCenterLimitSync(planKey: PlanKey | string): number {
  return getPlanSync(planKey).actionCenterLimit
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
 * Check if AI message usage is within limit
 */
export function canSendAiMessage(planKey: PlanKey | string, currentUsage: number): boolean {
  const limit = getAiMessageLimitSync(planKey)
  if (limit === -1) return true
  return currentUsage < limit
}

/**
 * Check if invoice creation is within limit
 */
export function canCreateInvoice(planKey: PlanKey | string, currentUsage: number): boolean {
  const limit = getInvoiceLimitSync(planKey)
  if (limit === -1) return true
  return currentUsage < limit
}

/**
 * Check if e-invoice submission is within limit
 */
export function canSubmitEinvoice(planKey: PlanKey | string, currentUsage: number): boolean {
  const limit = getEinvoiceLimitSync(planKey)
  if (limit === -1) return true
  return currentUsage < limit
}

/**
 * Check if action center usage is within limit
 */
export function canUseActionCenter(planKey: PlanKey | string, currentUsage: number): boolean {
  const limit = getActionCenterLimitSync(planKey)
  if (limit === -1) return true
  return currentUsage < limit
}

/**
 * Get usage percentage for any limit type
 */
export function getUsagePercentage(
  planKey: PlanKey | string,
  currentUsage: number,
  limitType: 'ocr' | 'aiMessage' | 'invoice' | 'einvoice' | 'actionCenter' = 'ocr'
): number {
  const plan = getPlanSync(planKey)
  const limitMap: Record<string, number> = {
    ocr: plan.ocrLimit,
    aiMessage: plan.aiMessageLimit,
    invoice: plan.invoiceLimit,
    einvoice: plan.einvoiceLimit,
    actionCenter: plan.actionCenterLimit,
  }
  const limit = limitMap[limitType]
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
