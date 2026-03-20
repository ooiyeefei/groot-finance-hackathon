/**
 * Convex HTTP API client for external Lambda invocation
 *
 * Docs: https://docs.convex.dev/http-api
 *
 * Authentication: Deployment key from SSM Parameter Store (SecureString)
 * Endpoints:
 * - POST /api/query - Read data
 * - POST /api/mutation - Write data
 * - POST /api/action - Run actions
 */

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const CONVEX_URL = process.env.CONVEX_DEPLOYMENT_URL || 'https://kindhearted-lynx-129.convex.cloud';
const SSM_PARAM_NAME = process.env.CONVEX_DEPLOYMENT_KEY_PARAM || '/finanseal/convex-deployment-key';

let cachedDeploymentKey: string | null = null;

/**
 * Get Convex deployment key from SSM Parameter Store
 * Caches after first fetch to avoid repeated SSM calls
 */
async function getDeploymentKey(): Promise<string> {
  if (cachedDeploymentKey) {
    return cachedDeploymentKey;
  }

  const ssm = new SSMClient({ region: process.env.AWS_REGION || 'us-west-2' });
  const command = new GetParameterCommand({
    Name: SSM_PARAM_NAME,
    WithDecryption: true,
  });

  const response = await ssm.send(command);
  if (!response.Parameter?.Value) {
    throw new Error(`SSM parameter ${SSM_PARAM_NAME} not found or empty`);
  }

  cachedDeploymentKey = response.Parameter.Value;
  return cachedDeploymentKey;
}

/**
 * Call Convex query via HTTP API
 */
export async function convexQuery<T = unknown>(
  functionPath: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const deploymentKey = await getDeploymentKey();

  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Convex ${deploymentKey}`,
    },
    body: JSON.stringify({
      path: functionPath,
      args,
      format: 'json',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Convex query failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { value?: T };

  // Convex HTTP API wraps the result in a "value" field
  if (data.value !== undefined) {
    return data.value;
  }

  // If no "value" field, the whole response is the result
  return data as unknown as T;
}

/**
 * Call Convex mutation via HTTP API
 */
export async function convexMutation<T = unknown>(
  functionPath: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const deploymentKey = await getDeploymentKey();

  const response = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Convex ${deploymentKey}`,
    },
    body: JSON.stringify({
      path: functionPath,
      args,
      format: 'json',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Convex mutation failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { value?: T };

  // Convex HTTP API wraps the result in a "value" field
  if (data.value !== undefined) {
    return data.value;
  }

  return data as unknown as T;
}

/**
 * Call Convex action via HTTP API
 */
export async function convexAction<T = unknown>(
  functionPath: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const deploymentKey = await getDeploymentKey();

  const response = await fetch(`${CONVEX_URL}/api/action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Convex ${deploymentKey}`,
    },
    body: JSON.stringify({
      path: functionPath,
      args,
      format: 'json',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Convex action failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { value?: T };

  if (data.value !== undefined) {
    return data.value;
  }

  return data as unknown as T;
}
