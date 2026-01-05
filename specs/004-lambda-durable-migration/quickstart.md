# Quickstart: Lambda Durable Functions Development

**Feature**: 004-lambda-durable-migration
**Date**: 2026-01-05

This guide covers local development, testing, and deployment of the Lambda Durable Functions document processing workflow.

---

## Prerequisites

### Required Tools

```bash
# Node.js 22.x (required for Lambda Durable Functions)
node --version  # v22.x.x

# AWS CDK CLI
npm install -g aws-cdk
cdk --version  # 2.x.x

# AWS CLI (configured with credentials)
aws --version
aws sts get-caller-identity  # Verify credentials

# AWS SAM CLI (for local Lambda testing)
sam --version  # 1.x.x

# Docker (for Lambda Layer builds)
docker --version
```

### Environment Variables

Create `.env.local` in project root:

```bash
# AWS Configuration
AWS_REGION=us-west-2
AWS_ACCOUNT_ID=837224017779

# Lambda Configuration
DOCUMENT_PROCESSOR_LAMBDA_ARN=arn:aws:lambda:us-west-2:837224017779:function:finanseal-document-processor:prod

# IAM Role for Vercel OIDC
AWS_ROLE_ARN=arn:aws:iam::837224017779:role/FinansealVercelOIDCRole

# Existing Service Configuration (copy from .env)
NEXT_PUBLIC_CONVEX_URL=https://...
GEMINI_API_KEY=...
SENTRY_DSN=...
```

---

## Project Setup

### 1. Initialize CDK Infrastructure

```bash
# Navigate to infrastructure directory
cd infra

# Install dependencies
npm install

# Bootstrap CDK (first time only)
cdk bootstrap aws://837224017779/us-west-2

# Synthesize CloudFormation template (validate)
cdk synth
```

### 2. Build Lambda Layer

The Python PDF processing layer requires Docker for cross-platform builds:

```bash
# Build the layer
cd infra/layers/python-pdf
docker build -t finanseal-pdf-layer .
docker run --rm -v $(pwd)/dist:/dist finanseal-pdf-layer

# Layer will be at: dist/python-pdf-layer.zip
```

### 3. Build Lambda Handler

```bash
# From project root
cd src/lambda/document-processor

# Install dependencies
npm install

# Build TypeScript
npm run build
```

---

## Local Development

### Running the Lambda Locally

Use AWS SAM CLI for local Lambda execution:

```bash
# Create test event file
cat > events/test-invoice.json << 'EOF'
{
  "documentId": "test-uuid-1234",
  "domain": "invoices",
  "storagePath": "invoices/test-document.pdf",
  "fileType": "pdf",
  "userId": "user-123",
  "businessId": "business-456",
  "idempotencyKey": "test-key-001"
}
EOF

# Invoke locally
sam local invoke DocumentProcessor \
  --event events/test-invoice.json \
  --env-vars env.json
```

### Testing with SAM Local API

```bash
# Start local API
sam local start-lambda

# Invoke from another terminal
aws lambda invoke \
  --function-name DocumentProcessor \
  --endpoint-url http://localhost:3001 \
  --payload file://events/test-invoice.json \
  output.json
```

### Unit Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

---

## Deployment

### Deploy to Staging

```bash
cd infra

# Deploy stack
cdk deploy FinansealDocumentProcessingStack-staging \
  --context environment=staging \
  --require-approval never

# Output will show:
# FunctionArn: arn:aws:lambda:us-west-2:837224017779:function:finanseal-document-processor-staging:prod
```

### Deploy to Production

```bash
cd infra

# Deploy with approval (production requires confirmation)
cdk deploy FinansealDocumentProcessingStack-prod \
  --context environment=prod

# Verify deployment
aws lambda get-function \
  --function-name finanseal-document-processor-prod
```

### Verify Deployment

```bash
# Check function configuration
aws lambda get-function-configuration \
  --function-name finanseal-document-processor-prod

# Check durable execution settings
aws lambda get-function \
  --function-name finanseal-document-processor-prod \
  --query 'Configuration.DurableConfig'
```

---

## Testing in Staging

### End-to-End Test

1. **Upload a test document** via the FinanSeal UI (staging environment)

2. **Monitor CloudWatch Logs**:
```bash
aws logs tail /aws/lambda/finanseal-document-processor-staging \
  --follow \
  --since 5m
```

3. **Check Durable Execution State**:
```bash
aws lambda get-durable-execution-state \
  --function-name finanseal-document-processor-staging \
  --execution-id <execution-id-from-logs>
```

### Load Testing

