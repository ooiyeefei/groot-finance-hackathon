/**
 * Referral Functions - Convex queries, mutations, and actions
 *
 * Manages the in-app referral code system:
 * - Opt-in and code generation
 * - Code validation
 * - Referral capture and attribution
 * - Status tracking and earning calculation
 * - Stripe Promotion Code sync
 */

import { v } from "convex/values";
import { query, mutation, internalMutation, internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveUserByClerkId } from "../lib/resolvers";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

// ============================================
// QUERIES
// ============================================

/**
 * Get the current user's referral code (if opted in).
 */
export const getMyCode = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const code = await ctx.db
      .query("referral_codes")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .first();

    if (!code) return null;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://finance.hellogroot.com";

    return {
      _id: code._id,
      code: code.code,
      referralUrl: `${baseUrl}/sign-up?ref=${code.code}`,
      type: code.type,
      isActive: code.isActive,
      totalReferrals: code.totalReferrals,
      totalConversions: code.totalConversions,
      totalEarnings: code.totalEarnings,
      createdAt: code.createdAt,
    };
  },
});

/**
 * Get list of businesses referred by the current user.
 */
export const getMyReferrals = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const referrals = await ctx.db
      .query("referrals")
      .withIndex("by_referrerUserId", (q) => q.eq("referrerUserId", identity.subject))
      .collect();

    // Sort by capturedAt descending (newest first)
    referrals.sort((a, b) => b.capturedAt - a.capturedAt);

    return referrals.map((r) => ({
      _id: r._id,
      referredBusinessName: r.referredBusinessName,
      status: r.status,
      capturedAt: r.capturedAt,
      convertedAt: r.convertedAt,
      currentPlan: r.currentPlan,
      estimatedEarning: r.estimatedEarning,
    }));
  },
});

/**
 * Get aggregated referral stats for the current user.
 */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { totalReferrals: 0, inTrial: 0, paying: 0, churned: 0, totalEstimatedEarnings: 0 };

    const referrals = await ctx.db
      .query("referrals")
      .withIndex("by_referrerUserId", (q) => q.eq("referrerUserId", identity.subject))
      .collect();

    let inTrial = 0;
    let paying = 0;
    let churned = 0;
    let totalEstimatedEarnings = 0;

    for (const r of referrals) {
      if (r.status === "trial") inTrial++;
      if (r.status === "paid" || r.status === "upgraded") paying++;
      if (r.status === "churned" || r.status === "cancelled") churned++;
      totalEstimatedEarnings += r.estimatedEarning ?? 0;
    }

    return {
      totalReferrals: referrals.length,
      inTrial,
      paying,
      churned,
      totalEstimatedEarnings,
    };
  },
});

/**
 * Validate a referral code (public — used during sign-up/checkout).
 */
export const validateCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const code = args.code.toUpperCase().trim();

    const referralCode = await ctx.db
      .query("referral_codes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    if (!referralCode) {
      return { valid: false, referrerName: null, error: "Invalid referral code" };
    }

    if (!referralCode.isActive) {
      return { valid: false, referrerName: null, error: "This referral code is no longer active" };
    }

    // Get referrer's business name for display
    const business = await ctx.db.get(referralCode.businessId);
    const referrerName = business?.name ?? null;

    // Check self-referral (if authenticated)
    const identity = await ctx.auth.getUserIdentity();
    if (identity && identity.subject === referralCode.userId) {
      return { valid: false, referrerName, error: "You cannot use your own referral code" };
    }

    return { valid: true, referrerName, error: null };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Opt in to the referral program and generate a code.
 */
