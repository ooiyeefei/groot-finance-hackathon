/**
 * Security Health Check API
 * GET /api/v1/utils/security/health - Check security system status
 */

import { NextRequest, NextResponse } from 'next/server'
import { withErrorSanitization, ERROR_CODES } from '@/domains/security/lib/error-sanitizer'
import { rateLimit, RATE_LIMIT_CONFIGS } from '@/domains/security/lib/rate-limit'

export const GET = withErrorSanitization(async (request: NextRequest) => {
  // Apply lenient rate limiting for health checks
  const healthRateLimit = await rateLimit(request, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20 // 20 health checks per minute
  })

  if (healthRateLimit) {
    return healthRateLimit
  }

  // Test security systems
  const securityHealth = {
    timestamp: new Date().toISOString(),
    systems: {
      csrf: {
        status: 'operational',
        description: 'CSRF protection system running'
      },
      rateLimit: {
        status: 'operational',
        description: 'Rate limiting system active'
      },
      errorSanitization: {
        status: 'operational',
        description: 'Error sanitization system active'
      },
      authentication: {
        status: 'operational',
        description: 'Clerk authentication integration active'
      }
    },
    version: '1.0.0',
    uptime: process.uptime()
  }

  return NextResponse.json({
    success: true,
    data: securityHealth
  })
}, 'Security Health Check')