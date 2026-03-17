/**
 * Email Forwarding Test Script (001-doc-email-forward)
 *
 * Simulates document email forwarding locally for testing.
 * Calls Convex action directly (same as Lambda does).
 *
 * Usage:
 *   npx tsx scripts/test-email-forward.ts
 *
 * Note: This script simulates the Lambda flow but skips actual S3 upload.
 * The Convex action will fail if the S3 file doesn't exist, so this is
 * primarily for testing the API contract, not end-to-end flow.
 */

import path from "path";
import fs from "fs";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://kindhearted-lynx-129.convex.cloud";
const S3_BUCKET = process.env.S3_BUCKET_NAME || "finanseal-bucket";

interface TestConfig {
  businessId: string;
  userId: string;
  testFilePath: string;
  senderEmail: string;
  subject: string;
}

async function simulateEmailForward(config: TestConfig) {
  console.log("\n📧 Email Forwarding Test (API Contract)");
  console.log("=========================================\n");

  try {
    // 1. Check if test file exists
    if (!fs.existsSync(config.testFilePath)) {
      console.error(`❌ Test file not found: ${config.testFilePath}`);
      console.log("\nPlease create a test file at test-data/sample-receipt.jpg");
      return;
    }

    console.log(`📄 Test file: ${config.testFilePath}`);

    // 2. Get file metadata
    const filename = path.basename(config.testFilePath);
    const stats = fs.statSync(config.testFilePath);
    console.log(`📊 File size: ${stats.size} bytes`);

    // 3. Determine MIME type
    const ext = path.extname(filename).toLowerCase();
    let mimeType: "application/pdf" | "image/jpeg" | "image/png";
    if (ext === ".pdf") {
      mimeType = "application/pdf";
    } else if (ext === ".png") {
      mimeType = "image/png";
    } else {
      mimeType = "image/jpeg";
    }
    console.log(`📋 MIME type: ${mimeType}`);

    // 4. Simulate S3 staging path (Lambda uploads here)
    const timestamp = Date.now();
    const s3Key = `document-inbox-staging/${config.businessId}/${timestamp}-${filename}`;
    console.log(`📦 Simulated S3 key: ${s3Key}`);

    // 5. Call Convex action (same as Lambda)
    console.log("\n📤 Calling Convex uploadAndCreateInboxEntry action...");
    console.log("⚠️  Note: This will fail if S3 file doesn't exist.");
    console.log("   For full end-to-end test, use real email forwarding.\n");

    const response = await fetch(`${CONVEX_URL}/api/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "functions/documentInboxInternal:uploadAndCreateInboxEntry",
        args: {
          s3Bucket: S3_BUCKET,
          s3Key,
          originalFilename: filename,
          mimeType,
          businessId: config.businessId,
          userId: config.userId,
          emailMetadata: {
            from: config.senderEmail,
            subject: config.subject,
            body: "Test email forwarding simulation",
            receivedAt: timestamp,
            messageId: `<test-${timestamp}@simulator>`,
          },
        },
        format: "json",
      }),
    });

    if (!response.ok) {
      throw new Error(`Convex action HTTP error: ${response.status}`);
    }

    const actionResult = await response.json();
    if (actionResult.status === "error") {
      console.error("\n❌ Convex action failed:");
      console.error(`   ${actionResult.errorMessage}`);
      console.log("\n💡 Expected behavior: Action requires actual S3 file to exist.");
      console.log("   To test end-to-end, send real email to inbox@prefix.hellogroot.com");
      return;
    }

    const result = actionResult.value;

    console.log("\n✅ Success!");
    console.log(`   Inbox Entry ID: ${result.inboxEntryId}`);
    console.log(`   File Hash: ${result.fileHash}`);
    console.log(`   File Size: ${result.fileSizeBytes} bytes`);
    console.log(`   Duplicate: ${result.isDuplicate}`);
    if (result.isDuplicate) {
      console.log(`   Original ID: ${result.duplicateOriginalId}`);
    }
    console.log(`   Trigger Classification: ${result.triggerClassification}`);

    console.log("\n📊 Next Steps:");
    if (result.isDuplicate) {
      console.log("   - Document marked as duplicate");
      console.log("   - Auto-reply email sent to sender");
    } else {
      console.log("   - Document created in inbox");
      console.log("   - Lambda will run Gemini classification");
      console.log("   - Check Documents Inbox page: http://localhost:3000/documents-inbox");
    }
  } catch (error) {
    console.error("\n❌ Error:", error);
    if (error instanceof Error) {
      console.error(error.message);
      console.error(error.stack);
    }
  }
}

// ============================================================================
// Configuration
// ============================================================================

const config: TestConfig = {
  // TODO: Replace with your business ID and user ID
  businessId: process.env.TEST_BUSINESS_ID || "YOUR_BUSINESS_ID",
  userId: process.env.TEST_USER_ID || "YOUR_USER_ID",
  testFilePath: path.join(__dirname, "../test-data/sample-receipt.jpg"),
  senderEmail: "test@mycompany.com",
  subject: "Fwd: Receipt for testing",
};

// Run simulation
console.log("\n⚠️  WARNING: This script tests the API contract only.");
console.log("It does NOT upload files to S3, so the Convex action will fail.");
console.log("For full end-to-end testing, send a real email to inbox@prefix.hellogroot.com\n");

simulateEmailForward(config).then(() => {
  process.exit(0);
});
