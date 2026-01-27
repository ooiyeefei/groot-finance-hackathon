# FinanSEAL Documentation

Technical documentation for the FinanSEAL financial co-pilot platform.

## Quick Links

| Section | Description |
|---------|-------------|
| [Architecture](./architecture/) | System design, infrastructure, patterns |
| [Features](./features/) | Feature documentation by domain |
| [Guides](./guides/) | Developer guides and tutorials |
| [API Reference](./api/) | API documentation |

---

## Architecture

- [Overview](./architecture/overview.md) - High-level system architecture
- [AWS Lambda Processing](./architecture/aws-lambda.md) - Document processing pipeline
- [Two-Phase Extraction](./architecture/two-phase-extraction.md) - Progressive UI pattern
- [Domain Architecture](./domain-architecture.md) - Domain-driven design structure

## Features

### Expense Claims
- [Overview](./features/expense-claims/overview.md) - Expense claims module
- [Duplicate Detection](./features/expense-claims/duplicate-detection.md) - Fraud prevention system
- [Approval Workflow](./features/expense-claims/approval-workflow.md) - Manager approval flow
- [Detailed Implementation](./features/expense-claims/detailed-implementation.md) - In-depth module docs

### Billing
- [Subscription Plans](./features/billing/subscription-plans.md) - Stripe integration & plans

### AI Chat
- [Chat Agent](./features/ai-chat/README.md) - AI assistant documentation

### Access Control
- [RBAC](./rbac.md) - Role-based access control
- [Multi-Tenancy](./tenancy.md) - Business isolation
- [Auth Docs](./auth/) - Authentication implementation

### Language & i18n
- [Language Support](./language/) - Multi-language implementation

## Guides

- [Developer Onboarding](./guides/developer-onboarding.md) - Getting started
- [Python Setup](./guides/python-setup.md) - Lambda development environment
- [Build Process](./guides/build-process-guide.md) - Build and deployment
- [Optimization Strategies](./guides/OPTIMIZATION_STRATEGIES.md) - Performance tips

## API

- [API Reference](./api/API_REFERENCE.md) - Complete API documentation
- [V1 Migration](./api/V1_MIGRATION_COMPLETE.md) - Migration notes

## Product

- [Roadmap](./product/ROADMAP.md) - Product roadmap
- [ADRs](./product/ADR.md) - Architecture decision records
- [Ideas](./product/IDEAS.md) - Feature ideas

## Archive

Old/deprecated docs moved to [archive/](./archive/) folder.

---

## For AI Coding Agents

See [CLAUDE.md](../CLAUDE.md) in project root for coding rules and conventions.
Domain-specific instructions in `src/domains/*/CLAUDE.md` and `src/app/**/CLAUDE.md`.
