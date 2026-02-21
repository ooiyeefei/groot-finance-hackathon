import type { Context } from 'aws-lambda';
import type {
  LambdaEvent,
  SignDocumentResponse,
  SignDocumentErrorResponse,
  ValidateDocumentResponse,
} from './types';
import { SigningError, ERROR_CODES } from './errors';
import { signDocument } from './signing/sign-document';
import { validateDocument } from './signing/validate-document';
import { getCredentials, getCertificateExpiryDays } from './credentials/ssm-credential-provider';
import {
  CloudWatchClient,
  PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';

const MAX_DOCUMENT_SIZE = 300 * 1024; // 300 KB per LHDN API constraint
const cloudwatch = new CloudWatchClient({});
let metricPublished = false;

function getEnvironment(event: LambdaEvent): string {
  return event.environment || process.env.SIGNING_ENVIRONMENT || 'sandbox';
}

function validateInput(
  event: unknown
): asserts event is LambdaEvent {
  if (!event || typeof event !== 'object') {
    throw new SigningError(ERROR_CODES.INVALID_JSON, 'Event must be a JSON object');
  }

  const e = event as Record<string, unknown>;

  if (e.action !== 'sign' && e.action !== 'validate') {
    throw new SigningError(
      ERROR_CODES.INVALID_JSON,
      `Invalid action: expected "sign" or "validate", got "${String(e.action)}"`
    );
  }

  if (typeof e.document !== 'string') {
    throw new SigningError(
      ERROR_CODES.INVALID_JSON,
      'Missing or invalid "document" field: must be a JSON string'
    );
  }

  const docBytes = Buffer.byteLength(e.document, 'utf-8');
  if (docBytes > MAX_DOCUMENT_SIZE) {
    throw new SigningError(
      ERROR_CODES.DOCUMENT_TOO_LARGE,
      `Document size ${docBytes} bytes exceeds limit of ${MAX_DOCUMENT_SIZE} bytes (300 KB)`
    );
  }

  // Validate JSON parse-ability
  let parsed: unknown;
  try {
    parsed = JSON.parse(e.document);
  } catch {
    throw new SigningError(
      ERROR_CODES.INVALID_JSON,
      'Document is not valid JSON'
    );
  }

  // Validate Invoice array exists
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('Invoice' in (parsed as object)) ||
    !Array.isArray((parsed as Record<string, unknown>).Invoice) ||
    (parsed as Record<string, unknown[]>).Invoice.length === 0
  ) {
    throw new SigningError(
      ERROR_CODES.MISSING_INVOICE,
      'Document must contain a non-empty "Invoice" array'
    );
  }
}

async function publishExpiryMetric(): Promise<void> {
  if (metricPublished) return;

  const expiryDays = getCertificateExpiryDays();
  if (expiryDays === null) return;

  try {
    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: 'FinanSEAL/DigitalSignature',
        MetricData: [
          {
            MetricName: 'CertificateExpiryDays',
            Value: expiryDays,
            Unit: 'Count',
            Timestamp: new Date(),
          },
        ],
      })
    );
    metricPublished = true;
  } catch (err) {
    // Non-critical: don't fail signing because of metrics
    console.warn('Failed to publish certificate expiry metric:', err);
  }
}

export async function handler(
  event: unknown,
  _context: Context
): Promise<
  SignDocumentResponse | SignDocumentErrorResponse | ValidateDocumentResponse
> {
  try {
    validateInput(event);

    const environment = getEnvironment(event);

    if (event.action === 'sign') {
      const { credentials, metadata } = await getCredentials(environment);
      await publishExpiryMetric();

      const result = await signDocument(
        event.document,
        credentials,
        metadata
      );

      console.log(
        JSON.stringify({
          action: 'sign',
          success: true,
          documentHash: result.documentHash,
          signingTime: result.signingTime,
          documentSizeBytes: Buffer.byteLength(event.document, 'utf-8'),
        })
      );

      return result;
    }

    if (event.action === 'validate') {
      const result = validateDocument(event.document);

      console.log(
        JSON.stringify({
          action: 'validate',
          valid: result.valid,
          checks: result.checks,
          ...(result.error ? { error: result.error } : {}),
        })
      );

      return result;
    }

    // Should never reach here due to validateInput
    throw new SigningError(ERROR_CODES.INTERNAL_ERROR, 'Unhandled action');
  } catch (err) {
    if (err instanceof SigningError) {
      console.error(
        JSON.stringify({
          action: (event as Record<string, unknown>)?.action ?? 'unknown',
          success: false,
          errorCode: err.errorCode,
          error: err.message,
        })
      );

      return {
        success: false,
        error: err.message,
        errorCode: err.errorCode,
        retryable: err.retryable,
      };
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(
      JSON.stringify({
        action: (event as Record<string, unknown>)?.action ?? 'unknown',
        success: false,
        errorCode: ERROR_CODES.INTERNAL_ERROR,
        error: message,
      })
    );

    return {
      success: false,
      error: message,
      errorCode: ERROR_CODES.INTERNAL_ERROR,
      retryable: true,
    };
  }
}
