/**
 * Convex Authentication Configuration
 *
 * Configures Convex to validate JWTs issued by Clerk.
 *
 * Setup Requirements:
 * 1. In Clerk Dashboard → JWT Templates → Create "convex" template
 *    - Go to: https://dashboard.clerk.com → Your App → JWT Templates
 *    - Click "New template" → Name it "convex"
 *    - Use default settings (Convex automatically handles the claims)
 *
 * 2. Copy the Issuer URL from the JWT template
 *    - It looks like: https://your-app.clerk.accounts.dev
 *
 * 3. Add to Convex Dashboard Environment Variables:
 *    - Go to: https://dashboard.convex.dev → Settings → Environment Variables
 *    - Add: CLERK_JWT_ISSUER_DOMAIN = <your Clerk Issuer URL>
 *
 * Once configured, you can use ctx.auth in Convex functions:
 * - ctx.auth.getUserIdentity() returns the authenticated user
 * - User identity includes: tokenIdentifier, subject (Clerk user ID), etc.
 */

import { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      // The domain is your Clerk Issuer URL from the "convex" JWT template
      // Configure CLERK_JWT_ISSUER_DOMAIN in Convex Dashboard → Settings → Environment Variables
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ]
} satisfies AuthConfig;
