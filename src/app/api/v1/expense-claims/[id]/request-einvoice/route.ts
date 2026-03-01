/**
 * Request E-Invoice / Retry Form Fill (019-lhdn-einv-flow-2)
 *
 * POST /api/v1/expense-claims/[id]/request-einvoice
 *
 * Manual trigger / retry: reads claim data from Convex (merchantFormUrl,
 * business details) and invokes the form fill Lambda.
 *
 * The auto flow (QR detect → form fill) is handled entirely by the
 * Python Lambda. This route is for user-initiated requests or retries.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { fromWebToken, fromIni } from '@aws-sdk/credential-providers'

const FORM_FILL_LAMBDA_ARN = process.env.EINVOICE_FORM_FILL_LAMBDA_ARN
const ROLE_ARN = process.env.AWS_ROLE_ARN
const AWS_REGION = process.env.AWS_REGION || 'us-west-2'

function isLocalDevelopment(): boolean {
  return !process.env.VERCEL && process.env.NODE_ENV !== 'production'
}

async function createLambdaClient(): Promise<LambdaClient> {
  if (isLocalDevelopment()) {
    const profile = process.env.AWS_PROFILE || 'groot-finanseal'
    return new LambdaClient({
      region: AWS_REGION,
      credentials: fromIni({ profile }),
    })
  }

  if (!ROLE_ARN) {
    throw new Error('AWS_ROLE_ARN not configured')
  }

  const { getVercelOidcToken } = await import('@vercel/oidc')
  const webIdentityToken = await getVercelOidcToken()

  return new LambdaClient({
    region: AWS_REGION,
    credentials: fromWebToken({
      roleArn: ROLE_ARN,
      webIdentityToken,
      roleSessionName: 'vercel-einvoice-form-fill',
      durationSeconds: 900,
    }),
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { client, userId } = await getAuthenticatedConvex()

    if (!client || !userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: expenseClaimId } = await params
    console.log('[Request E-Invoice API] Starting for claim:', expenseClaimId)

    // Validate claim and get data needed for form fill
    const result = await client.mutation(api.functions.expenseClaims.requestEinvoice, {
      claimId: expenseClaimId,
    })

    if (!FORM_FILL_LAMBDA_ARN) {
      return NextResponse.json(
        { success: false, error: 'Form fill service not configured' },
        { status: 500 }
      )
    }

    // Derive emailRef from claim ID (first 10 chars — deterministic)
    const emailRef = expenseClaimId.substring(0, 10)

    // Invoke the form fill Lambda (async, fire-and-forget)
    const lambdaClient = await createLambdaClient()
    const command = new InvokeCommand({
      FunctionName: FORM_FILL_LAMBDA_ARN,
      InvocationType: 'Event',
      Payload: JSON.stringify({
        merchantFormUrl: result.merchantFormUrl,
        buyerDetails: result.buyerDetails,
        extractedData: result.receiptData || { referenceNumber: null },
        emailRef,
        expenseClaimId,
      }),
    })
    await lambdaClient.send(command)
    console.log('[Request E-Invoice API] Form fill Lambda invoked successfully')

    return NextResponse.json({
      success: true,
      data: {
        emailRef,
        message: 'E-invoice request submitted. AI agent will fill the merchant form.',
      }
    }, { status: 202 })

  } catch (error) {
    console.error('[Request E-Invoice API] Error:', error)

    if (error instanceof Error) {
      if (error.message.includes('Not authenticated')) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        )
      }
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 404 }
        )
      }
      if (error.message.includes('No merchant form')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 400 }
        )
      }
    }

    // Translate Convex/system errors to user-friendly messages
    const rawError = error instanceof Error ? error.message : 'Failed to request e-invoice'
    let userError = rawError
    if (rawError.includes('TIN not configured')) {
      userError = 'Business TIN is not configured. Please update in Settings → Business Profile.'
    } else if (rawError.includes('address not configured')) {
      userError = 'Business address is not configured. Please update in Settings → Business Profile.'
    } else if (rawError.includes('Server Error') || rawError.includes('Request ID')) {
      userError = 'Something went wrong. Please check your business settings (TIN, address) and try again.'
    }

    return NextResponse.json(
      { success: false, error: userError },
      { status: 500 }
    )
  }
}
