#!/usr/bin/env npx tsx
/**
 * Sentry Alert Rules Setup Script
 *
 * This script programmatically configures Sentry alert rules using the Sentry API.
 * Run after initial Sentry project setup to configure:
 * - Email alert rules for new issues
 * - Webhook integration for Telegram forwarding
 * - Error grouping settings
 *
 * Usage:
 *   npx tsx scripts/setup-sentry-alerts.ts
 *   npx tsx scripts/setup-sentry-alerts.ts --force  # Replace existing rules
 *
 * Required environment variables:
 *   SENTRY_API_KEY - API key with alerts:write, project:write scopes
 *   SENTRY_ORG - Organization slug
 *   SENTRY_PROJECT - Project slug
 *   NEXT_PUBLIC_APP_URL - App URL for webhook endpoint (optional)
 *   SENTRY_WEBHOOK_SECRET - Shared secret for webhook validation (optional)
 *
 * @see https://docs.sentry.io/api/alerts/
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local from project root
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SENTRY_API_URL = "https://sentry.io/api/0";

interface AlertRuleConfig {
  name: string;
  actionMatch: "all" | "any" | "none";
  filterMatch: "all" | "any" | "none";
  conditions: Array<{
    id: string;
    [key: string]: unknown;
  }>;
  actions: Array<{
    id: string;
    [key: string]: unknown;
  }>;
  filters?: Array<{
    id: string;
    [key: string]: unknown;
  }>;
  frequency: number; // minutes
}

interface AlertRule extends AlertRuleConfig {
  id: string;
  projects: string[];
  dateCreated: string;
}

async function sentryRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = process.env.SENTRY_API_KEY;
  if (!apiKey) {
    throw new Error("SENTRY_API_KEY environment variable is required");
  }

  const url = `${SENTRY_API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Sentry API error (${response.status}): ${errorText}`
    );
  }

  return response.json() as Promise<T>;
}

async function getExistingAlertRules(
  org: string,
  project: string
): Promise<AlertRule[]> {
  return sentryRequest<AlertRule[]>(
    `/projects/${org}/${project}/rules/`
  );
}

async function createAlertRule(
  org: string,
  project: string,
  rule: AlertRuleConfig
): Promise<AlertRule> {
  return sentryRequest<AlertRule>(
    `/projects/${org}/${project}/rules/`,
    {
      method: "POST",
      body: JSON.stringify(rule),
    }
  );
}

async function deleteAlertRule(
  org: string,
  project: string,
  ruleId: string
): Promise<void> {
  await sentryRequest(`/projects/${org}/${project}/rules/${ruleId}/`, {
    method: "DELETE",
  });
}

/**
 * Note: Webhook actions must be configured via Sentry Dashboard,
 * not through the alert rules API.
 *
 * To enable webhooks:
 * 1. Go to Sentry Dashboard → Settings → Developer Settings → Custom Integrations
 * 2. Create a new "Internal Integration"
 * 3. Enable "Alert Rule Action" in Webhooks
 * 4. Add the webhook URL
 * 5. Then the webhook option will appear in alert rule actions
 */

/**
 * Alert rule configurations for FinanSEAL
 * Note: Webhook actions are configured separately via Sentry Dashboard
 */
const ALERT_RULES: AlertRuleConfig[] = [
  {
    name: "[FinanSEAL] New Issue Alert - All Errors",
    actionMatch: "any",
    filterMatch: "all",
    conditions: [
      {
        id: "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition",
      },
    ],
    actions: [
      {
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        fallthroughType: "ActiveMembers",
      },
    ],
    filters: [
      {
        id: "sentry.rules.filters.level.LevelFilter",
        match: "gte",
        level: "40", // ERROR level and above
      },
    ],
    frequency: 5, // Minimum 5 minutes
  },
  {
    name: "[FinanSEAL] Critical/Fatal Alert - Immediate",
    actionMatch: "any",
    filterMatch: "all",
    conditions: [
      {
        id: "sentry.rules.conditions.every_event.EveryEventCondition",
      },
    ],
    actions: [
      {
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        fallthroughType: "ActiveMembers",
      },
    ],
    filters: [
      {
        id: "sentry.rules.filters.level.LevelFilter",
        match: "gte",
        level: "50", // FATAL level
      },
    ],
    frequency: 5, // Minimum 5 minutes (Sentry API requirement)
  },
  {
    name: "[FinanSEAL] Regression Alert",
    actionMatch: "any",
    filterMatch: "all",
    conditions: [
      {
        id: "sentry.rules.conditions.regression_event.RegressionEventCondition",
      },
    ],
    actions: [
      {
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        fallthroughType: "ActiveMembers",
      },
    ],
    frequency: 30, // Don't re-trigger within 30 minutes
  },
  {
    name: "[FinanSEAL] High Volume Alert",
    actionMatch: "any",
    filterMatch: "all",
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        interval: "1h",
        value: 100, // More than 100 events per hour
      },
    ],
    actions: [
      {
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        fallthroughType: "ActiveMembers",
      },
    ],
    frequency: 60, // Don't re-trigger within 1 hour
  },
];

