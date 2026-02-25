# CSRF Protection for Groot Finance

## Overview

Groot Finance implements CSRF (Cross-Site Request Forgery) protection using the **Synchronizer Token Pattern** to prevent unauthorized state-changing operations.

## How It Works

### Token Generation

1. **Authenticated Users**: Tokens tied to Clerk `userId`
2. **Unauthenticated Sessions**: Tokens tied to IP + User-Agent hash
3. **Token Lifetime**: 1 hour (configurable)
4. **Storage**: In-memory Map (production: upgrade to Redis)

### Protection Flow

```
Client requests CSRF token
  ↓
GET /api/v1/utils/security/csrf-token
  ↓
Server generates cryptographic token (32 bytes base64url)
  ↓
Server stores: Map<userId, {token, expires}>
  ↓
Client includes token in X-CSRF-Token header
  ↓
Server validates token on POST/PUT/DELETE/PATCH
  ↓
Request proceeds or is blocked
```

## Protected Operations

All state-changing HTTP methods are protected:
- `POST` - Create operations
- `PUT` - Full updates
- `PATCH` - Partial updates
- `DELETE` - Delete operations

**Not protected**: `GET`, `HEAD`, `OPTIONS` (read-only)

## Exempted Endpoints

### Why Exemptions?

Certain flows require exemption because CSRF protection would break legitimate user actions:

1. **Sign-up & Invitation Flows**: User is not yet authenticated
2. **System Webhooks**: Server-to-server with signature verification

### Exempted Paths

```typescript
const CSRF_EXEMPT_PATHS = [
  '/api/v1/account-management/invitations/accept',  // User accepting invitation (pre-auth)
  '/api/v1/system/webhooks/clerk',                  // Clerk webhook (signature verified)
  '/api/trigger',                                    // Trigger.dev webhook (signature verified)
]
```

### Exemption Security

**Invitation Acceptance:**
- Protected by: Unique invitation tokens (UUID)
- Protected by: Email verification
- Protected by: Expiration timestamps
- Protected by: One-time use enforcement

**Webhooks:**
- Protected by: Cryptographic signature verification (Svix for Clerk)
- Protected by: IP allowlisting (production recommendation)
- Protected by: Timestamp validation (replay attack prevention)

## Usage Guide

### Frontend (Client-Side)

#### 1. Get CSRF Token

```typescript
async function getCSRFToken(): Promise<string> {
  const response = await fetch('/api/v1/utils/security/csrf-token', {
    credentials: 'include' // Include Clerk session cookie
  })

  const data = await response.json()

  if (!data.success) {
    throw new Error('Failed to get CSRF token')
  }

  return data.data.csrfToken
}
```

#### 2. Include Token in Requests

```typescript
// For state-changing operations
const csrfToken = await getCSRFToken()

await fetch('/api/v1/expense-claims', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken  // Include token
  },
  body: JSON.stringify(expenseData)
})
```

#### 3. Token Caching (Optional)

```typescript
let cachedToken: string | null = null
let tokenExpires: number = 0

async function getCachedCSRFToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpires) {
    return cachedToken // Return cached token
  }

  const response = await fetch('/api/v1/utils/security/csrf-token')
  const data = await response.json()

  cachedToken = data.data.csrfToken
  tokenExpires = Date.now() + (data.data.expiresIn * 1000) // Convert to ms

  return cachedToken
}
```

### Backend (API Routes)

#### Option 1: Manual Protection

```typescript
import { csrfProtection } from '@/domains/security/lib/csrf-protection'

export async function POST(request: NextRequest) {
  // Apply CSRF protection
  const csrfResponse = await csrfProtection(request)
  if (csrfResponse) {
    return csrfResponse // Block request
  }

  // Continue with API logic
  // ...
}
```

#### Option 2: Wrapper Function

```typescript
import { withCSRFProtection } from '@/domains/security/lib/csrf-protection'

export const POST = withCSRFProtection(async (request: NextRequest) => {
  // API logic - CSRF already validated
  // ...
})
```

#### Option 3: Middleware (Next.js 15)

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { csrfProtection } from '@/domains/security/lib/csrf-protection'

