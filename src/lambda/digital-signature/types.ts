// Request types

export interface SignDocumentRequest {
  action: 'sign';
  document: string;
  environment?: 'sandbox' | 'production';
}

export interface ValidateDocumentRequest {
  action: 'validate';
  document: string;
  environment?: 'sandbox' | 'production';
}

export type LambdaEvent = SignDocumentRequest | ValidateDocumentRequest;

// Response types

export interface SignDocumentResponse {
  success: true;
  signedDocument: string;
  documentHash: string;
  signingTime: string;
}

export interface SignDocumentErrorResponse {
  success: false;
  error: string;
  errorCode: string;
  retryable: boolean;
}

export interface ValidationChecks {
  documentHash: boolean;
  certificateValid: boolean;
  signatureIntegrity: boolean;
  signatureComplete: boolean;
}

export interface ValidateDocumentResponse {
  valid: boolean;
  checks: ValidationChecks;
  error?: string;
}

// Internal types

export interface SigningCredentials {
  privateKeyPem: string;
  certificatePem: string;
  certificateChainPem?: string;
}

export interface CertificateMetadata {
  issuerName: string;
  subjectName: string;
  serialNumberDecimal: string;
  validFrom: Date;
  validTo: Date;
  rawDer: Buffer;
}

export interface SignatureComponents {
  signatureValue: string;
  certBase64: string;
  certDigest: string;
  docDigest: string;
  propsDigest: string;
  signingTime: string;
  issuerName: string;
  subjectName: string;
  serialNumber: string;
}
