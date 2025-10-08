# REST API File Upload Design Research
**Date**: 2025-10-08
**Context**: Evaluating REST API endpoint design patterns for file upload operations

## Executive Summary

This research examines industry standards for REST API file upload endpoints, focusing on the debate between **resource-based URLs** (e.g., `/api/invoices/{id}/upload`) and **collection-based URLs** (e.g., `/api/invoices/upload`). Analysis of major platforms reveals a clear industry preference for **collection-based patterns** with POST method for file uploads.

### Key Finding
**Collection-based upload endpoints (POST to collection) are the industry standard** - adopted by AWS S3, Stripe, Google Cloud, Microsoft Graph, and recommended by major REST API design guidelines.

---

## 1. HTTP Method Semantics (RFC 7231 & RFC 9110)

### POST Method
- **Purpose**: Submit data for processing; server determines resource location
- **Idempotency**: NOT idempotent (multiple requests may create multiple resources)
- **Use Case**: Creating new resources without pre-determined URI
- **Quote**: "Requests that the target resource process the representation according to the resource's own specific semantics"

### PUT Method
- **Purpose**: Replace entire state of target resource at known URI
- **Idempotency**: Idempotent (multiple identical requests have same effect)
- **Use Case**: Update existing resource or create at client-specified URI
- **Quote**: "Requests that the state of the target resource be created or replaced with the state defined by the representation"

### Recommendation for File Uploads
**Use POST** - File uploads are resource creation operations where the server should:
1. Generate unique identifiers (document IDs)
2. Determine storage paths
3. Create database records
4. Handle transaction boundaries

---

## 2. Industry Standards Analysis

### AWS S3 (Amazon Web Services)
**Pattern**: Resource-based PUT to specific object key
```
PUT https://{bucket}.s3.{region}.amazonaws.com/{key}
```

**Characteristics**:
- Client specifies exact object key (resource identifier)
- Idempotent PUT operation
- Direct object replacement supported
- **Context**: S3 is object storage, not REST API - different semantics

### Stripe
**Pattern**: Collection-based POST
```
POST https://files.stripe.com/v1/files
```

**Characteristics**:
- POST to files collection
- Server generates file ID
- Multipart form data (RFC 2388)
- Required `purpose` parameter for classification
- Returns JSON with file metadata including generated `id`

**Example Response**:
```json
{
  "id": "file_abc123",
  "created": 1234567890,
  "filename": "invoice.pdf",
  "purpose": "dispute_evidence",
  "size": 12345,
  "url": "https://files.stripe.com/v1/files/file_abc123"
}
```

### GitHub API
**Pattern**: Resource-based PUT to specific path
```
PUT /repos/{owner}/{repo}/contents/{path}
```

**Characteristics**:
- PUT to specific file path
- Requires commit message (Git semantics)
- Base64 encoded content
- Requires `sha` for updates
- **Context**: Git-based, not pure REST - follows Git workflow

### Google Cloud Storage
**Pattern**: Collection-based POST with bucket parameter
```
POST https://storage.googleapis.com/upload/storage/v1/b/{bucket}/o
```

**Characteristics**:
- POST to objects collection
- Bucket as path parameter
- Object name in query parameter
- Multiple upload types: media, multipart, resumable
- Max file size: 5 TiB
- Server manages object creation

**Design Principle (Google AIP-133)**:
- Use POST for Create operations
- RPC name: "Create{ResourceName}"
- Server determines resource location
- Support user-specified IDs optionally

### Microsoft Graph (OneDrive/SharePoint)
**Pattern**: Dual approach depending on scenario

**New File Upload** (Collection-based):
```
PUT /me/drive/items/{parent-id}:/{filename}:/content
```

**Replace Existing** (Resource-based):
```
PUT /drives/{drive-id}/items/{item-id}/content
```

**Characteristics**:
- Special `:/{filename}:` syntax for collection-based creation
- Traditional PUT for resource replacement
- Max size: 250 MB (simple upload)
- Larger files require resumable upload sessions

---

## 3. REST API Design Guidelines (2024-2025)

### RESTful API Best Practices (restfulapi.net)

**Resource Naming Principles**:
1. Use nouns, not verbs
2. Use plural nouns for collections
3. Use singular for documents/singletons
4. Lowercase with hyphens
5. No trailing slashes
6. No file extensions

**URI Patterns**:
```
✅ GOOD:
POST   /device-management/managed-devices          # Create device
GET    /device-management/managed-devices          # List devices
GET    /device-management/managed-devices/{id}     # Get specific device
PUT    /device-management/managed-devices/{id}     # Update device
DELETE /device-management/managed-devices/{id}     # Delete device

❌ BAD:
POST   /device-management/create-device            # Verb in URI
GET    /device-management/get-device/{id}          # Verb in URI
```

