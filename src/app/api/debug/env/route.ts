import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const envVars = {
    OCR_ENDPOINT_URL: process.env.OCR_ENDPOINT_URL || 'NOT SET',
    OCR_MODEL_NAME: process.env.OCR_MODEL_NAME || 'NOT SET',
    EMBEDDING_ENDPOINT_URL: process.env.EMBEDDING_ENDPOINT_URL || 'NOT SET',
    EMBEDDING_MODEL_ID: process.env.EMBEDDING_MODEL_ID || 'NOT SET',
    SEALION_ENDPOINT_URL: process.env.SEALION_ENDPOINT_URL || 'NOT SET',
    QDRANT_URL: process.env.QDRANT_URL || 'NOT SET',
    NODE_ENV: process.env.NODE_ENV || 'NOT SET'
  }

  console.log('[Debug] Environment variables check:', envVars)

  return NextResponse.json({
    success: true,
    message: 'Environment variables debug',
    variables: envVars,
    timestamp: new Date().toISOString()
  })
}