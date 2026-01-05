# Lambda Invocation Contracts

This directory contains TypeScript contracts defining the interface between the Vercel Next.js application and the AWS Lambda Durable Function.

## Files

| File | Description |
|------|-------------|
| `lambda-invocation.ts` | Core request/response schemas for Lambda invocation |

## Usage

### From Vercel API Routes

```typescript
import type {
  DocumentProcessingRequest,
  LambdaInvocationResponse,
} from '@/specs/004-lambda-durable-migration/contracts/lambda-invocation';

// Create payload
const payload: DocumentProcessingRequest = {
  documentId: invoice.id,
  domain: 'invoices',
  storagePath: invoice.storage_path,
  fileType: invoice.file_type === 'pdf' ? 'pdf' : 'image',
  userId: user.id,
  businessId: business.id,
  idempotencyKey: `invoice-${invoice.id}-${Date.now()}`,
};

// Invoke Lambda
const response = await invokeDocumentProcessor(payload);
```

### From Lambda Handler

```typescript
import {
  DocumentProcessingRequestSchema,
  type InvoiceExtractionResult,
} from './contracts/lambda-invocation';

export const handler = withDurableExecution(async (event, context) => {
  // Validate input
  const payload = DocumentProcessingRequestSchema.parse(event);

  // Process...
  const result: InvoiceExtractionResult = { ... };

  return { success: true, extractedData: result };
});
```

## Contract Evolution

When modifying contracts:

1. **Backwards Compatibility**: Add new optional fields, don't remove existing ones
2. **Version If Breaking**: Major changes require API versioning
3. **Update Both Sides**: Lambda handler and Vercel invoker must stay in sync
4. **Test With Zod**: Use schema validation to catch mismatches

## Related Documentation

- [Data Model](../data-model.md) - Complete entity definitions
- [Research](../research.md) - SDK patterns and invocation flow
- [Quickstart](../quickstart.md) - Local development setup