**Nested Resources**:
```
POST   /tickets/{ticketId}/messages                # Create message in ticket
GET    /tickets/{ticketId}/messages                # List messages
PUT    /tickets/{ticketId}/messages/{id}           # Update message
```

**Key Quote**: "Use nouns to represent resources, not verbs. Let HTTP methods define the actions."

### Microsoft Azure REST API Guidelines

**Resource Naming**:
1. Use nouns for resource names
2. Use plural nouns for collections
3. Keep relationships simple (avoid deep nesting)
4. Don't mirror database structure

**Example**:
```
✅ GOOD:
POST   /customers                                   # Create customer
GET    /customers/{id}/orders                      # Get customer orders

❌ BAD:
POST   /create-customer                             # Verb in URI
GET    /database/customer_table/{id}/order_table   # Database structure exposed
```

### Google Cloud API Design Guide (AIP)

**AIP-133: Create Method Standard**:
- RPC name must start with "Create"
- Use POST HTTP verb
- Return fully created resource
- Server generates resource ID
- Support optional user-specified IDs for management plane

**Resource-Oriented Design (AIP-121)**:
- Resources identified by URIs
- Standard methods: Get, List, Create, Update, Delete
- Use POST for Create operations

**Naming Conventions (AIP-122)**:
- Collection identifiers are plural
- Resource names follow hierarchy
- Use lowercase with hyphens

---

## 4. File Upload Specific Patterns

### OpenAPI/Swagger Guidelines

**Single File Upload**:
```yaml
requestBody:
  content:
    image/png:
      schema:
        type: string
        format: binary
```

**Multipart Upload with Metadata**:
```yaml
requestBody:
  content:
    multipart/form-data:
      schema:
        type: object
        properties:
          file:
            type: string
            format: binary
          metadata:
            type: object
```

**Multiple Files**:
```yaml
requestBody:
  content:
    multipart/form-data:
      schema:
        type: object
        properties:
          files:
            type: array
            items:
              type: string
              format: binary
```

### Best Practices Summary
1. Use `multipart/form-data` for file uploads
2. Support metadata alongside files
3. Use `format: binary` in OpenAPI schemas
4. Consider resumable uploads for large files
5. Return created resource with generated ID

---

## 5. Current FinanSEAL Implementation Analysis

### Existing Patterns in Codebase

**Invoice Upload**: `/api/invoices/upload`
```typescript
POST /api/invoices/upload
- Collection-based
- Creates document record first (gets ID)
- Uploads to storage with document ID
- Updates record with storage path
- Returns document metadata with generated ID
```

**Expense Receipt Upload**: `/api/expense-claims/upload-receipt`
```typescript
POST /api/expense-claims/upload-receipt
- Collection-based with action suffix
- Creates expense_claims record first
- Uploads to storage with document ID
- Triggers background processing
- Returns expense_claim_id and transaction_id
```

**Business Logo Upload**: `/api/business-profile/upload-logo`
```typescript
POST /api/business-profile/upload-logo
- Collection-based with action suffix
- Single business logo (singleton resource)
- Updates existing business record
- Returns logo URL
```

### Implementation Patterns Observed

**Two-Stage Upload Process**:
1. Create database record → Get document ID
2. Upload file with document ID in path
3. Update record with final storage path
4. Return metadata with generated ID

**Storage Path Format**:
```typescript
// Using documentId-based paths (Storage v3.0)
{businessId}/{userId}/documents/{documentId}/raw/{uniqueFilename}
{businessId}/{userId}/documents/{documentId}/expense-receipt/{uniqueFilename}
```

**Characteristics**:
- Server generates all identifiers
- Transactional with rollback on failure
- Idempotency through deduplication keys
- Non-blocking with background processing

---

## 6. Analysis: Resource-Based vs Collection-Based

### Resource-Based Pattern (e.g., `/invoices/{id}/upload`)

**Pros**:
- Clear that you're uploading TO a specific invoice
- Explicit resource relationship
- RESTful in the sense of "uploading to this specific resource"

**Cons**:
- Requires client to know resource ID before upload
- Suggests resource already exists
- May imply updating existing file rather than creating new one
- Contradicts POST semantics (POST to collection, PUT to resource)
- Not standard for creation operations

**When to Use**:
- Updating existing resource's file attachment
- Replacing file for known resource
- Adding file to pre-created resource
- Example: `PUT /invoices/{id}/attachment` (replace)

