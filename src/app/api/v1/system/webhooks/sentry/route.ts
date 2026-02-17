/**
 * Sentry Webhook Handler
 *
 * Receives Sentry alert webhooks and forwards critical errors to Telegram and Discord.
 * Only processes 'triggered' actions with error/fatal severity.
 *
 * @see specs/003-sentry-integration/contracts/webhook-api.yaml
 * @see specs/003-sentry-integration/research.md
 */
import { NextRequest, NextResponse } from "next/server";
import {
  sendSentryAlert,
  type SentryIssueData,
} from "@/domains/system/lib/telegram-notifier";
import {
  sendDiscordAlert,
  isDiscordConfigured,
} from "@/domains/system/lib/discord-notifier";

/**
 * Sentry webhook payload structure.
 * Based on Sentry's webhook format for issue alerts.
 */
interface SentryWebhookPayload {
  action: "triggered" | "resolved" | "assigned" | "archived" | "ignored";
  data: {
    event?: {
      event_id: string;
      title: string;
      message?: string;
      level: "fatal" | "error" | "warning" | "info" | "debug";
      platform?: string;
      timestamp?: string;
      culprit?: string;
      tags?: Array<{ key: string; value: string }>;
      user?: {
        id?: string;
        email?: string;
        username?: string;
        ip_address?: string;
      };
      contexts?: {
        browser?: { name?: string; version?: string };
        os?: { name?: string; version?: string };
      };
    };
    issue?: {
      id: string;
      shortId: string;
      title: string;
      culprit?: string;
      level: string;
      status: string;
      count: number;
      firstSeen: string;
      lastSeen: string;
      metadata?: {
        type?: string;
        value?: string;
      };
    };
    triggered_rule?: string;
  };
  actor?: {
    type: "application" | "user";
    id?: string;
    name?: string;
  };
  installation?: {
    uuid: string;
  };
}

/**
 * Notification result for a single channel.
 */
interface NotificationResult {
  sent: boolean;
  message?: string;
  error?: string;
}

/**
 * Response structure for webhook processing.
 */
interface WebhookResponse {
  success: boolean;
  telegram_sent: boolean;
  discord_sent: boolean;
  message: string;
  notifications: {
    telegram: NotificationResult;
    discord: NotificationResult;
  };
}

/**
 * Health check response structure.
 */
interface WebhookHealthResponse {
  status: string;
  endpoint: string;
  telegram_configured: boolean;
  discord_configured: boolean;
  webhook_secret_configured: boolean;
}

/**
 * Validates the Sentry webhook signature.
 *
 * Sentry Internal Integrations sign the request body using HMAC-SHA256
 * with the Client Secret and send the signature in sentry-hook-signature header.
 *
 * Also supports legacy X-Sentry-Token header for manual testing.
 */
async function validateWebhookSignature(
  request: NextRequest,
  body: string
): Promise<boolean> {
  const secret = process.env.SENTRY_WEBHOOK_SECRET;

  if (!secret) {
    console.warn(
      "[Sentry Webhook] SENTRY_WEBHOOK_SECRET not configured - validation disabled"
    );
    return true; // Allow in development without secret
  }

  // Check for Sentry's HMAC signature (Internal Integrations)
  const signature = request.headers.get("sentry-hook-signature");
  if (signature) {
    const crypto = await import("crypto");
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");
    const isValid = signature === expectedSignature;
    if (!isValid) {
      console.warn("[Sentry Webhook] Invalid sentry-hook-signature");
    }
    return isValid;
  }

  // Fallback: Check for legacy X-Sentry-Token (manual testing)
  const token = request.headers.get("X-Sentry-Token");
  if (token) {
    const isValid = token === secret;
    if (!isValid) {
      console.warn("[Sentry Webhook] Invalid X-Sentry-Token");
    }
    return isValid;
  }

  console.warn("[Sentry Webhook] Missing authentication header");
  return false;
}

/**
 * Checks if the alert should be forwarded to notifications.
 *
 * Only forwards:
 * - action === 'triggered' (new alerts, not resolved/assigned)
 * - level === 'error' or 'fatal'
 */
function shouldForwardAlert(payload: SentryWebhookPayload): boolean {
  // Only process triggered alerts
  if (payload.action !== "triggered") {
    return false;
  }

  // Get level from event or issue
  const level =
    payload.data.event?.level || (payload.data.issue?.level as string);

  // Only forward error or fatal severity
  return level === "error" || level === "fatal";
}

/**
 * Extracts issue data from Sentry webhook payload for notification formatting.
 */
function extractIssueData(payload: SentryWebhookPayload): SentryIssueData {
  const event = payload.data.event;
  const issue = payload.data.issue;

  // Extract domain tag if present
  const domainTag = event?.tags?.find((t) => t.key === "domain")?.value;

  // Extract environment tag
  const envTag = event?.tags?.find((t) => t.key === "environment")?.value;

  // Extract business context if present
  const businessId = event?.tags?.find((t) => t.key === "business_id")?.value;
  const businessName = event?.tags?.find(
    (t) => t.key === "business_name"
  )?.value;

  // Build Sentry issue URL
  const org = process.env.SENTRY_ORG || "unknown";
  const project = process.env.SENTRY_PROJECT || "unknown";
  const issueId = issue?.id || event?.event_id;
  const url = `https://sentry.io/organizations/${org}/issues/${issueId}/`;

  return {
    title: event?.title || issue?.title || "Unknown Error",
    culprit: event?.culprit || issue?.culprit,
    type: issue?.metadata?.type || extractErrorType(event?.title),
    url,
    project,
    environment: envTag,
    user: event?.user
      ? {
          id: event.user.id,
          username: event.user.username,
        }
      : undefined,
    business:
      businessId || businessName
        ? {
            id: businessId,
            name: businessName,
          }
        : undefined,
    domain: domainTag,
    count: issue?.count,
    firstSeen: issue?.firstSeen,
    level: (event?.level || issue?.level) as SentryIssueData["level"],
  };
}

