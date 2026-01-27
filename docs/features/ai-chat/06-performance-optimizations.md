# Performance Optimizations

## Database Query Performance

### Composite Index Strategy

The agent system relies on optimized database queries with carefully designed composite indexes:

```sql
-- Critical performance indexes
CREATE INDEX idx_transactions_user_date ON transactions(user_id, transaction_date DESC);
CREATE INDEX idx_transactions_user_doctype_date ON transactions(user_id, document_type, transaction_date DESC);
CREATE INDEX idx_conversations_user_updated ON conversations(user_id, updated_at DESC);
```

### Query Optimization Patterns

#### Transaction Lookup Performance (`transaction-lookup-tool.ts`)

```typescript
// Optimized query structure for maximum performance
private buildOptimizedQuery(params: TransactionLookupParameters, userContext: UserContext) {
  let query = this.authenticatedSupabase
    .from('transactions')
    .select(`
      id, description, original_amount, original_currency,
      home_currency_amount, transaction_date, category,
      vendor_name, transaction_type, document_type, created_at
    `)
    .eq('user_id', userContext.userId)  // RLS + index optimization

  // Apply high-confidence filters first (leverages indexes)
  if (params.startDate) query = query.gte('transaction_date', params.startDate)
  if (params.endDate) query = query.lte('transaction_date', params.endDate)
  if (params.document_type) query = query.eq('document_type', params.document_type)

  // Apply ordering after filters for index efficiency
  query = query.order('transaction_date', { ascending: false })

  // Dynamic limits based on query type
  const limit = this.isAnalysisQuery(params) ? Math.max(50, params.limit * 3) : params.limit
  return query.limit(limit)
}
```

**Performance Rationale**:
1. **User Filter First**: `user_id` filter leverages RLS and primary index
2. **High-Confidence Filters**: Date ranges and document types have dedicated indexes
3. **Ordering After Filters**: Prevents expensive full-table sorts
4. **Dynamic Limits**: Analysis queries fetch more data for pattern detection

### Memory Management Strategies

#### Conversation Memory Optimization

```typescript
// validation-node.ts - Strategic citation cleanup
const isNewTurn = state.messages[state.messages.length - 1]?._getType() === 'human'
                  && !state.isClarificationResponse;

return {
  securityValidated: true,
  currentPhase: 'intent_analysis',
  citations: isNewTurn ? [] : state.citations // Reset for new conversations
};
```

#### Message History Limits

```typescript
// AgentState management - Prevent memory bloat
const MAX_CONVERSATION_LENGTH = 50;

// Automatic message trimming in state reducer
messages: (existing, new) => {
  const combined = [...(existing || []), ...new];
  return combined.slice(-MAX_CONVERSATION_LENGTH); // Keep only recent messages
}
```

## LLM API Optimization

### Request Batching and Caching

```typescript
// Future enhancement: Response caching for common queries
private async getCachedOrAnalyze(query: string): Promise<IntentAnalysis> {
  const cacheKey = `intent_${hash(query)}`;

  // Check cache first
  const cached = await this.getFromCache(cacheKey);
  if (cached && !this.isCacheExpired(cached)) {
    return cached.analysis;
  }

  // Perform analysis and cache
  const analysis = await this.performIntentAnalysis(query);
  await this.setCache(cacheKey, { analysis, timestamp: Date.now() }, 300); // 5min TTL

  return analysis;
}
```

### Token Optimization

#### Efficient System Prompts

```typescript
// Concise, role-focused prompts to minimize token usage
const systemPrompt = `You are a financial co-pilot for Southeast Asian SMEs.
Available tools: ${tools.map(t => t.function.name).join(', ')}
Respond in ${state.language}. Use tools when data lookup is needed.`;

// Context-aware prompt adjustment
if (state.currentIntent?.category === 'regulatory_knowledge') {
  systemPrompt += ' Focus on compliance and regulatory guidance.';
}
```

#### Message Compression

```typescript
// Intelligent conversation history compression
private compressConversationHistory(messages: BaseMessage[]): BaseMessage[] {
  const recentMessages = messages.slice(-10); // Keep 10 most recent
  const importantMessages = messages.filter(msg =>
    msg.content.includes('IMPORTANT') ||
    msg._getType() === 'system'
  );

  return [...importantMessages, ...recentMessages]
    .filter((msg, index, arr) => arr.indexOf(msg) === index); // Deduplicate
}
```

## Circuit Breaker Performance

### Unified Protection Function

```typescript
// Optimized from 5 separate mechanisms to single function
function checkCircuitBreaker(state: AgentState): { shouldBreak: boolean; reason?: string } {
  if (!state.messages || state.messages.length === 0) {
    return { shouldBreak: false };
  }

  // Efficient turn boundary calculation
  const currentTurnMessages = this.getCurrentTurnMessages(state);
  const currentTurnLength = currentTurnMessages.length;

  // Single-pass analysis of current turn
  let noResultsCount = 0;
  let toolFailuresCount = 0;

  for (const msg of currentTurnMessages) {
    if (msg._getType() === 'tool') {
      const content = typeof msg.content === 'string' ? msg.content : '';

      // Check for no results pattern
      if (content.includes('No transactions found') ||
          content.includes('No results found') ||
          content.includes('No documents found')) {
        noResultsCount++;
      }

      // Check for tool failures
      if (content.includes('error') || content.includes('failed') || content.includes('timeout')) {
        toolFailuresCount++;
      }
    }
  }

  // Consolidated threshold checks
  if (currentTurnLength > 8) return { shouldBreak: true, reason: `Turn too long (${currentTurnLength} messages)` };
  if (state.failureCount && state.failureCount >= 3) return { shouldBreak: true, reason: `${state.failureCount} consecutive failures` };
  if (noResultsCount >= 2) return { shouldBreak: true, reason: `${noResultsCount} repeated "no results" responses` };
  if (toolFailuresCount >= 3) return { shouldBreak: true, reason: `${toolFailuresCount} tool failures in current turn` };

  return { shouldBreak: false };
}
```

