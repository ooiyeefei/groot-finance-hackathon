# Convex HTTP API - Lambda Integration Guide

Documentation for calling Convex from external AWS Lambda functions using HTTP endpoints.

**Deployment URL**: `https://kindhearted-lynx-129.convex.cloud`

---

## Table of Contents

1. [HTTP Endpoints](#http-endpoints)
2. [Authentication](#authentication)
3. [Request/Response Format](#requestresponse-format)
4. [Error Handling](#error-handling)
5. [TypeScript Examples](#typescript-examples)
6. [Python Examples](#python-examples)
7. [Common Patterns](#common-patterns)
8. [Gotchas & Best Practices](#gotchas--best-practices)

---

## HTTP Endpoints

Convex exposes two primary HTTP endpoints for external access:

| Endpoint | Method | Use Case | Auth Required |
|----------|--------|----------|---------------|
| `/api/query` | POST | Read data (queries) | Public queries: No<br>Internal queries: Yes |
| `/api/mutation` | POST | Write data (mutations) | Yes (always) |

**Base URL**: `https://kindhearted-lynx-129.convex.cloud`

---

## Authentication

### Public Functions (No Auth)

Public queries exported with `query` can be called without authentication:

```typescript
// Convex function (public)
export const getInvoiceById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => { /* ... */ }
});
```

No `Authorization` header needed when calling from Lambda.

### Internal Functions (Auth Required)

Internal functions exported with `internalQuery`, `internalMutation`, or `internalAction` require a deployment key:

```typescript
// Convex function (internal)
export const internalUpdateStatus = internalMutation({
  args: { id: v.string(), status: v.string() },
  handler: async (ctx, args) => { /* ... */ }
});
```

**Authentication Header**:
```
Authorization: Bearer {CONVEX_DEPLOY_KEY}
```

The `CONVEX_DEPLOY_KEY` is stored in AWS SSM Parameter Store or passed as a Lambda environment variable.

### System Functions (Public but Trusted)

Functions in `convex/functions/system.ts` are exported as public `mutation` and `query` but designed for backend services. They use **implicit authorization** via document IDs (long random strings that only our backend knows).

**No authentication header required** for system functions — they are technically public, but secure by design.

---

## Request/Response Format

### Query Request

**Endpoint**: `POST /api/query`

**Payload**:
```json
{
  "path": "functions/system:getInvoiceById",
  "args": {
    "id": "abc123"
  },
  "format": "json"
}
```

**Success Response** (200 OK):
```json
{
  "status": "success",
  "value": {
    "_id": "abc123",
    "businessId": "biz456",
    "status": "pending",
    ...
  }
}
```

**Error Response** (200 OK with error status):
```json
{
  "status": "error",
  "errorMessage": "Invoice not found: abc123",
  "errorData": null
}
```

### Mutation Request

**Endpoint**: `POST /api/mutation`

**Payload**:
```json
{
  "path": "functions/system:updateInvoiceStatus",
  "args": {
    "id": "abc123",
    "status": "processing"
  },
  "format": "json"
}
```

**Success Response** (200 OK):
```json
{
  "status": "success",
  "value": "abc123"
}
```

**Error Response** (200 OK with error status):
```json
{
  "status": "error",
  "errorMessage": "Invoice not found: abc123",
  "errorData": null
}
```

---

## Error Handling

### HTTP-Level Errors

| Status Code | Meaning | Cause |
|-------------|---------|-------|
| 400 | Bad Request | Invalid JSON or missing required fields |
| 401 | Unauthorized | Missing or invalid `Authorization` header for internal function |
| 404 | Not Found | Function path does not exist |
| 500 | Internal Server Error | Convex deployment issue |

### Application-Level Errors

Even with HTTP 200, check `result.status`:

- `"success"` → Extract `result.value`
- `"error"` → Extract `result.errorMessage` and `result.errorData`

**Pattern**:
```typescript
const response = await fetch(`${CONVEX_URL}/api/query`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path, args, format: 'json' }),
});

// Check HTTP status
if (!response.ok) {
  const text = await response.text();
  throw new Error(`HTTP error: ${response.status} - ${text}`);
}

const result = await response.json();

// Check Convex status
if (result.status === 'error') {
  throw new Error(`Convex error: ${result.errorMessage}`);
}

return result.value;
```

---

## TypeScript Examples

### Basic Query (No Auth)

```typescript
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "";

async function convexQuery(
  functionPath: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: functionPath, args, format: "json" }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Convex query failed: ${response.status} ${text}`);
  }

  const result = await response.json();
  if (result.status === "error") {
    throw new Error(`Convex query error: ${result.errorMessage}`);
  }
  return result.value;
}

// Usage
const invoice = await convexQuery("functions/system:getInvoiceById", { id: "abc123" });
```

### Basic Mutation (No Auth - System Function)

```typescript
async function convexMutation(
  functionPath: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: functionPath, args, format: "json" }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Convex mutation failed: ${response.status} ${text}`);
  }

  const result = await response.json();
  if (result.status === "error") {
    throw new Error(`Convex mutation error: ${result.errorMessage}`);
  }
  return result.value;
}

// Usage
await convexMutation("functions/system:updateInvoiceStatus", {
  id: "abc123",
  status: "processing"
});
```

### Reusable Client Class (TypeScript)

```typescript
// src/lambda/shared/convex-client.ts

export class ConvexError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'ConvexError';
  }
}

export interface ConvexClientConfig {
  convexUrl: string;
  timeout?: number;
}

export class ConvexClient {
  private baseUrl: string;
  private timeout: number;

  constructor(config: ConvexClientConfig) {
    this.baseUrl = config.convexUrl.replace(/\/$/, '');
    this.timeout = config.timeout || 30000;
  }

  async query<T>(functionPath: string, args: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}/api/query`;
    const payload = {
      path: functionPath,
      args,
      format: 'json',
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new ConvexError(`HTTP error: ${response.status} - ${errorText.slice(0, 500)}`, 'HTTP_ERROR');
      }

      const result = await response.json();

      if (result.status === 'error') {
        throw new ConvexError(result.errorMessage || 'Unknown error', 'CONVEX_ERROR');
      }

      return result.value as T;
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ConvexError('Request timeout', 'TIMEOUT');
      }
      throw new ConvexError(`Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'REQUEST_FAILED');
    }
  }

  async mutation<T>(functionPath: string, args: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}/api/mutation`;
    const payload = {
      path: functionPath,
      args,
      format: 'json',
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new ConvexError(`HTTP error: ${response.status} - ${errorText.slice(0, 500)}`, 'HTTP_ERROR');
      }

      const result = await response.json();

      if (result.status === 'error') {
        throw new ConvexError(result.errorMessage || 'Unknown error', 'CONVEX_ERROR');
      }

      return result.value as T;
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ConvexError('Request timeout', 'TIMEOUT');
      }
      throw new ConvexError(`Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'REQUEST_FAILED');
    }
  }
}

// Singleton instance
let convexClient: ConvexClient | null = null;

export function getConvexClient(): ConvexClient {
  if (!convexClient) {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      throw new ConvexError('NEXT_PUBLIC_CONVEX_URL environment variable not set', 'CONFIG_ERROR');
    }
    convexClient = new ConvexClient({ convexUrl });
  }
  return convexClient;
}

// Usage in Lambda handler
import { getConvexClient } from './convex-client';

export async function handler(event: any) {
  const client = getConvexClient();

  const invoice = await client.query<Invoice>('functions/system:getInvoiceById', { id: 'abc123' });

  await client.mutation('functions/system:updateInvoiceStatus', {
    id: 'abc123',
    status: 'completed'
  });
}
```

**Existing Implementation**: `src/lambda/mcp-server/lib/convex-client.ts`

---

## Python Examples

### Basic Query (No Auth)

```python
import requests

CONVEX_URL = "https://kindhearted-lynx-129.convex.cloud"

def convex_query(function_path: str, args: dict) -> any:
    response = requests.post(
        f"{CONVEX_URL}/api/query",
        json={
            "path": function_path,
            "args": args,
            "format": "json"
        }
    )
    response.raise_for_status()
    result = response.json()

    if result.get("status") == "error":
        raise Exception(f"Convex query error: {result.get('errorMessage')}")

    return result.get("value")

# Usage
invoice = convex_query("functions/system:getInvoiceById", {"id": "abc123"})
```

### Basic Mutation (No Auth - System Function)

```python
def convex_mutation(function_path: str, args: dict) -> any:
    response = requests.post(
        f"{CONVEX_URL}/api/mutation",
        json={
            "path": function_path,
            "args": args,
            "format": "json"
        }
    )
    response.raise_for_status()
    result = response.json()

    if result.get("status") == "error":
        raise Exception(f"Convex mutation error: {result.get('errorMessage')}")

    return result.get("value")

# Usage
convex_mutation("functions/system:updateInvoiceStatus", {
    "id": "abc123",
    "status": "processing"
})
```

### Reusable Client Class (Python)

```python
# src/lambda/shared/convex_client.py

import httpx
from typing import Any, Dict, Optional

class ConvexError(Exception):
    """Error from Convex operations."""
    pass

class ConvexClient:
    """HTTP client for Convex system functions."""

    def __init__(self, convex_url: str, timeout: float = 30.0):
        """
        Initialize Convex client.

        Args:
            convex_url: Convex deployment URL (e.g., https://xxx.convex.cloud)
            timeout: Request timeout in seconds
        """
        self.base_url = convex_url.rstrip("/")
        self.timeout = timeout
        self._client = httpx.Client(timeout=timeout)

    def _query(self, function_path: str, args: Dict[str, Any]) -> Any:
        """
        Call a Convex query.

        Args:
            function_path: Full function path (e.g., "functions/system:getInvoiceById")
            args: Arguments to pass to the query

        Returns:
            Query result
        """
        url = f"{self.base_url}/api/query"
        payload = {
            "path": function_path,
            "args": args,
            "format": "json",
        }

        try:
            response = self._client.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            result = response.json()

            if result.get("status") == "error":
                raise ConvexError(result.get("errorMessage", "Unknown error"))

            return result.get("value")

        except httpx.HTTPStatusError as e:
            raise ConvexError(f"HTTP error: {e.response.status_code} - {e.response.text}")
        except Exception as e:
            raise ConvexError(f"Request failed: {str(e)}")

    def _mutation(self, function_path: str, args: Dict[str, Any]) -> Any:
        """
        Call a Convex mutation.

        Args:
            function_path: Full function path (e.g., "functions/system:updateInvoiceStatus")
            args: Arguments to pass to the mutation

        Returns:
            Mutation result
        """
        url = f"{self.base_url}/api/mutation"
        payload = {
            "path": function_path,
            "args": args,
            "format": "json",
        }

        try:
            response = self._client.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            result = response.json()

            if result.get("status") == "error":
                error_msg = result.get("errorMessage", "Unknown error")
                error_data = result.get("errorData")
                full_error = f"{error_msg}"
                if error_data:
                    full_error += f" | Data: {error_data}"
                raise ConvexError(full_error)

            return result.get("value")

        except httpx.HTTPStatusError as e:
            raise ConvexError(f"HTTP error: {e.response.status_code} - {e.response.text[:500]}")
        except ConvexError:
            raise  # Re-raise ConvexError as-is
        except Exception as e:
            raise ConvexError(f"Request failed: {str(e)}")

    def close(self):
        """Close the HTTP client."""
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

# Usage in Lambda handler
import os

def lambda_handler(event, context):
    convex_url = os.environ['NEXT_PUBLIC_CONVEX_URL']

    with ConvexClient(convex_url) as client:
        invoice = client._query("functions/system:getInvoiceById", {"id": "abc123"})

        client._mutation("functions/system:updateInvoiceStatus", {
            "id": "abc123",
            "status": "completed"
        })
```

**Existing Implementation**: `src/lambda/document-processor-python/utils/convex_client.py`

---

## Common Patterns

### Pattern 1: Read → Process → Write

```typescript
// EventBridge → Lambda → Convex
export async function handler(event: EventBridgeEvent) {
  const client = getConvexClient();

  // 1. Read data from Convex
  const businesses = await client.query<Business[]>(
    'functions/system:getBusinessesForLhdnPolling',
    {}
  );

  // 2. Process data (call external API, compute results, etc.)
  for (const biz of businesses) {
    const result = await processBusinessLogic(biz);

    // 3. Write results back to Convex
    await client.mutation('functions/system:updateBusinessStatus', {
      businessId: biz.id,
      status: result.status
    });
  }
}
```

### Pattern 2: Batch Processing with Error Handling

```typescript
async function processBatch(items: string[]): Promise<void> {
  const client = getConvexClient();
  const results = [];

  for (const itemId of items) {
    try {
      const result = await client.mutation('functions/system:processItem', {
        id: itemId
      });
      results.push({ id: itemId, success: true });
    } catch (error) {
      console.error(`Failed to process ${itemId}:`, error);
      results.push({ id: itemId, success: false, error: error.message });
    }
  }

  return results;
}
```

### Pattern 3: Convex as Cache Layer

```typescript
// Lambda reads cached data from Convex, processes in Lambda, writes one result
async function analyzeWithCache(businessId: string): Promise<Report> {
  const client = getConvexClient();

  // Read ALL data from Convex in one query (avoid bandwidth from reactive subscriptions)
  const data = await client.query('functions/system:getBusinessDataForAnalysis', {
    businessId
  });

  // Process locally in Lambda (heavy computation)
  const report = await runComplexAnalysis(data);

  // Write one result back to Convex
  await client.mutation('functions/system:saveAnalysisReport', {
    businessId,
    report
  });

  return report;
}
```

---

## Gotchas & Best Practices

### 1. Function Path Format

**Correct**:
```typescript
"functions/system:getInvoiceById"
"functions/expenseClaims:internalUpdateStatus"
```

**Incorrect**:
```typescript
"system:getInvoiceById"  // Missing "functions/" prefix
"system.getInvoiceById"  // Wrong separator (use ":" not ".")
```

### 2. Environment Variable Naming

Always use `NEXT_PUBLIC_CONVEX_URL` for consistency:

```typescript
// Lambda CDK stack
environment: {
  NEXT_PUBLIC_CONVEX_URL: 'https://kindhearted-lynx-129.convex.cloud',
}
```

**Never hardcode** the URL in Lambda code — always read from environment variables.

### 3. Optional Arguments

Convex `v.optional()` fields **do not accept `null`** — omit the field entirely:

```typescript
// ❌ Wrong
await client.mutation('functions/system:updateInvoiceStatus', {
  id: 'abc123',
  status: 'failed',
  errorMessage: null  // Will fail if errorMessage is v.optional(v.string())
});

// ✅ Correct
const args: Record<string, unknown> = {
  id: 'abc123',
  status: 'failed'
};
if (errorMessage) {
  args.errorMessage = errorMessage;  // Only include if non-null
}
await client.mutation('functions/system:updateInvoiceStatus', args);
```

### 4. HTTP 200 with Error Status

Convex returns HTTP 200 even for application errors. **Always check `result.status`**:

```typescript
const result = await response.json();

// ❌ Wrong - assumes success
return result.value;

// ✅ Correct - checks status
if (result.status === 'error') {
  throw new Error(result.errorMessage);
}
return result.value;
```

### 5. Timeout Configuration

Set appropriate timeouts for Lambda → Convex calls:

```typescript
// Default: 30s
const client = new ConvexClient({
  convexUrl: CONVEX_URL,
  timeout: 30000  // 30 seconds
});

// For long-running queries (e.g., large data exports)
const client = new ConvexClient({
  convexUrl: CONVEX_URL,
  timeout: 60000  // 60 seconds
});
```

### 6. Bandwidth Optimization

**Use actions, not queries, for heavy aggregations** — see CLAUDE.md "Convex Bandwidth & Query Budget" section:

```typescript
// ❌ Expensive - reactive query re-reads on every change
await client.query('dashboardWidget:getMonthlyStats', { businessId });

// ✅ Optimized - action runs once on demand
await client.mutation('dashboardWidget:computeMonthlyStatsAction', { businessId });
```

### 7. System Functions vs Internal Functions

| Type | Export | Auth | Use Case |
|------|--------|------|----------|
| **System Functions** | `mutation` or `query` | No (implicit via document IDs) | Backend services (Trigger.dev, Lambda) |
| **Internal Functions** | `internalMutation` or `internalQuery` | Yes (`CONVEX_DEPLOY_KEY`) | Convex-to-Convex internal calls |

**System functions** (`convex/functions/system.ts`) are designed for external backends and don't require auth headers.

### 8. Error Context for Debugging

Always include context in error messages:

```typescript
try {
  await client.mutation('functions/system:updateInvoiceStatus', args);
} catch (error) {
  console.error(`Failed to update invoice ${invoiceId}:`, error);
  throw new Error(`Invoice update failed for ${invoiceId}: ${error.message}`);
}
```

### 9. IAM Permissions for Lambda

Lambda execution role needs **no special IAM permissions** to call Convex HTTP API — it's a public HTTPS endpoint. Only S3, SSM, and other AWS resource permissions are needed.

### 10. CDK Environment Variable Updates

When updating Lambda environment variables in CDK:

1. Update `lambdaEnvVars` object in CDK stack
2. Run `npx cdk deploy` — CDK auto-creates a new Lambda version
3. The `prod` alias automatically points to the new version

**No manual version management needed** — `currentVersion` handles it.

---

## Reference Implementations

| Language | File | Use Case |
|----------|------|----------|
| TypeScript | `src/lambda/mcp-server/lib/convex-client.ts` | MCP server (full client class with timeout) |
| TypeScript | `src/lambda/lhdn-polling/handler.ts` | LHDN polling (inline query/mutation helpers) |
| TypeScript | `src/lambda/einvoice-email-processor/handler.ts` | Email processing (inline helpers) |
| Python | `src/lambda/document-processor-python/utils/convex_client.py` | Document processor (full client class) |

---

## FAQ

**Q: Do I need a deployment key to call Convex from Lambda?**

A: No, if you're calling **system functions** (exported as public `mutation`/`query` in `convex/functions/system.ts`). Yes, if you're calling **internal functions** (exported with `internalMutation`/`internalQuery`).

**Q: Can I use the Convex Node.js SDK in Lambda?**

A: No. The Convex SDK requires WebSocket connections and reactive subscriptions, which don't work in Lambda's stateless execution model. Use the HTTP API instead.

**Q: How do I handle rate limits?**

A: Convex HTTP API has generous rate limits for backend services. If you hit limits, implement exponential backoff with retry logic.

**Q: Can I call Convex from EventBridge directly?**

A: No. EventBridge can only invoke Lambda, SNS, SQS, or Step Functions. Use **EventBridge → Lambda → Convex HTTP API** pattern.

**Q: What's the max payload size?**

A: Convex HTTP API supports payloads up to **~6 MB** (Lambda's default payload limit). For larger data (e.g., document processing), store in S3 and pass S3 keys to Convex.

**Q: How do I debug Convex HTTP API calls?**

A: Enable CloudWatch Logs for your Lambda function. Log the full request payload and response for debugging:

```typescript
console.log('Convex request:', { path, args });
const result = await client.query(path, args);
console.log('Convex response:', result);
```

---

## Next Steps

For EventBridge → Lambda → Convex migration:

1. **Copy existing Lambda pattern** (lhdn-polling or mcp-server) as template
2. **Add ConvexClient** helper class to Lambda project
3. **Update CDK stack** with `NEXT_PUBLIC_CONVEX_URL` environment variable
4. **Call system functions** via HTTP API (no auth needed)
5. **Test locally** with `sam local invoke` or direct Lambda invocation
6. **Deploy with CDK** — auto-versioning handles deployment

See issue #353 for EventBridge migration plan.
