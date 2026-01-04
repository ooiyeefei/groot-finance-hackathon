/**
 * Health Check Service Layer
 *
 * Business logic for system health monitoring:
 * - Database connection validation
 * - External service status checks
 * - Uptime monitoring integration
 *
 * Migrated to Convex from Supabase
 *
 * North Star Architecture:
 * - All business logic centralized in service layer
 * - API routes are thin wrappers handling HTTP concerns
 *
 * Use Case:
 * - Load balancer health checks
 * - Uptime monitoring services
 * - DevOps alerting systems
 */

import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'

// ===== TYPE DEFINITIONS =====

export interface HealthStatus {
  success: boolean
  message: string
  timestamp: string
  database: {
    connected: boolean
    url: string
    provider: string
  }
  error?: string
}

// ===== CORE SERVICE FUNCTIONS =====

/**
 * Check Database Health
 *
 * Tests Convex connection with a simple query.
 * Used by uptime monitoring and load balancers.
 *
 * @returns Health status with database connection details
 */
export async function checkDatabaseHealth(): Promise<HealthStatus> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

  try {
    console.log('[Health Service] Checking Convex connection...')
    console.log('[Health Service] Convex URL:', convexUrl)

    if (!convexUrl) {
      return {
        success: false,
        message: 'Convex URL not configured',
        timestamp: new Date().toISOString(),
        database: {
          connected: false,
          url: '',
          provider: 'convex'
        },
        error: 'NEXT_PUBLIC_CONVEX_URL environment variable is not set'
      }
    }

    // Create Convex HTTP client for health check (no auth required for this check)
    const convex = new ConvexHttpClient(convexUrl)

    // Test connection by making a simple query
    // We use a public query that doesn't require auth - just listing tables
    // If the connection works, we get a result (even if empty)
    const startTime = Date.now()

    try {
      // Try to get current user (will return null without auth, but connection test passes)
      await convex.query(api.functions.users.getCurrentUser, {})
      const responseTime = Date.now() - startTime

      console.log(`[Health Service] Connection successful (${responseTime}ms)`)

      return {
        success: true,
        message: `Database connection working (${responseTime}ms)`,
        timestamp: new Date().toISOString(),
        database: {
          connected: true,
          url: convexUrl,
          provider: 'convex'
        }
      }
    } catch (queryError) {
      // Query might fail due to auth, but if the error is about auth, connection is still working
      const errorMessage = queryError instanceof Error ? queryError.message : 'Unknown error'

      // Auth errors mean connection works but auth is needed
      if (errorMessage.includes('Unauthenticated') || errorMessage.includes('auth')) {
        const responseTime = Date.now() - startTime
        console.log(`[Health Service] Connection successful (auth required) (${responseTime}ms)`)

        return {
          success: true,
          message: `Database connection working (${responseTime}ms)`,
          timestamp: new Date().toISOString(),
          database: {
            connected: true,
            url: convexUrl,
            provider: 'convex'
          }
        }
      }

      // Other errors indicate connection issues
      throw queryError
    }
  } catch (error) {
    console.error('[Health Service] Health check failed:', error)
    return {
      success: false,
      message: 'Health check failed',
      timestamp: new Date().toISOString(),
      database: {
        connected: false,
        url: convexUrl || '',
        provider: 'convex'
      },
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Check External Services Health
 *
 * Future expansion: Check status of external services like:
 * - Qdrant vector database
 * - Trigger.dev background jobs
 * - Clerk authentication
 *
 * @returns Status of external services
 */
export async function checkExternalServices(): Promise<{
  qdrant: boolean
  triggerDev: boolean
  clerk: boolean
}> {
  // Placeholder for future implementation
  return {
    qdrant: true,
    triggerDev: true,
    clerk: true
  }
}
