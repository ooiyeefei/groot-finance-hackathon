/**
 * Lambda Invoker for Document Processing
 *
 * Provides secure invocation of the document processing Lambda using
 * Vercel OIDC credentials. No public Lambda endpoint is exposed.
 *
 * @see specs/004-lambda-durable-migration/research.md for OIDC flow details
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { fromWebToken, fromIni } from '@aws-sdk/credential-providers';

// ============================================================================
// Types (defined inline to avoid importing from excluded Lambda directory)
// These MUST stay in sync with src/lambda/document-processor/contracts.ts
// ============================================================================

/**
 * Document processing request payload sent from Vercel API routes to Lambda.
 * This MUST match the Lambda's DocumentProcessingRequestSchema in contracts.ts
 */
export interface DocumentProcessingRequest {
  // Document identification
  documentId: string;                    // UUID from Convex
  domain: 'invoices' | 'expense_claims'; // Domain context for routing

  // Storage information
  storagePath: string;                   // S3 key for original document
  fileType: 'pdf' | 'image';             // Determines if conversion needed

  // Processing context (REQUIRED for Lambda)
  userId: string;                        // For audit trail
  businessId: string;                    // For business-specific categories

  // Idempotency
  idempotencyKey: string;                // Prevents duplicate processing

  // Optional hints (optimize when caller has context)
  expectedDocumentType?: 'invoice' | 'receipt';  // Skip classification if known
}

/**
 * Immediate response from async Lambda invocation.
 * The actual processing result is retrieved via status polling or webhooks.
 */
export interface LambdaInvocationResponse {
  /** AWS request ID, used for tracking and debugging */
  requestId: string;

  /** Lambda execution ID for durable function state queries */
  executionId: string;

  /** HTTP status code (202 for accepted) */
  statusCode: 202;
}

/**
 * Simplified job result for API callers
 * Maps to Trigger.dev's { jobId: string } pattern for compatibility
 */
export interface LambdaJobResult {
  jobId: string;
}

// Environment configuration
const LAMBDA_ARN = process.env.DOCUMENT_PROCESSOR_LAMBDA_ARN;
const ROLE_ARN = process.env.AWS_ROLE_ARN;
const AWS_REGION = process.env.AWS_REGION || 'us-west-2';

/**
 * Error thrown when Lambda invocation fails
 */
export class LambdaInvocationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'LambdaInvocationError';
  }
}

/**
 * Get OIDC token from Vercel environment.
 *
 * Uses the @vercel/oidc package to fetch tokens dynamically.
 * Tokens are NOT available as environment variables - they must be fetched.
 *
 * @throws {LambdaInvocationError} If OIDC token is not available
 */
async function getVercelOIDCToken(): Promise<string> {
  try {
    // Use Vercel's official OIDC package (same as aws-s3.ts)
    console.log('[Lambda] Fetching Vercel OIDC token...');
    const { getVercelOidcToken } = await import('@vercel/oidc');
    const token = await getVercelOidcToken();
    console.log('[Lambda] OIDC token fetched successfully');
    return token;
  } catch (vercelError) {
    console.error('[Lambda] Failed to get Vercel OIDC token:', vercelError);
    // For local development, check for a file-based token
    const tokenFile = process.env.AWS_WEB_IDENTITY_TOKEN_FILE;
    if (tokenFile) {
      const fs = await import('fs/promises');
      try {
        return await fs.readFile(tokenFile, 'utf-8');
      } catch {
        // Fall through to error
      }
    }

    throw new LambdaInvocationError(
      'OIDC token not available - ensure running in Vercel environment or configure AWS_WEB_IDENTITY_TOKEN_FILE for local development',
      'OIDC_TOKEN_MISSING'
    );
  }
}

/**
 * Check if running in local development environment
 */
function isLocalDevelopment(): boolean {
  // VERCEL env var is set in Vercel deployments
  // If not set or explicitly in development mode, we're local
  return !process.env.VERCEL && process.env.NODE_ENV !== 'production';
}

/**
 * Create a Lambda client with appropriate credentials.
 *
 * - In Vercel: Uses OIDC token to assume IAM role
 * - Locally: Uses AWS profile credentials (from ~/.aws/credentials)
 */
async function createLambdaClient(): Promise<LambdaClient> {
  console.log('[Lambda] Creating Lambda client...');
  console.log('[Lambda] LAMBDA_ARN:', LAMBDA_ARN ? 'set' : 'NOT SET');
  console.log('[Lambda] AWS_REGION:', AWS_REGION);
  console.log('[Lambda] Environment:', isLocalDevelopment() ? 'LOCAL' : 'VERCEL');

  // Local development: Use AWS profile credentials
  if (isLocalDevelopment()) {
    const profile = process.env.AWS_PROFILE || 'groot-finanseal';
    console.log(`[Lambda] Using local AWS profile: ${profile}`);

    return new LambdaClient({
      region: AWS_REGION,
      credentials: fromIni({ profile }),
    });
  }

  // Vercel deployment: Use OIDC to assume role
  console.log('[Lambda] ROLE_ARN:', ROLE_ARN ? 'set' : 'NOT SET');

  if (!ROLE_ARN) {
    throw new LambdaInvocationError(
      'AWS_ROLE_ARN environment variable is not configured',
      'MISSING_CONFIGURATION'
    );
  }

  const webIdentityToken = await getVercelOIDCToken();
  console.log('[Lambda] Got OIDC token, creating client with role assumption...');

  return new LambdaClient({
    region: AWS_REGION,
    credentials: fromWebToken({
      roleArn: ROLE_ARN,
      webIdentityToken,
      roleSessionName: 'vercel-lambda-invoke',
      durationSeconds: 900, // 15 minutes (minimum)
    }),
  });
}

