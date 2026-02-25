# Rate Limiting System

## Overview

Groot Finance implements a production-ready distributed rate limiting system using **Upstash Redis** with automatic fallback to in-memory storage when Redis is not configured.

### Features

- ✅ **Distributed Rate Limiting**: Works across serverless instances via Upstash Redis
- ✅ **Automatic Fallback**: Falls back to in-memory storage if Redis is unavailable
- ✅ **Sliding Window Algorithm**: Accurate rate limiting with minimal false positives
- ✅ **Combined Key Security**: Uses both User ID + IP address to prevent bypass attacks
- ✅ **Configurable Limits**: Per-endpoint rate limit configurations
- ✅ **Standard Headers**: Returns `X-RateLimit-*` and `Retry-After` headers
- ✅ **Fail-Closed**: Blocks requests on system errors for security

---

## Configuration

### Environment Variables

Add these to your `.env.local` file:

```bash
# Optional - Redis for distributed rate limiting (recommended for production)
UPSTASH_REDIS_REST_URL=your_upstash_redis_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_rest_token
```

**Get your free Upstash Redis credentials:**
1. Visit https://upstash.com/
2. Create a free account
3. Create a new Redis database
4. Copy REST URL and REST Token from the database console

**If not configured**: The system automatically falls back to in-memory rate limiting.

---

## Rate Limit Configurations

### Pre-Configured Limits

| Type | Window | Max Requests | Use Case |
|---|---|---|---|
| **ANONYMOUS** | 1 minute | 10 | Unauthenticated users |
| **AUTH** | 15 minutes | 5 | Login attempts |
| **QUERY** | 1 minute | 100 | Read operations (GET) |
| **MUTATION** | 1 minute | 30 | State-changing operations (POST/PUT/DELETE) |
| **EXPENSIVE** | 1 minute | 10 | Resource-intensive operations |
| **ADMIN** | 1 minute | 20 | Admin operations |
| **UPLOAD** | 1 hour | 10 | Document uploads |
| **CHAT** | 1 hour | 30 | AI chat messages |

---

## Usage

### Basic Usage in API Routes

```typescript
import { rateLimiters } from '@/domains/security/lib/rate-limit'

export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await rateLimiters.query(request)
  if (rateLimitResponse) return rateLimitResponse

  // Continue with API logic
  return NextResponse.json({ success: true, data: {...} })
}

export async function POST(request: NextRequest) {
  // Apply mutation rate limiting
  const rateLimitResponse = await rateLimiters.mutation(request)
  if (rateLimitResponse) return rateLimitResponse

  // Continue with API logic
  return NextResponse.json({ success: true })
}
```

### Available Pre-Configured Limiters

```typescript
rateLimiters.anonymous // Unauthenticated requests
rateLimiters.auth      // Authentication endpoints
rateLimiters.query     // Read operations
rateLimiters.mutation  // State-changing operations
rateLimiters.expensive // Resource-intensive operations
rateLimiters.admin     // Admin operations
rateLimiters.upload    // File uploads
rateLimiters.chat      // AI chat
```

### Custom Rate Limiter

```typescript
import { createRateLimiter } from '@/domains/security/lib/rate-limit'

const customLimiter = createRateLimiter({
  windowMs: 60 * 1000,  // 1 minute window
  maxRequests: 50       // 50 requests per minute
})

export async function GET(request: NextRequest) {
  const rateLimitResponse = await customLimiter(request)
  if (rateLimitResponse) return rateLimitResponse

  // Your API logic
}
```

### Business-Specific Rate Limiting

```typescript
import { createBusinessRateLimiter } from '@/domains/security/lib/rate-limit'

const businessLimiter = createBusinessRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100
})

// Rate limits are scoped to business context
// Users can have different limits across different businesses
```

### Custom Key Generator

```typescript
import { createRateLimiter } from '@/domains/security/lib/rate-limit'

const customLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyGenerator: async (request) => {
    const apiKey = request.headers.get('X-API-Key')
    return `ratelimit:api:${apiKey}`
  }
})
```

---

## Response Headers

When rate limit is exceeded, the response includes:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 45
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1746123456
Content-Type: application/json

{
  "success": false,
  "error": "Rate limit exceeded",
  "message": "Too many requests. Try again in 45 seconds.",
  "retryAfter": 45
}
```

**Header Explanations:**
- `Retry-After`: Seconds until rate limit resets
- `X-RateLimit-Limit`: Maximum requests allowed in window
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when window resets

---

## Security Features

### 1. Combined User ID + IP Key

Prevents rate limit bypass by switching between authenticated/unauthenticated requests:

```typescript
// Authenticated request
ratelimit:combined:user:abc123:ip:192.168.1.1

