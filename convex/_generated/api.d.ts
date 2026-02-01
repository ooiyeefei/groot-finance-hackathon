/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as functions_accountingEntries from "../functions/accountingEntries.js";
import type * as functions_actionCenterInsights from "../functions/actionCenterInsights.js";
import type * as functions_actionCenterJobs from "../functions/actionCenterJobs.js";
import type * as functions_admin from "../functions/admin.js";
import type * as functions_admin_resetDatabase from "../functions/admin/resetDatabase.js";
import type * as functions_analytics from "../functions/analytics.js";
import type * as functions_audit from "../functions/audit.js";
import type * as functions_businesses from "../functions/businesses.js";
import type * as functions_conversations from "../functions/conversations.js";
import type * as functions_duplicateMatches from "../functions/duplicateMatches.js";
import type * as functions_emails from "../functions/emails.js";
import type * as functions_expenseClaims from "../functions/expenseClaims.js";
import type * as functions_feedback from "../functions/feedback.js";
import type * as functions_financialIntelligence from "../functions/financialIntelligence.js";
import type * as functions_invoices from "../functions/invoices.js";
import type * as functions_memberships from "../functions/memberships.js";
import type * as functions_messages from "../functions/messages.js";
import type * as functions_ocrUsage from "../functions/ocrUsage.js";
import type * as functions_seedActionCenter from "../functions/seedActionCenter.js";
import type * as functions_stripeEvents from "../functions/stripeEvents.js";
import type * as functions_system from "../functions/system.js";
import type * as functions_systemMonitoring from "../functions/systemMonitoring.js";
import type * as functions_testSeedActionCenter from "../functions/testSeedActionCenter.js";
import type * as functions_users from "../functions/users.js";
import type * as functions_vendorPriceHistory from "../functions/vendorPriceHistory.js";
import type * as functions_vendors from "../functions/vendors.js";
import type * as functions_webhooks from "../functions/webhooks.js";
import type * as lib_resolvers from "../lib/resolvers.js";
import type * as lib_validators from "../lib/validators.js";
import type * as migrations from "../migrations.js";
import type * as types from "../types.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  "functions/accountingEntries": typeof functions_accountingEntries;
  "functions/actionCenterInsights": typeof functions_actionCenterInsights;
  "functions/actionCenterJobs": typeof functions_actionCenterJobs;
  "functions/admin": typeof functions_admin;
  "functions/admin/resetDatabase": typeof functions_admin_resetDatabase;
  "functions/analytics": typeof functions_analytics;
  "functions/audit": typeof functions_audit;
  "functions/businesses": typeof functions_businesses;
  "functions/conversations": typeof functions_conversations;
  "functions/duplicateMatches": typeof functions_duplicateMatches;
  "functions/emails": typeof functions_emails;
  "functions/expenseClaims": typeof functions_expenseClaims;
  "functions/feedback": typeof functions_feedback;
  "functions/financialIntelligence": typeof functions_financialIntelligence;
  "functions/invoices": typeof functions_invoices;
  "functions/memberships": typeof functions_memberships;
  "functions/messages": typeof functions_messages;
  "functions/ocrUsage": typeof functions_ocrUsage;
  "functions/seedActionCenter": typeof functions_seedActionCenter;
  "functions/stripeEvents": typeof functions_stripeEvents;
  "functions/system": typeof functions_system;
  "functions/systemMonitoring": typeof functions_systemMonitoring;
  "functions/testSeedActionCenter": typeof functions_testSeedActionCenter;
  "functions/users": typeof functions_users;
  "functions/vendorPriceHistory": typeof functions_vendorPriceHistory;
  "functions/vendors": typeof functions_vendors;
  "functions/webhooks": typeof functions_webhooks;
  "lib/resolvers": typeof lib_resolvers;
  "lib/validators": typeof lib_validators;
  migrations: typeof migrations;
  types: typeof types;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
