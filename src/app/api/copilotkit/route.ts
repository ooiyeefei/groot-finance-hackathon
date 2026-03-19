/**
 * Chat Runtime Endpoint — SSE Streaming
 *
 * POST /api/copilotkit — handles AI chat requests via Server-Sent Events.
 * Invokes the in-process LangGraph financial agent and streams events progressively.
 *
 * Auth: Clerk session (via cookies)
 * Rate limit: 30 messages/hour/user
 */

// Extend function timeout for multi-step AI agent (guardrail → intent → model → tool → response)
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserDataConvex, getAuthenticatedConvex } from '@/lib/convex'
import { rateLimit } from '@/domains/security/lib/rate-limit'
import { streamLangGraphAgent } from '@/lib/ai/copilotkit-adapter'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'

interface ChatRequestBody {
  message: string
  conversationId?: string
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  language?: string
  businessId?: string
}

export async function POST(req: NextRequest) {
  // 1. Rate limit (30 messages/hour/user)
  const rateLimitResponse = await rateLimit(req, {
    windowMs: 60 * 60 * 1000,
    maxRequests: 30,
  })
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  // 2. Authenticate via Clerk
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. Get user context from Convex
  let userData
  try {
    userData = await getUserDataConvex(userId)
  } catch {
    return NextResponse.json(
      { error: 'Failed to resolve user context' },
      { status: 500 }
    )
  }

  // 4. Parse request body
  let body: ChatRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const { message, conversationId, conversationHistory = [], language = 'en', businessId: requestBusinessId } = body

  if (!message || typeof message !== 'string') {
    return NextResponse.json(
      { error: 'Message is required' },
      { status: 400 }
    )
  }

  // 5. Resolve businessId — prefer frontend-provided, fall back to user default.
  // The frontend sends the active business from BusinessContextProvider.
  const resolvedBusinessId = requestBusinessId || userData.business_id
  if (!resolvedBusinessId) {
    return NextResponse.json(
      { error: 'No business context found' },
      { status: 400 }
    )
  }

  // 5.1 SECURITY: Always validate user has active membership for the resolved businessId.
  // Prevents businessId injection AND stale default business (user removed after profile cached).
  try {
    const { client: validationClient } = await getAuthenticatedConvex()
    if (validationClient) {
      const membership = await validationClient.query(
        api.functions.memberships.verifyMembership,
        { businessId: resolvedBusinessId }
      )
      if (!membership) {
        console.warn(`[Chat API] RBAC: User ${userId} has no active membership for business ${resolvedBusinessId}`)
        return NextResponse.json(
          { error: 'You do not have access to this business. Please switch to a valid business.' },
          { status: 403 }
        )
      }
    }
  } catch (membershipError) {
    console.error('[Chat API] Business membership validation error:', membershipError)
    return NextResponse.json(
      { error: 'Failed to validate business access' },
      { status: 403 }
    )
  }

  // 5.5 AI chat usage pre-flight check (fail-open per FR-016)
  try {
    const { client: convexClient } = await getAuthenticatedConvex()
    if (convexClient) {
      const usageCheck = await convexClient.mutation(
        api.functions.aiMessageUsage.checkAndRecordFromApi,
        { businessId: resolvedBusinessId as Id<"businesses"> }
      )

      if (!usageCheck.allowed) {
        return NextResponse.json(
          {
            error: 'AI chat message limit reached for this month. Purchase a credit pack or upgrade your plan for more messages.',
            code: 'USAGE_LIMIT_REACHED',
          },
          { status: 429 }
        )
      }
    }
  } catch (usageError) {
    // Fail-open: log and proceed if usage check fails (FR-016)
    console.warn('[Usage Tracking] AI chat pre-flight failed, proceeding (fail-open):', usageError)
  }

  // 6. Get Convex client for server-side message persistence
  let convexClient: Awaited<ReturnType<typeof getAuthenticatedConvex>>['client'] | null = null
  try {
    const { client } = await getAuthenticatedConvex()
    convexClient = client
  } catch {
    // Non-fatal: server-side persistence disabled, client will persist
    console.warn('[Chat API] Could not get Convex client for server persistence')
  }

  // 6.5 Resolve user role for RBAC-based tool filtering
  let userRole: string | undefined
  try {
    const profile = await ensureUserProfile(userId)
    userRole = profile?.role
    console.log(`[Chat API] Resolved role: ${userRole} for user ${userId}`)
  } catch (roleError) {
    console.warn('[Chat API] Could not resolve user role, will fall back to restricted access:', roleError)
  }

  // 7. Create SSE stream from the LangGraph agent
  console.log(`[Chat API] Streaming agent for user ${userId}, business ${resolvedBusinessId}, role ${userRole}, conversation ${conversationId}`)

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      function writeEvent(event: string, data: unknown) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(payload))
      }

      // Accumulate the full response for server-side persistence
      let accumulatedText = ''
      let accumulatedActions: unknown[] = []
      let accumulatedCitations: unknown[] = []

      try {
        // Emit an immediate status event so the client knows the stream is alive.
        // This resets the inactivity timeout while the LLM endpoint cold-starts.
        writeEvent('status', { phase: 'Connecting to AI agent...' })

        const eventStream = streamLangGraphAgent({
          message,
          conversationHistory,
          userContext: {
            userId,
            convexUserId: userData.id,
            businessId: resolvedBusinessId,
            conversationId: conversationId || 'new',
            homeCurrency: userData.home_currency || undefined,
            role: userRole,
          },
          language,
        })

        for await (const event of eventStream) {
          // Accumulate for server-side persistence
          if (event.event === 'text') {
            accumulatedText += (event.data as { token: string }).token
          } else if (event.event === 'action') {
            accumulatedActions.push(event.data)
          } else if (event.event === 'citation') {
            accumulatedCitations = (event.data as { citations: unknown[] }).citations
          }

          writeEvent(event.event, event.data)
        }
      } catch (error) {
        console.error('[Chat API] Stream error:', error)
        writeEvent('error', {
          message: 'Failed to process message',
          code: 'STREAM_ERROR',
        })
      } finally {
        // Server-side persistence: save the assistant message to Convex
        // This guarantees the message is saved even if the client disconnects.
        let serverPersisted = false
        if (accumulatedText && conversationId && convexClient) {
          try {
            const metadata: Record<string, unknown> = {}
            if (accumulatedCitations.length > 0) metadata.citations = accumulatedCitations
            if (accumulatedActions.length > 0) metadata.actions = accumulatedActions

            await convexClient.mutation(api.functions.messages.create, {
              conversationId,
              role: 'assistant',
              content: accumulatedText,
              metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
            })
            serverPersisted = true
            console.log(`[Chat API] Server persisted assistant message for conversation ${conversationId}`)
          } catch (persistError) {
            console.error('[Chat API] Server-side persistence failed:', persistError)
          }
        }

        // Signal to the client whether the server already persisted
        writeEvent('done', { serverPersisted })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