// Unauthenticated request from same IP
ratelimit:combined:ip:192.168.1.1
```

**Why**: Attackers can't bypass limits by logging out and making unauthenticated requests.

### 2. IP Address Validation

Validates IP addresses to prevent injection attacks:

```typescript
// Checks both IPv4 and IPv6 formats
// Falls back to 'unknown' for invalid IPs
```

### 3. Proxy Header Trust Order

Trusts proxy headers in order of reliability:
1. `X-Forwarded-For` (leftmost IP = original client)
2. `X-Real-IP`
3. `CF-Connecting-IP` (Cloudflare)

### 4. Fail-Closed Security

On system errors, blocks the request instead of allowing it:

```typescript
// ✅ CORRECT (fail-closed)
if (rateLimitError) {
  return 503 Service Unavailable
}

// ❌ WRONG (fail-open - security risk)
if (rateLimitError) {
  return allow() // Bypasses rate limiting!
}
```

---

## Architecture

### Redis-Based (Production)

```
Request
  ↓
Generate Key: ratelimit:combined:user:abc:ip:1.2.3.4
  ↓
Redis INCR key
  ├─→ Count = 1 → Set TTL (expire window)
  ├─→ Count ≤ Max → Allow request
  └─→ Count > Max → Block (429)
```

**Benefits:**
- ✅ Works across serverless instances
- ✅ Atomic increments (no race conditions)
- ✅ Automatic expiration via TTL
- ✅ Scales horizontally

### In-Memory Fallback (Development)

```
Request
  ↓
Generate Key
  ↓
Check Map<key, {count, resetTime}>
  ├─→ Expired → Reset counter
  ├─→ Count ≤ Max → Allow request
  └─→ Count > Max → Block (429)
```

**Limitations:**
- ⚠️ Per-instance only (not distributed)
- ⚠️ Lost on serverless cold starts
- ⚠️ Memory cleanup every 5 minutes

---

## Monitoring & Debugging

### Check Rate Limit Status

```bash
# Redis CLI (if using Upstash Redis)
redis-cli --tls -h your-redis-host.upstash.io -p 6379 -a your_token

# List all rate limit keys
KEYS ratelimit:*

# Check specific user's count
GET ratelimit:combined:user:abc123:ip:192.168.1.1:1746120000000

# Check TTL
TTL ratelimit:combined:user:abc123:ip:192.168.1.1:1746120000000
```

### Console Logs

```bash
# Redis initialization
[Rate Limit] ✅ Redis client initialized successfully (distributed mode)
[Rate Limit] ⚠️ Redis credentials not configured, using in-memory fallback

# Redis errors (automatic fallback)
[Rate Limit] Redis error, falling back to in-memory: [error details]

# System errors (fail-closed)
[Rate Limit] Error - BLOCKING REQUEST: [error details]
```

### Test Rate Limiting

```bash
# Test with curl (adjust URL and limits)
for i in {1..15}; do
  curl -i http://localhost:3000/api/v1/expense-claims \
    -H "Cookie: __session=your_session_token"
  echo "Request $i"
done

# Expected output:
# Requests 1-10: 200 OK
# Requests 11+: 429 Too Many Requests
```

---

## Best Practices

### 1. Choose Appropriate Limits

```typescript
// ✅ GOOD: Match limit to endpoint cost
rateLimiters.query    // Fast reads: 100/min
rateLimiters.mutation // Writes: 30/min
rateLimiters.expensive // OCR processing: 10/min

// ❌ BAD: Same limit for everything
rateLimiters.query    // 10/min is too strict for reads
```

### 2. Rate Limit Early

```typescript
// ✅ GOOD: Check rate limit before expensive operations
export async function POST(request: NextRequest) {
  const rateLimitResponse = await rateLimiters.mutation(request)
  if (rateLimitResponse) return rateLimitResponse

  // Now do expensive database query
  const result = await complexDatabaseOperation()
}

// ❌ BAD: Rate limit after expensive operation
export async function POST(request: NextRequest) {
  const result = await complexDatabaseOperation() // Wasted resources!

  const rateLimitResponse = await rateLimiters.mutation(request)
  if (rateLimitResponse) return rateLimitResponse
}
```

### 3. Use Business Scoping When Appropriate

```typescript
// ✅ GOOD: Business-specific limits for multi-tenant
const businessLimiter = createBusinessRateLimiter({...})

// Each business gets separate rate limits
// User in Business A: 100 requests/min
// Same user in Business B: 100 requests/min (separate counter)
```

### 4. Document Rate Limits

```typescript
/**
 * POST /api/v1/expense-claims
 *
 * Rate Limit: 30 requests per minute (MUTATION)
 *
 * Headers:
 * - X-RateLimit-Limit: 30
 * - X-RateLimit-Remaining: [0-30]
 * - X-RateLimit-Reset: [unix timestamp]
 */