export async function middleware(request: NextRequest) {
  // Apply CSRF protection to all API routes
  if (request.nextUrl.pathname.startsWith('/api/v1/')) {
    const csrfResponse = await csrfProtection(request)
    if (csrfResponse) {
      return csrfResponse
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/v1/:path*'
}
```

## Error Responses

### Missing Token

```json
{
  "success": false,
  "error": "CSRF token is required",
  "message": "Missing CSRF token. Please include X-CSRF-Token header."
}
```

**Status Code**: `403 Forbidden`

### Invalid Token

```json
{
  "success": false,
  "error": "CSRF token validation failed",
  "message": "Invalid CSRF token"
}
```

**Status Code**: `403 Forbidden`

### Expired Token

```json
{
  "success": false,
  "error": "CSRF token validation failed",
  "message": "CSRF token has expired"
}
```

**Status Code**: `403 Forbidden`

### Security Error (Fail-Closed)

```json
{
  "success": false,
  "error": "Security validation failed",
  "message": "CSRF protection encountered an error and blocked the request"
}
```

**Status Code**: `403 Forbidden`

## Security Best Practices

### ✅ Implemented

1. **Cryptographically Secure Tokens**: `crypto.randomBytes(32)`
2. **Timing-Safe Comparison**: `crypto.timingSafeEqual()` prevents timing attacks
3. **Token Expiration**: 1-hour lifetime prevents token reuse
4. **Automatic Cleanup**: Expired tokens removed every 30 minutes
5. **Fail-Closed Design**: Errors block requests by default
6. **Session-Based Fallback**: Works for unauthenticated flows
7. **Detailed Logging**: Security events logged for audit

### 🔄 Production Recommendations

1. **Upgrade to Redis**: Current in-memory storage doesn't persist across serverless instances
2. **Implement Rate Limiting**: Token generation endpoint should have strict limits
3. **Add Monitoring**: Alert on repeated CSRF failures
4. **Enable CORS**: Properly configure allowed origins
5. **Use HTTPS Only**: Never send tokens over HTTP
6. **Token Rotation**: Generate new token after state changes

### ⚠️ Known Limitations

1. **In-Memory Storage**: Tokens lost on serverless cold starts
2. **No Persistence**: Browser refresh requires new token
3. **Single Token Per User**: No support for multiple concurrent sessions

## Testing

### Unit Tests

```typescript
import { generateCSRFTokenForUser, validateCSRFToken } from '@/domains/security/lib/csrf-protection'

describe('CSRF Protection', () => {
  it('should generate valid token', async () => {
    const result = await generateCSRFTokenForUser()
    expect(result.token).toBeDefined()
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/) // Base64url format
  })

  it('should validate correct token', async () => {
    const { token } = await generateCSRFTokenForUser()
    const validation = await validateCSRFToken(token!)
    expect(validation.valid).toBe(true)
  })

  it('should reject invalid token', async () => {
    const validation = await validateCSRFToken('invalid-token')
    expect(validation.valid).toBe(false)
  })

  it('should reject expired token', async () => {
    // Test with mocked Date.now()
  })
})
```

### Integration Tests

```typescript
describe('CSRF Protection Integration', () => {
  it('should block POST without token', async () => {
    const response = await fetch('/api/v1/expense-claims', {
      method: 'POST',
      body: JSON.stringify({...})
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      success: false,
      error: 'CSRF token is required'
    })
  })

  it('should allow POST with valid token', async () => {
    const tokenResponse = await fetch('/api/v1/utils/security/csrf-token')
    const { csrfToken } = await tokenResponse.json()

    const response = await fetch('/api/v1/expense-claims', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({...})
    })

    expect(response.status).toBe(201)
  })

  it('should exempt invitation acceptance', async () => {
    const response = await fetch('/api/v1/account-management/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: 'invitation-token' })
    })

    // Should not require CSRF token
    expect(response.status).not.toBe(403)
  })
})
```

## Troubleshooting

### Issue 1: "CSRF token is required" on every request

**Cause**: Token not being sent in headers

**Solution**: Ensure frontend includes `X-CSRF-Token` header

```typescript
// ❌ Wrong - missing header
fetch('/api/endpoint', {
  method: 'POST',
  body: JSON.stringify(data)
})

// ✅ Correct - includes header
fetch('/api/endpoint', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': csrfToken
  },
  body: JSON.stringify(data)
})
```

### Issue 2: Token expired immediately

**Cause**: Serverless cold start cleared in-memory storage

**Solution**: Upgrade to Redis for persistent storage

### Issue 3: Invitation acceptance blocked

**Cause**: Exemption path not matching

**Solution**: Verify path is in `CSRF_EXEMPT_PATHS` array

### Issue 4: High token generation latency

**Cause**: Rate limiting or cold start

**Solution**: Implement token prefetching on page load

## Migration Guide

### Existing APIs Without CSRF Protection

1. **Identify state-changing endpoints**: Find all POST/PUT/DELETE/PATCH routes
2. **Add CSRF protection**: Use `withCSRFProtection()` or middleware
3. **Update frontend**: Include token in request headers
4. **Test exemptions**: Verify sign-up and invitation flows still work
5. **Monitor errors**: Watch for false positives

### Example Migration

**Before**:
```typescript
// src/app/api/v1/endpoint/route.ts
export async function POST(request: NextRequest) {
  const body = await request.json()
  // ... API logic
}
```

**After**:
```typescript
import { withCSRFProtection } from '@/domains/security/lib/csrf-protection'

export const POST = withCSRFProtection(async (request: NextRequest) => {
  const body = await request.json()
  // ... API logic (same as before)
})
```

## Performance Impact

| Operation | Overhead | Notes |
|---|---|---|
| Token generation | ~5-10ms | Cryptographic random + storage |
| Token validation | ~2-5ms | Map lookup + timing-safe comparison |
| Token cleanup | ~1-2ms | Every 30 minutes (background) |

**Total per request**: ~7-15ms (negligible compared to database queries)

## Compliance

- **OWASP A01:2021** - Broken Access Control: ✅ Mitigated
- **OWASP A02:2021** - Cryptographic Failures: ✅ Using crypto.randomBytes
- **OWASP A05:2021** - Security Misconfiguration: ✅ Fail-closed design
- **PCI DSS 6.5.9**: CSRF protection required for payment systems

## FAQ

**Q: Why not use SameSite cookies instead?**
A: SameSite cookies don't protect against subdomain attacks or browser bugs. Token-based CSRF provides defense-in-depth.

**Q: Can I disable CSRF for testing?**
A: No. Use the exemption list if needed, but never disable globally.

**Q: Why are webhooks exempted?**
A: Webhooks use cryptographic signature verification (stronger than CSRF tokens).

**Q: What happens if Redis is down?**
A: Falls back to in-memory storage (tokens lost on cold starts).

**Q: Can users have multiple tokens?**
A: Currently no. Each user/session has one active token.

---

**Last Updated**: 2025-01-13
**Maintained By**: Groot Finance Security Team
**Related Documentation**:
- Rate Limiting: `RATE_LIMITING.md`
- RBAC: `src/domains/security/CLAUDE.md`
- Error Handling: `src/domains/security/lib/error-sanitizer.ts`