**Performance Benefits**:
- **Single-Pass Analysis**: One loop instead of multiple filters
- **Early Exit**: Return immediately on threshold breach
- **Reduced Function Calls**: Consolidated logic prevents overhead
- **Memory Efficiency**: Process messages once, not multiple times

## Tool Execution Performance

### Parameter Processing Optimization

```typescript
// Optimized parameter sanitization (transaction-lookup-tool.ts)
private _processAndSanitizeParameters(params: TransactionLookupParameters): any {
  const sanitizedParams = { ...params }; // Shallow copy to prevent mutation

  // Efficient query sanitization
  if (sanitizedParams.query) {
    sanitizedParams.query = this._sanitize_query(sanitizedParams.query);
  }

  // Date range optimization - single calculation
  const dateRange = this._calculateDateRange(sanitizedParams);
  if (dateRange.startDate) sanitizedParams.startDate = dateRange.startDate;
  if (dateRange.endDate) sanitizedParams.endDate = dateRange.endDate;

  return sanitizedParams;
}
```

### Database Connection Pooling

```typescript
// Efficient authenticated client creation
export async function createAuthenticatedSupabaseClient(userId: string): Promise<SupabaseClient | null> {
  // Connection pooling via Supabase client reuse
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service role for RLS
    {
      auth: { persistSession: false }, // Stateless for performance
      global: {
        headers: { 'sb-user-id': userId } // Custom RLS context
      }
    }
  );

  return client;
}
```

## Real-World Performance Metrics

### Expected Performance Targets

```typescript
// Performance monitoring thresholds
const PERFORMANCE_TARGETS = {
  TOPIC_GUARDRAIL: 2000,      // 2s max for topic classification
  INTENT_ANALYSIS: 3000,      // 3s max for intent understanding
  TRANSACTION_LOOKUP: 1500,   // 1.5s max for database queries
  DOCUMENT_SEARCH: 2500,      // 2.5s max for vector search
  TOTAL_CONVERSATION: 8000,   // 8s max for complete conversation turn
};
```

### Performance Monitoring

```typescript
// Execution time tracking in tools
const startTime = Date.now();

try {
  const result = await this.performToolOperation(parameters, userContext);
  const executionTime = Date.now() - startTime;

  console.log(`[Performance] ${this.getToolName()} executed in ${executionTime}ms`);

  return {
    success: true,
    data: result,
    metadata: { executionTime }
  };
} catch (error) {
  const executionTime = Date.now() - startTime;
  console.error(`[Performance] ${this.getToolName()} failed after ${executionTime}ms:`, error);
  throw error;
}
```

## Scalability Optimizations

### Stateless Processing

```typescript
// All node functions are pure and stateless
export async function analyzeIntent(state: AgentState): Promise<Partial<AgentState>> {
  // No shared state - all context in AgentState
  // Enables horizontal scaling and distributed processing

  const analysis = await performIntentAnalysis(state.messages);

  return {
    currentIntent: analysis,
    currentPhase: analysis.needsClarification ? 'clarification' : 'execution'
  };
}
```

### Lazy Loading Strategies

```typescript
// Tool factory with lazy initialization
export class ToolFactory {
  private static toolInstances: Map<string, BaseTool> = new Map();

  static getTool(toolName: string): BaseTool {
    if (!this.toolInstances.has(toolName)) {
      // Lazy instantiation - create only when needed
      switch (toolName) {
        case 'transaction-lookup':
          this.toolInstances.set(toolName, new TransactionLookupTool());
          break;
        // ... other tools
      }
    }

    return this.toolInstances.get(toolName)!;
  }
}
```

## Cache Strategies (Future Enhancements)

### Vector Search Caching

```typescript
// Regulatory knowledge caching for repeated queries
private async getCachedOrSearchDocuments(query: string, options: SearchOptions): Promise<SearchResult[]> {
  const cacheKey = `docs_${hash(query + JSON.stringify(options))}`;

  // Check cache first (Redis/Memory)
  const cached = await this.cache.get(cacheKey);
  if (cached && !this.isCacheExpired(cached)) {
    return cached.results;
  }

  // Perform vector search and cache results
  const results = await this.performVectorSearch(query, options);
  await this.cache.set(cacheKey, { results, timestamp: Date.now() }, 600); // 10min TTL

  return results;
}
```

### Intent Analysis Caching

```typescript
// Common intent patterns caching
const COMMON_INTENTS_CACHE = new Map([
  ['show my transactions', { category: 'transaction_analysis', confidence: 0.95 }],
  ['gst registration singapore', { category: 'regulatory_knowledge', confidence: 0.98, country: 'singapore' }],
  ['business setup malaysia', { category: 'business_setup', confidence: 0.92, country: 'malaysia' }]
]);
```

---

*These optimizations ensure the agent system performs efficiently under production loads while maintaining security and functionality.*