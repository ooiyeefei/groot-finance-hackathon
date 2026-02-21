# Contract: Signing Lambda Function

**Service**: `finanseal-digital-signature`
**Runtime**: Node.js 20.x (Lambda, ARM_64)
**Invocation**: Direct Lambda invoke (from Next.js API route or other Lambda)

## Sign Document

**Operation**: Sign an unsigned UBL 2.1 JSON invoice document

### Request (Lambda event payload)

```typescript
interface SignDocumentRequest {
  action: 'sign';
  document: string;        // Unsigned UBL 2.1 JSON document (stringified)
  environment?: string;    // 'sandbox' | 'production' (default: from Lambda env var)
}
```

### Response

**Success (200)**:
```typescript
interface SignDocumentResponse {
  success: true;
  signedDocument: string;  // Minified signed JSON document
  documentHash: string;    // SHA-256 hash of signed document (Base64, for LHDN submission)
  signingTime: string;     // UTC timestamp: 'YYYY-MM-DDTHH:MM:SSZ'
}
```

**Failure**:
```typescript
interface SignDocumentErrorResponse {
  success: false;
  error: string;           // Human-readable error message
  errorCode: string;       // Machine-readable error code (see data-model.md)
  retryable: boolean;      // Whether the caller should retry
}
```

### Error Code → Retryable Mapping

| Error Code | Retryable | Reason |
|------------|-----------|--------|
| `INVALID_JSON` | false | Bad input |
| `INVALID_UTF8` | false | Bad input |
| `MISSING_INVOICE` | false | Bad input |
| `DOCUMENT_TOO_LARGE` | false | Bad input |
| `CREDENTIAL_UNAVAILABLE` | true | Transient SSM issue |
| `CERTIFICATE_EXPIRED` | false | Requires admin action |
| `CERTIFICATE_NOT_YET_VALID` | false | Requires admin action |
| `KEY_CERT_MISMATCH` | false | Requires admin action |
| `SIGNING_FAILED` | true | Possibly transient |
| `INTERNAL_ERROR` | true | Unknown issue |

## Validate Signed Document

**Operation**: Verify a signed document's signature integrity before LHDN submission

### Request

```typescript
interface ValidateDocumentRequest {
  action: 'validate';
  document: string;        // Signed UBL 2.1 JSON document (stringified)
  environment?: string;    // 'sandbox' | 'production' (default: from Lambda env var)
}
```

### Response

**Success (valid document)**:
```typescript
interface ValidateDocumentResponse {
  valid: true;
  checks: {
    documentHash: true;
    certificateValid: true;
    signatureIntegrity: true;
    signatureComplete: true;
  };
}
```

**Failure (invalid document)**:
```typescript
interface ValidateDocumentResponse {
  valid: false;
  checks: {
    documentHash: boolean;
    certificateValid: boolean;
    signatureIntegrity: boolean;
    signatureComplete: boolean;
  };
  error: string;           // First failing check description
}
```

## Lambda Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| Runtime | Node.js 20.x | Existing pattern, native `crypto` support |
| Architecture | ARM_64 | Cost-optimized (existing pattern) |
| Memory | 256 MB | SHA-256 + RSA signing is CPU-bound, not memory-bound |
| Timeout | 30 seconds | Signing is fast (<1s); timeout accounts for cold start + SSM fetch |
| Alias | `prod` | Existing versioning pattern |

## IAM Permissions Required

```typescript
// SSM Parameter Store read access
{
  actions: ['ssm:GetParameter'],
  resources: ['arn:aws:ssm:us-west-2:837224017779:parameter/finanseal/*/digital-signature/*']
}

// KMS decrypt (if using custom CMK instead of default aws/ssm key)
{
  actions: ['kms:Decrypt'],
  resources: ['arn:aws:kms:us-west-2:837224017779:key/*']  // Scope to specific key in implementation
}
```

## Invocation Permission

Vercel OIDC role (`FinanSEAL-Vercel-S3-Role`) must be granted `lambda:InvokeFunction` on the `prod` alias, following existing pattern from `mcp-server-stack.ts`.
