# Feature Specification: Digital Signature Infrastructure for LHDN e-Invoice

**Feature Branch**: `001-digital-signature-infra`
**Created**: 2026-02-20
**Status**: Draft
**Input**: GitHub Issue #199 — Build digital signature infrastructure for LHDN MyInvois e-Invoice submission
**Related Issues**: #75 (LHDN MyInvois integration), #198 (e-Invoice schema changes), #204 (submission UI), #206 (e-invoice fields UI)

## Scope Boundary

**In scope**: Signing infrastructure only — receives pre-built unsigned UBL JSON documents, signs them using the LHDN 8-step workflow, and returns signed output. JSON format only (LHDN accepts both JSON and XML interchangeably; JSON chosen to match FinanSEAL's TypeScript/Convex stack). Also includes secure credential storage, pre-submission signature validation, and certificate lifecycle monitoring.

**Out of scope** (to be covered by separate issues under #75):
- **UBL document generation** — building JSON UBL invoice documents from sales invoice data (no issue filed yet)
- **LHDN API backend** — OAuth 2.0 authentication, API submission, and response handling (no issue filed yet; #204 covers UI only)
- **PDF generation with QR code** — post-validation PDF with LHDN QR code (no issue filed yet)

## Clarifications

### Session 2026-02-20

- Q: Does this feature include document generation and/or LHDN API submission, or signing only? → A: Signing only. Receives pre-built unsigned UBL documents, signs them, returns signed output. Document generation, LHDN API backend, and PDF generation are separate concerns under #75 (no dedicated issues yet).
- Q: Certificate tenancy model — single platform certificate or per-tenant? → A: Single platform certificate (intermediary model). FinanSEAL acts as an LHDN-approved intermediary and signs all tenant invoices with one platform-level certificate.
- Q: Document format — JSON only, XML only, or both? → A: JSON only. LHDN accepts both interchangeably (submitter's choice). FinanSEAL's stack is TypeScript/Convex (all data is JSON), the upstream document generator will produce JSON, and JSON canonicalization (minification) is simpler than XML (xml-c14n11). No XML support needed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign an e-Invoice Document (Priority: P1)

As the e-invoice submission system, I need to digitally sign an unsigned JSON invoice document so that LHDN MyInvois accepts it for processing. LHDN v1.1 mandates digital signatures on all submitted documents using X.509 certificates with RSA-SHA256 — documents without valid signatures are rejected.

The signing process follows LHDN's prescribed 8-step workflow:
1. Accept the unsigned document (UTF-8 encoded JSON)
2. Apply transformations — remove UBLExtensions and Signature elements, minify the document (JSON canonicalization)
3. Generate a SHA-256 hash of the transformed document, Base64 encoded
4. Sign the digest using RSA-SHA256 with the private key
5. Create a SHA-256 hash of the signing certificate
6. Populate signed properties — signing time (UTC), issuer name, serial number
7. Generate a SHA-256 hash of the signed properties
8. Embed the complete signature block (SignatureValue, X509Certificate, DigestValues) into the document

**Why this priority**: This is the core capability. Without signing, no e-invoices can be submitted to LHDN. Every other story depends on this working correctly.

**Independent Test**: Can be fully tested by providing an unsigned sample invoice and a test certificate, running the signing workflow, and verifying the output document contains a valid embedded signature in the correct location.

**Acceptance Scenarios**:

1. **Given** an unsigned JSON invoice and a valid signing certificate, **When** the signing service processes the document, **Then** the output contains a complete signature block with SignatureValue, X509Certificate, and all required DigestValues in the LHDN-specified JSON structure
2. **Given** a signed JSON document, **When** submitted to the LHDN sandbox environment, **Then** the signature validation passes and the document is accepted
3. **Given** an unsigned JSON document, **When** the signing service applies transformations (step 2), **Then** UBLExtensions and Signature elements are removed, and the document is minified (JSON canonicalization)
4. **Given** the signing service generates a document hash (step 3), **When** the hash is compared against an independently computed SHA-256 hash of the same transformed document, **Then** the values match exactly

---

### User Story 2 - Securely Store Signing Credentials (Priority: P2)

As a system administrator, I need to securely store the X.509 signing certificate and its private key so that the signing service can access them without exposing the key material. The private key must never be visible in application logs, environment variables displayed in consoles, or source code.

**Why this priority**: The signing service cannot function without access to the private key and certificate. Secure storage is a prerequisite for P1 but has independent value — it establishes the security foundation for all cryptographic operations.

**Independent Test**: Can be tested by storing a test certificate and private key, then verifying the signing service can retrieve them for use while confirming the key material is not exposed in any logs or management consoles.

**Acceptance Scenarios**:

1. **Given** an X.509 certificate and its RSA private key, **When** an administrator stores them in the secure parameter store, **Then** the key material is encrypted at rest and only accessible to authorized services
2. **Given** stored credentials, **When** the signing service requests the private key, **Then** the decrypted key is returned and usable for RSA-SHA256 signing operations
3. **Given** a stored private key, **When** an unauthorized service or user attempts to access it, **Then** access is denied and the attempt is logged for audit
4. **Given** the signing service retrieves the private key, **When** the operation completes, **Then** the decrypted key does not appear in any system logs, error outputs, or monitoring dashboards

---

### User Story 3 - Validate Signed Documents Before Submission (Priority: P3)

As the e-invoice submission system, I need to verify that a signed document's signature is valid before submitting it to LHDN, so that I can catch signing errors early and avoid unnecessary API calls and rejection responses.

**Why this priority**: Pre-submission validation prevents wasted API calls to LHDN and provides faster feedback when signing issues occur. It is valuable but not blocking — documents could be submitted and validated by LHDN directly.

**Independent Test**: Can be tested by verifying a correctly signed document passes validation, and a tampered or incorrectly signed document fails validation with a clear error message.

**Acceptance Scenarios**:

1. **Given** a correctly signed document, **When** the validation service checks the signature, **Then** the validation passes and returns a success status
2. **Given** a document whose content was modified after signing, **When** the validation service checks the signature, **Then** the validation fails with a message indicating the document hash does not match
3. **Given** a document signed with an expired certificate, **When** the validation service checks the signature, **Then** the validation fails with a message indicating the certificate has expired
4. **Given** a document with a malformed or incomplete signature block, **When** the validation service checks the signature, **Then** the validation fails with a specific error describing what is missing or malformed

---

### User Story 4 - Monitor and Rotate Signing Certificates (Priority: P4)

As a system administrator, I need to be notified when a signing certificate is approaching its expiry date, and I need a documented process to rotate to a new certificate without disrupting the signing service.

**Why this priority**: Certificate rotation is essential for long-term operations but does not block initial launch. LHDN sandbox certificates are typically valid for a reasonable period, giving time to establish this workflow after core signing is functional.

**Independent Test**: Can be tested by storing a certificate with a near-future expiry date and verifying that a notification/alert is triggered within the defined monitoring window.

**Acceptance Scenarios**:

1. **Given** a stored signing certificate, **When** the certificate is within 30 days of expiry, **Then** the system sends an alert notification to the designated administrator
2. **Given** a new signing certificate has been obtained, **When** an administrator stores the new certificate and private key, **Then** the signing service begins using the new credentials for subsequent signing operations
3. **Given** the signing service is using a current certificate, **When** a rotation to a new certificate occurs, **Then** documents currently being signed complete with the old certificate, and new signing requests use the new certificate
4. **Given** a certificate rotation has been completed, **When** the old certificate is reviewed, **Then** the old private key has been securely removed from the parameter store

---

### Edge Cases

- What happens when the signing service receives a document that is not valid UTF-8? The service should reject it with a clear encoding error before attempting any signing steps.
- What happens when the signing service receives a non-JSON input (e.g., XML, PDF, plain text)? The service should reject it with a clear error indicating only JSON format is supported.
- What happens when the private key in the parameter store has been rotated but the certificate has not (or vice versa)? The service should detect the key-certificate mismatch and refuse to sign, logging the inconsistency.
- What happens when the parameter store is temporarily unavailable? The signing service should return a retriable error rather than failing silently or producing an unsigned document.
- What happens when a document exceeds the maximum expected size for an e-invoice? The service should enforce a reasonable size limit and reject oversized documents with a clear error.
- What happens when the signing service is invoked with a certificate that has not yet reached its validity start date (not-before date is in the future)? The service should reject the signing request with a clear message.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept unsigned invoice documents in JSON format (UTF-8 encoded UBL 2.1 JSON) and produce signed JSON output documents
- **FR-002**: System MUST implement the complete LHDN-prescribed 8-step signing workflow: document creation, transformation, document hash generation, digest signing, certificate hash creation, signed properties population, properties hash generation, and signature block embedding
- **FR-003**: System MUST apply correct document transformations — removal of UBLExtensions and Signature elements, followed by minification (JSON canonicalization)
- **FR-004**: System MUST generate SHA-256 hashes and sign digests using RSA-SHA256 with the stored private key
- **FR-005**: System MUST embed the complete signature block in the LHDN-specified location within the JSON document structure
- **FR-006**: System MUST include signing time (UTC), issuer name, serial number, and certificate hash in the signed properties
- **FR-007**: System MUST store private keys encrypted at rest and restrict access to only the authorized signing service
- **FR-008**: System MUST store the signing certificate, certificate chain (if applicable), and private key as separate secured entries
- **FR-009**: System MUST provide a pre-submission validation capability that checks signature integrity, certificate validity period, and signature block completeness
- **FR-010**: System MUST reject invalid inputs (non-UTF-8, unsupported formats, missing required fields) with descriptive error messages before attempting signing
- **FR-011**: System MUST log all signing operations (success and failure) for audit purposes, without ever logging private key material
- **FR-012**: System MUST support certificate rotation without requiring service downtime — new credentials take effect for subsequent requests after storage
- **FR-013**: System MUST alert administrators when the signing certificate is within 30 days of expiry

### Key Entities

- **Signing Certificate**: A single platform-level X.509 certificate issued by an LHDN-approved Certificate Authority, used by FinanSEAL as an intermediary to sign all tenant invoices. Contains the public key, issuer information, serial number, and validity period. One certificate serves the entire platform — tenants do not need individual certificates.
- **Private Key**: An RSA private key (paired with the signing certificate's public key). Used to create the digital signature. Must be stored securely and never exposed outside the signing operation.
- **Unsigned Document**: An invoice document in UBL 2.1 JSON format, ready for signing. Contains all invoice data but no signature block.
- **Signed Document**: The output of the signing process — the original document with an embedded signature block containing SignatureValue, X509Certificate, and all DigestValues per LHDN specification.
- **Signature Block**: The cryptographic signature embedded within the document. Includes the signed digest, certificate information, signed properties (time, issuer, serial), and hash values.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of signed documents submitted to the LHDN sandbox environment pass signature validation on first attempt
- **SC-002**: The signing operation completes within 5 seconds per document for typical invoice sizes (under 500 KB)
- **SC-003**: Private key material is never exposed in any system logs, error messages, or management interfaces — verified through log audit
- **SC-004**: Certificate expiry alerts are sent at least 30 days before certificate expiration, providing sufficient time for renewal
- **SC-005**: Certificate rotation completes without any signing request failures — zero dropped or failed requests during the rotation window
- **SC-006**: JSON document format produces valid signed output accepted by LHDN sandbox (submitted with `format: "JSON"` in the LHDN API)
- **SC-007**: Invalid inputs (wrong format, bad encoding, missing fields) are rejected with descriptive errors within 1 second

## Assumptions

- LHDN sandbox environment is available for testing signed document submissions
- FinanSEAL operates as an LHDN-approved intermediary with a single platform-level signing certificate — all tenant invoices are signed with this one certificate (no per-tenant certificate management required)
- The organization will obtain a single X.509 certificate from an LHDN-approved Certificate Authority for production use (sandbox may use self-signed certificates)
- RSA-2048 key size is sufficient for LHDN requirements (RSA-2048 private keys are approximately 1.7 KB, well within secure parameter store limits)
- The signing service will operate within a single cloud account (no cross-account credential sharing required)
- AWS SSM Parameter Store SecureString (standard tier, free) will be used for private key storage — it provides the same KMS-based AES-256 encryption as Secrets Manager at zero cost, and RSA-2048/4096 keys fit within the 4 KB standard tier limit
- Certificate rotation for X.509 certificates requires manual steps (obtaining new certificate from CA) regardless of the storage mechanism — no built-in automation template exists for this
- The LHDN SDK reference implementation (C# code samples + Digital_Signature_User_Guide.pdf) will be used as the authoritative reference for JSON document signature structure
- JSON format only — LHDN accepts both JSON and XML interchangeably, but JSON is chosen because FinanSEAL's stack is TypeScript/Convex (all data is already JSON), JSON canonicalization (minification) is simpler than XML (xml-c14n11), and the upstream document generator will produce JSON
