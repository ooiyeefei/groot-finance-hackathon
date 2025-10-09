/**
 * CSRF Token API
 * GET /api/csrf - Get CSRF token for authenticated user
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleCSRFTokenRequest } from '@/lib/csrf-protection'

export async function GET(request: NextRequest) {
  return handleCSRFTokenRequest(request)
}