/**
 * LHDN MyInvois API Client — e-Invoice Submission Pipeline
 *
 * Handles all communication with LHDN's MyInvois REST API:
 * - OAuth authentication (intermediary model with onbehalfof header)
 * - Document submission (single + batch)
 * - Status polling
 * - Document cancellation
 * - TIN validation
 */

import {
  type LhdnConfig,
  type LhdnToken,
  type LhdnTokenResponse,
  type LhdnDocument,
  type LhdnSubmissionResponse,
  type LhdnSubmissionStatus,
  type LhdnCancelRequest,
  LhdnApiError,
} from "./types"
import { LHDN_API_PATHS } from "./constants"

function getConfig(): LhdnConfig {
  const clientId = process.env.LHDN_CLIENT_ID
  const clientSecret = process.env.LHDN_CLIENT_SECRET
  const baseUrl =
    process.env.LHDN_API_URL || "https://preprod-api.myinvois.hasil.gov.my"
  const environment =
    (process.env.LHDN_ENVIRONMENT as "sandbox" | "production") || "sandbox"

  if (!clientId) throw new Error("LHDN_CLIENT_ID is not configured")
  if (!clientSecret) throw new Error("LHDN_CLIENT_SECRET is not configured")

  return { clientId, clientSecret, baseUrl, environment }
}

/**
 * Authenticate with LHDN MyInvois API.
 *
 * Supports two modes controlled by LHDN_AUTH_MODE env var:
 * - "intermediary" (default): Uses platform credentials + onbehalfof header
 *   for the tenant's TIN. Requires taxpayer authorization on MyInvois portal.
 * - "direct": Uses the taxpayer's own credentials directly, no onbehalfof
 *   header. Useful for testing with a personal taxpayer sandbox account.
 */
export async function authenticate(tenantTin: string): Promise<LhdnToken> {
  const config = getConfig()
  const url = `${config.baseUrl}${LHDN_API_PATHS.TOKEN}`
  const authMode = process.env.LHDN_AUTH_MODE || "intermediary"

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "client_credentials",
    scope: "InvoicingAPI",
  })

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  }

  if (authMode === "intermediary") {
    headers.onbehalfof = tenantTin
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: body.toString(),
  })

  if (!response.ok) {
    let errorBody: unknown
    try {
      errorBody = await response.json()
    } catch {
      errorBody = await response.text()
    }

    throw new LhdnApiError(
      `LHDN authentication failed: ${response.status} ${response.statusText}`,
      response.status,
      Array.isArray(errorBody)
        ? errorBody
        : [
            {
              code: "AUTH_FAILED",
              message:
                typeof errorBody === "string"
                  ? errorBody
                  : JSON.stringify(errorBody),
            },
          ]
    )
  }

  const data = (await response.json()) as LhdnTokenResponse

  return {
    accessToken: data.access_token,
    tokenType: data.token_type,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

async function lhdnFetch<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const config = getConfig()
  const url = `${config.baseUrl}${path}`

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  })

  if (!response.ok) {
    let errorBody: unknown
    try {
      errorBody = await response.json()
    } catch {
      errorBody = await response.text()
    }

    const errors = Array.isArray(errorBody)
      ? errorBody
      : errorBody && typeof errorBody === "object" && "error" in errorBody
        ? [errorBody as unknown as { code: string; message: string }]
        : undefined

    throw new LhdnApiError(
      `LHDN API error: ${response.status} ${response.statusText}`,
      response.status,
      errors
    )
  }

  if (response.status === 204) return {} as T
  return response.json() as Promise<T>
}

/**
 * Submit one or more documents to LHDN for validation.
 * Max 100 documents per batch, 300KB per document, 5MB total.
 */
export async function submitDocuments(
  documents: LhdnDocument[],
  accessToken: string
): Promise<LhdnSubmissionResponse> {
  return lhdnFetch<LhdnSubmissionResponse>(
    LHDN_API_PATHS.SUBMIT_DOCUMENTS,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ documents }),
    }
  )
}

/**
 * Get the status of a submission and its documents.
 */
export async function getSubmissionStatus(
  submissionUid: string,
  accessToken: string
): Promise<LhdnSubmissionStatus> {
  return lhdnFetch<LhdnSubmissionStatus>(
    `${LHDN_API_PATHS.GET_SUBMISSION}${submissionUid}`,
    accessToken
  )
}

/**
 * Cancel a validated document within the 72-hour window.
 */
export async function cancelDocument(
  documentUuid: string,
  reason: string,
  accessToken: string
): Promise<void> {
  const body: LhdnCancelRequest = {
    status: "cancelled",
    reason,
  }

  await lhdnFetch<void>(
    `${LHDN_API_PATHS.CANCEL_DOCUMENT}${documentUuid}/state`,
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify(body),
    }
  )
}

/**
 * Validate a TIN with LHDN.
 */
export async function validateTin(
  tin: string,
  accessToken: string
): Promise<boolean> {
  try {
    await lhdnFetch<void>(
      `${LHDN_API_PATHS.VALIDATE_TIN}${tin}`,
      accessToken
    )
    return true
  } catch (error) {
    if (error instanceof LhdnApiError && error.statusCode === 404) {
      return false
    }
    throw error
  }
}

/**
 * Get the LHDN environment configuration.
 */
export function getLhdnEnvironment(): "sandbox" | "production" {
  return getConfig().environment
}
