/**
 * AWS SSM Parameter Store Client
 *
 * Shared utility for reading, writing, and deleting SSM parameters.
 * Uses Vercel OIDC for production (assumes IAM role) and falls back
 * to default credential chain for local development.
 *
 * Used by:
 * - CloudFront signer (private key storage)
 * - Stripe integration (secret key storage)
 */

import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
  DeleteParameterCommand,
} from '@aws-sdk/client-ssm'
import { fromWebToken } from '@aws-sdk/credential-providers'

const AWS_REGION = process.env.AWS_REGION || 'us-west-2'
const AWS_ROLE_ARN = process.env.AWS_ROLE_ARN

/**
 * Create an SSM client with appropriate credentials.
 * Production: Vercel OIDC → AssumeRoleWithWebIdentity
 * Local dev: Default credential chain (AWS CLI profile)
 */
export function createSSMClient(): SSMClient {
  const clientConfig: ConstructorParameters<typeof SSMClient>[0] = {
    region: AWS_REGION,
  }

  if (AWS_ROLE_ARN) {
    clientConfig.credentials = async () => {
      const { getVercelOidcToken } = await import('@vercel/oidc')
      const token = await getVercelOidcToken()
      const provider = fromWebToken({
        roleArn: AWS_ROLE_ARN,
        webIdentityToken: token,
        roleSessionName: `groot-ssm-${Date.now()}`,
        durationSeconds: 3600,
      })
      return provider()
    }
  }

  return new SSMClient(clientConfig)
}

/**
 * Get a parameter value from SSM Parameter Store.
 * Automatically decrypts SecureString parameters.
 */
export async function getSSMParameter(name: string): Promise<string | null> {
  try {
    const client = createSSMClient()
    const command = new GetParameterCommand({
      Name: name,
      WithDecryption: true,
    })
    const response = await client.send(command)
    return response.Parameter?.Value ?? null
  } catch (error) {
    console.error(`[SSM] Failed to get parameter ${name}:`, error)
    return null
  }
}

/**
 * Store a parameter in SSM Parameter Store as SecureString.
 * Overwrites if the parameter already exists.
 */
export async function putSSMParameter(name: string, value: string): Promise<boolean> {
  try {
    const client = createSSMClient()
    const command = new PutParameterCommand({
      Name: name,
      Value: value,
      Type: 'SecureString',
      Overwrite: true,
    })
    await client.send(command)
    return true
  } catch (error) {
    console.error(`[SSM] Failed to put parameter ${name}:`, error)
    return false
  }
}

/**
 * Delete a parameter from SSM Parameter Store.
 * Silently succeeds if the parameter doesn't exist.
 */
export async function deleteSSMParameter(name: string): Promise<boolean> {
  try {
    const client = createSSMClient()
    const command = new DeleteParameterCommand({ Name: name })
    await client.send(command)
    return true
  } catch (error: unknown) {
    // ParameterNotFound is expected when disconnecting a never-stored key
    if (error instanceof Error && error.name === 'ParameterNotFound') {
      return true
    }
    console.error(`[SSM] Failed to delete parameter ${name}:`, error)
    return false
  }
}
