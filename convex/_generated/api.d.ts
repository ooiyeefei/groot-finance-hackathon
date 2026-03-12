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
import type * as functions_aiMessageUsage from "../functions/aiMessageUsage.js";
import type * as functions_analytics from "../functions/analytics.js";
import type * as functions_appVersions from "../functions/appVersions.js";
import type * as functions_attendanceRecords from "../functions/attendanceRecords.js";
import type * as functions_audit from "../functions/audit.js";
import type * as functions_bankAccounts from "../functions/bankAccounts.js";
import type * as functions_bankImportSessions from "../functions/bankImportSessions.js";
import type * as functions_bankTransactions from "../functions/bankTransactions.js";
import type * as functions_businesses from "../functions/businesses.js";
import type * as functions_catalogItems from "../functions/catalogItems.js";
import type * as functions_consent from "../functions/consent.js";
import type * as functions_conversations from "../functions/conversations.js";
import type * as functions_creditPacks from "../functions/creditPacks.js";
import type * as functions_csvImportTemplates from "../functions/csvImportTemplates.js";
import type * as functions_customers from "../functions/customers.js";
import type * as functions_duplicateMatches from "../functions/duplicateMatches.js";
import type * as functions_einvoiceJobs from "../functions/einvoiceJobs.js";
import type * as functions_einvoiceJobsNode from "../functions/einvoiceJobsNode.js";
import type * as functions_einvoiceReceivedDocuments from "../functions/einvoiceReceivedDocuments.js";
import type * as functions_einvoiceUsage from "../functions/einvoiceUsage.js";
import type * as functions_emails from "../functions/emails.js";
import type * as functions_expenseClaims from "../functions/expenseClaims.js";
import type * as functions_expenseSubmissions from "../functions/expenseSubmissions.js";
import type * as functions_exportCodeMappings from "../functions/exportCodeMappings.js";
import type * as functions_exportHistory from "../functions/exportHistory.js";
import type * as functions_exportJobs from "../functions/exportJobs.js";
import type * as functions_exportSchedules from "../functions/exportSchedules.js";
import type * as functions_exportTemplates from "../functions/exportTemplates.js";
import type * as functions_feedback from "../functions/feedback.js";
import type * as functions_financialIntelligence from "../functions/financialIntelligence.js";
import type * as functions_goodsReceivedNotes from "../functions/goodsReceivedNotes.js";
import type * as functions_invoices from "../functions/invoices.js";
import type * as functions_leaveBalances from "../functions/leaveBalances.js";
import type * as functions_leaveRequests from "../functions/leaveRequests.js";
import type * as functions_leaveTypes from "../functions/leaveTypes.js";
import type * as functions_lhdnJobs from "../functions/lhdnJobs.js";
import type * as functions_lhdnTokens from "../functions/lhdnTokens.js";
import type * as functions_matchingSettings from "../functions/matchingSettings.js";
import type * as functions_mcpApiKeys from "../functions/mcpApiKeys.js";
import type * as functions_mcpProposals from "../functions/mcpProposals.js";
import type * as functions_memberships from "../functions/memberships.js";
import type * as functions_messages from "../functions/messages.js";
import type * as functions_notificationJobs from "../functions/notificationJobs.js";
import type * as functions_notifications from "../functions/notifications.js";
import type * as functions_ocrUsage from "../functions/ocrUsage.js";
import type * as functions_overtimeRules from "../functions/overtimeRules.js";
import type * as functions_payPeriodConfigs from "../functions/payPeriodConfigs.js";
import type * as functions_payments from "../functions/payments.js";
import type * as functions_payrollAdjustments from "../functions/payrollAdjustments.js";
import type * as functions_poMatches from "../functions/poMatches.js";
import type * as functions_publicHolidays from "../functions/publicHolidays.js";
import type * as functions_purchaseOrders from "../functions/purchaseOrders.js";
import type * as functions_pushSubscriptions from "../functions/pushSubscriptions.js";
import type * as functions_reconciliationMatches from "../functions/reconciliationMatches.js";
import type * as functions_referral from "../functions/referral.js";
import type * as functions_retentionJobs from "../functions/retentionJobs.js";
import type * as functions_salesInvoiceUsage from "../functions/salesInvoiceUsage.js";
import type * as functions_salesInvoices from "../functions/salesInvoices.js";
import type * as functions_salesOrders from "../functions/salesOrders.js";
import type * as functions_stripeEvents from "../functions/stripeEvents.js";
import type * as functions_stripeIntegrations from "../functions/stripeIntegrations.js";
import type * as functions_system from "../functions/system.js";
import type * as functions_systemMonitoring from "../functions/systemMonitoring.js";
import type * as functions_teamCalendar from "../functions/teamCalendar.js";
import type * as functions_timesheets from "../functions/timesheets.js";
import type * as functions_users from "../functions/users.js";
import type * as functions_vendorPriceHistory from "../functions/vendorPriceHistory.js";
import type * as functions_vendors from "../functions/vendors.js";
import type * as functions_webhooks from "../functions/webhooks.js";
import type * as functions_workSchedules from "../functions/workSchedules.js";
import type * as lib_llm from "../lib/llm.js";
import type * as lib_mcpClient from "../lib/mcpClient.js";
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
  "functions/aiMessageUsage": typeof functions_aiMessageUsage;
  "functions/analytics": typeof functions_analytics;
  "functions/appVersions": typeof functions_appVersions;
  "functions/attendanceRecords": typeof functions_attendanceRecords;
  "functions/audit": typeof functions_audit;
  "functions/bankAccounts": typeof functions_bankAccounts;
  "functions/bankImportSessions": typeof functions_bankImportSessions;
  "functions/bankTransactions": typeof functions_bankTransactions;
  "functions/businesses": typeof functions_businesses;
  "functions/catalogItems": typeof functions_catalogItems;
  "functions/consent": typeof functions_consent;
  "functions/conversations": typeof functions_conversations;
  "functions/creditPacks": typeof functions_creditPacks;
  "functions/csvImportTemplates": typeof functions_csvImportTemplates;
  "functions/customers": typeof functions_customers;
  "functions/duplicateMatches": typeof functions_duplicateMatches;
  "functions/einvoiceJobs": typeof functions_einvoiceJobs;
  "functions/einvoiceJobsNode": typeof functions_einvoiceJobsNode;
  "functions/einvoiceReceivedDocuments": typeof functions_einvoiceReceivedDocuments;
  "functions/einvoiceUsage": typeof functions_einvoiceUsage;
  "functions/emails": typeof functions_emails;
  "functions/expenseClaims": typeof functions_expenseClaims;
  "functions/expenseSubmissions": typeof functions_expenseSubmissions;
  "functions/exportCodeMappings": typeof functions_exportCodeMappings;
  "functions/exportHistory": typeof functions_exportHistory;
  "functions/exportJobs": typeof functions_exportJobs;
  "functions/exportSchedules": typeof functions_exportSchedules;
  "functions/exportTemplates": typeof functions_exportTemplates;
  "functions/feedback": typeof functions_feedback;
  "functions/financialIntelligence": typeof functions_financialIntelligence;
  "functions/goodsReceivedNotes": typeof functions_goodsReceivedNotes;
  "functions/invoices": typeof functions_invoices;
  "functions/leaveBalances": typeof functions_leaveBalances;
  "functions/leaveRequests": typeof functions_leaveRequests;
  "functions/leaveTypes": typeof functions_leaveTypes;
  "functions/lhdnJobs": typeof functions_lhdnJobs;
  "functions/lhdnTokens": typeof functions_lhdnTokens;
  "functions/matchingSettings": typeof functions_matchingSettings;
  "functions/mcpApiKeys": typeof functions_mcpApiKeys;
  "functions/mcpProposals": typeof functions_mcpProposals;
  "functions/memberships": typeof functions_memberships;
  "functions/messages": typeof functions_messages;
  "functions/notificationJobs": typeof functions_notificationJobs;
  "functions/notifications": typeof functions_notifications;
  "functions/ocrUsage": typeof functions_ocrUsage;
  "functions/overtimeRules": typeof functions_overtimeRules;
  "functions/payPeriodConfigs": typeof functions_payPeriodConfigs;
  "functions/payments": typeof functions_payments;
  "functions/payrollAdjustments": typeof functions_payrollAdjustments;
  "functions/poMatches": typeof functions_poMatches;
  "functions/publicHolidays": typeof functions_publicHolidays;
  "functions/purchaseOrders": typeof functions_purchaseOrders;
  "functions/pushSubscriptions": typeof functions_pushSubscriptions;
  "functions/reconciliationMatches": typeof functions_reconciliationMatches;
  "functions/referral": typeof functions_referral;
  "functions/retentionJobs": typeof functions_retentionJobs;
  "functions/salesInvoiceUsage": typeof functions_salesInvoiceUsage;
  "functions/salesInvoices": typeof functions_salesInvoices;
  "functions/salesOrders": typeof functions_salesOrders;
  "functions/stripeEvents": typeof functions_stripeEvents;
  "functions/stripeIntegrations": typeof functions_stripeIntegrations;
  "functions/system": typeof functions_system;
  "functions/systemMonitoring": typeof functions_systemMonitoring;
  "functions/teamCalendar": typeof functions_teamCalendar;
  "functions/timesheets": typeof functions_timesheets;
  "functions/users": typeof functions_users;
  "functions/vendorPriceHistory": typeof functions_vendorPriceHistory;
  "functions/vendors": typeof functions_vendors;
  "functions/webhooks": typeof functions_webhooks;
  "functions/workSchedules": typeof functions_workSchedules;
  "lib/llm": typeof lib_llm;
  "lib/mcpClient": typeof lib_mcpClient;
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
