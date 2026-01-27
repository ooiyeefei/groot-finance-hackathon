# AWS Lambda Document Processing

## Architecture

```
Vercel API → AWS OIDC Auth → Lambda Function (Python 3.11)
                                    │
                                    ├── Step 1: convert-pdf (Poppler in Layer)
                                    ├── Step 2: validate-document (Gemini)
                                    ├── Step 3: extract-data (DSPy + Gemini)
                                    └── Step 4: update-convex (HTTP API)
```

## Lambda Resources

| Property | Value |
|----------|-------|
| **Function ARN** | `arn:aws:lambda:us-west-2:837224017779:function:finanseal-document-processor` |
| **Memory** | 1024 MB |
| **Timeout** | 15 minutes |
| **Runtime** | Python 3.11 |

## Key Files

| Path | Purpose |
|------|---------|
| `src/lambda/document-processor-python/` | Python Lambda handler and steps |
| `infra/` | AWS CDK infrastructure (Lambda, Layer, IAM, CloudWatch) |
| `src/lambda/layers/python-document-processor/` | Docker-based Python Layer |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL |
| `GEMINI_API_KEY` | Google Gemini API key for DSPy |
| `S3_BUCKET_NAME` | S3 bucket (finanseal-bucket) |
| `SENTRY_DSN` | Sentry error tracking |

## Invocation Pattern

1. **API Routes**: Use `@aws-sdk/client-lambda` with OIDC authentication
2. **Auth**: Vercel OIDC provider → AWS IAM Role assumption
3. **Response**: Fire-and-forget async invocation (202 Accepted)

## Processing Workflow

1. **File Upload**: Client uploads PDF/images → AWS S3
2. **API Trigger**: Client calls `/api/documents/[documentId]/process`
3. **Non-blocking Response**: API returns 202 Accepted immediately
4. **Lambda Processing**: AWS Lambda processes document with Gemini AI
5. **Database Update**: Lambda updates Convex via HTTP API

## Deployment

Always use AWS CDK for infrastructure changes:

```bash
cd infra
npx cdk deploy --profile groot-finanseal --region us-west-2
```

**Never make ad-hoc CLI changes** - all infrastructure is version-controlled in CDK.

## Related Documentation

- [Two-Phase Extraction](./two-phase-extraction.md)
- [Architecture Overview](./overview.md)
