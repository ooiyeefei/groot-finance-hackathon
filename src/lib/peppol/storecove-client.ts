/**
 * Storecove API Client — Peppol Access Point Integration
 *
 * Handles all communication with Storecove's REST API:
 * - Document submission (invoices & credit notes)
 * - Receiver discovery (verify Peppol participant IDs)
 * - Evidence retrieval (delivery proof)
 */

import {
  type StorecoveConfig,
  type StorecoveDocumentSubmission,
  type StorecoveSubmissionResponse,
  type StorecoveEvidence,
  StorecoveApiError,
} from "./types"

function getConfig(): StorecoveConfig {
  const apiKey = process.env.STORECOVE_API_KEY
  const legalEntityId = process.env.STORECOVE_LEGAL_ENTITY_ID
  const baseUrl = process.env.STORECOVE_API_URL || "https://api.storecove.com"

  if (!apiKey) throw new Error("STORECOVE_API_KEY is not configured")
  if (!legalEntityId) throw new Error("STORECOVE_LEGAL_ENTITY_ID is not configured")

  return {
    apiKey,
    legalEntityId: parseInt(legalEntityId, 10),
    baseUrl,
  }
}

async function storecoveFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const config = getConfig()
  const url = `${config.baseUrl}${path}`

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
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

    const errors =
      response.status === 422 && Array.isArray(errorBody)
        ? errorBody
        : undefined

    throw new StorecoveApiError(
      `Storecove API error: ${response.status} ${response.statusText}`,
      response.status,
      errors
    )
  }

  // Some endpoints return empty body (204)
  if (response.status === 204) return {} as T

  return response.json() as Promise<T>
}

/**
 * Submit a document (invoice or credit note) to Storecove for Peppol transmission.
 */
export async function submitDocument(
  payload: StorecoveDocumentSubmission
): Promise<StorecoveSubmissionResponse> {
  return storecoveFetch<StorecoveSubmissionResponse>(
    "/api/v2/document_submissions",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  )
}

/**
 * Verify a receiver's Peppol participant ID is active on the network.
 */
export async function discoverReceiver(
  scheme: string,
  identifier: string
): Promise<{ active: boolean }> {
  try {
    await storecoveFetch("/api/v2/discovery/receives", {
      method: "POST",
      body: JSON.stringify({
        documentTypes: ["invoice"],
        network: "peppol",
        metaScheme: "iso6523-actorid-upis",
        scheme,
        identifier,
      }),
    })
    return { active: true }
  } catch (error) {
    if (error instanceof StorecoveApiError && error.statusCode === 404) {
      return { active: false }
    }
    throw error
  }
}

/**
 * Retrieve delivery evidence for a submission.
 */
export async function getEvidence(
  submissionGuid: string
): Promise<StorecoveEvidence> {
  return storecoveFetch<StorecoveEvidence>(
    `/api/v2/document_submissions/${submissionGuid}/evidence`
  )
}

/**
 * Get the configured legal entity ID.
 */
export function getLegalEntityId(): number {
  return getConfig().legalEntityId
}
