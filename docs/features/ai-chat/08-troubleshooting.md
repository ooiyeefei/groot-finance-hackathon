# Troubleshooting Guide

## Common Issues and Solutions

### 1. Authentication Failures

#### Symptoms
- `401 Unauthorized` responses
- "Authentication error" messages in chat
- User context validation failures

#### Diagnosis
```typescript
// Check user context in validation-node.ts
console.log('[Debug] UserContext:', {
  exists: !!state.userContext,
  userId: state.userContext?.userId,
  format: typeof state.userContext?.userId
});
```

#### Solutions
1. **Verify Clerk Configuration**:
   ```bash
   # Check environment variables
   echo $NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
   echo $CLERK_SECRET_KEY
   ```

2. **Check User Database Sync**:
   ```sql
   -- Verify user exists in Supabase
   SELECT id, clerk_user_id FROM users WHERE clerk_user_id = 'user_xxx';
   ```

3. **RLS Policy Verification**:
   ```sql
   -- Test RLS policies
   SET session.user_id = 'user_xxx';
   SELECT * FROM transactions LIMIT 1;
   ```

### 2. Circuit Breaker Activation

#### Symptoms
- Conversations ending abruptly with "I'm having trouble processing your request"
- Router logs showing circuit breaker activation

#### Diagnosis
```typescript
// Enable detailed router logging
console.log('[Router DEBUG] State:', JSON.stringify({
  phase: state.currentPhase,
  messageCount: state.messages?.length,
  lastMessageType: state.messages?.[state.messages.length - 1]?._getType(),
  failureCount: state.failureCount,
  turnLength: getCurrentTurnMessages(state).length
}, null, 2));
```

#### Common Triggers and Solutions

1. **Turn Length Exceeded (>8 messages)**
   ```typescript
   // Review conversation flow for loops
   // Check if tools are generating excessive back-and-forth
   ```

2. **Repeated Tool Failures**
   ```typescript
   // Check tool execution logs
   console.log('[Tool] Execution result:', result.success, result.error);
   ```

3. **No Results Pattern**
   ```typescript
   // Verify database has data for user
   SELECT COUNT(*) FROM transactions WHERE user_id = 'user_xxx';
   ```

#### Prevention Strategies
- Monitor conversation patterns in production
- Adjust circuit breaker thresholds if needed
- Implement tool retry logic with exponential backoff

### 3. Tool Execution Failures

#### Transaction Lookup Tool Issues

**Symptom**: "No transactions found" when data exists

**Diagnosis**:
```typescript
// Check query parameters
console.log('[Debug] Query params:', {
  query: parameters.query,
  dateRange: parameters.dateRange,
  startDate: parameters.startDate,
  endDate: parameters.endDate
});

// Check database query
const { data, error } = await query;
console.log('[Debug] DB result:', { count: data?.length, error });
```

**Common Solutions**:
1. **Date Range Issues**:
   ```typescript
   // Verify date calculations
   const dateRange = this._calculateDateRange(params);
   console.log('[Debug] Calculated dates:', dateRange);
   ```

2. **RLS Permission Issues**:
   ```typescript
   // Verify authenticated client
   if (!this.authenticatedSupabase) {
     console.error('[Tool] No authenticated client available');
     return { success: false, error: 'Authentication failed' };
   }
   ```

3. **Query Sanitization Over-filtering**:
   ```typescript
   // Check if query sanitization is removing too much
   const original = parameters.query;
   const sanitized = this._sanitize_query(parameters.query);
   console.log('[Debug] Query sanitization:', { original, sanitized });
   ```

#### Document Search Tool Issues

**Symptom**: "No documents found" or vector search errors

**Diagnosis**:
```typescript
// Check Qdrant connection
try {
  await this.qdrantClient.getCollections();
  console.log('[Debug] Qdrant connection successful');
} catch (error) {
  console.error('[Debug] Qdrant connection failed:', error);
}
```

**Solutions**:
1. **Vector Database Connection**:
   ```bash
   # Test Qdrant connectivity
   curl -X GET "${QDRANT_URL}/collections" \
        -H "api-key: ${QDRANT_API_KEY}"
   ```

