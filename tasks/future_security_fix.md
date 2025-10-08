# Future Security Fix: JWT Validation in Middleware

## Status: CRITICAL - To be implemented in future sprint

## Expert Consensus Summary (2025-01-07)

Both Gemini Pro and Gemini Flash experts (9/10 confidence each) identified a critical security vulnerability in our middleware implementation that requires immediate attention in the next development cycle.

## 🚨 Critical Security Vulnerability

### Current Implementation Issue
```typescript
// CURRENT (INSECURE) - src/middleware.ts:109-112
const supabaseToken = req.cookies.get('__session')?.value ||
                     req.headers.get('authorization')?.replace('Bearer ', '')

if (!supabaseToken) {
  return NextResponse.redirect(new URL(`/${locale}/onboarding/business`, req.url))
}
// ❌ Only checks token PRESENCE, not VALIDITY
```

### Security Risks
1. **Token Forgery** - Attackers can create fake tokens that pass presence check
2. **Expired Token Reuse** - Old/invalid tokens continue to work
3. **Tenant Data Breach** - Unauthorized access to other businesses' data
4. **Industry Anti-pattern** - Well-known vulnerability pattern

### Impact Assessment
- **Severity**: CRITICAL
- **Affected**: All protected routes (applications, invoices, expense-claims, etc.)
- **Exploit**: Easy - anyone can forge a token cookie/header
- **Data at Risk**: Multi-tenant business data isolation compromised

## ✅ Required Implementation

### 1. Install JWT Library
```bash
npm install jose
```

### 2. Implement Proper JWT Validation
```typescript
// REQUIRED (SECURE) Implementation - src/middleware.ts
import { jwtVerify } from 'jose'

if (needsBusinessContext(req)) {
  try {
    const token = req.cookies.get('__session')?.value
    if (!token) {
      return NextResponse.redirect(new URL(`/${locale}/onboarding/business`, req.url))
    }

    // ✅ Verify signature, expiry, and claims
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET)
    )

    // ✅ Extract and validate business context
    const businessId = payload.business_id || payload.active_business_id
    if (!businessId) {
      return NextResponse.redirect(new URL(`/${locale}/onboarding/business`, req.url))
    }

    // ✅ Token is valid and contains business context
    console.log(`[Middleware] Valid business context: ${businessId} for user: ${userId}`)

  } catch (error) {
    // ✅ Invalid token - redirect to authentication
    console.error(`[Middleware] Invalid JWT token for user ${userId}:`, error)
    return NextResponse.redirect(new URL(`/${locale}/sign-in`, req.url))
  }
}
```

### 3. Environment Variables Required
```bash
# .env.local
SUPABASE_JWT_SECRET=your_supabase_jwt_secret_here
```

### 4. Enhanced Role-Based Protection
```typescript
// Leverage existing role matchers with JWT claims
if (isManagerRoute(req)) {
  const userRole = payload.role || 'employee'
  if (!['manager', 'admin'].includes(userRole)) {
    return NextResponse.redirect(new URL(`/${locale}/unauthorized`, req.url))
  }
}

if (isAdminRoute(req)) {
  const userRole = payload.role || 'employee'
  if (userRole !== 'admin') {
    return NextResponse.redirect(new URL(`/${locale}/unauthorized`, req.url))
  }
}
```

## 📋 Implementation Checklist

### Phase 1: Core JWT Validation (Critical)
- [ ] Install `jose` JWT library
- [ ] Add SUPABASE_JWT_SECRET environment variable
- [ ] Implement JWT signature verification
- [ ] Add expiry validation
- [ ] Extract business_id from payload
- [ ] Handle validation failures with proper redirects

### Phase 2: Enhanced Security (High Priority)
- [ ] Implement role-based route protection
- [ ] Add business context validation per route
- [ ] Create unauthorized access page
- [ ] Add security logging and monitoring

### Phase 3: Performance Optimization (Medium Priority)
- [ ] Consider JWT validation caching
- [ ] Add performance metrics
- [ ] Implement audit logging
- [ ] Add rate limiting for failed validations

## 🎯 Expert Recommendations

### Gemini Pro (9/10 confidence):
> "The middleware approach is architecturally excellent and follows industry best practices. The current 'fast fail' pattern is acceptable IF downstream APIs perform full JWT validation. However, for defense-in-depth, middleware should validate signatures."

### Gemini Flash (9/10 confidence):
> "Critical Security Vulnerability: Relying solely on token presence is a well-known anti-pattern that has led to numerous data breaches. Full JWT validation in middleware is essential for multi-tenant SaaS security."

## 🔒 Security Best Practices

1. **Defense in Depth**: Both middleware AND API routes should validate JWTs
2. **Tenant Isolation**: Always extract and validate business_id from tokens
3. **Signature Verification**: Never trust unsigned or unverified tokens
4. **Expiry Enforcement**: Always check token expiration dates
5. **Role Validation**: Enforce role-based access controls from JWT claims

## 📅 Timeline Recommendation

- **Week 1**: Implement core JWT validation (Phase 1)
- **Week 2**: Add role-based protection (Phase 2)
- **Week 3**: Performance optimization and monitoring (Phase 3)

## 🔗 References

- [JWT Best Practices RFC](https://tools.ietf.org/html/rfc8725)
- [Supabase JWT Documentation](https://supabase.com/docs/guides/auth/jwts)
- [JOSE Library Documentation](https://github.com/panva/jose)
- [OWASP JWT Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)

---

**Author**: Expert Consensus Analysis (Gemini Pro + Gemini Flash)
**Date**: 2025-01-07
**Priority**: CRITICAL
**Estimated Effort**: 2-3 days focused development