/**
 * Plan Configuration
 *
 * Defines subscription tiers with OCR limits and features.
 * Pattern: Following Next.js SaaS Starter
 * @see https://github.com/nextjs/saas-starter
 *
 * Pricing (MYR):
 * - Free: RM 0/month (5 OCR credits)
 * - Pro: RM 79/month (100 OCR credits)
 * - Enterprise: RM 199/month (unlimited OCR)
 */

export const PLANS = {
  free: {
    name: 'Free',
    priceId: null, // No Stripe product for free tier
    price: 0,
    currency: 'MYR',
    ocrLimit: 5,
    features: [
      'Read-only financial data',
      'Basic reports',
      '5 OCR scans/month',
      'Email support',
    ],
  },
  pro: {
    name: 'Pro',
    priceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
    price: 79,
    currency: 'MYR',
    ocrLimit: 100,
    features: [
      'Full data access',
      'Advanced reports & analytics',
      '100 OCR scans/month',
      'Priority support',
      'Multi-currency tracking',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID ?? null,
    price: 199,
    currency: 'MYR',
    ocrLimit: -1, // Unlimited
    features: [
      'Everything in Pro',
      'Unlimited OCR scans',
      'API access',
      'Custom branding',
      'Dedicated support',
      'Team management',
    ],
  },
} as const;

export type PlanName = keyof typeof PLANS;
export type Plan = (typeof PLANS)[PlanName];

/**
 * Get plan configuration by name
 */
export function getPlan(planName: PlanName): Plan {
  return PLANS[planName];
}

/**
 * Get OCR limit for a plan
 * Returns -1 for unlimited
 */
export function getOcrLimit(planName: PlanName): number {
  return PLANS[planName].ocrLimit;
}

/**
 * Check if OCR usage is within limit
 * @param planName - Current plan
 * @param currentUsage - Current month's OCR usage
 * @returns true if more OCR scans are allowed
 */
export function canUseOcr(planName: PlanName, currentUsage: number): boolean {
  const limit = getOcrLimit(planName);
  if (limit === -1) return true; // Unlimited
  return currentUsage < limit;
}

/**
 * Get usage percentage (for progress bars/warnings)
 * @returns 0-100 for limited plans, 0 for unlimited
 */
export function getUsagePercentage(planName: PlanName, currentUsage: number): number {
  const limit = getOcrLimit(planName);
  if (limit === -1) return 0; // Unlimited shows 0%
  return Math.min(100, Math.round((currentUsage / limit) * 100));
}

/**
 * Get plan from Stripe price ID
 * Used in webhook handlers to map Stripe price to plan name
 */
export function getPlanFromPriceId(priceId: string): PlanName {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'pro';
  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) return 'enterprise';
  return 'free';
}

/**
 * Get plan from Stripe product ID
 * Used when we only have product ID (less common)
 */
export function getPlanFromProductId(productId: string): PlanName {
  // Product IDs are different from price IDs
  // This requires mapping configured in Stripe Dashboard
  // For now, fall back to price ID matching
  return getPlanFromPriceId(productId);
}

/**
 * Get all paid plans for pricing display
 */
export function getPaidPlans(): Array<{ name: PlanName; plan: Plan }> {
  return [
    { name: 'pro', plan: PLANS.pro },
    { name: 'enterprise', plan: PLANS.enterprise },
  ];
}