/**
 * Extracts error type from title (e.g., "TypeError: Cannot read..." -> "TypeError")
 */
function extractErrorType(title?: string): string | undefined {
  if (!title) return undefined;
  const match = title.match(/^(\w+Error):/);
  return match ? match[1] : undefined;
}

/**
 * POST /api/v1/system/webhooks/sentry
 *
 * Receives Sentry webhook alerts and forwards critical errors to Telegram and Discord.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<WebhookResponse | { error: string; code?: string }>> {
  try {
    // 1. Read body as text for signature validation
    const body = await request.text();

    // 2. Validate webhook signature
    if (!(await validateWebhookSignature(request, body))) {
      return NextResponse.json(
        { error: "Invalid or missing webhook signature", code: "INVALID_SIGNATURE" },
        { status: 401 }
      );
    }

    // 3. Parse payload
    let payload: SentryWebhookPayload;
    try {
      payload = JSON.parse(body);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload", code: "INVALID_PAYLOAD" },
        { status: 400 }
      );
    }

    // 3. Validate required fields
    if (!payload.action || !payload.data) {
      return NextResponse.json(
        {
          error: "Missing required fields: action, data",
          code: "MISSING_FIELDS",
        },
        { status: 400 }
      );
    }

    console.log(
      `[Sentry Webhook] Received ${payload.action} alert`,
      payload.data.triggered_rule
        ? `from rule: ${payload.data.triggered_rule}`
        : ""
    );

    // 4. Check if should forward to notifications
    if (!shouldForwardAlert(payload)) {
      const level =
        payload.data.event?.level || payload.data.issue?.level || "unknown";
      console.log(
        `[Sentry Webhook] Skipping: action=${payload.action}, level=${level}`
      );
      return NextResponse.json({
        success: true,
        telegram_sent: false,
        discord_sent: false,
        message: `Alert not forwarded: action=${payload.action}, level=${level}`,
        notifications: {
          telegram: { sent: false, message: "Alert filtered by severity/action" },
          discord: { sent: false, message: "Alert filtered by severity/action" },
        },
      });
    }

    // 5. Extract issue data
    const issueData = extractIssueData(payload);

    // 6. Send to Telegram and Discord in parallel
    const [telegramResult, discordResult] = await Promise.allSettled([
      // Telegram
      (async (): Promise<NotificationResult> => {
        if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
          return { sent: false, message: "Telegram not configured" };
        }
        try {
          const messageId = await sendSentryAlert(issueData);
          console.log(
            `[Sentry Webhook] Alert forwarded to Telegram (message_id: ${messageId})`
          );
          return { sent: true, message: `message_id: ${messageId}` };
        } catch (error) {
          console.error("[Sentry Webhook] Telegram error:", error);
          return {
            sent: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      })(),
      // Discord
      (async (): Promise<NotificationResult> => {
        if (!isDiscordConfigured()) {
          return { sent: false, message: "Discord not configured" };
        }
        try {
          await sendDiscordAlert(issueData);
          console.log("[Sentry Webhook] Alert forwarded to Discord");
          return { sent: true };
        } catch (error) {
          console.error("[Sentry Webhook] Discord error:", error);
          return {
            sent: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      })(),
    ]);

    // Extract results
    const telegram =
      telegramResult.status === "fulfilled"
        ? telegramResult.value
        : { sent: false, error: "Promise rejected" };
    const discord =
      discordResult.status === "fulfilled"
        ? discordResult.value
        : { sent: false, error: "Promise rejected" };

    // Build response message
    const messages: string[] = [];
    if (telegram.sent) messages.push("Telegram: ✓");
    else if (telegram.error) messages.push(`Telegram: ✗ (${telegram.error})`);
    else messages.push(`Telegram: skipped (${telegram.message})`);

    if (discord.sent) messages.push("Discord: ✓");
    else if (discord.error) messages.push(`Discord: ✗ (${discord.error})`);
    else messages.push(`Discord: skipped (${discord.message})`);

    const anySent = telegram.sent || discord.sent;

    return NextResponse.json({
      success: true,
      telegram_sent: telegram.sent,
      discord_sent: discord.sent,
      message: messages.join(" | "),
      notifications: {
        telegram,
        discord,
      },
    });
  } catch (error) {
    console.error("[Sentry Webhook] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/system/webhooks/sentry
 *
 * Health check endpoint for webhook configuration.
 */
export async function GET(): Promise<NextResponse<WebhookHealthResponse>> {
  const hasTelegramConfig =
    !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID;
  const hasDiscordConfig = isDiscordConfigured();
  const hasWebhookSecret = !!process.env.SENTRY_WEBHOOK_SECRET;

  return NextResponse.json({
    status: "ok",
    endpoint: "/api/v1/system/webhooks/sentry",
    telegram_configured: hasTelegramConfig,
    discord_configured: hasDiscordConfig,
    webhook_secret_configured: hasWebhookSecret,
  });
}
