/**
 * CSRF Token API
 * GET /api/csrf-token - Get CSRF token for current user session
 */

import { NextRequest } from 'next/server'
import { handleCSRFTokenRequest } from '@/lib/csrf-protection'

export async function GET(request: NextRequest) {
  return handleCSRFTokenRequest()
}