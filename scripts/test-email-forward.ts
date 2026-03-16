/**
 * Email Forwarding Test Script (001-doc-email-forward)
 *
 * Simulates document email forwarding locally for testing.
 * Creates inbox entries directly via Convex without requiring AWS SES.
 *
 * Usage:
 *   npx tsx scripts/test-email-forward.ts
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import fs from "fs";
import crypto from "crypto";
import path from "path";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://kindhearted-lynx-129.convex.cloud";
const convex = new ConvexHttpClient(CONVEX_URL);

interface TestConfig {
  businessId: string;
  userId: string;
  testFilePath: string;
  senderEmail: string;
  subject: string;
}

async function uploadFileToConvex(filePath: string): Promise<string> {
  // Read file
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer]);

  // Get upload URL
  const uploadUrl = await convex.mutation(api.functions.files.generateUploadUrl);

  // Upload file
  const response = await fetch(uploadUrl, {
    method: "POST",
    body: blob,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  const result = await response.json();
  return result.storageId;
}

async function simulateEmailForward(config: TestConfig) {
  console.log("\n📧 Email Forwarding Test");
  console.log("========================\n");

  try {
    // 1. Check if test file exists
    if (!fs.existsSync(config.testFilePath)) {
      console.error(`❌ Test file not found: ${config.testFilePath}`);
      console.log("\nPlease create a test file at test-data/sample-receipt.jpg");
      return;
    }

    console.log(`📄 Test file: ${config.testFilePath}`);

    // 2. Read file and calculate hash
    const fileBuffer = fs.readFileSync(config.testFilePath);
    const fileHash = crypto.createHash("md5").update(fileBuffer).digest("hex");
    const filename = path.basename(config.testFilePath);
    const fileSize = fileBuffer.length;

    console.log(`📊 File size: ${fileSize} bytes`);
    console.log(`#️⃣  File hash: ${fileHash}`);

    // 3. Upload to Convex storage
    console.log("\n📤 Uploading to Convex storage...");
    const storageId = await uploadFileToConvex(config.testFilePath);
    console.log(`✅ Storage ID: ${storageId}`);

    // 4. Determine MIME type
    const ext = path.extname(filename).toLowerCase();
    let mimeType: "application/pdf" | "image/jpeg" | "image/png";
    if (ext === ".pdf") {
      mimeType = "application/pdf";
    } else if (ext === ".png") {
      mimeType = "image/png";
    } else {
      mimeType = "image/jpeg";
    }

    // 5. Create inbox entry
    console.log("\n📝 Creating inbox entry...");
    const result = await convex.mutation(api.functions.documentInbox.createInboxEntry as any, {
      businessId: config.businessId,
      userId: config.userId,
      fileStorageId: storageId,
      originalFilename: filename,
      fileHash,
      fileSizeBytes: fileSize,
      mimeType,
      sourceType: "email_forward",
      emailMetadata: {
        from: config.senderEmail,
        subject: config.subject,
        body: "Test email forwarding simulation",
        receivedAt: Date.now(),
        messageId: `<test-${Date.now()}@simulator>`,
      },
    });

    console.log("\n✅ Success!");
    console.log(`   Inbox Entry ID: ${result.inboxEntryId}`);
    console.log(`   Duplicate: ${result.isDuplicate}`);
    if (result.isDuplicate) {
      console.log(`   Original ID: ${result.duplicateOriginalId}`);
    }
    console.log(`   Trigger Classification: ${result.triggerClassification}`);

    console.log("\n📊 Next Steps:");
    if (result.isDuplicate) {
      console.log("   - Document marked as duplicate");
      console.log("   - Status: quarantined");
    } else {
      console.log("   - Document created in inbox");
      console.log("   - Status: pending_classification");
      console.log("   - Check Documents Inbox page: http://localhost:3000/documents-inbox");
    }
  } catch (error) {
    console.error("\n❌ Error:", error);
    if (error instanceof Error) {
      console.error(error.message);
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
simulateEmailForward(config).then(() => {
  process.exit(0);
});
