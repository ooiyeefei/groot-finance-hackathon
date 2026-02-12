/**
 * SSE Stream Parser
 *
 * Parses Server-Sent Events from a fetch Response body.
 * Handles buffering of partial chunks and yields typed event objects.
 */

import type { CitationData } from '@/lib/ai/tools/base-tool'

// --- Event Types ---

export interface StatusEvent {
  event: 'status'
  data: { phase: string }
}

export interface TextEvent {
  event: 'text'
  data: { token: string }
}

export interface ActionEvent {
  event: 'action'
  data: ChatAction
}

export interface CitationEvent {
  event: 'citation'
  data: { citations: CitationData[] }
}

export interface DoneEvent {
  event: 'done'
  data: { totalTokens?: number }
}

export interface ErrorEvent {
  event: 'error'
  data: { message: string; code?: string }
}

export type StreamEvent =
  | StatusEvent
  | TextEvent
  | ActionEvent
  | CitationEvent
  | DoneEvent
  | ErrorEvent

// --- Action Card Types ---

export interface ChatAction {
  type: string
  id?: string
  data: Record<string, unknown>
}

/**
 * Parse an SSE stream from a fetch Response into typed events.
 * Yields StreamEvent objects as they arrive.
 */
export async function* parseSSEStream(
  response: Response
): AsyncGenerator<StreamEvent> {
  const body = response.body
  if (!body) {
    throw new Error('Response body is null')
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Process complete SSE messages (separated by double newline)
      const messages = buffer.split('\n\n')
      // Keep the last incomplete chunk in the buffer
      buffer = messages.pop() || ''

      for (const message of messages) {
        const trimmed = message.trim()
        if (!trimmed) continue

        const event = parseSSEMessage(trimmed)
        if (event) {
          yield event
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const event = parseSSEMessage(buffer.trim())
      if (event) {
        yield event
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Parse a single SSE message block into a typed event.
 */
function parseSSEMessage(message: string): StreamEvent | null {
  let eventType = ''
  let dataStr = ''

  for (const line of message.split('\n')) {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataStr += line.slice(5).trim()
    }
  }

  if (!eventType || !dataStr) return null

  try {
    const data = JSON.parse(dataStr)
    return { event: eventType, data } as StreamEvent
  } catch {
    console.warn('[SSE Parser] Failed to parse event data:', dataStr)
    return null
  }
}
