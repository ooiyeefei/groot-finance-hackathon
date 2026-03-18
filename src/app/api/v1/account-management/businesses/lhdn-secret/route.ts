/**
 * LHDN Client Secret Management (019-lhdn-einv-flow-2)
 *
 * POST /api/v1/account-management/businesses/lhdn-secret
 *   - Saves LHDN client secret to AWS SSM Parameter Store SecureString
 *   - Path: /groot-finance/businesses/{businessId}/lhdn-client-secret
 *
 * GET /api/v1/account-management/businesses/lhdn-secret
 *   - Checks if a secret exists (returns boolean, NOT the secret value)
 *
 * Security:
 * - Client secret is NEVER stored in Convex (plain-text database)
 * - Stored encrypted at rest via SSM SecureString (KMS)
 * - Only admins of the business can set/check the secret
 * - The secret is read at poll time by Convex Node.js actions via SSM
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { SSMClient, PutParameterCommand, GetParameterCommand } from '@aws-sdk/client-ssm'
import { fromWebToken, fromIni } from '@aws-sdk/credential-providers'

const AWS_REGION = process.env.AWS_REGION || 'us-west-2'
const ROLE_ARN = process.env.AWS_ROLE_ARN

function isLocalDevelopment(): boolean {
  return !process.env.VERCEL && process.env.NODE_ENV !== 'production'
}

async function createSSMClient(): Promise<SSMClient> {
  if (isLocalDevelopment()) {
    const profile = process.env.AWS_PROFILE || 'groot-finanseal'
    return new SSMClient({
      region: AWS_REGION,
      credentials: fromIni({ profile }),
    })
  }

  if (!ROLE_ARN) {
    throw new Error('AWS_ROLE_ARN not configured')
  }

  const { getVercelOidcToken } = await import('@vercel/oidc')
  const webIdentityToken = await getVercelOidcToken()

  return new SSMClient({
    region: AWS_REGION,
    credentials: fromWebToken({
      roleArn: ROLE_ARN,
      webIdentityToken,
      roleSessionName: 'vercel-lhdn-secret',
      durationSeconds: 900,
    }),
  })
}

/**
 * POST: Save LHDN client secret to SSM Parameter Store
 */
export async function POST(request: NextRequest) {
  try {
    const { client, userId } = await getAuthenticatedConvex()

    if (!client || !userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { client_secret } = body

    if (!client_secret || typeof client_secret !== 'string' || client_secret.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'client_secret is required' },
        { status: 400 }
      )
    }

    // Get current business context to verify access
    const context = await client.query(api.functions.businesses.getBusinessContext, {})
    if (!context || !context.businessId) {
      return NextResponse.json(
        { success: false, error: 'No active business context' },
        { status: 400 }
      )
    }

    // Only owners/managers can manage LHDN credentials
    if (context.role !== 'owner' && context.role !== 'manager') {
      return NextResponse.json(
        { success: false, error: 'Only owners/managers can manage LHDN credentials' },
        { status: 403 }
      )
    }

    const ssmClient = await createSSMClient()
    const parameterPath = `/groot-finance/businesses/${context.businessId}/lhdn-client-secret`

    await ssmClient.send(new PutParameterCommand({
      Name: parameterPath,
      Value: client_secret.trim(),
      Type: 'SecureString',
      Overwrite: true,
      Description: `LHDN MyInvois client secret for business ${context.businessId}`,
    }))

    console.log(`[LHDN Secret] Saved to SSM: ${parameterPath}`)

    return NextResponse.json({
      success: true,
      data: { message: 'LHDN client secret saved securely' },
    })
  } catch (error) {
    console.error('[LHDN Secret] Error saving:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save LHDN secret',
      },
      { status: 500 }
    )
  }
}

/**
 * GET: Check if LHDN client secret exists (does NOT return the value)
 */
export async function GET() {
  try {
    const { client, userId } = await getAuthenticatedConvex()

    if (!client || !userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const context = await client.query(api.functions.businesses.getBusinessContext, {})
    if (!context || !context.businessId) {
      return NextResponse.json(
        { success: false, error: 'No active business context' },
        { status: 400 }
      )
    }

    const ssmClient = await createSSMClient()
    const parameterPath = `/groot-finance/businesses/${context.businessId}/lhdn-client-secret`

    try {
      await ssmClient.send(new GetParameterCommand({
        Name: parameterPath,
        WithDecryption: false, // Don't need the value, just check existence
      }))
      const response = NextResponse.json({ success: true, data: { exists: true } })
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
      return response
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'ParameterNotFound') {
        const response = NextResponse.json({ success: true, data: { exists: false } })
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
        return response
      }
      throw error
    }
  } catch (error) {
    console.error('[LHDN Secret] Error checking:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check LHDN secret',
      },
      { status: 500 }
    )
  }
}
