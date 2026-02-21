# Implementation Plan: Digital Signature Infrastructure for LHDN e-Invoice

**Branch**: `001-digital-signature-infra` | **Date**: 2026-02-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-digital-signature-infra/spec.md`

## Summary

Build an AWS Lambda signing service that implements LHDN's 8-step digital signature workflow for UBL 2.1 JSON invoice documents. The service receives unsigned JSON documents, signs them using an X.509 certificate (stored in AWS SSM Parameter Store SecureString), and returns minified signed documents ready for LHDN MyInvois API submission. Includes pre-submission signature validation and certificate expiry monitoring.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x (Lambda runtime)
**Primary Dependencies**: `node:crypto` (built-in), `@aws-sdk/client-ssm`, `aws-cdk-lib` (CDK v2.175.0)
**Storage**: AWS SSM Parameter Store SecureString (free standard tier) for private key and certificate
**Testing**: Jest (unit tests for signing logic), AWS Lambda test invocations (integration)
**Target Platform**: AWS Lambda (ARM_64, Node.js 20.x) deployed via CDK
**Project Type**: Lambda service within existing CDK monorepo
**Performance Goals**: <5 seconds per signing operation (typical invoice <300 KB)
**Constraints**: Single platform certificate (intermediary model), JSON format only, 300 KB per-document limit (LHDN API constraint)
**Scale/Scope**: Single signing Lambda, single set of SSM parameters per environment

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is not yet configured (placeholder template). No gates to enforce. Passes trivially.

**Post-Phase 1 re-check**: No violations. Design follows existing CDK patterns (NodejsFunction + prod alias + esbuild bundling). No new abstractions introduced beyond what's necessary.

## Project Structure

### Documentation (this feature)

```text
specs/001-digital-signature-infra/
├── plan.md              # This file
├── spec.md              # Feature specification (clarified)
├── research.md          # Phase 0: technical decisions and rationale
├── data-model.md        # Phase 1: entities, fields, state transitions
├── quickstart.md        # Phase 1: setup and testing guide
├── contracts/
│   └── signing-lambda.md  # Phase 1: Lambda invocation contract
├── checklists/
│   └── requirements.md    # Specification quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
infra/
├── bin/
│   └── digital-signature.ts              # CDK app entry point (new)
├── lib/
│   └── digital-signature-stack.ts        # CDK stack definition (new)

src/lambda/
└── digital-signature/                     # Lambda source (new directory)
    ├── handler.ts                         # Lambda entry point (routes sign/validate actions)
    ├── signing/
    │   ├── sign-document.ts               # 8-step LHDN signing workflow
    │   ├── validate-document.ts           # Pre-submission signature validation
    │   ├── transform.ts                   # JSON transformation: remove sig fields, minify
    │   └── signature-block.ts             # Build UBLExtensions + Signature JSON structure
    ├── credentials/
    │   └── ssm-credential-provider.ts     # SSM Parameter Store credential retrieval + caching
    ├── types.ts                           # TypeScript interfaces (request/response/errors)
    └── errors.ts                          # Error codes and typed error classes
```

**Structure Decision**: Follows existing pattern of Lambda source in `src/lambda/{service-name}/` with CDK stack in `infra/lib/{service-name}-stack.ts` and entry point in `infra/bin/{service-name}.ts`. Matches `mcp-server` and `document-processor-python` conventions.

## Complexity Tracking

No constitution violations to justify. Design uses minimal abstractions:
- One Lambda function with two actions (sign, validate)
- One CDK stack
- One SSM credential provider (caches credentials for Lambda lifetime)
- No database, no queues, no external API calls (LHDN API is out of scope)
