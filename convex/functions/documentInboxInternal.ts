/**
 * Document Inbox Internal Actions
 *
 * Internal actions called by Lambda email processor.
 * Handles file upload to Convex storage and inbox entry creation.
 */

"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import crypto from "crypto";

/**
 * Upload file from S3 to Convex storage and create inbox entry
 * Called by: Lambda email processor after receiving forwarded document
 *
 * @param s3Bucket - S3 bucket name
 * @param s3Key - S3 object key
 * @param originalFilename - Original attachment filename
 * @param mimeType - File MIME type
 * @param businessId - Business ID
 * @param userId - User ID (determined from email sender)
 * @param emailMetadata - Email metadata (from, subject, etc.)
 * @returns Inbox entry creation result
 */
export const uploadAndCreateInboxEntry = action({
  args: {
    s3Bucket: v.string(),
    s3Key: v.string(),
    originalFilename: v.string(),
    mimeType: v.union(
      v.literal("application/pdf"),
      v.literal("image/jpeg"),
      v.literal("image/png")
    ),
    businessId: v.id("businesses"),
    userId: v.id("users"),
    emailMetadata: v.object({
      from: v.string(),
      subject: v.string(),
      body: v.string(),
      receivedAt: v.number(),
      messageId: v.string(),
    }),
  },
  handler: async (ctx, args): Promise<{
    inboxEntryId: any;
    triggerClassification: boolean;
    isDuplicate: boolean;
    duplicateOriginalId?: any;
    fileHash: string;
    fileSizeBytes: number;
  }> => {
    // 1. Download file from S3
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({ region: process.env.AWS_REGION || "us-west-2" });

    const response = await s3.send(
      new GetObjectCommand({ Bucket: args.s3Bucket, Key: args.s3Key })
    );

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    // 2. Calculate file hash
    const fileHash = crypto.createHash("md5").update(fileBuffer).digest("hex");

    // 3. Upload to Convex storage
    const storageId = await ctx.storage.store(new Blob([fileBuffer], { type: args.mimeType }));

    // 4. Create inbox entry via internal mutation
    const result = await ctx.runMutation(internal.functions.documentInbox.createInboxEntry, {
      businessId: args.businessId,
      userId: args.userId,
      fileStorageId: storageId,
      originalFilename: args.originalFilename,
      fileHash,
      fileSizeBytes: fileBuffer.length,
      mimeType: args.mimeType,
      sourceType: "email_forward",
      emailMetadata: args.emailMetadata,
    });

    return {
      ...result,
      fileHash,
      fileSizeBytes: fileBuffer.length,
    };
  },
});