export const optIn = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const clerkUserId = identity.subject;

    // Check if already opted in
    const existing = await ctx.db
      .query("referral_codes")
      .withIndex("by_userId", (q) => q.eq("userId", clerkUserId))
      .first();

    if (existing) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://finance.hellogroot.com";
      return { code: existing.code, referralUrl: `${baseUrl}/sign-up?ref=${existing.code}` };
    }

    // Get user's business
    const user = await resolveUserByClerkId(ctx.db, clerkUserId);
    if (!user?.businessId) throw new Error("No business associated with user");

    // Generate code: GR-FIN-XXXXX from Clerk userId
    const raw = clerkUserId.startsWith("user_") ? clerkUserId.slice(5) : clerkUserId;
    let code = `GR-FIN-${raw.slice(0, 5).toUpperCase()}`;

    // Check for collision and extend if needed
    for (let len = 5; len <= 8; len++) {
      const collision = await ctx.db
        .query("referral_codes")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (!collision) break;
      code = `GR-FIN-${raw.slice(0, len + 1).toUpperCase()}`;
    }

    const now = Date.now();

    // Create referral code record
    await ctx.db.insert("referral_codes", {
      code,
      userId: clerkUserId,
      businessId: user.businessId,
      type: "customer",
      isActive: true,
      totalReferrals: 0,
      totalConversions: 0,
      totalEarnings: 0,
      createdAt: now,
    });

    // Schedule Stripe promotion code creation
    await ctx.scheduler.runAfter(0, internal.functions.referral.createStripePromotionCode, {
      code,
      userId: clerkUserId,
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://finance.hellogroot.com";
    return { code, referralUrl: `${baseUrl}/sign-up?ref=${code}` };
  },
});

/**
 * Capture a referral — record that a referral code was used during sign-up.
 */
export const captureReferral = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const clerkUserId = identity.subject;
    const code = args.code.toUpperCase().trim();

    // Validate the code exists and is active
    const referralCode = await ctx.db
      .query("referral_codes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    if (!referralCode || !referralCode.isActive) {
      return { success: false, error: "Invalid or inactive referral code" };
    }

    // Self-referral check
    if (referralCode.userId === clerkUserId) {
      return { success: false, error: "Cannot use your own referral code" };
    }

    // Get user's business
    const user = await resolveUserByClerkId(ctx.db, clerkUserId);
    if (!user?.businessId) {
      return { success: false, error: "No business associated" };
    }

    // First-touch attribution: check if business already has a referral
    const business = await ctx.db.get(user.businessId);
    if (business?.referredByCode) {
      return { success: false, error: "Business already has a referral attribution" };
    }

    const now = Date.now();

    // Create referral record
    await ctx.db.insert("referrals", {
      referralCodeId: referralCode._id,
      referralCode: code,
      referrerUserId: referralCode.userId,
      referrerBusinessId: referralCode.businessId,
      referredBusinessId: user.businessId,
      referredBusinessName: business?.name ?? undefined,
      status: "signed_up",
      capturedAt: now,
      attributionExpiresAt: now + NINETY_DAYS_MS,
      createdAt: now,
      updatedAt: now,
    });

    // Update business with referral attribution
    await ctx.db.patch(user.businessId, {
      referredByCode: code,
      referredByUserId: referralCode.userId,
      referredByBusinessId: referralCode.businessId,
      referralCapturedAt: now,
    });

    // Update referral code stats
    await ctx.db.patch(referralCode._id, {
      totalReferrals: referralCode.totalReferrals + 1,
    });

    return { success: true };
  },
});

// ============================================
// WEBHOOK MUTATIONS (called from webhook handlers via ConvexHttpClient)
// ============================================

/**
 * Update referral status based on subscription events.
 * Called from webhook handlers.
 */
export const updateReferralStatus = mutation({
  args: {
    referredBusinessId: v.string(),
    newStatus: v.union(
      v.literal("trial"),
      v.literal("paid"),
      v.literal("upgraded"),
      v.literal("downgraded"),
      v.literal("churned"),
      v.literal("cancelled")
    ),
    planName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find referral by referred business ID
    const referral = await ctx.db
      .query("referrals")
      .withIndex("by_referredBusinessId", (q) =>
        q.eq("referredBusinessId", args.referredBusinessId as any)
      )
      .first();

    if (!referral) {
      console.log(`[Referral] No referral found for business ${args.referredBusinessId}`);
      return;
    }

    // Check attribution expiry
    if (args.newStatus === "paid" && Date.now() > referral.attributionExpiresAt) {
      console.log(`[Referral] Attribution expired for referral ${referral._id}`);
      await ctx.db.patch(referral._id, {
        status: "expired",
        updatedAt: Date.now(),
      });
      return;
    }

    const now = Date.now();
    const updates: Record<string, any> = {
      status: args.newStatus,
      updatedAt: now,
    };

    if (args.planName) {
      updates.currentPlan = args.planName;
    }

    // Calculate earnings on first payment
    if (args.newStatus === "paid" && !referral.convertedAt) {
      updates.convertedAt = now;
      updates.planAtConversion = args.planName;

      // Look up code type for commission tier
      const referralCode = await ctx.db.get(referral.referralCodeId);
      const isReseller = referralCode?.type === "partner_reseller";

      // Commission by code type: customer RM 80/200, reseller RM 300/800
      const earning = isReseller
        ? (args.planName === "pro" ? 800 : 300)
        : (args.planName === "pro" ? 200 : 80);
      updates.estimatedEarning = earning;

      // Update referral code aggregate stats
      if (referralCode) {
        await ctx.db.patch(referralCode._id, {
          totalConversions: referralCode.totalConversions + 1,
          totalEarnings: referralCode.totalEarnings + earning,
        });
      }
    }

    await ctx.db.patch(referral._id, updates);

    console.log(`[Referral] Updated referral ${referral._id} to status: ${args.newStatus}`);
  },
});

