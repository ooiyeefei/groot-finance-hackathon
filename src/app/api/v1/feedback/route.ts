/**
 * Feedback API v1 - Main Collection Routes
 * POST /api/v1/feedback - Submit new feedback
 * GET /api/v1/feedback - List feedback (admin only)
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedConvex } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

/**
 * POST /api/v1/feedback
 * Submit new feedback (bug report, feature request, or general feedback)
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { client } = await getAuthenticatedConvex();
    if (!client) {
      return NextResponse.json(
        { success: false, error: "Failed to authenticate" },
        { status: 500 }
      );
    }

    const formData = await request.formData();

    const type = formData.get("type") as "bug" | "feature" | "general";
    const message = formData.get("message") as string;
    const isAnonymous = formData.get("isAnonymous") === "true";
    const screenshot = formData.get("screenshot") as File | null;

    // Validate required fields
    if (!type || !["bug", "feature", "general"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "Invalid feedback type" },
        { status: 400 }
      );
    }

    if (!message || message.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: "Please tell us a bit more so we can help you" },
        { status: 400 }
      );
    }

    if (message.length > 2000) {
      return NextResponse.json(
        { success: false, error: "Message must be under 2000 characters" },
        { status: 400 }
      );
    }

    // Upload screenshot if provided
    let screenshotStorageId: Id<"_storage"> | undefined = undefined;
    if (screenshot && screenshot.size > 0) {
      // Validate screenshot
      if (screenshot.size > 2 * 1024 * 1024) {
        return NextResponse.json(
          { success: false, error: "Screenshot is too large (max 2MB)" },
          { status: 400 }
        );
      }

      if (!screenshot.type.startsWith("image/")) {
        return NextResponse.json(
          { success: false, error: "Invalid image format" },
          { status: 400 }
        );
      }

      // Get upload URL and upload screenshot
      const uploadUrl = await client.mutation(api.functions.feedback.generateUploadUrl);
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": screenshot.type },
        body: screenshot,
      });

      if (!uploadResponse.ok) {
        console.error("[Feedback API] Screenshot upload failed:", uploadResponse.statusText);
        // Continue without screenshot - graceful degradation
      } else {
        const { storageId } = await uploadResponse.json();
        screenshotStorageId = storageId;
      }
    }

    // Create feedback record
    const feedbackId = await client.mutation(api.functions.feedback.create, {
      type,
      message: message.trim(),
      screenshotStorageId,
      pageUrl: request.headers.get("referer") || "",
      userAgent: request.headers.get("user-agent") || "",
      isAnonymous,
    });

    const origin = request.nextUrl.origin;
    const cookieHeader = request.headers.get("cookie") || "";

    // Fire-and-forget GitHub issue creation for bugs and features
    if (type !== "general") {
      fetch(`${origin}/api/v1/feedback/github`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": cookieHeader,
        },
        body: JSON.stringify({ feedbackId: feedbackId }),
      }).catch((err) => {
        console.error("[Feedback API] GitHub issue trigger failed:", err);
      });
    }

    // Fire-and-forget email notifications to team
    fetch(`${origin}/api/v1/feedback/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": cookieHeader,
      },
      body: JSON.stringify({ feedbackId: feedbackId }),
    }).catch((err) => {
      console.error("[Feedback API] Notification trigger failed:", err);
    });

    return NextResponse.json(
      { success: true, data: { id: feedbackId } },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Feedback API] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit feedback" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/feedback
 * List all feedback (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { client } = await getAuthenticatedConvex();
    if (!client) {
      return NextResponse.json(
        { success: false, error: "Failed to authenticate" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);

    const type = searchParams.get("type") as "bug" | "feature" | "general" | null;
    const status = searchParams.get("status") as "new" | "reviewed" | "resolved" | null;
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const result = await client.query(api.functions.feedback.list, {
      type: type || undefined,
      status: status || undefined,
      limit: Math.min(limit, 100),
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[Feedback API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch feedback" },
      { status: 500 }
    );
  }
}
