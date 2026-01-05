# Research: Lambda Durable Functions Migration

**Feature**: 004-lambda-durable-migration
**Date**: 2026-01-05
**Purpose**: Resolve all technical unknowns before implementation

## 1. Lambda Durable Functions SDK Patterns

### Decision: Use `@aws/durable-execution-sdk-js` with `withDurableExecution` wrapper

**Rationale**: This is the official AWS SDK for durable functions, providing:
- `context.step()` for automatic checkpointing
- `context.waitForCallback()` for external events
- `context.parallel()` for concurrent execution
- Automatic retry and recovery from failures

**Alternatives Considered**:
- AWS Step Functions: Rejected - requires separate service, additional cost, more complex setup
- Custom checkpointing: Rejected - reinventing the wheel, error-prone

### Handler Structure Pattern

```typescript
import { DurableContext, withDurableExecution } from "@aws/durable-execution-sdk-js";

export const handler = withDurableExecution(
  async (event: DocumentProcessingPayload, context: DurableContext) => {
    // Step 1: Classification (checkpointed)
    const classification = await context.step("classify-document", async () => {
      return await classifyDocument(event.documentId, event.domain);
    });

    // Step 2: PDF Conversion if needed (checkpointed)
    let imageUrls: string[];
    if (classification.needsConversion) {
      imageUrls = await context.step("convert-pdf", async () => {
        return await convertPdfToImages(event.documentId, event.storagePath);
      });
    } else {
      imageUrls = [event.storagePath];
    }

    // Step 3: Extraction based on document type (checkpointed)
    const extractedData = await context.step("extract-data", async () => {
      if (classification.type === 'invoice') {
        return await extractInvoiceData(imageUrls, event.businessCategories);
      } else {
        return await extractReceiptData(imageUrls, event.businessCategories);
      }
    });

    // Step 4: Update database status (checkpointed)
    await context.step("update-status", async () => {
      await updateConvexStatus(event.documentId, 'completed', extractedData);
    });

    return { success: true, documentId: event.documentId, extractedData };
  }
);
```

### Key Patterns

1. **Deterministic Code Outside Steps**: Logic that decides which step to execute must be deterministic
2. **Idempotent Steps**: Each step should be idempotent since it may replay on recovery
3. **Checkpoint Granularity**: Each step adds ~100-500ms overhead, balance granularity vs performance

---

## 2. Lambda Layer for Python Dependencies

### Decision: Docker-based Lambda Layer with poppler-utils and pdf2image

**Rationale**:
- Lambda Layers provide shared dependencies across invocations
- Docker build ensures correct architecture (ARM64/x86_64)
- poppler-utils binary works in Lambda environment
- Estimated layer size: ~60MB (within 250MB limit)

**Alternatives Considered**:
- Separate Python Lambda: Rejected - adds invocation latency, more complex orchestration
- Container Image Lambda: Rejected - larger image size, slower cold starts

### Layer Build Process

```dockerfile
# Dockerfile for Lambda Layer build
FROM public.ecr.aws/lambda/python:3.11

# Install system dependencies
RUN yum install -y poppler-utils

# Install Python packages
RUN pip install pdf2image Pillow -t /opt/python/

# Package the layer
WORKDIR /opt
RUN zip -r9 /layer.zip .
```

### Node.js Child Process Invocation

```typescript
import { spawn } from 'child_process';
import * as path from 'path';

export async function convertPdfToImage(pdfBuffer: Buffer): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join('/opt', 'python', 'convert_pdf.py');
    const process = spawn('python3', [pythonScript], {
      env: { ...process.env, PYTHONPATH: '/opt/python' }
    });

    let output = '';
    let error = '';

    process.stdin.write(pdfBuffer.toString('base64'));
    process.stdin.end();

    process.stdout.on('data', (data) => { output += data; });
    process.stderr.on('data', (data) => { error += data; });

    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python process failed: ${error}`));
        return;
      }
      const result = JSON.parse(output);
      resolve(result.pages.map((p: string) => Buffer.from(p, 'base64')));
    });
  });
}
```

---

## 3. Vercel OIDC → Lambda Invocation Flow

### Decision: Use AWS SDK v3 with STS AssumeRoleWithWebIdentity

**Rationale**:
- Existing OIDC provider already configured in AWS
- AWS SDK v3 supports web identity credentials
- No long-lived credentials needed in Vercel environment

**Alternatives Considered**:
- API Gateway + Lambda: Rejected - adds public endpoint, against security requirements
- Lambda Function URL: Rejected - creates public endpoint

### Invocation Pattern

```typescript
// src/lib/lambda-invoker.ts
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { fromWebToken } from "@aws-sdk/credential-providers";

const LAMBDA_ARN = process.env.DOCUMENT_PROCESSOR_LAMBDA_ARN!;
const ROLE_ARN = process.env.AWS_ROLE_ARN!;

export async function invokeDocumentProcessor(
  payload: DocumentProcessingPayload
): Promise<{ executionId: string }> {
  // Get OIDC token from Vercel
  const webIdentityToken = await getVercelOIDCToken();

  // Create Lambda client with OIDC credentials
  const client = new LambdaClient({
    region: 'us-west-2',
    credentials: fromWebToken({
      roleArn: ROLE_ARN,
      webIdentityToken,
    }),
  });

  // Invoke Lambda asynchronously (fire-and-forget)
  const command = new InvokeCommand({
    FunctionName: LAMBDA_ARN,
    InvocationType: 'Event', // Async invocation
    Payload: JSON.stringify(payload),
  });

  const response = await client.send(command);

  // Extract execution ID from response headers
  const executionId = response.$metadata.requestId;

  return { executionId };
}

