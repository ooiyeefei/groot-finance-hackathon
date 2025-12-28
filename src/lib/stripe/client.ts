/**
 * Stripe Client Initialization
 *
 * Server-side and client-side Stripe SDK initialization.
 * Pattern: Following Next.js SaaS Starter
 * @see https://github.com/nextjs/saas-starter
 */

import Stripe from 'stripe';

// Lazy-initialized Stripe client (prevents build failure when env vars missing)
let stripeInstance: Stripe | null = null;

// Helper to get Stripe instance with validation
// Uses lazy initialization to avoid build-time errors
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  if (!stripeInstance) {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-12-15.clover',
      typescript: true,
    });
  }

  return stripeInstance;
}

// For backward compatibility - lazy getter
export const stripe = {
  get instance() {
    return getStripe();
  }
};

// Type exports for use in other files
export type { Stripe };
