/**
 * Telegram Notifier for Sentry Alert Forwarding
 *
 * Sends formatted error alerts to a Telegram chat/group via the Bot API.
 * Used by the Sentry webhook handler to forward critical errors.
 *
 * @see specs/003-sentry-integration/research.md
 * @see https://core.telegram.org/bots/api#sendmessage
 */

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

/**
 * Telegram message options for the sendMessage API.
 */
export interface TelegramMessageOptions {
  /** Message text (HTML formatted) */
  text: string;
  /** Parse mode for formatting */
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  /** Disable link previews */
  disableWebPagePreview?: boolean;
  /** Disable notification sound */
  disableNotification?: boolean;
}

/**
 * Sentry issue data for formatting Telegram messages.
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
 * Response from Telegram API sendMessage.
 */
interface TelegramResponse {
  ok: boolean;
  result?: {
    message_id: number;
    chat: { id: number };
    date: number;
  };
  error_code?: number;
  description?: string;
}

/**
 * Sends a message to Telegram using the Bot API.
 *
 * @param message - Message text (HTML formatted)
 * @param options - Additional message options
 * @returns Promise resolving to message ID on success
 * @throws Error on API failure or missing configuration
 */
export async function sendTelegramMessage(
  message: string,
  options?: Omit<TelegramMessageOptions, "text">
): Promise<number> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables are required"
    );
  }

  const url = `${TELEGRAM_API_BASE}${botToken}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: options?.parseMode || "HTML",
      disable_web_page_preview: options?.disableWebPagePreview ?? true,
      disable_notification: options?.disableNotification ?? false,
    }),
  });

  const data = (await response.json()) as TelegramResponse;

  if (!data.ok) {
    throw new Error(
      `Telegram API error (${data.error_code}): ${data.description}`
    );
  }

  return data.result?.message_id || 0;
}

/**
 * Formats a Sentry issue into an HTML message for Telegram.
 *
 * @param issue - Sentry issue data from webhook payload
 * @returns Formatted HTML message
 */
export function formatSentryAlert(issue: SentryIssueData): string {
  const levelEmoji = getLevelEmoji(issue.level);
  const levelText = (issue.level || "error").toUpperCase();

  // Build message parts
  const parts: string[] = [];

  // Header with level and title
  parts.push(`${levelEmoji} <b>${levelText}</b>: ${escapeHtml(issue.title)}`);

  // Error type and culprit
  if (issue.type) {
    parts.push(`<b>Type:</b> <code>${escapeHtml(issue.type)}</code>`);
  }
  if (issue.culprit) {
    parts.push(`<b>Location:</b> <code>${escapeHtml(issue.culprit)}</code>`);
  }

  // Context information
  if (issue.project || issue.environment) {
    const context = [
      issue.project && `Project: ${escapeHtml(issue.project)}`,
      issue.environment && `Env: ${escapeHtml(issue.environment)}`,
    ]
      .filter(Boolean)
      .join(" | ");
    parts.push(`<b>Context:</b> ${context}`);
  }

  // Domain tag
  if (issue.domain) {
    parts.push(`<b>Domain:</b> ${escapeHtml(issue.domain)}`);
  }

  // User context (if available)
  if (issue.user?.id || issue.user?.username) {
    const userInfo = issue.user.username
      ? `${issue.user.username} (${issue.user.id})`
      : issue.user.id;
    parts.push(`<b>User:</b> ${escapeHtml(userInfo || "unknown")}`);
  }

  // Business context (if available)
  if (issue.business?.id || issue.business?.name) {
    const businessInfo = issue.business.name
      ? `${issue.business.name} (${issue.business.id})`
      : issue.business.id;
    parts.push(`<b>Business:</b> ${escapeHtml(businessInfo || "unknown")}`);
  }

  // Occurrence count
  if (issue.count && issue.count > 1) {
    parts.push(`<b>Occurrences:</b> ${issue.count}`);
  }

  // First seen timestamp
  if (issue.firstSeen) {
    const date = new Date(issue.firstSeen);
    parts.push(`<b>First Seen:</b> ${date.toISOString()}`);
  }

  // Sentry link
  parts.push(`\n<a href="${escapeHtml(issue.url)}">View in Sentry →</a>`);

  return parts.join("\n");
}

/**
 * Sends a Sentry issue alert to Telegram.
 *
 * Convenience function that formats the issue and sends it.
 *
 * @param issue - Sentry issue data
 * @returns Promise resolving to message ID
 */
export async function sendSentryAlert(issue: SentryIssueData): Promise<number> {
  const message = formatSentryAlert(issue);
  return sendTelegramMessage(message, {
    parseMode: "HTML",
    disableWebPagePreview: true,
    // Don't silence fatal errors
    disableNotification: issue.level !== "fatal",
  });
}

/**
 * Gets an emoji for the severity level.
 */
function getLevelEmoji(level?: string): string {
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
 * Escapes HTML special characters for Telegram HTML mode.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