/**
 * Capture referral from webhook (when promotion code used at checkout).
 * Called from checkout.session.completed handler.
 */
export const captureReferralFromWebhook = mutation({
  args: {
    businessId: v.string(),
    stripePromotionCodeId: v.string(),
    businessName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Look up referral code by Stripe promotion code ID
    const referralCode = await ctx.db
      .query("referral_codes")
      .withIndex("by_stripePromotionCodeId", (q) =>
        q.eq("stripePromotionCodeId", args.stripePromotionCodeId)
      )
      .first();

    if (!referralCode) {
      console.log(`[Referral] No referral code found for Stripe promo: ${args.stripePromotionCodeId}`);
      return;
    }

    // Check if business already has a referral
    const existingReferral = await ctx.db
      .query("referrals")
      .withIndex("by_referredBusinessId", (q) =>
        q.eq("referredBusinessId", args.businessId as any)
      )
      .first();

    if (existingReferral) {
      console.log(`[Referral] Business ${args.businessId} already has referral attribution`);
      return;
    }

    const now = Date.now();

    // Create referral record
    await ctx.db.insert("referrals", {
      referralCodeId: referralCode._id,
      referralCode: referralCode.code,
      referrerUserId: referralCode.userId,
      referrerBusinessId: referralCode.businessId,
      referredBusinessId: args.businessId as any,
      referredBusinessName: args.businessName,
      status: "signed_up",
      capturedAt: now,
      attributionExpiresAt: now + NINETY_DAYS_MS,
      createdAt: now,
      updatedAt: now,
    });

    // Update business with referral attribution
    await ctx.db.patch(args.businessId as any, {
      referredByCode: referralCode.code,
      referredByUserId: referralCode.userId,
      referredByBusinessId: referralCode.businessId,
      referralCapturedAt: now,
    });

    // Update referral code stats
    await ctx.db.patch(referralCode._id, {
      totalReferrals: referralCode.totalReferrals + 1,
    });

    console.log(`[Referral] Captured referral for business ${args.businessId} via promo code ${referralCode.code}`);
  },
});

// ============================================
// ACTIONS (external API calls)
// ============================================

/**
 * Create a Stripe Promotion Code for a referral code.
 * Creates the shared coupon if it doesn't exist.
 */
export const createStripePromotionCode = internalAction({
  args: {
    code: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    // Import Stripe dynamically (action context)
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-04-30.basil" as any,
    });

    // Find or create the shared referral coupon
    const COUPON_ID = "referral-rm100-off";
    let couponId = COUPON_ID;

    try {
      await stripe.coupons.retrieve(COUPON_ID);
    } catch {
      // Coupon doesn't exist, create it
      const coupon = await stripe.coupons.create({
        id: COUPON_ID,
        amount_off: 10000, // RM 100 in cents (MYR)
        currency: "myr",
        duration: "once",
        name: "Referral: RM 100 off annual plan",
      });
      couponId = coupon.id;
      console.log(`[Referral] Created Stripe coupon: ${couponId}`);
    }

    // Create promotion code
    // Note: Stripe SDK v20+ types may not include 'coupon' directly,
    // but the API supports it. Using type assertion.
    const promotionCode = await stripe.promotionCodes.create({
      coupon: couponId,
      code: args.code,
      active: true,
      metadata: {
        referrer_user_id: args.userId,
        type: "referral",
      },
    } as any);

    // Update referral code record with Stripe IDs
    const referralCode = await ctx.runQuery(internal.functions.referral.getByCode, {
      code: args.code,
    });

    if (referralCode) {
      await ctx.runMutation(internal.functions.referral.updateStripeIds, {
        referralCodeId: referralCode._id,
        stripePromotionCodeId: promotionCode.id,
        stripeCouponId: couponId,
      });
    }

    console.log(`[Referral] Created Stripe promotion code: ${args.code} → ${promotionCode.id}`);
  },
});

