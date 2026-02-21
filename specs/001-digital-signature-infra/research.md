# Research: Digital Signature Infrastructure for LHDN e-Invoice

**Branch**: `001-digital-signature-infra` | **Date**: 2026-02-20

## Decision 1: Private Key Storage Mechanism

**Decision**: AWS SSM Parameter Store SecureString (standard tier)

**Rationale**: Free tier ($0/month vs $0.40/secret/month for Secrets Manager), same KMS-based AES-256 encryption, RSA-2048 private keys (~1.7 KB) fit within 4 KB standard tier limit. Lambda can access via `GetParameter` with `WithDecryption: true`. Single-account setup means no need for Secrets Manager's cross-account resource policies.

**Alternatives considered**:
- AWS Secrets Manager — identical security, but costs $0.40/secret/month with no benefit for X.509 key storage (no built-in cert rotation template)
- AWS KMS direct key storage — would require KMS key creation ($1/month) and changes the signing model (KMS does the signing rather than Lambda)
- Environment variables — insecure, key visible in Lambda console

**Parameter naming convention**:
```
/finanseal/{environment}/digital-signature/private-key
/finanseal/{environment}/digital-signature/certificate
/finanseal/{environment}/digital-signature/certificate-chain
```

**Caveat**: Store values via AWS CLI/SDK, not CloudFormation/CDK, to avoid private key appearing in stack templates.

## Decision 2: Document Format

**Decision**: JSON only (UBL 2.1 JSON Alternative Representation)

**Rationale**: LHDN accepts both JSON and XML interchangeably — submitter's choice via `format` field in API request. JSON selected because:
- FinanSEAL's stack is TypeScript/Convex (all data is already JSON)
- JSON canonicalization is simple minification (`JSON.stringify` without spaces) vs XML xml-c14n11 canonical processing
- Upstream document generator (not yet built) will naturally produce JSON from Convex data
- No compliance, validation, or acceptance difference between formats

**Alternatives considered**:
- XML (UBL 2.1 standard) — more complex canonicalization, requires XML parser library, no benefit
- Both formats — doubles signing code, test surface, and maintenance for zero customer/regulatory benefit

## Decision 3: Signing Architecture

**Decision**: AWS Lambda signing service (dedicated function), following existing CDK patterns

**Rationale**: Fits the existing `infra/lib/` stack pattern (see `document-processing-stack.ts`, `mcp-server-stack.ts`). Keeps signing isolated from the Next.js app. Lambda has IAM-scoped access to SSM parameters. Uses `NodejsFunction` with esbuild bundling, ARM_64 architecture, `prod` alias pattern.

**Alternatives considered**:
- In-process signing in Next.js API route — private key loaded into app process memory, risk of exposure in error logs, no isolation
- Convex action — Convex runtime doesn't support Node.js `crypto` module natively

## Decision 4: JSON Signature Structure

**Decision**: Follow LHDN UBL 2.1 JSON `"_"` convention for XAdES-equivalent signature embedding

**Rationale**: LHDN's official sample (`sample-ul-invoice-2.1-signed.min.json`) demonstrates the exact JSON structure. The `"_"` key convention maps XML element text content to `[{ "_": "value" }]` and XML attributes to sibling keys. This is the UBL 2.1 JSON Alternative Representation standard.

**Key technical details**:
- Signature embedded as `Invoice[0].UBLExtensions` (full crypto block) and `Invoice[0].Signature` (reference pointer)
- SignedProperties hashed including `"Target": "signature"` wrapper
- Certificate serial number must be decimal (not hex) — convert from Node.js `X509Certificate.serialNumber` using `BigInt('0x' + hex).toString(10)`
- Signing time format: `YYYY-MM-DDTHH:MM:SSZ` (no milliseconds)
- X509Certificate value: Base64-encoded DER, not PEM

## Decision 5: Canonicalization Method

**Decision**: JSON minification via `JSON.stringify()` without space arguments (equivalent to Python's `json.dumps(obj, separators=(',', ':'))`)

**Rationale**: LHDN reference implementation uses regex-based minification that strips whitespace outside quoted strings. Node.js `JSON.stringify()` without arguments produces identical output. No sorted key ordering required — insertion order is preserved and must remain consistent between signing and validation.

**Key rules**:
1. Remove `Invoice[0].UBLExtensions` and `Invoice[0].Signature` before hashing
2. Minify the resulting JSON (whitespace removal)
3. Hash the minified UTF-8 bytes with SHA-256
4. For SignedProperties hash: `JSON.stringify(signedPropsObject)` (the QualifyingProperties content including `"Target"` wrapper)

## Decision 6: Node.js Crypto Dependencies

**Decision**: Use built-in `node:crypto` module for all cryptographic operations. Add `node-forge` only if PKCS#12 loading is needed.

**Rationale**: Node.js 20.x (Lambda runtime) provides everything needed:
- `createHash('sha256')` — document, certificate, and properties hashing
- `createSign('RSA-SHA256')` — digest signing
- `X509Certificate` class — certificate parsing (issuer, serial, raw DER)
- `Buffer` — Base64 encoding

**npm dependencies**: None required for core signing. `node-forge` optional for PKCS#12 file loading (can be avoided by pre-converting to PEM via `openssl`).

## Decision 7: Certificate Tenancy Model

**Decision**: Single platform certificate (intermediary model)

**Rationale**: FinanSEAL acts as an LHDN-approved intermediary. One certificate signs all tenant invoices. This simplifies parameter store structure (one set of parameters per environment) and eliminates per-tenant certificate procurement/management.

## Decision 8: LHDN API Document Size Constraints

**Decision**: Enforce 300 KB per-document limit matching LHDN API constraints

**Rationale**: LHDN submission API has a 300 KB per-document limit and 5 MB per-batch limit. The signing service should reject documents exceeding 300 KB before signing, since they would be rejected by LHDN anyway. This resolves the "reasonable size limit" edge case from the spec.
