/**
 * Health Check Service Layer
 *
 * Business logic for system health monitoring:
 * - Database connection validation
 * - External service status checks
 * - Uptime monitoring integration
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

import { createClient } from '@supabase/supabase-js'

// ===== TYPE DEFINITIONS =====

export interface HealthStatus {
  success: boolean
  message: string
  timestamp: string
  database: {
    connected: boolean
    url: string
    hasServiceKey: boolean
  }
  error?: string
}

// ===== CORE SERVICE FUNCTIONS =====

/**
 * Check Database Health
 *
 * Tests Supabase connection with a simple query.
 * Used by uptime monitoring and load balancers.
 *
 * @returns Health status with database connection details
 * @throws Error if health check fails
 */
export async function checkDatabaseHealth(): Promise<HealthStatus> {
  try {
    console.log('[Health Service] Checking Supabase connection...')
    console.log('[Health Service] Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('[Health Service] Service key exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

    // Create Supabase client for health check
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Test basic query - check invoices table
    const { data, error } = await supabase
      .from('invoices')
      .select('count')
      .limit(1)

    if (error) {
      console.error('[Health Service] Database error:', error)
      return {
        success: false,
        message: 'Database connection failed',
        timestamp: new Date().toISOString(),
        database: {
          connected: false,
          url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
          hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
        },
        error: error.message
      }
    }

    console.log('[Health Service] Connection successful')

    return {
      success: true,
      message: 'Database connection working',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      }
    }
  } catch (error) {
    console.error('[Health Service] Health check failed:', error)
    return {
      success: false,
      message: 'Health check failed',
      timestamp: new Date().toISOString(),
      database: {
        connected: false,
        url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
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