async function getVercelOIDCToken(): Promise<string> {
  // Vercel provides OIDC token via environment
  const token = process.env.VERCEL_OIDC_TOKEN;
  if (!token) {
    // Fallback for local development
    throw new Error('OIDC token not available - ensure running in Vercel environment');
  }
  return token;
}
```

### IAM Role Trust Policy Update

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::837224017779:oidc-provider/oidc.vercel.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.vercel.com:aud": "YOUR_VERCEL_TEAM_ID"
        }
      }
    }
  ]
}
```

### IAM Policy for Lambda Invocation

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:us-west-2:837224017779:function:finanseal-document-processor:*"
    }
  ]
}
```

---

## 4. Sentry Integration for AWS Lambda

### Decision: Use @sentry/aws-serverless with existing DSN

**Rationale**:
- Same Sentry project as Next.js application
- Unified error tracking dashboard
- Zero additional cost within free tier

**Alternatives Considered**:
- CloudWatch Alarms only: Rejected - no unified dashboard with frontend errors
- New Sentry project: Rejected - unnecessary separation

### Integration Pattern

```typescript
// src/lambda/document-processor/index.ts
import * as Sentry from "@sentry/aws-serverless";
import { DurableContext, withDurableExecution } from "@aws/durable-execution-sdk-js";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  integrations: [
    Sentry.awsLambdaIntegration(),
  ],
});

export const handler = Sentry.wrapHandler(
  withDurableExecution(async (event: any, context: DurableContext) => {
    try {
      // ... durable function logic
    } catch (error) {
      Sentry.captureException(error, {
        extra: {
          documentId: event.documentId,
          step: context.currentStep,
        },
      });
      throw error;
    }
  })
);
```

### Error Context Tags

```typescript
Sentry.setTag("lambda.function", "document-processor");
Sentry.setTag("document.domain", event.domain);
Sentry.setTag("document.type", classification?.type || "unknown");
```

---

## 5. CDK Stack Configuration

### Decision: Single stack with Lambda + Layer + IAM

**Rationale**:
- Simpler deployment and rollback
- All resources have clear dependency chain
- Environment-specific stacks via CDK context

### Complete CDK Stack

```typescript
// infra/lib/document-processing-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class DocumentProcessingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Reference existing S3 bucket
    const bucket = s3.Bucket.fromBucketName(this, 'FinansealBucket', 'finanseal-bucket');

    // Python dependencies layer
    const pythonLayer = new lambda.LayerVersion(this, 'PythonPdfLayer', {
      code: lambda.Code.fromAsset('layers/python-pdf'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_22_X],
      compatibleArchitectures: [lambda.Architecture.ARM_64],
      description: 'pdf2image, Pillow, poppler-utils',
    });

    // Document processor Lambda
    const documentProcessor = new lambda.Function(this, 'DocumentProcessor', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../src/lambda/document-processor'),
      functionName: 'finanseal-document-processor',
      memorySize: 1024,
      timeout: cdk.Duration.minutes(15), // Per-invocation timeout
      layers: [pythonLayer],
      environment: {
        SENTRY_DSN: process.env.SENTRY_DSN || '',
        NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL || '',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
        S3_BUCKET_NAME: 'finanseal-bucket',
      },
      durableConfig: {
        executionTimeout: cdk.Duration.hours(1),
        retentionPeriod: cdk.Duration.days(30),
      },
    });

    // Checkpoint permissions
    documentProcessor.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'lambda:CheckpointDurableExecutions',
        'lambda:GetDurableExecutionState',
      ],
      resources: [documentProcessor.functionArn],
    }));

    // S3 permissions
    bucket.grantReadWrite(documentProcessor);

    // Create version and alias
    const version = documentProcessor.currentVersion;
    const alias = new lambda.Alias(this, 'ProdAlias', {
      aliasName: 'prod',
      version,
    });

    // Allow Vercel OIDC role to invoke
    alias.grantInvoke(new iam.ArnPrincipal(
      'arn:aws:iam::837224017779:role/FinansealVercelOIDCRole'
    ));

    // Outputs
    new cdk.CfnOutput(this, 'FunctionArn', {
      value: alias.functionArn,
      description: 'Lambda ARN for Vercel invocation',
    });
  }
}
```

---

## 6. Cold Start Optimization

### Decision: ARM64 + 1024MB + Provisioned Concurrency (optional)

**Rationale**:
- ARM64 (Graviton2) provides 34% better price-performance
- 1024MB balances cost and CPU allocation
- Provisioned concurrency only if cold starts exceed 3s in production

**Measurements Needed**:
- Baseline cold start time after deployment
- P95 cold start under load
- Impact of Python layer on initialization

### Optimization Techniques Applied

1. **Lazy Loading**: Import heavy dependencies inside functions, not at top level
2. **Connection Reuse**: Initialize S3/Convex clients outside handler
3. **Minimal Dependencies**: Bundle only required modules with esbuild

```typescript
// Good: Lazy import for rarely-used code
async function handleRareCase() {
  const { heavyLibrary } = await import('heavy-library');
  return heavyLibrary.process();
}

// Good: Client reuse across invocations
const s3Client = new S3Client({ region: 'us-west-2' });

export const handler = withDurableExecution(async (event, context) => {
  // s3Client is reused across warm invocations
});
```

---

## Summary of Decisions

| Topic | Decision | Confidence |
|-------|----------|------------|
| SDK | `@aws/durable-execution-sdk-js` | High |
| Python Dependencies | Lambda Layer with Docker build | High |
| Invocation | AWS SDK v3 with OIDC credentials | High |
| Error Tracking | @sentry/aws-serverless | High |
| Infrastructure | Single CDK stack | High |
| Architecture | ARM64 (Graviton2) | High |
| Memory | 1024 MB | High |

All technical unknowns have been resolved. Ready for Phase 1 design artifacts.
