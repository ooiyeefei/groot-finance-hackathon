# API Integration and Configuration

## Chat API Endpoint

### Main Route Handler (`/api/chat/route.ts`)

The chat API serves as the primary interface between the frontend and the LangGraph agent system.

```typescript
export async function POST(request: NextRequest) {
  // 1. Authentication Layer
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Request Processing
  const { message, conversationId, language } = await request.json()

  // 3. Conversation Management
  let conversation = await loadOrCreateConversation(conversationId, userId)

  // 4. Clarification Context Detection
  const isClarificationResponse = await checkClarificationContext(conversation, message)

  // 5. Agent State Creation/Restoration
  const agentState = await createOrRestoreAgentState(
    conversation,
    message,
    userId,
    language,
    isClarificationResponse
  )

  // 6. LangGraph Agent Execution
  const agent = createFinancialAgent()
  const result = await agent.invoke(agentState)

  // 7. Response Processing and Storage
  const response = await processAgentResponse(result, conversation)

  return NextResponse.json(response)
}
```

### Conversation Management

#### Loading Conversation History

```typescript
async function loadOrCreateConversation(conversationId: string, userId: string) {
  const { data: conversation } = await supabase
    .from('conversations')
    .select(`
      id, title, created_at, updated_at,
      messages:conversation_messages(
        id, role, content, tool_calls, tool_call_id,
        created_at, metadata
      )
    `)
    .eq('id', conversationId)
    .eq('user_id', userId)
    .order('created_at', { foreignTable: 'conversation_messages', ascending: true })
    .single()

  if (!conversation) {
    // Create new conversation
    const { data: newConversation } = await supabase
      .from('conversations')
      .insert({
        id: conversationId,
        user_id: userId,
        title: generateConversationTitle(message),
        metadata: { language }
      })
      .select()
      .single()

    return { ...newConversation, messages: [] }
  }

  return conversation
}
```

#### Message Persistence

```typescript
async function saveConversationMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  metadata?: any
) {
  return await supabase
    .from('conversation_messages')
    .insert({
      conversation_id: conversationId,
      role,
      content,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    })
}
```

### Clarification Context Management

#### Detection Logic

```typescript
async function checkClarificationContext(conversation: any, message: string): Promise<{
  isResponse: boolean;
  originalState?: AgentState;
}> {
  if (!conversation?.messages?.length) {
    return { isResponse: false }
  }

  // Find the most recent assistant message
  const recentMessages = conversation.messages.slice(-5)
  const lastAssistantMessage = recentMessages
    .reverse()
    .find(msg => msg.role === 'assistant')

  if (!lastAssistantMessage?.metadata?.clarification_pending) {
    return { isResponse: false }
  }

  // Restore agent state from metadata
  const originalState = lastAssistantMessage.metadata.agent_state

  return {
    isResponse: true,
    originalState: {
      ...originalState,
      userContext: { userId: conversation.user_id }, // Refresh user context
      currentPhase: 'execution',                     // Reset from 'completed'
      needsClarification: false,                     // Clear clarification flags
      isClarificationResponse: true                  // Mark as clarification response
    }
  }
}
```

## AI Model Configuration

### Provider Configuration (`src/lib/ai-config.ts`)

```typescript
export interface AIConfig {
  chat: {
    provider: 'openai' | 'anthropic' | 'groq' | 'gemini'
    model: string
    apiKey: string
    baseURL?: string
    temperature?: number
    maxTokens?: number
  }
  guardrail: {
    provider: 'openai' | 'anthropic'
    model: string
    apiKey: string
    baseURL?: string
  }
}

// Environment-based configuration
export const aiConfig: AIConfig = {
  chat: {
    provider: process.env.AI_CHAT_PROVIDER as any || 'openai',
    model: process.env.AI_CHAT_MODEL || 'gpt-4-turbo-preview',
    apiKey: process.env.AI_CHAT_API_KEY!,
    baseURL: process.env.AI_CHAT_BASE_URL,
    temperature: parseFloat(process.env.AI_CHAT_TEMPERATURE || '0.1'),
    maxTokens: parseInt(process.env.AI_CHAT_MAX_TOKENS || '2000')
  },
  guardrail: {
    provider: process.env.AI_GUARDRAIL_PROVIDER as any || 'openai',
    model: process.env.AI_GUARDRAIL_MODEL || 'gpt-3.5-turbo',
    apiKey: process.env.AI_GUARDRAIL_API_KEY!,
    baseURL: process.env.AI_GUARDRAIL_BASE_URL
  }
}
```