async function main() {
  console.log("🚀 Sentry Alert Rules Setup Script\n");

  // Validate environment
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;

  if (!org || !project) {
    console.error(
      "❌ Error: SENTRY_ORG and SENTRY_PROJECT environment variables are required"
    );
    process.exit(1);
  }

  console.log(`📋 Organization: ${org}`);
  console.log(`📋 Project: ${project}\n`);

  try {
    // Get existing rules
    console.log("📖 Fetching existing alert rules...");
    const existingRules = await getExistingAlertRules(org, project);
    console.log(`   Found ${existingRules.length} existing rules\n`);

    // Check for FinanSEAL rules that already exist
    const finansealRules = existingRules.filter((r) =>
      r.name.startsWith("[FinanSEAL]")
    );

    if (finansealRules.length > 0) {
      console.log(
        "⚠️  Found existing FinanSEAL rules. Do you want to replace them?"
      );
      console.log("   Existing rules:");
      finansealRules.forEach((r) => console.log(`   - ${r.name} (id: ${r.id})`));
      console.log(
        "\n   Run with --force flag to delete and recreate all FinanSEAL rules"
      );

      if (!process.argv.includes("--force")) {
        console.log("\n✅ No changes made. Use --force to recreate rules.");
        return;
      }

      // Delete existing FinanSEAL rules
      console.log("\n🗑️  Deleting existing FinanSEAL rules...");
      for (const rule of finansealRules) {
        await deleteAlertRule(org, project, rule.id);
        console.log(`   Deleted: ${rule.name}`);
      }
      console.log("");
    }

    // Create new rules
    console.log("➕ Creating new alert rules...\n");
    for (const ruleConfig of ALERT_RULES) {
      try {
        const createdRule = await createAlertRule(org, project, ruleConfig);
        console.log(`   ✅ Created: ${createdRule.name} (id: ${createdRule.id})`);
      } catch (error) {
        console.error(`   ❌ Failed to create: ${ruleConfig.name}`);
        console.error(`      ${error instanceof Error ? error.message : error}`);
      }
    }

    console.log("\n✅ Alert rules setup complete!");
    console.log("\n📝 Summary of created rules:");
    console.log("   1. New Issue Alert - Notifies on first occurrence of new errors");
    console.log("   2. Critical/Fatal Alert - Immediate notification for fatal errors");
    console.log("   3. Regression Alert - Notifies when resolved issues recur");
    console.log("   4. High Volume Alert - Triggers when error rate spikes (>100/hr)");

    // Show webhook configuration instructions
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://your-domain.com";
    console.log("\n💡 Manual Steps Required for Webhook/Telegram Alerts:");
    console.log("   1. Go to Sentry Dashboard → Settings → Developer Settings");
    console.log("   2. Create a new 'Internal Integration'");
    console.log("   3. Enable 'Alert Rule Action' in Webhooks section");
    console.log(`   4. Set webhook URL: ${appUrl}/api/v1/system/webhooks/sentry`);
    console.log("   5. Set SENTRY_WEBHOOK_SECRET env var and use as X-Sentry-Token");
    console.log("   6. Add the integration's webhook action to each alert rule");
    console.log("   7. Configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.local");
  } catch (error) {
    console.error("\n❌ Setup failed:", error);
    process.exit(1);
  }
}

main();