```

---

## Troubleshooting

### Issue: Rate limit not working

**Check:**
1. Redis credentials configured?
   ```bash
   echo $UPSTASH_REDIS_REST_URL
   echo $UPSTASH_REDIS_REST_TOKEN
   ```

2. Console logs show Redis initialization?
   ```
   [Rate Limit] ✅ Redis client initialized successfully
   ```

3. If using in-memory fallback, restart will reset counters

### Issue: Users hitting limits too quickly

**Solutions:**
1. **Increase limits** (if legitimate traffic):
   ```typescript
   rateLimiters.query // 100 → 200 requests/min
   ```

2. **Separate endpoints** (different limits):
   ```typescript
   // Heavy operation
   rateLimiters.expensive // 10/min

   // Light operation
   rateLimiters.query // 100/min
   ```

3. **Business-specific limits** (scale per business):
   ```typescript
   const businessLimiter = createBusinessRateLimiter({
     maxRequests: businessTier === 'enterprise' ? 1000 : 100
   })
   ```

### Issue: False positives (legitimate users blocked)

**Causes:**
- Shared IP addresses (corporate NAT, VPNs)
- Aggressive crawlers

**Solutions:**
1. **Whitelist IP ranges**:
   ```typescript
   const whitelistIPs = ['10.0.0.0/8', '192.168.0.0/16']
   if (whitelistIPs.includes(ip)) return null // Skip rate limit
   ```

2. **Authenticated users get higher limits**:
   ```typescript
   const { userId } = await auth()
   const config = userId
     ? RATE_LIMIT_CONFIGS.QUERY      // 100/min
     : RATE_LIMIT_CONFIGS.ANONYMOUS  // 10/min
   ```

---

## Performance

### Redis (Production)

| Operation | Duration | Notes |
|---|---|---|
| Redis INCR | ~10-30ms | Upstash edge caching |
| Redis EXPIRE | ~10-20ms | Only on first request |
| Total overhead | ~20-50ms | Per request |

### In-Memory (Development)

| Operation | Duration | Notes |
|---|---|---|
| Map lookup | <1ms | JavaScript Map |
| Counter increment | <1ms | Simple addition |
| Total overhead | <1ms | Per request |

---

## Migration from Old System

If you're migrating from the old in-memory-only system:

```typescript
// OLD (in-memory only)
import { apiRateLimiter, applyRateLimit, getClientIdentifier } from './old-rate-limiter'

// NEW (Redis + fallback)
import { rateLimiters } from '@/domains/security/lib/rate-limit'

// ✅ Backward compatible - same API
const rateLimitResponse = await rateLimiters.mutation(request)
if (rateLimitResponse) return rateLimitResponse
```

**Benefits of migrating:**
- ✅ Distributed rate limiting
- ✅ Automatic Redis fallback
- ✅ Same API, zero code changes
- ✅ Better security (combined keys)

---

## Future Enhancements

### Planned Features

1. **Dynamic Limits** (per user tier):
   ```typescript
   const limits = await getUserTierLimits(userId)
   const limiter = createRateLimiter(limits)
   ```

2. **Rate Limit Analytics** (Supabase logging):
   ```sql
   CREATE TABLE rate_limit_logs (
     timestamp, user_id, endpoint, blocked
   )
   ```

3. **Adaptive Rate Limiting** (AI-based):
   ```typescript
   // Increase limits for trusted users
   // Decrease limits for suspicious activity
   ```

---

## Testing

### Unit Tests

```typescript
import { rateLimit, RATE_LIMIT_CONFIGS } from '@/domains/security/lib/rate-limit'

describe('Rate Limiting', () => {
  it('should allow requests under limit', async () => {
    const response = await rateLimit(mockRequest, RATE_LIMIT_CONFIGS.QUERY)
    expect(response).toBeNull() // Null = allowed
  })

  it('should block requests over limit', async () => {
    // Make 101 requests
    for (let i = 0; i < 101; i++) {
      await rateLimit(mockRequest, RATE_LIMIT_CONFIGS.QUERY)
    }

    const response = await rateLimit(mockRequest, RATE_LIMIT_CONFIGS.QUERY)
    expect(response?.status).toBe(429)
  })
})
```

### Integration Tests

```typescript
describe('API Rate Limiting Integration', () => {
  it('should rate limit expense claims endpoint', async () => {
    const responses = []

    // Make 31 requests (limit is 30)
    for (let i = 0; i < 31; i++) {
      const res = await fetch('/api/v1/expense-claims')
      responses.push(res.status)
    }

    expect(responses.slice(0, 30)).toEqual(Array(30).fill(200))
    expect(responses[30]).toBe(429)
  })
})
```

---

## Support

**Questions?** Check:
1. Main documentation: `/src/domains/security/CLAUDE.md`
2. Code: `/src/domains/security/lib/rate-limit.ts`
3. Environment setup: `/.env.example`

**Issues?** Check console logs for:
- Redis initialization status
- Fallback warnings
- Error messages

---

**Last Updated:** 2025-01-13
**Version:** 1.0.0
**Maintained By:** Groot Finance Security Team