```bash
# Use artillery for load testing
npm install -g artillery

# Create load test config
cat > load-test.yml << 'EOF'
config:
  target: "https://finanseal-staging.vercel.app"
  phases:
    - duration: 60
      arrivalRate: 5

scenarios:
  - name: "Document Processing"
    flow:
      - post:
          url: "/api/v1/documents/test-doc/process"
          headers:
            Authorization: "Bearer ${AUTH_TOKEN}"
EOF

artillery run load-test.yml
```

---

## Debugging

### CloudWatch Insights Queries

```sql
-- Find failed executions
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 20

-- Track step execution times
fields @timestamp, documentId, step, durationMs
| filter @message like /step completed/
| stats avg(durationMs) as avgDuration by step

-- Find long-running workflows
fields @timestamp, documentId, totalDurationMs
| filter totalDurationMs > 60000
| sort totalDurationMs desc
```

### Sentry Integration

Errors are automatically sent to Sentry with:
- `lambda.function` tag
- `document.domain` tag
- `document.type` tag
- Full execution context

View errors at: https://sentry.io/organizations/finanseal/issues/

### Local Debugging with VS Code

Add to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Lambda",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "sam",
      "runtimeArgs": [
        "local",
        "invoke",
        "DocumentProcessor",
        "--event",
        "events/test-invoice.json",
        "--debug-port",
        "5858"
      ],
      "port": 5858,
      "localRoot": "${workspaceFolder}/src/lambda/document-processor",
      "remoteRoot": "/var/task",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

---

## Rollback Procedures

### Immediate Rollback

```bash
# List Lambda versions
aws lambda list-versions-by-function \
  --function-name finanseal-document-processor-prod

# Point alias to previous version
aws lambda update-alias \
  --function-name finanseal-document-processor-prod \
  --name prod \
  --function-version <previous-version-number>
```

### CDK Rollback

```bash
# Rollback to previous CloudFormation stack
aws cloudformation rollback-stack \
  --stack-name FinansealDocumentProcessingStack-prod
```

### Full Trigger.dev Fallback

If critical issues discovered within 24 hours:

1. Revert API route changes (git revert)
2. Redeploy with Trigger.dev invocations
3. Trigger.dev tasks remain in `004-lambda-fallback` branch for 7 days

---

## Common Issues

### Cold Start Too Slow

**Symptoms**: First invocation takes >3 seconds

**Solutions**:
1. Enable Provisioned Concurrency (adds cost):
   ```bash
   aws lambda put-provisioned-concurrency-config \
     --function-name finanseal-document-processor-prod \
     --qualifier prod \
     --provisioned-concurrent-executions 2
   ```
2. Reduce bundle size by checking imports
3. Move heavy imports inside functions (lazy loading)

### Lambda Layer Missing

**Symptoms**: `ModuleNotFoundError: No module named 'pdf2image'`

**Solution**: Verify layer is attached:
```bash
aws lambda get-function-configuration \
  --function-name finanseal-document-processor-prod \
  --query 'Layers'
```

### OIDC Token Expired

**Symptoms**: `ExpiredTokenException` when invoking from Vercel

**Solution**: OIDC tokens are automatically refreshed by Vercel. If persistent:
1. Check IAM trust policy conditions
2. Verify Vercel team ID matches policy

### Checkpoint Failures

**Symptoms**: `CheckpointError: Failed to save checkpoint`

**Solution**:
1. Check IAM permissions include `lambda:CheckpointDurableExecutions`
2. Verify Lambda has sufficient memory for checkpoint data
3. Check CloudWatch for quota errors

---

## Architecture Diagram

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Vercel API     │     │   AWS Lambda     │     │    External      │
│   Routes         │     │   Durable Func   │     │    Services      │
├──────────────────┤     ├──────────────────┤     ├──────────────────┤
│                  │     │                  │     │                  │
│ /api/documents/  │────▶│ Step 1: Classify │────▶│ S3 (read doc)    │
│ [id]/process     │     │   ↓ checkpoint   │     │                  │
│                  │     │                  │     │                  │
│ Uses OIDC auth   │     │ Step 2: Convert  │────▶│ S3 (write imgs)  │
│ via AWS SDK      │     │   ↓ checkpoint   │     │                  │
│                  │     │                  │     │                  │
│ Fire-and-forget  │     │ Step 3: Extract  │────▶│ Gemini API       │
│ (async invoke)   │     │   ↓ checkpoint   │     │                  │
│                  │     │                  │     │                  │
│                  │     │ Step 4: Update   │────▶│ Convex           │
│                  │     │                  │     │                  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                ▲
                                │
                         ┌──────┴──────┐
                         │   Sentry    │
                         │   (errors)  │
                         └─────────────┘
```

---

## Next Steps

After completing local development:

1. **Run `/speckit.tasks`** to generate implementation tasks
2. **Follow Implementation Phases** in [plan.md](./plan.md)
3. **Track Progress** in generated `tasks.md`
