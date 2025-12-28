/**
 * Stripe Client Initialization
 *
 * Server-side and client-side Stripe SDK initialization.
 * Pattern: Following Next.js SaaS Starter
 * @see https://github.com/nextjs/saas-starter
 */

import Stripe from 'stripe';

// Server-side Stripe client
// Only use in API routes and server components
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
  typescript: true,
});

// Helper to get Stripe instance with validation
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return stripe;
}

// Type exports for use in other files
export type { Stripe };