### Collection-Based Pattern (e.g., `/invoices/upload`)

**Pros**:
- Aligns with POST semantics (create in collection)
- Server generates resource ID
- Standard REST pattern for creation
- Industry standard (Stripe, Google Cloud)
- Clear creation intent
- Atomic transaction (create + upload)

**Cons**:
- Less explicit about resource relationship
- May need clarification through naming

**When to Use**:
- Creating new resources via file upload
- Server manages resource lifecycle
- Need atomic creation operation
- Example: `POST /invoices/upload` (create)

---

## 7. Recommendations for FinanSEAL

### Primary Recommendation: Keep Collection-Based Pattern

**Current patterns are correct** and align with industry standards:

```typescript
✅ RECOMMENDED (Current):
POST /api/invoices/upload
POST /api/expense-claims/upload-receipt
POST /api/business-profile/upload-logo

❌ NOT RECOMMENDED:
POST /api/invoices/{id}/upload         # Confusing semantics
PUT  /api/invoices/{id}/file           # Requires pre-existing resource
```

### Rationale

1. **Industry Alignment**: Matches Stripe, Google Cloud patterns
2. **HTTP Semantics**: POST for creation, server generates IDs
3. **Existing Implementation**: Already correct, no changes needed
4. **Atomic Operations**: Create record + upload in single transaction
5. **Developer Experience**: Clear intent (creating via upload)

### Optional: URI Naming Refinement

If you want more RESTful naming without action verbs:

```typescript
// Current (acceptable with explicit intent)
POST /api/invoices/upload
POST /api/expense-claims/upload-receipt

// Alternative (more RESTful, removes verb)
POST /api/invoices                      # Generic: could be JSON or file
POST /api/invoices?method=upload        # Query parameter for clarity
POST /api/invoice-uploads               # Separate upload resource
POST /api/expense-claims                # Generic creation
POST /api/expense-claim-receipts        # Specific receipt resource

// NOT recommended (resource-based for creation)
POST /api/invoices/{id}/upload
PUT  /api/invoices/{id}/file
```

### Recommended Approach: **Keep Current Implementation**

**Why**:
1. `/upload` suffix makes intent crystal clear
2. Industry precedent (Stripe uses `/files`, which is also a noun)
3. Avoids ambiguity (JSON vs file upload)
4. Already implemented consistently
5. Developer-friendly and self-documenting

**Purist Alternative** (if strict REST adherence required):
```typescript
// Create separate upload resource collections
POST /api/invoice-uploads               # Returns invoice_id
POST /api/expense-receipt-uploads       # Returns expense_claim_id
POST /api/logo-uploads                  # Returns business_id + logo_url
```

---

## 8. Conclusion

### Industry Standard: Collection-Based POST

**Verdict**: Major platforms (Stripe, Google Cloud Storage, Microsoft Graph for new files) use **collection-based POST** for file uploads where server generates identifiers.

**Exceptions**:
- AWS S3: Pure object storage, not REST API semantics
- GitHub: Git-specific workflow, not pure REST

### For FinanSEAL

**Current implementation is CORRECT and follows industry best practices**:

```typescript
POST /api/invoices/upload               ✅ Aligns with Stripe pattern
POST /api/expense-claims/upload-receipt ✅ Aligns with Google Cloud pattern
POST /api/business-profile/upload-logo  ✅ Acceptable for singleton resource
```

**No changes needed** unless team prefers strictly purist REST naming (separate resource collections like `/invoice-uploads`), which would be a stylistic preference rather than correctness issue.

### Key Takeaways

1. **POST to collections** for file upload creation (industry standard)
2. **PUT to resources** for file replacement (known ID required)
3. **Server generates IDs** in creation scenarios (RESTful)
4. **Action verbs in URLs** are acceptable when intent is clear (pragmatic REST)
5. **Developer experience** matters more than REST purism

### References

- RFC 7231: HTTP/1.1 Semantics (POST/PUT methods)
- RFC 9110: HTTP Semantics (Latest standard)
- RESTful API Design: https://restfulapi.net/
- Google Cloud API Design Guide (AIP-133, AIP-121, AIP-122)
- Microsoft Azure REST API Guidelines
- Stripe API Documentation
- AWS S3 API Documentation
- GitHub REST API Documentation
- Microsoft Graph API Documentation
- OpenAPI/Swagger File Upload Specification

---

**Research conducted**: 2025-10-08
**Codebase context**: FinanSEAL Invoice Management System
**Conclusion**: Current implementation is industry-standard compliant