/**
 * Auto-generate referral code for a user+business.
 * Called from initializeBusinessFromOnboarding and backfill.
 * Skips if user already has a referral code.
 */
export const autoGenerateCode = internalMutation({
  args: {
    clerkUserId: v.string(),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    // Check if already has a code
    const existing = await ctx.db
      .query("referral_codes")
      .withIndex("by_userId", (q) => q.eq("userId", args.clerkUserId))
      .first();

    if (existing) return existing.code;

    // Generate code: GR-FIN-XXXXX from Clerk userId
    const raw = args.clerkUserId.startsWith("user_") ? args.clerkUserId.slice(5) : args.clerkUserId;
    let code = `GR-FIN-${raw.slice(0, 5).toUpperCase()}`;

    // Check for collision and extend if needed
    for (let len = 5; len <= 8; len++) {
      const collision = await ctx.db
        .query("referral_codes")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (!collision) break;
      code = `GR-FIN-${raw.slice(0, len + 1).toUpperCase()}`;
    }

    await ctx.db.insert("referral_codes", {
      code,
      userId: args.clerkUserId,
      businessId: args.businessId,
      type: "customer",
      isActive: true,
      totalReferrals: 0,
      totalConversions: 0,
      totalEarnings: 0,
      createdAt: Date.now(),
    });

    // Schedule async Stripe Promotion Code creation
    await ctx.scheduler.runAfter(0, internal.functions.referral.createStripePromotionCode, {
      code,
      userId: args.clerkUserId,
    });

    console.log(`[Referral] Auto-generated code ${code} for user ${args.clerkUserId}`);
    return code;
  },
});

/**
 * Backfill referral codes for all existing users who don't have one.
 * Run once from Convex Dashboard: npx convex run functions/referral:backfillAllCodes
 */
export const backfillAllCodes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    let created = 0;
    let skipped = 0;

    for (const user of users) {
      if (!user.clerkUserId || !user.businessId) {
        skipped++;
        continue;
      }

      // Check if already has a code
      const existing = await ctx.db
        .query("referral_codes")
        .withIndex("by_userId", (q) => q.eq("userId", user.clerkUserId))
        .first();

      if (existing) {
        skipped++;
        continue;
      }

      // Generate code
      const raw = user.clerkUserId.startsWith("user_") ? user.clerkUserId.slice(5) : user.clerkUserId;
      let code = `GR-FIN-${raw.slice(0, 5).toUpperCase()}`;

      for (let len = 5; len <= 8; len++) {
        const collision = await ctx.db
          .query("referral_codes")
          .withIndex("by_code", (q) => q.eq("code", code))
          .first();
        if (!collision) break;
        code = `GR-FIN-${raw.slice(0, len + 1).toUpperCase()}`;
      }

      await ctx.db.insert("referral_codes", {
        code,
        userId: user.clerkUserId,
        businessId: user.businessId,
        type: "customer",
        isActive: true,
        totalReferrals: 0,
        totalConversions: 0,
        totalEarnings: 0,
        createdAt: Date.now(),
      });

      // Schedule Stripe Promotion Code creation
      await ctx.scheduler.runAfter(created * 500, internal.functions.referral.createStripePromotionCode, {
        code,
        userId: user.clerkUserId,
      });

      created++;
    }

    console.log(`[Referral Backfill] Created ${created} codes, skipped ${skipped} users`);
    return { created, skipped };
  },
});

/**
 * Internal query to get referral code by code string.
 */
export const getByCode = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("referral_codes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
  },
});

/**
 * Internal mutation to update Stripe IDs on referral code.
 */
export const updateStripeIds = internalMutation({
  args: {
    referralCodeId: v.id("referral_codes"),
    stripePromotionCodeId: v.string(),
    stripeCouponId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.referralCodeId, {
      stripePromotionCodeId: args.stripePromotionCodeId,
      stripeCouponId: args.stripeCouponId,
    });
  },
});
