/**
 * Feedback Screenshot Upload URL API
 * POST /api/v1/feedback/upload-url - Generate presigned S3 URL for screenshot upload
 *
 * Returns a presigned PUT URL for direct S3 upload and the permanent public URL
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

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
 * POST /api/v1/feedback/upload-url
 * Generate presigned URL for screenshot upload
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { contentType } = body;

    // Validate content type
    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!contentType || !allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { success: false, error: "Invalid content type. Must be PNG, JPEG, or WebP" },
        { status: 400 }
      );
    }

    // Generate unique filename
    const extension = contentType.split("/")[1];
    const filename = `${uuidv4()}.${extension}`;
    const key = `${S3_PREFIX}/${filename}`;

    // Create presigned PUT URL (expires in 5 minutes)
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    // The permanent public URL for this file
    const publicUrl = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;

    console.log(`[Feedback Upload] Generated presigned URL for ${key}`);

    return NextResponse.json({
      success: true,
      data: {
        uploadUrl,    // Presigned PUT URL (use for uploading)
        publicUrl,    // Permanent public URL (store in database)
        key,          // S3 object key
        expiresIn: 300,
      },
    });
  } catch (error) {
    console.error("[Feedback Upload] Error generating presigned URL:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
