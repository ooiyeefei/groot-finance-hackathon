export const ERROR_CODES = {
  INVALID_JSON: 'INVALID_JSON',
  INVALID_UTF8: 'INVALID_UTF8',
  MISSING_INVOICE: 'MISSING_INVOICE',
  DOCUMENT_TOO_LARGE: 'DOCUMENT_TOO_LARGE',
  CREDENTIAL_UNAVAILABLE: 'CREDENTIAL_UNAVAILABLE',
  CERTIFICATE_EXPIRED: 'CERTIFICATE_EXPIRED',
  CERTIFICATE_NOT_YET_VALID: 'CERTIFICATE_NOT_YET_VALID',
  KEY_CERT_MISMATCH: 'KEY_CERT_MISMATCH',
  SIGNING_FAILED: 'SIGNING_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const RETRYABLE_CODES: Set<ErrorCode> = new Set([
  ERROR_CODES.CREDENTIAL_UNAVAILABLE,
  ERROR_CODES.SIGNING_FAILED,
  ERROR_CODES.INTERNAL_ERROR,
]);

export class SigningError extends Error {
  public readonly errorCode: ErrorCode;
  public readonly retryable: boolean;

  constructor(errorCode: ErrorCode, message: string) {
    super(message);
    this.name = 'SigningError';
    this.errorCode = errorCode;
    this.retryable = RETRYABLE_CODES.has(errorCode);
  }
}
