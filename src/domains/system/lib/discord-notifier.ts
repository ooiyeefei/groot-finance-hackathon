/**
 * Discord Notifier for Sentry Alert Forwarding
 *
 * Sends formatted error alerts to a Discord channel via webhook.
 * Used by the Sentry webhook handler to forward critical errors.
 *
 * @see specs/003-sentry-integration/research.md
 * @see https://discord.com/developers/docs/resources/webhook
 */

/**
 * Discord embed colors based on severity level.
 */
const SEVERITY_COLORS = {
  fatal: 15158332, // Red (0xE74C3C)
  error: 15548997, // Light red (0xED4245)
  warning: 15105570, // Orange (0xE67E22)
  info: 3447003, // Blue (0x3498DB)
  debug: 9807270, // Grey (0x95A5A6)
} as const;

/**
 * Sentry issue data for formatting Discord embeds.
 * Shared type with telegram-notifier.
 */
export interface SentryIssueData {
  /** Issue title/error message */
  title: string;
  /** Culprit (file/function where error occurred) */
  culprit?: string;
  /** Error type (e.g., TypeError, Error) */
  type?: string;
  /** Issue URL in Sentry dashboard */
  url: string;
  /** Project name */
  project?: string;
  /** Environment (production, development) */
  environment?: string;
  /** User context if available */
  user?: {
    id?: string;
    username?: string;
  };
  /** Business context if available */
  business?: {
    id?: string;
    name?: string;
  };
  /** Domain tag */
  domain?: string;
  /** Number of occurrences */
  count?: number;
  /** First seen timestamp */
  firstSeen?: string;
  /** Severity level */
  level?: "error" | "fatal" | "warning" | "info";
}

/**
 * Discord embed structure for webhook.
 */
interface DiscordEmbed {
  title: string;
  description?: string;
  url?: string;
  color: number;
  fields: DiscordField[];
  footer?: {
    text: string;
  };
  timestamp?: string;
}

interface DiscordField {
  name: string;
  value: string;
  inline?: boolean;
}

/**
 * Discord webhook payload.
 */
interface DiscordWebhookPayload {
  embeds: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
}

/**
 * Check if Discord webhook is configured.
 *
 * @returns true if DISCORD_WEBHOOK_URL is set
 */
export function isDiscordConfigured(): boolean {
  return !!process.env.DISCORD_WEBHOOK_URL;
}

/**
 * Get color for severity level.
 */
function getSeverityColor(level?: string): number {
  switch (level) {
    case "fatal":
      return SEVERITY_COLORS.fatal;
    case "error":
      return SEVERITY_COLORS.error;
    case "warning":
      return SEVERITY_COLORS.warning;
    case "info":
      return SEVERITY_COLORS.info;
    default:
      return SEVERITY_COLORS.error;
  }
}

/**
 * Get emoji for severity level.
 */
function getSeverityEmoji(level?: string): string {
  switch (level) {
    case "fatal":
      return "🔴";
    case "error":
      return "🟠";
    case "warning":
      return "🟡";
    case "info":
      return "🔵";
    default:
      return "🟠";
  }
}

/**
 * Format a Sentry issue into a Discord embed.
 *
 * @param issue - Sentry issue data from webhook payload
 * @returns Formatted Discord embed
 */
export function formatDiscordEmbed(issue: SentryIssueData): DiscordEmbed {
  const levelEmoji = getSeverityEmoji(issue.level);
  const levelText = (issue.level || "error").toUpperCase();
  const color = getSeverityColor(issue.level);

  const fields: DiscordField[] = [];

  // Error type
  if (issue.type) {
    fields.push({
      name: "Type",
      value: `\`${issue.type}\``,
      inline: true,
    });
  }

  // Location/Culprit
  if (issue.culprit) {
    fields.push({
      name: "Location",
      value: `\`${issue.culprit}\``,
      inline: true,
    });
  }

  // Context (project/environment)
  if (issue.project || issue.environment) {
    const contextParts: string[] = [];
    if (issue.project) contextParts.push(issue.project);
    if (issue.environment) contextParts.push(issue.environment);
    fields.push({
      name: "Context",
      value: contextParts.join(" | "),
      inline: true,
    });
  }

  // Domain
  if (issue.domain) {
    fields.push({
      name: "Domain",
      value: issue.domain,
      inline: true,
    });
  }

  // User
  if (issue.user?.id || issue.user?.username) {
    const userInfo = issue.user.username
      ? `${issue.user.username} (${issue.user.id})`
      : issue.user.id || "unknown";
    fields.push({
      name: "User",
      value: userInfo,
      inline: true,
    });
  }

  // Business
  if (issue.business?.id || issue.business?.name) {
    const businessInfo = issue.business.name
      ? `${issue.business.name} (${issue.business.id})`
      : issue.business.id || "unknown";
    fields.push({
      name: "Business",
      value: businessInfo,
      inline: true,
    });
  }

  // Occurrences
  if (issue.count && issue.count > 1) {
    fields.push({
      name: "Occurrences",
      value: issue.count.toString(),
      inline: true,
    });
  }

  // First seen
  if (issue.firstSeen) {
    fields.push({
      name: "First Seen",
      value: `<t:${Math.floor(new Date(issue.firstSeen).getTime() / 1000)}:R>`,
      inline: true,
    });
  }

  return {
    title: `${levelEmoji} ${levelText}: ${issue.title}`,
    url: issue.url,
    color,
    fields,
    footer: {
      text: "Sentry Alert",
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Send a Sentry issue alert to Discord via webhook.
 *
 * @param issue - Sentry issue data
 * @returns Promise resolving to true on success
 * @throws Error on webhook failure
 */
export async function sendDiscordAlert(issue: SentryIssueData): Promise<boolean> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error("DISCORD_WEBHOOK_URL environment variable is required");
  }

  const embed = formatDiscordEmbed(issue);

  const payload: DiscordWebhookPayload = {
    embeds: [embed],
    username: "Sentry Alerts",
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord webhook error (${response.status}): ${text}`);
  }

  return true;
}
