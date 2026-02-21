# Data Model: Digital Signature Infrastructure

**Branch**: `001-digital-signature-infra` | **Date**: 2026-02-20

## Entities

### SigningCredentials (stored in SSM Parameter Store)

Platform-level credentials — one set per environment (sandbox, production).

| Parameter Path | Type | Description |
|----------------|------|-------------|
| `/finanseal/{env}/digital-signature/private-key` | SecureString | PEM-encoded RSA private key (~1.7 KB for RSA-2048) |
| `/finanseal/{env}/digital-signature/certificate` | SecureString | PEM-encoded X.509 signing certificate |
| `/finanseal/{env}/digital-signature/certificate-chain` | SecureString | PEM-encoded intermediate CA certificate(s), if applicable |

**Identity**: Single platform certificate per environment. No per-tenant parameters.
**Lifecycle**: Manual creation via AWS CLI → active use → rotation (store new, remove old)

### UnsignedDocument (input)

A UBL 2.1 JSON invoice document received by the signing service.

| Field | Type | Description |
|-------|------|-------------|
| `_D` | string | UBL Invoice namespace URI |
| `_A` | string | UBL Common Aggregate Components namespace URI |
| `_B` | string | UBL Common Basic Components namespace URI |
| `Invoice` | array[1] | Array containing a single Invoice object with all invoice fields |

**Validation rules**:
- Must be valid UTF-8 encoded JSON
- Must parse as valid JSON with `Invoice` array
- Must NOT contain `UBLExtensions` or `Signature` keys (or they will be removed)
- Must be under 300 KB (LHDN per-document limit)

### SignedDocument (output)

The input document with the signature block embedded.

| Field | Type | Description |
|-------|------|-------------|
| (all fields from UnsignedDocument) | — | Preserved as-is |
| `Invoice[0].UBLExtensions` | array | Full XAdES-equivalent signature block in JSON format |
| `Invoice[0].Signature` | array | Reference pointer to the signature |

**Output format**: Minified JSON (no whitespace).

### SignatureBlock (embedded within SignedDocument)

The cryptographic signature components within `UBLExtensions`.

| Component | Location in JSON | Description |
|-----------|-----------------|-------------|
| SignatureValue | `UBLExtensions[0].UBLExtension[0]...Signature[0].SignatureValue[0]._` | Base64-encoded RSA-SHA256 signature of the minified document |
| X509Certificate | `...KeyInfo[0].X509Data[0].X509Certificate[0]._` | Base64-encoded DER signing certificate |
| DocDigest | `...SignedInfo[0].Reference[1].DigestValue[0]._` | Base64-encoded SHA-256 hash of the minified document (without signature) |
| PropsDigest | `...SignedInfo[0].Reference[0].DigestValue[0]._` | Base64-encoded SHA-256 hash of the minified SignedProperties |
| CertDigest | `...SignedProperties[0]...CertDigest[0].DigestValue[0]._` | Base64-encoded SHA-256 hash of the DER-encoded certificate |
| SigningTime | `...SignedProperties[0]...SigningTime[0]._` | UTC timestamp in `YYYY-MM-DDTHH:MM:SSZ` format |
| IssuerName | `...IssuerSerial[0].X509IssuerName[0]._` | Certificate issuer Distinguished Name (RFC 4514) |
| SerialNumber | `...IssuerSerial[0].X509SerialNumber[0]._` | Certificate serial number as decimal string |

### SigningResult (Lambda response)

The response from the signing Lambda function.

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether signing succeeded |
| `signedDocument` | string | Minified signed JSON document (on success) |
| `documentHash` | string | SHA-256 hash of the signed document (for LHDN submission API) |
| `error` | string | Error message (on failure) |
| `errorCode` | string | Machine-readable error code (on failure) |
| `signingTime` | string | UTC timestamp when document was signed |

### ValidationResult (Lambda response for validation)

| Field | Type | Description |
|-------|------|-------------|
| `valid` | boolean | Whether signature validation passed |
| `checks` | object | Individual check results |
| `checks.documentHash` | boolean | Document hash matches signature |
| `checks.certificateValid` | boolean | Certificate is within validity period |
| `checks.signatureIntegrity` | boolean | RSA signature verifies against document |
| `checks.signatureComplete` | boolean | All required signature fields present |
| `error` | string | First failing check description (if invalid) |

## State Transitions

### Document Signing Flow

```
UnsignedDocument → [validate input] → [transform & hash] → [sign] → [embed signature] → SignedDocument
                     ↓ (invalid)
                   Error (rejected)
```

### Certificate Lifecycle

```
Not Stored → [admin stores via CLI] → Active → [30-day expiry alert] → Expiring
                                        ↓                                   ↓
                                   [rotation]                          [rotation]
                                        ↓                                   ↓
                                   Active (new cert)              Active (new cert)
                                        ↓
                                   [remove old] → Removed
```

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_JSON` | Input is not valid JSON |
| `INVALID_UTF8` | Input is not valid UTF-8 |
| `MISSING_INVOICE` | JSON does not contain `Invoice` array |
| `DOCUMENT_TOO_LARGE` | Document exceeds 300 KB limit |
| `CREDENTIAL_UNAVAILABLE` | Cannot retrieve private key or certificate from parameter store |
| `CERTIFICATE_EXPIRED` | Signing certificate has expired |
| `CERTIFICATE_NOT_YET_VALID` | Certificate not-before date is in the future |
| `KEY_CERT_MISMATCH` | Private key does not match the certificate's public key |
| `SIGNING_FAILED` | Cryptographic signing operation failed |
| `INTERNAL_ERROR` | Unexpected internal error |
