import { NextRequest, NextResponse } from 'next/server'
import { validateDebugAccess, logDebugAccess, createDebugErrorResponse } from '@/lib/debug-auth'

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Validate debug access (authentication + environment checks)
    const authResult = await validateDebugAccess()

    if (!authResult.authorized) {
      return authResult.response!
    }

    const { userId } = authResult

    // Log access for audit purposes
    logDebugAccess(userId!, '/api/debug/env', 'accessed')

    const nodeEnv = process.env.NODE_ENV || 'development'
    const envVars = {
      OCR_ENDPOINT_URL: process.env.OCR_ENDPOINT_URL || 'NOT SET',
      OCR_MODEL_NAME: process.env.OCR_MODEL_NAME || 'NOT SET',
      EMBEDDING_ENDPOINT_URL: process.env.EMBEDDING_ENDPOINT_URL || 'NOT SET',
      EMBEDDING_MODEL_ID: process.env.EMBEDDING_MODEL_ID || 'NOT SET',
      SEALION_ENDPOINT_URL: process.env.SEALION_ENDPOINT_URL || 'NOT SET',
      QDRANT_URL: process.env.QDRANT_URL || 'NOT SET',
      NODE_ENV: nodeEnv
    }

    return NextResponse.json({
      success: true,
      message: 'Environment variables debug',
      variables: envVars,
      userId,
      environment: nodeEnv,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    return createDebugErrorResponse(error, 'Environment debug')
  }
}