### Model Initialization

```typescript
// model-node.ts - LLM client creation
function createLLMClient(config: AIConfig['chat']): ChatOpenAI {
  const clientConfig: any = {
    model: config.model,
    temperature: config.temperature || 0.1,
    maxTokens: config.maxTokens || 2000,
    apiKey: config.apiKey
  }

  if (config.baseURL) {
    clientConfig.configuration = {
      baseURL: config.baseURL
    }
  }

  return new ChatOpenAI(clientConfig)
}
```

## LangGraph Integration Patterns

### Agent Factory

```typescript
// langgraph-agent.ts - Main agent creation
export function createFinancialAgent(): StateGraph<AgentState> {
  const graph = new StateGraph(AgentStateAnnotation)

  // Node registration with proper typing
  graph.addNode("topicGuardrail", topicGuardrail)
  graph.addNode("handleOffTopic", handleOffTopic)
  graph.addNode("validate", validate)
  graph.addNode("analyzeIntent", analyzeIntent)
  graph.addNode("handleClarification", handleClarification)
  graph.addNode("callModel", callModel)
  graph.addNode("executeTool", executeTool)
  graph.addNode("correctToolCall", correctToolCall)

  // Edge definitions with router logic
  graph.addEdge(START, "topicGuardrail")
  graph.addConditionalEdges("topicGuardrail", router)
  graph.addConditionalEdges("validate", router)
  graph.addConditionalEdges("analyzeIntent", router)
  graph.addConditionalEdges("handleClarification", router)
  graph.addConditionalEdges("callModel", router)
  graph.addConditionalEdges("executeTool", router)
  graph.addConditionalEdges("correctToolCall", router)

  return graph.compile()
}
```

### State Management Integration

```typescript
// Agent state integration with API
export async function processWithAgent(
  message: string,
  userContext: UserContext,
  existingState?: Partial<AgentState>
): Promise<{
  response: string;
  citations: CitationData[];
  conversationComplete: boolean;
}> {
  const agent = createFinancialAgent()

  const initialState: AgentState = {
    messages: [new HumanMessage(message)],
    language: 'en',
    userContext,
    securityValidated: false,
    failureCount: 0,
    currentIntent: null,
    needsClarification: false,
    clarificationQuestions: [],
    currentPhase: 'validation',
    citations: [],
    isTopicAllowed: undefined,
    isClarificationResponse: false,
    ...existingState
  }

  try {
    const result = await agent.invoke(initialState)

    return {
      response: extractFinalResponse(result.messages),
      citations: result.citations || [],
      conversationComplete: result.currentPhase === 'completed'
    }
  } catch (error) {
    console.error('[Agent] Execution error:', error)
    throw error
  }
}
```

## Tool Integration

### Dynamic Schema Generation

```typescript
// Integration with ToolFactory for LLM function calling
export async function callModel(state: AgentState): Promise<Partial<AgentState>> {
  const llm = createLLMClient(aiConfig.chat)

  // Get dynamic tool schemas from factory
  const tools = ToolFactory.getToolSchemas('openai')

  const systemPrompt = createSystemPrompt(state, tools)

  const response = await llm.invoke(
    state.messages,
    {
      tools: tools,
      system: systemPrompt
    }
  )

  return {
    messages: [...state.messages, response]
  }
}
```

### Tool Execution Integration