2. **Embedding Generation**:
   ```typescript
   // Verify embedding service
   const embedding = await this.generateEmbedding("test query");
   console.log('[Debug] Embedding length:', embedding.length);
   ```

### 4. Memory and Performance Issues

#### High Memory Usage

**Symptoms**:
- Slow response times
- API timeouts
- Out of memory errors

**Diagnosis**:
```typescript
// Monitor conversation state size
console.log('[Debug] State size:', {
  messagesCount: state.messages?.length,
  citationsCount: state.citations?.length,
  messagesSizeKB: JSON.stringify(state.messages).length / 1024
});
```

**Solutions**:
1. **Conversation Trimming**:
   ```typescript
   // Implement aggressive trimming for long conversations
   const MAX_MESSAGES = 25; // Reduce from 50 if needed
   ```

2. **Citation Cleanup**:
   ```typescript
   // Clear citations more frequently
   if (isNewTurn && state.citations.length > 10) {
     state.citations = [];
   }
   ```

#### Slow Database Queries

**Symptoms**:
- Tool execution timeouts
- Long response delays

**Diagnosis**:
```sql
-- Check query performance
EXPLAIN ANALYZE
SELECT * FROM transactions
WHERE user_id = 'user_xxx'
AND transaction_date >= '2024-01-01'
ORDER BY transaction_date DESC;
```

**Solutions**:
1. **Index Verification**:
   ```sql
   -- Ensure indexes exist
   \d+ transactions
   ```

2. **Query Optimization**:
   ```typescript
   // Reduce result set size
   const limit = this.isAnalysisQuery(params) ? 25 : 10; // Reduce limits
   ```

### 5. LLM Integration Issues

#### API Key Problems

**Symptoms**:
- "Invalid API key" errors
- Guardrail failures with undefined headers

**Diagnosis**:
```typescript
// Check API key configuration
console.log('[Debug] API config:', {
  provider: aiConfig.chat.provider,
  hasApiKey: !!aiConfig.chat.apiKey,
  keyLength: aiConfig.chat.apiKey?.length,
  keyPrefix: aiConfig.chat.apiKey?.substring(0, 10)
});
```

**Solutions**:
1. **Environment Variable Check**:
   ```bash
   # Verify environment variables are loaded
   node -e "console.log(process.env.AI_CHAT_API_KEY?.substring(0, 10))"
   ```

2. **API Key Validation Enhancement**:
   ```typescript
   // Implement robust validation
   if (typeof aiConfig.chat.apiKey !== 'string' ||
       aiConfig.chat.apiKey.length < 10) {
     throw new Error('Invalid API key configuration');
   }
   ```

#### Model Response Issues

**Symptoms**:
- Malformed tool calls
- Incomplete responses
- Invalid JSON in tool parameters

**Diagnosis**:
```typescript
// Log raw LLM responses
console.log('[Debug] LLM response:', {
  content: response.content,
  toolCalls: response.tool_calls?.length,
  finishReason: response.finish_reason
});
```

**Solutions**:
1. **Tool Call Validation**:
   ```typescript
   // Enhance tool call correction
   if (message.finish_reason === 'tool_calls' &&
       (!message.tool_calls || message.tool_calls.length === 0)) {
     console.log('[Debug] Malformed tool call detected');
     return 'correctToolCall';
   }
   ```

2. **Parameter Schema Validation**:
   ```typescript
   // Add JSON schema validation
   const ajv = new Ajv();
   const validate = ajv.compile(this.getToolSchema().function.parameters);
   if (!validate(parameters)) {
     return { success: false, error: 'Invalid parameters' };
   }
   ```

### 6. State Management Issues

#### Clarification Loop Problems

**Symptoms**:
- Users stuck in clarification loops
- State not properly restored after clarification
- Validation failures after clarification responses

