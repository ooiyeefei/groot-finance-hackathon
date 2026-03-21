/**
 * AWS Lambda Client
 *
 * Client for invoking Lambda functions from Next.js API routes.
 * Used primarily for triggering email workflows.
 *
 * Authentication:
 * - Vercel Deployment: Uses Vercel OIDC to assume IAM role (AWS_ROLE_ARN required)
 * - Local Development: Uses AWS default credential chain (env vars or ~/.aws/credentials)
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { fromWebToken } from '@aws-sdk/credential-providers'
import type { AwsCredentialIdentityProvider } from '@smithy/types'

// Configuration from environment
const AWS_REGION = process.env.AWS_REGION || 'us-west-2'
const AWS_ROLE_ARN = process.env.AWS_ROLE_ARN // Set in Vercel for OIDC

// ============================================
// CREDENTIAL PROVIDER (Vercel OIDC)
// ============================================

/**
 * Create Vercel OIDC credential provider
 *
 * Fetches fresh OIDC token from Vercel for each credential request.
 * This handles token refresh automatically since tokens expire.
 */
function createVercelOidcCredentialProvider(
  roleArn: string
): AwsCredentialIdentityProvider {
  return async () => {
    // Dynamic import to avoid bundling issues when not on Vercel
    const { getVercelOidcToken } = await import('@vercel/oidc')

    // Get fresh token for each credential request
    const token = await getVercelOidcToken()

    // Use fromWebToken to assume the IAM role with the OIDC token
    const provider = fromWebToken({
      roleArn,
      webIdentityToken: token,
      roleSessionName: `groot-lambda-${Date.now()}`,
      durationSeconds: 3600, // 1 hour session
    })

    return provider()
  }
}

// ============================================
// CLIENT SINGLETON
// ============================================

let lambdaClient: LambdaClient | null = null

/**
 * Get or create Lambda client singleton
 *
 * Authentication strategy:
 * 1. If AWS_ROLE_ARN is set (Vercel deployment): Uses Vercel OIDC federation
 * 2. Otherwise (local dev): Uses AWS default credential provider chain
 *    - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 *    - Shared credentials file (~/.aws/credentials)
 *    - IAM roles (EC2, ECS, Lambda)
 */
function getLambdaClient(): LambdaClient {
  if (!lambdaClient) {
    const clientConfig: ConstructorParameters<typeof LambdaClient>[0] = {
      region: AWS_REGION,
    }

    // Use Vercel OIDC if AWS_ROLE_ARN is configured
    if (AWS_ROLE_ARN) {
      console.log('[Lambda Client] Using Vercel OIDC federation')
      clientConfig.credentials = createVercelOidcCredentialProvider(AWS_ROLE_ARN)
    } else {
      console.log('[Lambda Client] Using default credential provider chain')
      // No credentials specified = uses default credential provider chain
    }

    lambdaClient = new LambdaClient(clientConfig)
    console.log(`[Lambda Client] Initialized for region: ${AWS_REGION}`)
  }

  return lambdaClient
}

// ============================================
// WORKFLOW PAYLOAD TYPES
// ============================================

export interface WelcomeWorkflowPayload {
  userId: string          // Convex user ID
  clerkUserId: string     // Clerk user ID
  email: string           // User's email address
  firstName?: string      // Optional first name for personalization
  executionId: string     // Svix webhook ID for idempotency
  isTeamMember: boolean   // true = invitation-based, false = direct signup
}

export interface TriggerWorkflowResult {
  success: boolean
  statusCode?: number
  executionArn?: string
  error?: string
}

// ============================================
// WORKFLOW TRIGGERS
// ============================================

/**
 * Trigger Welcome Email Workflow
 *
 * Invokes the Lambda Durable Function to start the welcome email sequence.
 * Uses async invocation (Event) for fire-and-forget pattern.
 *
 * Idempotency: Lambda Durable Functions track execution state internally.
 *
 * @param payload - Welcome workflow parameters
 * @returns Result with success status
 */
export async function triggerWelcomeWorkflow(
  payload: WelcomeWorkflowPayload
): Promise<TriggerWorkflowResult> {
  // Use alias ARN for stable invocation
  const functionName = process.env.WELCOME_WORKFLOW_LAMBDA_ARN || 'finanseal-welcome-workflow:prod'

  console.log(`[Lambda Client] Triggering welcome workflow for user: ${payload.email}`)
  console.log(`[Lambda Client] Execution ID (idempotency): ${payload.executionId}`)
  console.log(`[Lambda Client] Is team member: ${payload.isTeamMember}`)
  console.log(`[Lambda Client] Function: ${functionName}`)

  try {
    const client = getLambdaClient()

    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event', // Async invocation - fire and forget
      Payload: Buffer.from(JSON.stringify(payload)),
    })

    const response = await client.send(command)

    console.log(`[Lambda Client] Invocation response: StatusCode=${response.StatusCode}`)

    // StatusCode 202 = async invocation accepted
    if (response.StatusCode === 202) {
      return {
        success: true,
        statusCode: response.StatusCode,
      }
    }

    // Any other status code is unexpected for async invocation
    return {
      success: false,
      statusCode: response.StatusCode,
      error: `Unexpected status code: ${response.StatusCode}`,
    }

  } catch (error) {
    console.error('[Lambda Client] Error invoking welcome workflow:', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error invoking Lambda',
    }
  }
}

/**
 * Check if welcome workflow infrastructure is configured
 *
 * Returns false if Lambda ARN is not set, allowing graceful degradation
 * during development before CDK deployment.
 */
export function isWelcomeWorkflowConfigured(): boolean {
  return Boolean(process.env.WELCOME_WORKFLOW_LAMBDA_ARN)
}
