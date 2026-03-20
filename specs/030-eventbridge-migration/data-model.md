# Data Model: EventBridge Migration

## Overview
This document defines all data structures, types, and interfaces used in the EventBridge migration from Convex crons to AWS Lambda.

---

## Core Types

### EventBridgeEvent
EventBridge event payload passed to Lambda handler.

```typescript
interface EventBridgeEvent {
  version: string; // EventBridge schema version
  id: string; // Unique event ID
  'detail-type': 'Scheduled Event';
  source: 'aws.events';
  account: string; // AWS account ID
  time: string; // ISO 8601 timestamp
  region: string; // AWS region
  resources: string[]; // ARNs of resources
  detail: {
    module: JobModule; // Which job to run
  };
}
```

**Example:**
```json
{
  "version": "0",
  "id": "abc123",
  "detail-type": "Scheduled Event",
  "source": "aws.events",
  "time": "2026-03-20T04:00:00Z",
  "detail": {
    "module": "proactive-analysis"
  }
}
```

---

### JobModule
Enum of all supported job modules.

```typescript
type JobModule =
  // Daily jobs (4am UTC = 12pm MYT)
  | 'proactive-analysis'
  | 'ai-discovery'
  | 'notification-digest'
  | 'einvoice-monitoring'
  | 'ai-daily-digest'

  // Weekly jobs (Sunday 2am UTC = 10am MYT)
  | 'dspy-fee'
  | 'dspy-bank-recon'
  | 'dspy-po-match'
  | 'dspy-ar-match'
  | 'chat-agent-optimization'
  | 'einvoice-dspy-digest'
  | 'weekly-email-digest'

  // Monthly jobs (1st of month, 3am UTC = 11am MYT)
  | 'scheduled-reports';
```

**Mapping to Convex functions:**

| Module | Convex Function | Type |
|--------|----------------|------|
| `proactive-analysis` | `functions/actionCenterJobs:runProactiveAnalysis` | Action |
| `ai-discovery` | `functions/actionCenterJobs:runAIDiscovery` | Action |
| `notification-digest` | `functions/notificationJobs:runDigest` | Action |
| `einvoice-monitoring` | `functions/einvoiceMonitoring:runMonitoringCycle` | Action |
| `ai-daily-digest` | `functions/actionCenterJobs:runAIDailyDigest` | Action |
| `dspy-fee` | `functions/dspyOptimization:weeklyOptimization` | Action |
| `dspy-bank-recon` | `functions/bankReconOptimization:weeklyOptimization` | Action |
| `dspy-po-match` | `functions/poMatchOptimization:weeklyOptimization` | Action |
| `dspy-ar-match` | `functions/orderMatchingOptimization:weeklyOptimization` | Action |
| `chat-agent-optimization` | (invokes DSPy optimizer Lambda) | Lambda invoke |
| `einvoice-dspy-digest` | `functions/einvoiceDspyJobs:runWeeklyDigest` | Action |
| `weekly-email-digest` | `functions/emailDigestJobs:runWeeklyDigest` | Action |
| `scheduled-reports` | `functions/scheduledReportJobs:runScheduledReports` | Action |

---

### JobResult
Return type from job handler and module functions.

```typescript
interface JobResult {
  module: JobModule; // Which module ran
  status: 'success' | 'skipped' | 'error'; // Execution status
  durationMs: number; // Total execution time (ms)
  documentsRead?: number; // Number of Convex documents read
  documentsWritten?: number; // Number of documents written
  error?: string; // Error message if status === 'error'
}
```

**Status meanings:**
- `success`: Job completed successfully and made changes
- `skipped`: Job ran but no work needed (e.g., no corrections to train on)
- `error`: Job failed with exception

**Example (success):**
```json
{
  "module": "proactive-analysis",
  "status": "success",
  "durationMs": 2450,
  "documentsRead": 15,
  "documentsWritten": 3
}
```

**Example (error):**
```json
{
  "module": "dspy-fee",
  "status": "error",
  "durationMs": 1200,
  "error": "Insufficient corrections for training (need 20, got 8)"
}
```

---

## Convex HTTP API Types

### ConvexActionRequest
Payload sent to Convex HTTP API.

```typescript
interface ConvexActionRequest {
  functionPath: string; // e.g., "functions/actionCenterJobs:runProactiveAnalysis"
  args: Record<string, unknown>; // Function arguments (often empty {})
}
```

**Example:**
```json
{
  "functionPath": "functions/actionCenterJobs:runProactiveAnalysis",
  "args": {}
}
```

### ConvexActionResponse
Generic response from Convex action (shape varies by action).

```typescript
interface ConvexActionResponse<T = unknown> {
  value: T; // Action return value
}
```

**Example (proactive analysis):**
```json
{
  "value": {
    "businessesAnalyzed": 15,
    "insightsCreated": 3,
    "durationMs": 2450
  }
}
```

---

## DSPy Optimizer Types

### DspyOptimizerPayload
Payload sent to `finanseal-dspy-optimizer` Lambda.

