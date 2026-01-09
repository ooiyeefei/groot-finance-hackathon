/**
 * Feedback API v1 - Main Collection Routes
 * POST /api/v1/feedback - Submit new feedback
 * GET /api/v1/feedback - List feedback (admin only)
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedConvex } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

// S3 configuration for feedback screenshots
const S3_BUCKET = "finanseal-public";
const S3_REGION = "us-west-2";
const S3_PREFIX = "feedback-screenshots";

// Initialize S3 client
const s3Client = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

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

    // Upload screenshot to S3 if provided
    let screenshotUrl: string | undefined = undefined;
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

      try {
        // Generate unique filename
        const extension = screenshot.type.split("/")[1] || "png";
        const filename = `${uuidv4()}.${extension}`;
        const key = `${S3_PREFIX}/${filename}`;

        // Convert File to Buffer
        const arrayBuffer = await screenshot.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload to S3
        await s3Client.send(
          new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: screenshot.type,
          })
        );

        // Set permanent public URL
        screenshotUrl = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
        console.log(`[Feedback API] Screenshot uploaded to S3: ${screenshotUrl}`);
      } catch (uploadError) {
        console.error("[Feedback API] S3 screenshot upload failed:", uploadError);
        // Continue without screenshot - graceful degradation
      }
    }

    // Create feedback record
    const feedbackId = await client.mutation(api.functions.feedback.create, {
      type,
      message: message.trim(),
      screenshotUrl, // Permanent S3 URL
      pageUrl: request.headers.get("referer") || "",
      userAgent: request.headers.get("user-agent") || "",
      isAnonymous,
    });

    const origin = request.nextUrl.origin;
    const cookieHeader = request.headers.get("cookie") || "";

    // Fire-and-forget GitHub issue creation for all feedback types
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
