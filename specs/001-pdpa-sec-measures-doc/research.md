# Research: PDPA Security Measures Documentation

**Feature**: 001-pdpa-sec-measures-doc
**Date**: 2026-03-03

## 1. Third-Party Provider Security Certifications

### Clerk (Authentication)

- **Decision**: Document Clerk as SOC 2 Type II certified authentication provider
- **Certifications**: SOC 2 Type II, CCPA compliant
- **Security Page**: https://clerk.com/security
- **DPA**: https://clerk.com/legal/dpa
- **Privacy**: https://clerk.com/legal/privacy
- **Rationale**: Clerk is the sole authentication provider. SOC 2 Type II covers security, availability, and confidentiality — directly relevant to PDPA audit requirements.

### Stripe (Payments)

- **Decision**: Document Stripe as PCI DSS Level 1 certified payment processor
- **Certifications**: PCI Service Provider Level 1, SOC 1/2/3 Type II, NIST alignment
- **Security Page**: https://docs.stripe.com/security
- **Compliance Page**: https://docs.stripe.com/compliance
- **Key Facts**: AES-256 encryption at rest, tokenization of PANs, no card data touches Groot Finance systems
- **Rationale**: Groot Finance delegates all payment data handling to Stripe. PCI Level 1 is the highest classification in the payments industry.

### Sentry (Error Tracking)

- **Decision**: Document Sentry as SOC 2 Type II + ISO 27001 certified, with PII scrubbing controls
- **Certifications**: SOC 2 Type II, ISO 27001, GDPR compliant, HIPAA eligible
- **Security Page**: https://sentry.io/security/
- **Trust Center**: https://sentry.io/trust/
- **Key Facts**: GCP-hosted, US and Germany regions, annual penetration testing
- **Rationale**: Sentry processes error data which may contain user context. PII scrubbing is configured in Groot Finance to redact sensitive fields before transmission.

### Convex (Database)

- **Decision**: Document Convex as SOC 2 Type II certified database provider with AES-256 encryption at rest
- **Certifications**: SOC 2 Type II, HIPAA compliant, GDPR compliant
- **Security Page**: https://docs.convex.dev (security section)
- **Key Facts**: AES-256 encryption at rest, TLS in transit, unique credentials per customer DB, hosted on AWS
- **Rationale**: Convex stores all business data including financial records. SOC 2 Type II + AES-256 at rest meets PDPA data protection requirements.

### AWS (Infrastructure)

- **Decision**: Document AWS as the infrastructure provider with 143+ compliance certifications
- **Certifications**: SOC 2 Type II, ISO 9001, PCI-DSS, HIPAA, FedRAMP, GDPR, FIPS 140-3
- **Compliance Page**: https://aws.amazon.com/compliance/
- **Services Used**: SSM Parameter Store (SecureString/KMS), S3 (AES-256), Lambda (IAM-scoped), CloudFront (OAC + signed URLs)
- **Rationale**: AWS manages infrastructure under shared responsibility model. Groot Finance configures IAM least-privilege, encryption, and access controls on top.

### Vercel (Deployment)

- **Decision**: Document Vercel as SOC 2 Type 2 + ISO 27001 certified deployment platform with OIDC support
- **Certifications**: SOC 2 Type 2, ISO 27001:2022, PCI DSS v4.0, GDPR, DPF certified
- **Security Page**: https://vercel.com/security
- **Trust Center**: https://security.vercel.com/
- **Key Facts**: AWS-based, AES-256 at rest, HTTPS/TLS in transit, OIDC for credential-free AWS access
- **Rationale**: Vercel hosts the Next.js application and provides OIDC identity federation to AWS, eliminating long-lived credentials.

## 2. Codebase Audit Summary

### Controls by Domain (from specification phase audit)

| Domain | Controls Found | Key Files |
|--------|---------------|-----------|
| Authentication & Identity | 3 | `convex/auth.config.ts`, `src/middleware.ts`, `src/domains/system/lib/webhook.service.ts` |
| Authorization & Access Control | 4 | `convex/schema.ts`, `src/domains/security/lib/rbac.ts`, `src/lib/db/business-context.ts`, `src/lib/ai/mcp/mcp-permissions.ts` |
| Encryption & Secure Storage | 3 | `infra/lib/digital-signature-stack.ts`, `infra/lib/cdn-stack.ts`, `src/lib/cloudfront-signer.ts` |
| Infrastructure Security | 5 | `infra/lib/digital-signature-stack.ts`, `infra/lib/document-processing-stack.ts`, `infra/lib/cdn-stack.ts` |
| Audit & Monitoring | 4 | `convex/schema.ts`, `convex/functions/audit.ts`, `sentry.client.config.ts`, `sentry.server.config.ts` |
| Code Security & Headers | 4 | `next.config.ts`, `sentry.client.config.ts` |
| Data Protection & Privacy | 5 | `convex/schema.ts`, `src/app/api/v1/billing/webhooks/route.ts`, `src/app/api/v1/system/webhooks/clerk/route.ts` |
| Payment Security | 3 | `src/app/api/v1/billing/webhooks/route.ts`, `src/app/api/v1/stripe-integration/webhooks/[businessId]/route.ts` |

**Total**: 31+ distinct security controls identified across 8 domains.

## 3. Document Structure Best Practices

- **Decision**: Use a flat domain-based structure (8 top-level sections, one per domain) rather than a layered architecture view or threat-model-based structure
- **Rationale**: Domain-based organization maps naturally to security questionnaire categories (authentication, authorization, encryption, etc.), directly supporting User Story 2 (sales team answering questionnaires). A threat-model view would be harder for non-technical readers.
- **Alternatives Considered**:
  - Layered (network/application/data): Rejected — cross-cutting controls would appear in multiple layers, causing duplication
  - Threat-model (STRIDE): Rejected — too technical for sales team use case
  - Compliance-framework (NIST CSF): Rejected — adds overhead without NIST requirement

## 4. Code Reference Format

- **Decision**: File path + symbol name (e.g., `infra/lib/cdn-stack.ts → CdnStack`)
- **Rationale**: Clarified during `/speckit.clarify` session. Balances verifiability with maintenance stability. Line numbers excluded as they go stale on every commit.
- **Alternatives Considered**:
  - Exact file + line numbers: Rejected — stale on every edit
  - File path only: Rejected — insufficient for large files
  - Stack/module name only: Rejected — too abstract for technical verification

## 5. PDPA Jurisdiction Applicability

- **Decision**: Document is jurisdiction-agnostic — focuses on technical security controls that support compliance with any Southeast Asian data protection law (Malaysia PDPA, Thailand PDPA, Singapore PDPA)
- **Rationale**: The security controls themselves are the same regardless of jurisdiction. PDPA-specific procedural requirements (DPO appointment, breach notification timelines, cross-border transfer rules) are handled by separate compliance documents.
- **Alternatives Considered**:
  - Malaysia-specific mapping: Rejected — limits reusability and the product targets multiple SEA markets
  - Multi-jurisdiction appendix: Rejected — adds complexity; better handled in separate compliance docs
