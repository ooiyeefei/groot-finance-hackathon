/**
 * Feedback Notification API - Sends email notifications to team
 * POST /api/v1/feedback/notify - Internal endpoint for team notifications
 *
 * This endpoint is called via fire-and-forget from the main feedback POST.
 * It sends email notifications to configured team members.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedConvex } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { emailService } from "@/lib/services/email-service";

// Get notification recipients from environment
const NOTIFICATION_EMAILS = process.env.FEEDBACK_NOTIFICATION_EMAILS?.split(",").map(e => e.trim()).filter(Boolean) || [];

interface NotifyPayload {
  feedbackId: string;
}

/**
 * POST /api/v1/feedback/notify
 * Sends email notifications about new feedback
 */
export async function POST(request: NextRequest) {
  try {
    // Skip if no notification emails configured
    if (NOTIFICATION_EMAILS.length === 0) {
      console.log("[Feedback Notify] No notification emails configured, skipping");
      return NextResponse.json({
        success: true,
        message: "No notification recipients configured",
      });
    }

    const body: NotifyPayload = await request.json();
    const { feedbackId } = body;

    if (!feedbackId) {
      return NextResponse.json(
        { success: false, error: "Missing feedbackId" },
        { status: 400 }
      );
    }

    // Get feedback details from Convex
    const { client } = await getAuthenticatedConvex();
    if (!client) {
      return NextResponse.json(
        { success: false, error: "Failed to authenticate with Convex" },
        { status: 500 }
      );
    }

    const feedback = await client.query(api.functions.feedback.get, {
      id: feedbackId as Id<"feedback">,
    });

    if (!feedback) {
      return NextResponse.json(
        { success: false, error: "Feedback not found" },
        { status: 404 }
      );
    }

    // Send notification to each configured recipient
    const results = await Promise.allSettled(
      NOTIFICATION_EMAILS.map(async (recipientEmail) => {
        const result = await emailService.sendFeedbackNotification({
          recipientEmail,
          feedbackType: feedback.type as "bug" | "feature" | "general",
          feedbackMessage: feedback.message,
          submitterEmail: feedback.user?.email,
          pageUrl: feedback.pageUrl || undefined,
          githubIssueUrl: feedback.githubIssueUrl || undefined,
          isAnonymous: feedback.isAnonymous,
        });

        if (!result.success) {
          throw new Error(result.error);
        }

        return { email: recipientEmail, messageId: result.messageId };
      })
    );

    const successful = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;

    console.log(`[Feedback Notify] Sent ${successful} notifications, ${failed} failed`);

    return NextResponse.json({
      success: true,
      data: {
        notificationsSent: successful,
        notificationsFailed: failed,
      },
    });
  } catch (error) {
    console.error("[Feedback Notify] Error sending notifications:", error);
    return NextResponse.json(
      { success: false, error: "Failed to send notifications" },
      { status: 500 }
    );
  }
}
