# Tasks: Digital Signature Infrastructure for LHDN e-Invoice

**Input**: Design documents from `/specs/001-digital-signature-infra/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/signing-lambda.md

**Tests**: Not explicitly requested in the spec. Test tasks are NOT included. Validate via quickstart.md integration testing.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Exact file paths included in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create project structure, shared types, and error definitions

- [X] T001 Create Lambda source directory structure at `src/lambda/digital-signature/` with subdirectories `signing/` and `credentials/`
- [X] T002 [P] Define TypeScript interfaces in `src/lambda/digital-signature/types.ts` — `SignDocumentRequest`, `SignDocumentResponse`, `SignDocumentErrorResponse`, `ValidateDocumentRequest`, `ValidateDocumentResponse` per contracts/signing-lambda.md
- [X] T003 [P] Define error codes and typed error classes in `src/lambda/digital-signature/errors.ts` — `SigningError` class with all error codes from data-model.md (`INVALID_JSON`, `INVALID_UTF8`, `MISSING_INVOICE`, `DOCUMENT_TOO_LARGE`, `CREDENTIAL_UNAVAILABLE`, `CERTIFICATE_EXPIRED`, `CERTIFICATE_NOT_YET_VALID`, `KEY_CERT_MISMATCH`, `SIGNING_FAILED`, `INTERNAL_ERROR`) and retryable flag per contracts/signing-lambda.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core modules that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Implement SSM credential provider in `src/lambda/digital-signature/credentials/ssm-credential-provider.ts` — fetch private key and certificate from SSM Parameter Store using `@aws-sdk/client-ssm` `GetParameter` with `WithDecryption: true`, cache credentials for Lambda lifetime, parameter paths: `/finanseal/{env}/digital-signature/private-key` and `/finanseal/{env}/digital-signature/certificate`. Must never log key material. Throw `CREDENTIAL_UNAVAILABLE` on SSM failure.
- [X] T005 [P] Implement JSON transformation utilities in `src/lambda/digital-signature/signing/transform.ts` — two functions: (1) `removeSignatureFields(doc)` — delete `Invoice[0].UBLExtensions` and `Invoice[0].Signature` keys; (2) `minifyJson(jsonString)` — produce compact JSON via `JSON.stringify(JSON.parse(input))` (no whitespace). Per research.md Decision 5.
- [X] T006 [P] Implement signature block builder in `src/lambda/digital-signature/signing/signature-block.ts` — construct the complete `UBLExtensions` and `Signature` JSON structures per LHDN UBL 2.1 JSON `"_"` convention (research.md Decision 4). Takes as input: signatureValue, certBase64, certDigest, docDigest, propsDigest, signingTime, issuerName, serialNumber. Returns the two JSON objects to embed in `Invoice[0]`.
- [X] T007 Implement input validation in Lambda handler scaffold at `src/lambda/digital-signature/handler.ts` — validate `action` field (must be `sign` or `validate`), validate `document` field (must be valid UTF-8 JSON string, must contain `Invoice` array, must be under 300 KB per research.md Decision 8). Route to appropriate handler function. Return typed error responses for invalid inputs (`INVALID_JSON`, `INVALID_UTF8`, `MISSING_INVOICE`, `DOCUMENT_TOO_LARGE`).

**Checkpoint**: Foundation ready — signing workflow, validation, and CDK deployment can now proceed

---

## Phase 3: User Story 1 — Sign an e-Invoice Document (Priority: P1) MVP

**Goal**: Given an unsigned UBL 2.1 JSON invoice and the platform signing certificate, produce a signed JSON document that passes LHDN sandbox validation.

**Independent Test**: Invoke Lambda with a sample unsigned invoice → verify output contains complete signature block → submit to LHDN sandbox → signature validation passes.

### Implementation for User Story 1

- [X] T008 [US1] Implement the 8-step LHDN signing workflow in `src/lambda/digital-signature/signing/sign-document.ts` — orchestrates the full flow:
  1. Receive unsigned JSON document (already validated by handler)
  2. Call `removeSignatureFields()` then `minifyJson()` from transform.ts
  3. Generate SHA-256 hash of minified document bytes (DocDigest) using `node:crypto` `createHash('sha256')`
  4. Sign the minified document bytes with RSA-SHA256 using `createSign('RSA-SHA256')` → SignatureValue (Base64)
  5. Compute SHA-256 hash of the DER-encoded certificate (CertDigest) using `X509Certificate.raw`
  6. Build SignedProperties object with: signing time (`YYYY-MM-DDTHH:MM:SSZ`, no milliseconds), issuer name from `X509Certificate.issuer`, serial number converted to decimal via `BigInt('0x' + hex).toString(10)`
  7. Compute SHA-256 hash of `JSON.stringify(signedProperties)` (PropsDigest) — includes `"Target": "signature"` wrapper
  8. Call signature-block.ts builder, embed `UBLExtensions` and `Signature` into parsed document, return `JSON.stringify(finalDoc)` as minified signed output
  Returns `SignDocumentResponse` with `signedDocument`, `documentHash` (SHA-256 of final signed output for LHDN API), and `signingTime`.
- [X] T009 [US1] Wire `sign` action in `src/lambda/digital-signature/handler.ts` — on `action: 'sign'`, call credential provider to get private key + certificate, then call `signDocument()` from sign-document.ts, return `SignDocumentResponse`. Wrap in try/catch for `SigningError` → `SignDocumentErrorResponse`. Add structured logging for sign operations (success: log document hash + signing time; failure: log error code + document size — NEVER log document content or key material).
- [X] T010 [US1] Create CDK stack in `infra/lib/digital-signature-stack.ts` — `FinansealDigitalSignatureStack` extending `cdk.Stack`. Use `NodejsFunction` with: runtime Node.js 20.x, ARM_64 architecture, entry `../../src/lambda/digital-signature/handler.ts`, handler `handler`, memory 256 MB, timeout 30s, esbuild bundling (minify + sourceMap, target node20, CJS format). Load env vars from `.env.local` via dotenv. Create `currentVersion` + `prod` alias. Grant `ssm:GetParameter` on `arn:aws:ssm:us-west-2:837224017779:parameter/finanseal/*/digital-signature/*`. Add Vercel OIDC invoke permission on alias. Create CloudWatch log group `/aws/lambda/finanseal-digital-signature` with 1-month retention. Export function ARN, alias ARN, and log group name. Follow patterns from `infra/lib/mcp-server-stack.ts`.
- [X] T011 [US1] Create CDK app entry point in `infra/bin/digital-signature.ts` — instantiate `cdk.App()`, create `FinansealDigitalSignatureStack` with `env: { account: '837224017779', region: 'us-west-2' }` and tags `{ Environment: 'production', Project: 'finanseal', Feature: 'digital-signature' }`. Follow pattern from existing entry points in `infra/bin/`.
- [X] T012 [US1] Generate self-signed test certificate, store in SSM sandbox parameters, deploy CDK stack, and invoke signing Lambda with LHDN sample unsigned document to verify end-to-end signing works. Follow quickstart.md steps 1-4. Validate: output contains `UBLExtensions` and `Signature` fields, `signedDocument` is minified JSON, `documentHash` is present.

**Checkpoint**: User Story 1 complete — the signing service can sign JSON invoices and is deployed via CDK. This is the MVP.

---

## Phase 4: User Story 2 — Securely Store Signing Credentials (Priority: P2)

**Goal**: Verify that the credential storage infrastructure (built in Phase 2) meets all security requirements — encryption at rest, access restriction, audit logging, no key leakage.

**Independent Test**: Store test credentials → invoke signing Lambda (should succeed) → attempt access from a different IAM role (should fail) → verify no key material in CloudWatch logs.

### Implementation for User Story 2

- [X] T013 [US2] Add key-certificate mismatch detection to `src/lambda/digital-signature/credentials/ssm-credential-provider.ts` — after fetching both private key and certificate, verify the private key matches the certificate's public key by signing a test string and verifying with the certificate. Throw `KEY_CERT_MISMATCH` error if they don't match. This catches partial rotation errors (key rotated but certificate not, or vice versa).
- [X] T014 [US2] Add certificate validity period checks to `src/lambda/digital-signature/credentials/ssm-credential-provider.ts` — after fetching the certificate, parse it with `X509Certificate` and verify: (1) `validFrom` is in the past (throw `CERTIFICATE_NOT_YET_VALID` if not), (2) `validTo` is in the future (throw `CERTIFICATE_EXPIRED` if not). Cache the parsed certificate metadata alongside the raw PEM.
- [X] T015 [US2] Audit the signing Lambda implementation for private key leakage — review all `console.log`, `console.error`, and structured logging statements in `handler.ts`, `sign-document.ts`, `ssm-credential-provider.ts`, and `errors.ts`. Ensure: no log statement includes the private key PEM content, the certificate PEM content, or the decrypted SecureString value. Error messages must reference error codes, not key material. Add a code comment in `ssm-credential-provider.ts` warning future developers not to log credential values.

**Checkpoint**: User Story 2 complete — credential storage is verified secure with mismatch detection, validity checks, and no-leakage audit.

---

## Phase 5: User Story 3 — Validate Signed Documents Before Submission (Priority: P3)

**Goal**: Given a signed JSON document, verify its signature integrity, certificate validity, and completeness before submitting to LHDN — catching signing errors early.

**Independent Test**: Sign a document (US1) → validate it (should pass) → tamper with signed document → validate again (should fail with specific error).

### Implementation for User Story 3

- [X] T016 [P] [US3] Implement signature validation in `src/lambda/digital-signature/signing/validate-document.ts` — perform four checks returning `ValidationResult` per data-model.md:
  1. **signatureComplete**: Verify all required signature fields exist in the document (`UBLExtensions`, `Signature`, `SignatureValue`, `X509Certificate`, `DigestValue` entries, `SignedProperties`)
  2. **documentHash**: Remove `UBLExtensions` and `Signature`, minify, compute SHA-256 → compare against `DocDigest` in `SignedInfo.Reference[1].DigestValue`
  3. **signatureIntegrity**: Extract `SignatureValue` and `X509Certificate`, use `node:crypto` `createVerify('RSA-SHA256')` to verify the signature against the minified document bytes and the certificate's public key
  4. **certificateValid**: Parse embedded `X509Certificate` with `X509Certificate` class, check `validFrom` <= now <= `validTo`
  Return `{ valid: true/false, checks: {...}, error: "first failing check" }`.
- [X] T017 [US3] Wire `validate` action in `src/lambda/digital-signature/handler.ts` — on `action: 'validate'`, call `validateDocument()` from validate-document.ts, return `ValidateDocumentResponse`. Add structured logging (valid/invalid result, which checks failed — no document content logged).
- [X] T018 [US3] Test validation end-to-end — sign a document via the Lambda (US1), then invoke with `action: 'validate'` on the signed output (should return `valid: true`). Modify the signed document (change a character in an Invoice field), validate again (should return `valid: false` with `documentHash: false`). Follow quickstart.md step 5.

**Checkpoint**: User Story 3 complete — pre-submission validation catches tampered, expired, and malformed signatures.

---

## Phase 6: User Story 4 — Monitor and Rotate Signing Certificates (Priority: P4)

**Goal**: Alert administrators when the certificate approaches expiry (30 days) and support zero-downtime rotation by allowing new credentials to take effect on next Lambda cold start.

**Independent Test**: Store a certificate with near-future expiry → verify CloudWatch alarm fires → store new certificate → invoke signing → verify new certificate is used.

### Implementation for User Story 4

- [X] T019 [US4] Add certificate expiry days-remaining calculation to `src/lambda/digital-signature/credentials/ssm-credential-provider.ts` — after loading the certificate, compute days until `validTo`. Expose as a method `getCertificateExpiryDays(): number`. Log a warning-level message if days remaining <= 30: `"Certificate expiring in {N} days"`.
- [X] T020 [US4] Add CloudWatch metric and alarm for certificate expiry in `infra/lib/digital-signature-stack.ts` — create a custom CloudWatch metric `CertificateExpiryDays` in namespace `FinanSEAL/DigitalSignature`. Add a CloudWatch alarm that triggers when the metric is <= 30 (threshold alarm, evaluate 1 period of 24 hours). Connect alarm to an SNS topic for admin notifications. The Lambda should publish this metric on each invocation (or on cold start) via CloudWatch PutMetricData.
- [X] T021 [US4] Add CloudWatch metric publishing to `src/lambda/digital-signature/handler.ts` — on Lambda cold start (first invocation after credential load), publish `CertificateExpiryDays` metric to CloudWatch using `@aws-sdk/client-cloudwatch` `PutMetricData`. Grant Lambda `cloudwatch:PutMetricData` permission in CDK stack. Only publish once per credential cache lifecycle (not on every warm invocation).
- [X] T022 [US4] Implement credential cache invalidation for rotation support in `src/lambda/digital-signature/credentials/ssm-credential-provider.ts` — add a `clearCache()` method that forces the next `getCredentials()` call to re-fetch from SSM. The signing handler does NOT need to call this explicitly — Lambda container recycling naturally triggers re-fetch. Document in quickstart.md that certificate rotation takes effect when Lambda cold-starts (typically within minutes of low-traffic periods, or immediately if Lambda is redeployed).

**Checkpoint**: User Story 4 complete — certificate expiry monitoring with 30-day alert and zero-downtime rotation via Lambda lifecycle.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final deployment, end-to-end validation, and documentation

- [X] T023 Deploy CDK stack to production environment — run `cd infra && npx cdk deploy FinansealDigitalSignatureStack --profile groot-finanseal --region us-west-2`. Verify stack outputs (function ARN, alias ARN, log group).
- [X] T024 [P] Store production credentials in SSM — use AWS CLI to store the LHDN-approved CA certificate and private key at `/finanseal/production/digital-signature/private-key` and `/finanseal/production/digital-signature/certificate`. (Separate from sandbox credentials stored in Phase 3.)
- [X] T025 Run `npm run build` in repo root — ensure TypeScript compilation passes with no errors (CLAUDE.md mandatory build-fix loop).
- [X] T026 End-to-end LHDN sandbox validation — sign a realistic sample UBL 2.1 JSON invoice, validate the signature locally via the validate action, and if sandbox access is available, submit the signed document to the LHDN MyInvois sandbox API to confirm acceptance (SC-001, SC-006).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (types.ts and errors.ts must exist)
- **User Story 1 (Phase 3)**: Depends on Phase 2 — this is the **MVP**
- **User Story 2 (Phase 4)**: Depends on Phase 2 (credential provider exists), can start in parallel with US1
- **User Story 3 (Phase 5)**: Depends on Phase 2, uses transform.ts from Phase 2. Benefits from US1 to produce signed test documents but is independently implementable
- **User Story 4 (Phase 6)**: Depends on Phase 2 (credential provider), and US1 CDK stack (Phase 3 T010) for CloudWatch alarm
- **Polish (Phase 7)**: Depends on US1 at minimum; benefits from all stories complete

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational phase — fully independent MVP
- **US2 (P2)**: Depends only on Foundational phase — adds security hardening to credential provider
- **US3 (P3)**: Depends only on Foundational phase — adds validate action to handler. Benefits from US1 for test data
- **US4 (P4)**: Depends on Foundational + US1 CDK stack — adds monitoring to existing infrastructure

### Within Each User Story

- Types and errors before module implementation
- Credential provider and transform utilities before signing workflow
- Core implementation before CDK deployment
- CDK deployment before integration testing

### Parallel Opportunities

- T002 + T003 (types.ts + errors.ts) — different files, no dependencies
- T004 + T005 + T006 (credential provider + transform + signature block) — different files, T004 needs types.ts done first, but T005 and T006 can run in parallel with T004
- US2 (T013-T015) can start in parallel with US1 (T008-T012) after Phase 2
- T016 (validate-document.ts) can be written in parallel with US1 implementation

---

## Parallel Example: Phase 2 (Foundational)

```text
# These three tasks touch different files with no dependencies on each other:
T004: SSM credential provider in credentials/ssm-credential-provider.ts
T005: JSON transform utilities in signing/transform.ts
T006: Signature block builder in signing/signature-block.ts

# T007 (handler scaffold) depends on types from T002/T003 but not on T004-T006
```

## Parallel Example: User Story 1 + User Story 2

```text
# After Phase 2 completes, US1 and US2 can proceed in parallel:
Developer A (US1): T008 → T009 → T010 → T011 → T012
Developer B (US2): T013 → T014 → T015
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T007)
3. Complete Phase 3: User Story 1 (T008-T012)
4. **STOP and VALIDATE**: Deploy Lambda, invoke with test document, verify signed output
5. This delivers: a working signing service that can sign JSON invoices for LHDN

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (signing) → Deploy → **MVP!** Documents can be signed
3. Add US2 (security hardening) → Credential storage verified secure
4. Add US3 (validation) → Pre-submission validation available
5. Add US4 (monitoring) → Certificate expiry alerts active
6. Polish → Production deployment + LHDN sandbox end-to-end test

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Git author: `grootdev-ai` / `dev@hellogroot.com` (CLAUDE.md mandatory)
- Build must pass (`npm run build`) before task completion (CLAUDE.md mandatory)
- CDK deploy: `cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2` (CLAUDE.md mandatory)
