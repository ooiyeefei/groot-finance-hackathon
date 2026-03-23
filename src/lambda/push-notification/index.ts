/**
 * 034-leave-enhance: Push Notification Lambda
 *
 * Sends push notifications via APNs (iOS) and FCM (Android).
 * Reads credentials from AWS SSM Parameter Store.
 * Invoked from the leave notification API route.
 */

import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import * as https from "https";
import * as http2 from "http2";
import * as jwt from "jsonwebtoken";

const ssm = new SSMClient({ region: process.env.AWS_REGION || "us-west-2" });

// Cache SSM params for Lambda warm starts
let cachedApnsKey: string | null = null;
let cachedApnsKeyId: string | null = null;
let cachedApnsTeamId: string | null = null;
let cachedFcmServiceAccount: any = null;
let cachedFcmAccessToken: string | null = null;
let cachedFcmTokenExpiry = 0;

interface PushEvent {
  recipientUserId: string;
  businessId: string;
  title: string;
  body: string;
  data: {
    type: "leave_submitted" | "leave_approved" | "leave_rejected";
    leaveRequestId: string;
    deepLink: string;
  };
  deviceTokens: Array<{
    platform: "ios" | "android";
    deviceToken: string;
  }>;
}

interface PushResult {
  success: boolean;
  sent: number;
  failed: number;
  errors: Array<{ deviceToken: string; error: string }>;
}

async function getSSMParam(name: string): Promise<string> {
  const cmd = new GetParameterCommand({
    Name: name,
    WithDecryption: true,
  });
  const result = await ssm.send(cmd);
  return result.Parameter?.Value || "";
}

async function getApnsCredentials() {
  if (!cachedApnsKey) {
    cachedApnsKey = await getSSMParam("/finanseal/prod/apns-private-key");
    cachedApnsKeyId = await getSSMParam("/finanseal/prod/apns-key-id");
    cachedApnsTeamId = await getSSMParam("/finanseal/prod/apns-team-id");
  }
  return { key: cachedApnsKey!, keyId: cachedApnsKeyId!, teamId: cachedApnsTeamId! };
}

function createApnsJwt(keyId: string, teamId: string, privateKey: string): string {
  return jwt.sign({}, privateKey, {
    algorithm: "ES256",
    keyid: keyId,
    issuer: teamId,
    expiresIn: "1h",
    header: { alg: "ES256", kid: keyId },
  });
}

async function sendApns(
  deviceToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { key, keyId, teamId } = await getApnsCredentials();
    const token = createApnsJwt(keyId, teamId, key);
    const bundleId = process.env.APNS_BUNDLE_ID || "com.hellogroot.finance";

    return new Promise((resolve) => {
      const client = http2.connect("https://api.push.apple.com");

      const headers = {
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        authorization: `bearer ${token}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
      };

      const payload = JSON.stringify({
        aps: {
          alert: { title, body },
          sound: "default",
          badge: 1,
        },
        ...data,
      });

      const req = client.request(headers);
      let responseData = "";

      req.on("response", (headers) => {
        const status = headers[":status"];
        if (status === 200) {
          resolve({ success: true });
        } else {
          req.on("data", (chunk) => { responseData += chunk; });
          req.on("end", () => {
            resolve({ success: false, error: `APNs ${status}: ${responseData}` });
          });
        }
      });

      req.on("error", (err) => {
        resolve({ success: false, error: `APNs error: ${err.message}` });
      });

      req.write(payload);
      req.end();

      // Close client after request
      req.on("close", () => client.close());
    });
  } catch (err: any) {
    return { success: false, error: `APNs setup error: ${err.message}` };
  }
}

async function getFcmAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedFcmAccessToken && now < cachedFcmTokenExpiry) {
    return cachedFcmAccessToken;
  }

  if (!cachedFcmServiceAccount) {
    const raw = await getSSMParam("/finanseal/prod/fcm-service-account");
    cachedFcmServiceAccount = JSON.parse(raw);
  }

  const sa = cachedFcmServiceAccount;
  const jwtToken = jwt.sign(
    {
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
    },
    sa.private_key,
    { algorithm: "RS256", expiresIn: "1h" },
  );

  // Exchange JWT for access token
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwtToken}`,
  });

  const tokenData = await response.json();
  cachedFcmAccessToken = tokenData.access_token;
  cachedFcmTokenExpiry = now + (tokenData.expires_in - 60) * 1000;
  return cachedFcmAccessToken!;
}

async function sendFcm(
  deviceToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const accessToken = await getFcmAccessToken();
    const projectId = cachedFcmServiceAccount?.project_id;

    if (!projectId) {
      return { success: false, error: "FCM project_id not found in service account" };
    }

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: deviceToken,
            notification: { title, body },
            data,
            android: {
              priority: "high",
              notification: {
                channel_id: "leave_notifications",
                click_action: "FLUTTER_NOTIFICATION_CLICK",
              },
            },
          },
        }),
      },
    );

    if (response.ok) {
      return { success: true };
    }

    const errorBody = await response.text();
    return { success: false, error: `FCM ${response.status}: ${errorBody}` };
  } catch (err: any) {
    return { success: false, error: `FCM error: ${err.message}` };
  }
}

export async function handler(event: PushEvent): Promise<PushResult> {
  console.log("[push-notification] Sending to", event.deviceTokens.length, "devices");

  const results = await Promise.allSettled(
    event.deviceTokens.map(async ({ platform, deviceToken }) => {
      const dataStrings: Record<string, string> = {
        type: event.data.type,
        leaveRequestId: event.data.leaveRequestId,
        deepLink: event.data.deepLink,
      };

      if (platform === "ios") {
        return { deviceToken, ...(await sendApns(deviceToken, event.title, event.body, dataStrings)) };
      } else {
        return { deviceToken, ...(await sendFcm(deviceToken, event.title, event.body, dataStrings)) };
      }
    }),
  );

  let sent = 0;
  let failed = 0;
  const errors: Array<{ deviceToken: string; error: string }> = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value.success) {
        sent++;
      } else {
        failed++;
        errors.push({ deviceToken: result.value.deviceToken, error: result.value.error || "Unknown" });
      }
    } else {
      failed++;
      errors.push({ deviceToken: "unknown", error: result.reason?.message || "Promise rejected" });
    }
  }

  console.log(`[push-notification] Sent: ${sent}, Failed: ${failed}`);

  return {
    success: failed === 0,
    sent,
    failed,
    errors,
  };
}
