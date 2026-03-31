---
paths:
  - "infra/**"
  - "src/lambda/**"
---
# AWS CDK & Infrastructure

## Deployment
```bash
cd infra
npx cdk deploy --profile groot-finanseal --region us-west-2
```
**Never make ad-hoc CLI changes** -- all infrastructure via CDK. CDK is single source of truth.

## Core Rules

**Add to existing stacks**: Always add to an existing CDK stack in `infra/lib/`. Do not create new stacks unless logically independent and approved.

**AWS-first for AWS operations**: When a feature needs AWS services (SSM, S3, SES, LHDN API), put logic in Lambda -- not Convex actions. Lambda has IAM-native access (zero exported credentials). Convex handles scheduling + real-time data layer only.

## Security -- IAM Authentication Required

- **All Lambda functions**: Secured with IAM-based invocation. No public Function URLs, no unauthenticated API Gateway endpoints.
- **Vercel invocation**: Use OIDC role `arn:aws:iam::837224017779:role/FinanSEAL-Vercel-S3-Role`. Add `addPermission()` on Lambda alias with this role as principal.
- **New IAM permissions**: Do NOT modify the Vercel OIDC role directly. Report back with the exact policy statement needed so the user can update manually.
- **Lambda execution role**: Least-privilege -- scope IAM actions to specific resource ARNs with conditions.

## MCP as Single Intelligence Engine

- **MCP is the single source of truth** for all financial intelligence AND all chat agent tools. 36 tools live on MCP Lambda.
- **Tool-factory eliminated (032-mcp-first)**: `src/lib/ai/tools/mcp-tool-registry.ts` is the only tool interface. Fetches schemas from MCP `tools/list`, filters by RBAC, executes via MCP `tools/call`.
- **New tool workflow**: Add MCP endpoint in `src/lambda/mcp-server/tools/` -> register in handler + contracts -> deploy CDK -> done.
- **Agent architecture**: See `src/lib/ai/CLAUDE.md` for ADRs on custom LangGraph nodes, RBAC model, and MCP integration.
- **MCP observability**: CloudWatch alarms on `mcp-server-stack.ts` (error rate, P99 latency, API Gateway 5XX) -> SNS -> `dev@hellogroot.com`.
- **Internal calls** (Convex -> MCP Lambda): Use `MCP_INTERNAL_SERVICE_KEY` (SSM + Convex env). Pass `X-Internal-Key` header and `_businessId` in params.
- **App -> Lambda** (Vercel -> Lambda): Use IAM auth via Vercel OIDC role.
- **MCP client helper**: `convex/lib/mcp-client.ts` -- reusable `callMCPTool()` and `callMCPToolsBatch()`.

## Cost Optimization -- Free Tier First

- Prefer AWS free tier: SSM SecureString (free) over Secrets Manager ($0.40/secret/month), CloudWatch Logs with retention limits, ARM_64 Lambda (cheaper than x86_64).
- Mark `@aws-sdk/*` as `externalModules` in Lambda bundling -- use runtime-provided SDK to reduce bundle size.

## Current CDK Stacks

| Stack | File | Key Resources |
|-------|------|-----------|
| **DocumentProcessing** | `document-processing-stack.ts` | `finanseal-document-processor` (Python Docker), `finanseal-einvoice-form-fill` (Python Docker, 2048MB), `finanseal-lhdn-polling` (Node.js 20), `finanseal-dspy-optimizer` (Python Docker), `finanseal-einvoice-email-processor` |
| **ScheduledIntelligence** | `scheduled-intelligence-stack.ts` | `finanseal-scheduled-intelligence` (Node.js 20, 512MB), 13 EventBridge rules, SQS DLQ, CloudWatch alarms, SNS |
| **CDN** | `cdn-stack.ts` | CloudFront (OAC -> `finanseal-bucket`), signed URL key pair, SSM params |
| **SystemEmail** | `system-email-stack.ts` | `finanseal-welcome-workflow` (Node.js 22), SES `notifications.hellogroot.com`, CloudWatch alarms |
| **MCPServer** | `mcp-server-stack.ts` | `finanseal-mcp-server` (Node.js 20, 512MB), API Gateway REST `/mcp` |
| **DigitalSignature** | `digital-signature-stack.ts` | `finanseal-digital-signature` (Node.js 20), SSM params, cert expiry alarm |
| **APNs** | `apns-stack.ts` | SSM parameters for push notification keys |
| **PublicAssets** | `public-assets-stack.ts` | `finanseal-public` S3 bucket, Vercel OIDC upload permission |

**Shared resources** (not CDK-managed):
- S3: `finanseal-bucket` (private documents)
- Vercel OIDC role: `arn:aws:iam::837224017779:role/FinanSEAL-Vercel-S3-Role`
- Convex: `https://kindhearted-lynx-129.convex.cloud`