/**
 * Invoke the document processing Lambda asynchronously.
 *
 * This is the primary entry point for triggering document processing from
 * Vercel API routes. The invocation is fire-and-forget - the Lambda runs
 * independently and updates Convex status as it progresses.
 *
 * @param payload - Document processing request payload
 * @returns Invocation response with execution ID for tracking
 * @throws {LambdaInvocationError} If invocation fails
 *
 * @example
 * ```typescript
 * const response = await invokeDocumentProcessor({
 *   documentId: 'doc-123',
 *   domain: 'invoices',
 *   storagePath: 'invoices/doc-123.pdf',
 *   fileType: 'pdf',
 *   userId: 'user-456',
 *   businessId: 'biz-789',
 *   idempotencyKey: `process-doc-123-${Date.now()}`,
 * });
 * console.log('Execution started:', response.executionId);
 * ```
 */
export async function invokeDocumentProcessor(
  payload: DocumentProcessingRequest
): Promise<LambdaInvocationResponse> {
  console.log('[Lambda] invokeDocumentProcessor called with documentId:', payload.documentId);

  if (!LAMBDA_ARN) {
    console.error('[Lambda] DOCUMENT_PROCESSOR_LAMBDA_ARN is not set!');
    throw new LambdaInvocationError(
      'DOCUMENT_PROCESSOR_LAMBDA_ARN environment variable is not configured',
      'MISSING_CONFIGURATION'
    );
  }

  try {
    const client = await createLambdaClient();
    console.log('[Lambda] Client created, invoking function:', LAMBDA_ARN);

    const command = new InvokeCommand({
      FunctionName: LAMBDA_ARN,
      InvocationType: 'Event', // Async invocation - fire and forget
      Payload: JSON.stringify(payload),
    });

    const response = await client.send(command);
    console.log('[Lambda] Invocation response status:', response.StatusCode);

    // For async invocation, status 202 indicates accepted
    if (response.StatusCode !== 202) {
      throw new LambdaInvocationError(
        `Unexpected Lambda response status: ${response.StatusCode}`,
        'INVOCATION_FAILED',
        response.StatusCode
      );
    }

    // Extract execution ID from response metadata
    const executionId = response.$metadata.requestId || `exec-${Date.now()}`;

    return {
      requestId: response.$metadata.requestId || '',
      executionId,
      statusCode: 202,
    };
  } catch (error) {
    // Re-throw LambdaInvocationError as-is
    if (error instanceof LambdaInvocationError) {
      throw error;
    }

    // Handle specific AWS errors
    if (error instanceof Error) {
      const awsError = error as Error & { name?: string; $metadata?: { httpStatusCode?: number } };

      // OIDC token expired
      if (awsError.name === 'ExpiredTokenException') {
        throw new LambdaInvocationError(
          'OIDC token has expired - request a new token',
          'OIDC_TOKEN_EXPIRED',
          401
        );
      }

      // IAM permission denied
      if (awsError.name === 'AccessDeniedException') {
        throw new LambdaInvocationError(
          'Access denied - check IAM role permissions for Lambda invocation',
          'ACCESS_DENIED',
          403
        );
      }

      // Function not found
      if (awsError.name === 'ResourceNotFoundException') {
        throw new LambdaInvocationError(
          `Lambda function not found: ${LAMBDA_ARN}`,
          'FUNCTION_NOT_FOUND',
          404
        );
      }

      // Generic AWS error
      throw new LambdaInvocationError(
        `Lambda invocation failed: ${awsError.message}`,
        'INVOCATION_FAILED',
        awsError.$metadata?.httpStatusCode
      );
    }

    // Unknown error
    throw new LambdaInvocationError(
      'An unknown error occurred during Lambda invocation',
      'UNKNOWN_ERROR'
    );
  }
}

/**
 * Invoke the document processing Lambda synchronously (for testing).
 *
 * This is only used for local testing and debugging. Production always
 * uses async invocation via invokeDocumentProcessor().
 *
 * @param payload - Document processing request payload
 * @returns The Lambda function's return value
 */
export async function invokeDocumentProcessorSync(
  payload: DocumentProcessingRequest
): Promise<unknown> {
  if (!LAMBDA_ARN) {
    throw new LambdaInvocationError(
      'DOCUMENT_PROCESSOR_LAMBDA_ARN environment variable is not configured',
      'MISSING_CONFIGURATION'
    );
  }

  const client = await createLambdaClient();

  const command = new InvokeCommand({
    FunctionName: LAMBDA_ARN,
    InvocationType: 'RequestResponse', // Sync invocation
    Payload: JSON.stringify(payload),
  });

  const response = await client.send(command);

  if (response.FunctionError) {
    const errorPayload = response.Payload
      ? JSON.parse(Buffer.from(response.Payload).toString())
      : {};
    throw new LambdaInvocationError(
      `Lambda function error: ${response.FunctionError}`,
      'FUNCTION_ERROR',
      response.StatusCode,
      errorPayload
    );
  }

  if (response.Payload) {
    return JSON.parse(Buffer.from(response.Payload).toString());
  }

  return null;
}