**Diagnosis**:
```typescript
// Check clarification state restoration
console.log('[Debug] Clarification restoration:', {
  isClarificationResponse: state.isClarificationResponse,
  hasUserContext: !!state.userContext,
  currentPhase: state.currentPhase,
  needsClarification: state.needsClarification
});
```

**Solutions**:
1. **State Restoration Fix**:
   ```typescript
   // Ensure proper state restoration
   if (isClarificationResponse.isResponse) {
     agentState = {
       ...isClarificationResponse.originalState,
       userContext: currentUserContext,  // Critical: refresh user context
       currentPhase: 'execution',        // Reset from 'completed'
       needsClarification: false,        // Clear flags
       isClarificationResponse: true     // Mark appropriately
     };
   }
   ```

2. **Metadata Cleanup**:
   ```typescript
   // Clear clarification metadata after processing
   await supabase
     .from('conversation_messages')
     .update({
       metadata: {
         ...existingMetadata,
         clarification_pending: false
       }
     })
     .eq('id', messageId);
   ```

## Debugging Tools and Techniques

### 1. Enhanced Logging

```typescript
// Comprehensive state logging utility
function logAgentState(state: AgentState, context: string) {
  console.log(`[Debug ${context}]`, {
    phase: state.currentPhase,
    messageCount: state.messages?.length,
    lastMessageType: state.messages?.[state.messages.length - 1]?._getType(),
    hasUserContext: !!state.userContext?.userId,
    securityValidated: state.securityValidated,
    failureCount: state.failureCount,
    citationsCount: state.citations?.length,
    isTopicAllowed: state.isTopicAllowed,
    isClarificationResponse: state.isClarificationResponse,
    needsClarification: state.needsClarification
  });
}
```

### 2. Performance Monitoring

```typescript
// Add execution timing to all nodes
const nodeWithTiming = (nodeFn: Function, nodeName: string) =>
  async (state: AgentState) => {
    const start = Date.now();
    try {
      const result = await nodeFn(state);
      console.log(`[Performance] ${nodeName}: ${Date.now() - start}ms`);
      return result;
    } catch (error) {
      console.error(`[Error] ${nodeName} failed after ${Date.now() - start}ms:`, error);
      throw error;
    }
  };
```

### 3. Database Query Analysis

```sql
-- Monitor slow queries
SELECT query, mean_exec_time, calls, total_exec_time
FROM pg_stat_statements
WHERE query ILIKE '%transactions%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE tablename = 'transactions'
ORDER BY n_distinct DESC;
```

### 4. Environment Validation Script

```typescript
// Environment validation utility
export function validateEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required environment variables
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY',
    'AI_CHAT_API_KEY'
  ];

  for (const env of required) {
    if (!process.env[env]) {
      errors.push(`Missing environment variable: ${env}`);
    }
  }

  // Validate API keys format
  if (process.env.AI_CHAT_API_KEY && process.env.AI_CHAT_API_KEY.length < 10) {
    errors.push('AI_CHAT_API_KEY appears to be invalid (too short)');
  }

  return { valid: errors.length === 0, errors };
}
```

## Production Monitoring

### Key Metrics to Monitor

1. **Agent Performance**:
   - Average conversation completion time
   - Circuit breaker activation rate
   - Tool execution success rate

2. **Database Performance**:
   - Query execution times
   - Connection pool utilization
   - RLS policy enforcement overhead

3. **User Experience**:
   - Clarification loop frequency
   - Conversation completion rate
   - User satisfaction with responses

### Alerting Thresholds

```typescript
const ALERT_THRESHOLDS = {
  CIRCUIT_BREAKER_RATE: 0.1,      // Alert if >10% of conversations trigger circuit breaker
  AVG_RESPONSE_TIME: 8000,        // Alert if average response time >8 seconds
  TOOL_FAILURE_RATE: 0.05,        // Alert if >5% of tool executions fail
  DATABASE_QUERY_TIME: 2000,      // Alert if database queries >2 seconds
  MEMORY_USAGE_MB: 512            // Alert if memory usage >512MB
};
```

---

*Use this guide to diagnose and resolve issues quickly in both development and production environments.*