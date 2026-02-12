/**
 * CopilotKit Runtime Endpoint
 *
 * POST /api/copilotkit — handles all CopilotKit agent communication.
 * Replaces the old /api/v1/chat endpoint.
 *
 * Auth: Clerk session token
 * Rate limit: 30 messages/hour/user
 * LLM: GoogleGenerativeAIAdapter (gemini-3-flash-preview)
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  CopilotRuntime,
  GoogleGenerativeAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime'
import { auth } from '@clerk/nextjs/server'
import { getUserDataConvex } from '@/lib/convex'
import { rateLimit } from '@/domains/security/lib/rate-limit'
import { invokeLangGraphAgent } from '@/lib/ai/copilotkit-adapter'

// Create the LLM adapter for CopilotKit's own needs
// (The LangGraph agent manages its own LLM calls internally)
const serviceAdapter = new GoogleGenerativeAIAdapter({
  model: 'gemini-3-flash-preview',
})

// Create CopilotKit runtime with our LangGraph agent as a server-side action
const runtime = new CopilotRuntime({
  actions: [
    {
      name: 'financialAgent',
      description:
        'FinanSEAL financial co-pilot agent. Handles expense queries, vendor analytics, compliance questions, and financial insights for Southeast Asian SMEs.',
      parameters: [
        {
          name: 'message',
          type: 'string',
          description: 'The user message to send to the financial agent',
          required: true,
        },
        {
          name: 'conversationId',
          type: 'string',
          description: 'The conversation ID for context',
          required: false,
        },
      ],
      handler: async ({ message, conversationId }: { message: string; conversationId?: string }) => {
        // UserContext is injected via request properties (set in POST handler)
        // For now, return a placeholder — the actual agent invocation happens
        // through the CopilotKit message flow
        return { result: message }
      },
    },
  ],
})

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

  if (!userData.business_id) {
    return NextResponse.json(
      { error: 'No business context found' },
      { status: 400 }
    )
  }

  // 4. Pass to CopilotKit runtime with user context as properties
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: '/api/copilotkit',
    properties: {
      userId,
      convexUserId: userData.id,
      businessId: userData.business_id,
    },
  })

  return handleRequest(req)
}
