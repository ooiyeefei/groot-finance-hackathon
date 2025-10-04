/**
 * Shared authentication and authorization utilities for debug endpoints
 * Provides consistent security controls across all debug routes
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

interface DebugAuthResult {
  authorized: boolean
  userId?: string
  response?: NextResponse
}

/**
 * Validates debug endpoint access with authentication and environment checks
 * @returns Authorization result with userId or error response
 */
export async function validateDebugAccess(): Promise<DebugAuthResult> {
  try {
    // SECURITY: Require authentication
    const { userId } = await auth()

    if (!userId) {
      return {
        authorized: false,
        response: NextResponse.json({
          error: 'Authentication required',
          message: 'Debug endpoints require authentication'
        }, { status: 401 })
      }
    }

    // SECURITY: Restrict to development/staging environments only
    const nodeEnv = process.env.NODE_ENV || 'development'
    const isProduction = nodeEnv === 'production'

    if (isProduction) {
      console.log(`[Debug] Debug access blocked in production for user: ${userId}`)
      return {
        authorized: false,
        response: NextResponse.json({
          error: 'Debug endpoints disabled in production',
          message: 'Debug endpoints are not available in production for security reasons'
        }, { status: 403 })
      }
    }

    // Optional: Additional role-based checks could be added here
    // For now, any authenticated user in non-production can access debug endpoints

    return {
      authorized: true,
      userId
    }

  } catch (error) {
    console.error('[Debug] Debug access validation error:', error)
    return {
      authorized: false,
      response: NextResponse.json({
        error: 'Debug endpoint error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  }
}

/**
 * Standard error response for debug endpoint failures
 */
export function createDebugErrorResponse(error: unknown, context: string = 'Debug operation') {
  console.error(`[Debug] ${context} error:`, error)
  return NextResponse.json({
    error: `${context} failed`,
    message: error instanceof Error ? error.message : 'Unknown error',
    timestamp: new Date().toISOString()
  }, { status: 500 })
}

/**
 * Logs debug endpoint access for audit purposes
 */
export function logDebugAccess(userId: string, endpoint: string, action: string = 'accessed') {
  console.log(`[Debug] User ${userId} ${action} debug endpoint: ${endpoint} at ${new Date().toISOString()}`)
}