```typescript
// Secure tool execution with factory pattern
export async function executeTool(state: AgentState): Promise<Partial<AgentState>> {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage

  const toolResults: ToolMessage[] = []
  let updatedCitations = [...(state.citations || [])]
  let failureCount = state.failureCount || 0

  for (const toolCall of lastMessage.tool_calls || []) {
    try {
      // Factory-based tool execution
      const result = await ToolFactory.executeTool(
        toolCall.name,
        toolCall.args,
        state.userContext
      )

      // Process results
      const toolMessage = new ToolMessage({
        content: JSON.stringify(result),
        tool_call_id: toolCall.id
      })

      toolResults.push(toolMessage)

      // Merge citations if available
      if (result.citations) {
        updatedCitations = mergeCitations(updatedCitations, result.citations)
      }

      // Reset failure count on success
      if (result.success) {
        failureCount = 0
      } else {
        failureCount += 1
      }

    } catch (error) {
      console.error(`[Tool] ${toolCall.name} execution failed:`, error)

      const errorMessage = new ToolMessage({
        content: JSON.stringify({
          success: false,
          error: 'Tool execution failed'
        }),
        tool_call_id: toolCall.id
      })

      toolResults.push(errorMessage)
      failureCount += 1
    }
  }

  return {
    messages: [...state.messages, ...toolResults],
    citations: updatedCitations,
    failureCount
  }
}
```

## External Service Integration

### Supabase Integration

#### Authenticated Client Creation

```typescript
// Security pattern for database access
export async function createAuthenticatedSupabaseClient(
  userId: string
): Promise<SupabaseClient | null> {
  try {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service role for RLS
      {
        auth: {
          persistSession: false // Stateless for performance
        },
        global: {
          headers: {
            'sb-user-id': userId // Custom header for RLS context
          }
        }
      }
    )

    // Verify client can access user data
    const { data: user } = await client
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single()

    if (!user) {
      console.error(`[Auth] User not found: ${userId}`)
      return null
    }

    return client
  } catch (error) {
    console.error('[Auth] Failed to create authenticated client:', error)
    return null
  }
}
```

### Vector Search Integration (Qdrant)

```typescript
// Document search tool integration
export class DocumentSearchTool extends BaseTool {
  private qdrantClient: QdrantClient

  constructor() {
    super()
    this.qdrantClient = new QdrantClient({
      url: process.env.QDRANT_URL!,
      apiKey: process.env.QDRANT_API_KEY!
    })
  }

  protected async executeInternal(
    parameters: ToolParameters,
    userContext: UserContext
  ): Promise<ToolResult> {
    try {
      // Generate embedding for query
      const embedding = await this.generateEmbedding(parameters.query)

      // Search Qdrant collection
      const searchResults = await this.qdrantClient.search('financial-docs', {
        vector: embedding,
        limit: parameters.limit || 5,
        filter: {
          must: [
            { key: 'country', match: { value: parameters.country } }
          ]
        }
      })

      // Format results with citations
      const citations = searchResults.map((result, index) => ({
        id: `doc_${index + 1}`,
        source_name: result.payload?.source_name,
        country: result.payload?.country,
        content_snippet: result.payload?.content,
        confidence_score: result.score,
        official_url: result.payload?.url
      }))

      return {
        success: true,
        data: this.formatSearchResults(searchResults),
        citations,
        metadata: {
          query: parameters.query,
          resultsCount: searchResults.length
        }
      }

    } catch (error) {
      console.error('[DocumentSearch] Vector search failed:', error)
      return {
        success: false,
        error: 'Document search temporarily unavailable'
      }
    }
  }
}
```

## Error Handling and Recovery

### API Error Responses

```typescript
// Standardized error handling in API routes
function handleAPIError(error: any): NextResponse {
  if (error.message?.includes('unauthorized')) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }

  if (error.message?.includes('rate limit')) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429 }
    )
  }

  // Generic error (don't expose internal details)
  console.error('[API] Internal error:', error)
  return NextResponse.json(
    { error: 'Service temporarily unavailable' },
    { status: 500 }
  )
}
```

### Circuit Breaker Integration

```typescript
// API-level circuit breaker for agent timeouts
const AGENT_TIMEOUT = 30000 // 30 seconds

export async function POST(request: NextRequest) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Agent timeout')), AGENT_TIMEOUT)
  })

  try {
    const result = await Promise.race([
      agent.invoke(agentState),
      timeoutPromise
    ])

    return NextResponse.json(result)

  } catch (error) {
    if (error.message === 'Agent timeout') {
      return NextResponse.json(
        { error: 'Request timeout. Please try a simpler query.' },
        { status: 408 }
      )
    }

    return handleAPIError(error)
  }
}
```

---

*This integration layer ensures secure, reliable, and performant communication between the frontend, agent system, and external services.*