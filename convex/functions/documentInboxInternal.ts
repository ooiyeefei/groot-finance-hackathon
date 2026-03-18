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
 * Upload file from pre-signed URL to Convex storage and create inbox entry.
 * Lambda generates a pre-signed S3 URL (valid 5 min) so Convex doesn't need AWS credentials.
 */
export const uploadAndCreateInboxEntry = action({
  args: {
    presignedUrl: v.string(),
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
    // 1. Download file via pre-signed URL (no AWS SDK needed)
    const response = await fetch(args.presignedUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }

    const fileBuffer = Buffer.from(await response.arrayBuffer());

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
