/**
 * APNs Push Notification Sender
 *
 * POST /api/v1/notifications/send-push
 *
 * Sends push notifications to iOS devices via Apple's APNs HTTP/2 API.
 * Called by Convex internalAction after a notification is created.
 */

import { NextRequest, NextResponse } from 'next/server';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { SignJWT, importPKCS8 } from 'jose';

// Cache APNs credentials in memory (Lambda-style warm start)
let cachedCredentials: {
  privateKey: CryptoKey;
  keyId: string;
  teamId: string;
} | null = null;

const ssmClient = new SSMClient({ region: 'us-west-2' });

async function getAPNsCredentials() {
  if (cachedCredentials) return cachedCredentials;

  const [privateKeyResult, keyIdResult, teamIdResult] = await Promise.all([
    ssmClient.send(new GetParameterCommand({
      Name: '/finanseal/prod/apns-private-key',
      WithDecryption: true,
    })),
    ssmClient.send(new GetParameterCommand({
      Name: '/finanseal/prod/apns-key-id',
    })),
    ssmClient.send(new GetParameterCommand({
      Name: '/finanseal/prod/apns-team-id',
    })),
  ]);

  const privateKeyPem = privateKeyResult.Parameter?.Value;
  const keyId = keyIdResult.Parameter?.Value;
  const teamId = teamIdResult.Parameter?.Value;

  if (!privateKeyPem || !keyId || !teamId) {
    throw new Error('Missing APNs credentials in SSM');
  }

  const privateKey = await importPKCS8(privateKeyPem, 'ES256');

  cachedCredentials = { privateKey, keyId, teamId };
  return cachedCredentials;
}

async function createAPNsJWT(keyId: string, teamId: string, privateKey: CryptoKey): Promise<string> {
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .sign(privateKey);
}

export async function POST(request: NextRequest) {
  try {
    // Validate internal API key
    const apiKey = request.headers.get('x-api-key');
    if (apiKey !== process.env.INTERNAL_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { deviceToken, title, body: messageBody, resourceUrl, badge } = body;

    if (!deviceToken || !title) {
      return NextResponse.json(
        { error: 'Missing required fields: deviceToken, title' },
        { status: 400 }
      );
    }

    const credentials = await getAPNsCredentials();
    const jwt = await createAPNsJWT(
      credentials.keyId,
      credentials.teamId,
      credentials.privateKey
    );

    // Build APNs payload
    const payload = {
      aps: {
        alert: {
          title,
          body: messageBody || '',
        },
        badge: badge ?? 1,
        sound: 'default',
      },
      resourceUrl: resourceUrl || undefined,
    };

    // Send to APNs HTTP/2 endpoint
    const apnsUrl = `https://api.push.apple.com/3/device/${deviceToken}`;
    const response = await fetch(apnsUrl, {
      method: 'POST',
      headers: {
        'authorization': `bearer ${jwt}`,
        'apns-topic': 'com.hellogroot.finanseal',
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const statusCode = response.status;

      // 410 Gone = device token is no longer valid
      if (statusCode === 410) {
        return NextResponse.json({
          success: false,
          error: 'token_unregistered',
          deviceToken,
        }, { status: 410 });
      }

      // 429 Too Many Requests
      if (statusCode === 429) {
        return NextResponse.json({
          success: false,
          error: 'rate_limited',
          retryAfter: response.headers.get('retry-after'),
        }, { status: 429 });
      }

      console.error(`[APNs] Error ${statusCode}:`, errorBody);
      return NextResponse.json({
        success: false,
        error: errorBody,
      }, { status: statusCode });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[APNs] Send error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
