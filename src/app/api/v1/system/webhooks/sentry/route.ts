/**
 * Sentry Webhook Handler
 *
 * Receives Sentry alert webhooks and forwards critical errors to Telegram.
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
 * Response structure for webhook processing.
 */
interface WebhookResponse {
  success: boolean;
  telegram_sent: boolean;
  message: string;
}

/**
 * Validates the Sentry webhook token.
 *
 * Sentry sends a configurable token in the X-Sentry-Token header.
 * We validate this against our SENTRY_WEBHOOK_SECRET env var.
 */
function validateWebhookToken(request: NextRequest): boolean {
  const secret = process.env.SENTRY_WEBHOOK_SECRET;

  if (!secret) {
    console.warn(
      "[Sentry Webhook] SENTRY_WEBHOOK_SECRET not configured - validation disabled"
    );
    return true; // Allow in development without secret
  }

  const token = request.headers.get("X-Sentry-Token");

  if (!token) {
    console.warn("[Sentry Webhook] Missing X-Sentry-Token header");
    return false;
  }

  return token === secret;
}

/**
 * Checks if the alert should be forwarded to Telegram.
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
 * Extracts issue data from Sentry webhook payload for Telegram formatting.
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
 * Receives Sentry webhook alerts and forwards critical errors to Telegram.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<WebhookResponse | { error: string; code?: string }>> {
  try {
    // 1. Validate webhook token
    if (!validateWebhookToken(request)) {
      return NextResponse.json(
        { error: "Invalid or missing webhook token", code: "INVALID_TOKEN" },
        { status: 401 }
      );
    }

    // 2. Parse payload
    let payload: SentryWebhookPayload;
    try {
      payload = await request.json();
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

    // 4. Check if should forward to Telegram
    if (!shouldForwardAlert(payload)) {
      const level =
        payload.data.event?.level || payload.data.issue?.level || "unknown";
      console.log(
        `[Sentry Webhook] Skipping: action=${payload.action}, level=${level}`
      );

      return NextResponse.json({
        success: true,
        telegram_sent: false,
        message: `Alert not forwarded: action=${payload.action}, level=${level}`,
      });
    }

    // 5. Check Telegram configuration
    if (
      !process.env.TELEGRAM_BOT_TOKEN ||
      !process.env.TELEGRAM_CHAT_ID
    ) {
      console.warn(
        "[Sentry Webhook] Telegram not configured - alert not forwarded"
      );

      return NextResponse.json({
        success: true,
        telegram_sent: false,
        message: "Telegram not configured",
      });
    }

    // 6. Extract issue data and send to Telegram
    const issueData = extractIssueData(payload);

    try {
      const messageId = await sendSentryAlert(issueData);
      console.log(
        `[Sentry Webhook] Alert forwarded to Telegram (message_id: ${messageId})`
      );

      return NextResponse.json({
        success: true,
        telegram_sent: true,
        message: `Alert forwarded to Telegram (message_id: ${messageId})`,
      });
    } catch (telegramError) {
      console.error(
        "[Sentry Webhook] Failed to send Telegram alert:",
        telegramError
      );

      // Return success=true but telegram_sent=false
      // The webhook processed successfully, Telegram just failed
      return NextResponse.json({
        success: true,
        telegram_sent: false,
        message: `Telegram send failed: ${telegramError instanceof Error ? telegramError.message : "Unknown error"}`,
      });
    }
  } catch (error) {
    console.error("[Sentry Webhook] Unexpected error:", error);

    return NextResponse.json(
      {
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/system/webhooks/sentry
 *
 * Health check endpoint for webhook configuration.
 */
export async function GET(): Promise<NextResponse> {
  const hasTelegramConfig =
    !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID;
  const hasWebhookSecret = !!process.env.SENTRY_WEBHOOK_SECRET;

  return NextResponse.json({
    status: "ok",
    endpoint: "/api/v1/system/webhooks/sentry",
    telegram_configured: hasTelegramConfig,
    webhook_secret_configured: hasWebhookSecret,
  });
}