```typescript
interface DspyOptimizerPayload {
  module: 'fee' | 'bank-recon' | 'po-match' | 'ar-match' | 'chat-agent-rag';
  force?: boolean; // Skip minimum correction check (default: false)
}
```

**Module mapping:**

| JobModule | DSPy Optimizer Module |
|-----------|----------------------|
| `dspy-fee` | `fee` |
| `dspy-bank-recon` | `bank-recon` |
| `dspy-po-match` | `po-match` |
| `dspy-ar-match` | `ar-match` |
| `chat-agent-optimization` | `chat-agent-rag` |

### DspyOptimizerResponse
Response from `finanseal-dspy-optimizer` Lambda.

```typescript
interface DspyOptimizerResponse {
  readyToOptimize: boolean; // True if training ran
  correctionsCount?: number; // Number of corrections used
  optimizationRun?: boolean; // True if model was updated
  reason?: string; // Human-readable status message
  durationMs?: number; // Training duration
}
```

**Example (insufficient corrections):**
```json
{
  "readyToOptimize": false,
  "correctionsCount": 8,
  "reason": "Need 20 corrections minimum, got 8"
}
```

**Example (training succeeded):**
```json
{
  "readyToOptimize": true,
  "correctionsCount": 45,
  "optimizationRun": true,
  "reason": "Model optimized with 45 corrections",
  "durationMs": 12400
}
```

---

## Environment Variables

### Lambda Environment
```typescript
interface LambdaEnv {
  NODE_ENV: 'production';
  CONVEX_DEPLOYMENT_URL: string; // e.g., "https://kindhearted-lynx-129.convex.cloud"
  CONVEX_DEPLOYMENT_KEY_PARAM: string; // e.g., "/finanseal/convex-deployment-key"
  DSPY_OPTIMIZER_LAMBDA_ARN: string; // ARN of finanseal-dspy-optimizer
}
```

**Deployment key retrieval:**
```typescript
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({ region: 'us-west-2' });
const result = await ssm.send(
  new GetParameterCommand({
    Name: process.env.CONVEX_DEPLOYMENT_KEY_PARAM,
    WithDecryption: true,
  })
);
const deploymentKey = result.Parameter!.Value!;
```

---

## CDK Resource Types

### ScheduledJob
Configuration for each EventBridge rule.

```typescript
interface ScheduledJob {
  module: JobModule; // Module identifier
  schedule: string; // EventBridge cron expression
  description: string; // Human-readable description
}
```

**Example:**
```typescript
{
  module: 'proactive-analysis',
  schedule: 'cron(0 4 * * ? *)',
  description: 'Daily proactive business insights analysis'
}
```

---

## State Transitions

### Job Lifecycle
```
EventBridge Scheduled Event
  ↓
Lambda Handler (index.ts)
  ↓ dispatch by module
Module Function (e.g., runProactiveAnalysis)
  ↓ HTTP POST
Convex Action (e.g., functions/actionCenterJobs:runProactiveAnalysis)
  ↓ business logic in Convex
Convex Response (JSON)
  ↓ map to JobResult
Lambda Handler (return JobResult)
  ↓ on error
Dead Letter Queue (SQS)
```

### Error Flow
```
Module Function throws exception
  ↓
Handler catches, returns JobResult with status='error'
  ↓
Lambda completes (not a Lambda-level failure)
  ↓
EventBridge sees 200 OK (no retry)

OR (if Lambda crashes)

Lambda times out or throws unhandled error
  ↓
EventBridge retries (2 attempts)
  ↓
All retries fail
  ↓
Event sent to DLQ
  ↓
CloudWatch alarm fires (DLQ depth > 5)
  ↓
SNS email sent
```

---

## Validation Rules

### EventBridgeEvent Validation
```typescript
function validateEvent(event: unknown): event is EventBridgeEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'detail' in event &&
    typeof event.detail === 'object' &&
    event.detail !== null &&
    'module' in event.detail &&
    typeof event.detail.module === 'string'
  );
}
```

### JobModule Validation
```typescript
const VALID_MODULES: JobModule[] = [
  'proactive-analysis',
  'ai-discovery',
  'notification-digest',
  'einvoice-monitoring',
  'ai-daily-digest',
  'dspy-fee',
  'dspy-bank-recon',
  'dspy-po-match',
  'dspy-ar-match',
  'chat-agent-optimization',
  'einvoice-dspy-digest',
  'weekly-email-digest',
  'scheduled-reports',
];

function isValidModule(module: string): module is JobModule {
  return VALID_MODULES.includes(module as JobModule);
}
```

---

## Summary

**Key Types:**
- `EventBridgeEvent` — EventBridge payload to Lambda
- `JobModule` — Enum of 13 supported modules
- `JobResult` — Standardized return type
- `ConvexActionRequest/Response` — Convex HTTP API shapes
- `DspyOptimizerPayload/Response` — Python Lambda invocation

**Key Patterns:**
- All modules return `Omit<JobResult, 'durationMs'>` (handler adds duration)
- Errors are caught and returned as `status: 'error'` (not thrown)
- Convex actions return varying shapes — modules map to standardized `JobResult`
- DSPy modules invoke Python Lambda instead of Convex action
