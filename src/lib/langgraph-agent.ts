/**
 * LangGraph Financial Co-pilot Agent
 * State-driven, cyclical agent architecture for intelligent financial assistance
 */

import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { BaseMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { EmbeddingService } from './ai-services/embedding-service';
import { VectorStorageService } from './ai-services/vector-storage-service';
import { aiConfig } from './config/ai-config';
import { createServiceSupabaseClient } from './supabase-server';

// Agent State Definition using modern Annotation.Root pattern
const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
    default: () => []
  }),
  language: Annotation<string>({
    reducer: (x: string, y: string) => y || x,
    default: () => 'en'
  }),
  userId: Annotation<string>({
    reducer: (x: string, y: string) => y || x,
    default: () => ''
  }),
  conversationId: Annotation<string>({
    reducer: (x: string, y: string) => y || x,
    default: () => ''
  })
});

// Export the state type for use in functions
export type AgentState = typeof AgentStateAnnotation.State;

// Tool execution results interface
interface ToolExecutionResult {
  toolName: string;
  result: string;
  error?: string;
}

/**
 * Document Search Tool - RAG search against Qdrant vector database
 */
class DocumentSearchTool {
  private embeddingService = new EmbeddingService();
  private vectorService = new VectorStorageService();

  async execute(query: string, userId?: string): Promise<string> {
    try {
      console.log(`[DocumentSearch] Processing query: ${query}`);

      // Generate embedding for the user's query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // Perform similarity search against Qdrant
      const searchResults = await this.vectorService.similaritySearch(
        queryEmbedding,
        5, // Return top 5 most relevant documents
        0.7 // Minimum similarity threshold
      );

      if (!searchResults || searchResults.length === 0) {
        return "No relevant documents found for your query. Please make sure you have uploaded documents related to your question.";
      }

      // Format the results
      const formattedResults = searchResults.map((result, index) => {
        const metadata = result.payload || {};
        return `Document ${index + 1} (Relevance: ${(result.score || 0).toFixed(3)}):
Content: ${result.payload?.text || 'No content available'}
Document ID: ${metadata.document_id || 'Unknown'}
Upload Date: ${metadata.created_at || 'Unknown'}`;
      }).join('\n\n');

      console.log(`[DocumentSearch] Found ${searchResults.length} relevant documents`);
      return `Found ${searchResults.length} relevant document(s):\n\n${formattedResults}`;

    } catch (error) {
      console.error('[DocumentSearch] Error:', error);
      return `Error searching documents: ${error instanceof Error ? error.message : 'Unknown error occurred'}`;
    }
  }
}

/**
 * Transaction Lookup Tool - SQL-based transaction queries
 */
class TransactionLookupTool {
  private supabase = createServiceSupabaseClient();

  async execute(query: string, userId?: string): Promise<string> {
    try {
      console.log(`[TransactionLookup] Processing query: ${query}`);

      // Convert natural language to SQL using SEA-LION
      const sqlQuery = await this.convertToSQL(query);
      
      if (!sqlQuery) {
        return "Unable to generate a valid SQL query from your request. Please try rephrasing your question.";
      }

      console.log(`[TransactionLookup] Generated SQL: ${sqlQuery}`);

      // Execute query against Supabase
      const { data, error } = await this.supabase
        .from('transactions')
        .select('*')
        .limit(50); // Simplified for now - in production, we'd use the generated SQL

      if (error) {
        console.error('[TransactionLookup] Query error:', error);
        return `Error executing query: ${error.message}`;
      }

      if (!data || data.length === 0) {
        return "No transactions found matching your criteria.";
      }

      return this.formatTransactionResults(data, query);

    } catch (error) {
      console.error('[TransactionLookup] Error:', error);
      return `Error looking up transactions: ${error instanceof Error ? error.message : 'Unknown error occurred'}`;
    }
  }

  private async convertToSQL(naturalLanguageQuery: string): Promise<string | null> {
    try {
      const systemPrompt = `You are an expert SQL generator for a financial database. Convert natural language queries to safe PostgreSQL SELECT statements.

Database Schema:
- transactions table with columns: id, user_id, transaction_type, description, original_amount, original_currency, home_currency_amount, transaction_date, category, vendor_name
- Always use appropriate WHERE clauses and LIMIT results

Return only the SQL query, no explanations.`;

      const response = await fetch(`${aiConfig.seaLion.endpointUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: aiConfig.seaLion.modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Convert this to SQL: ${naturalLanguageQuery}` }
          ],
          max_tokens: 300,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`SEA-LION API error: ${response.status}`);
      }

      const result = await response.json();
      const sqlQuery = result.choices?.[0]?.message?.content?.trim();
      
      if (!sqlQuery || !sqlQuery.toLowerCase().startsWith('select')) {
        throw new Error('Generated query is not a valid SELECT statement');
      }

      return sqlQuery;
    } catch (error) {
      console.error('[TransactionLookup] Text-to-SQL conversion error:', error);
      return null;
    }
  }

  private formatTransactionResults(data: any[], originalQuery: string): string {
    const summary = `Found ${data.length} transaction(s) for "${originalQuery}":\n\n`;
    
    const details = data.slice(0, 5).map((transaction, index) => {
      return `${index + 1}. ${transaction.description || 'No description'}
   Amount: ${transaction.original_amount} ${transaction.original_currency}
   Date: ${transaction.transaction_date}
   Category: ${transaction.category || 'Uncategorized'}
   Vendor: ${transaction.vendor_name || 'Unknown'}`;
    }).join('\n\n');

    const moreResultsNote = data.length > 5 ? `\n\n... and ${data.length - 5} more transactions` : '';
    
    return summary + details + moreResultsNote;
  }
}

/**
 * Tool Registry - manages available tools
 */
const toolRegistry = {
  search_documents: new DocumentSearchTool(),
  get_transactions: new TransactionLookupTool()
};

/**
 * Call Model Node - The agent's "brain"
 * Calls SEA-LION with prompt-guided tool calling system prompt
 */
async function callModel(state: AgentState): Promise<Partial<AgentState>> {
  console.log('[CallModel] Processing state with', state.messages.length, 'messages');

  const systemPrompt = getSystemPrompt(state.language || 'en');
  
  // Prepare messages for SEA-LION
  const messages = [
    { role: 'system', content: systemPrompt },
    ...state.messages.map(msg => ({
      role: msg._getType() === 'human' ? 'user' : 'assistant',
      content: msg.content
    }))
  ];

  try {
    const response = await fetch(`${aiConfig.seaLion.endpointUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiConfig.seaLion.modelId,
        messages,
        max_tokens: 1000,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`SEA-LION API error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || 'I apologize, but I cannot process your request right now.';

    console.log('[CallModel] SEA-LION response:', content);

    // Check if the response is a tool call (JSON format)
    try {
      const toolCall = JSON.parse(content);
      if (toolCall.tool_call && toolCall.tool_call.name) {
        // This is a tool call - add it to messages as an AI message
        return {
          messages: [...state.messages, new AIMessage(content)]
        };
      }
    } catch {
      // Not JSON, treat as regular response
    }

    // Regular text response - add to messages
    return {
      messages: [...state.messages, new AIMessage(content)]
    };

  } catch (error) {
    console.error('[CallModel] Error:', error);
    return {
      messages: [...state.messages, new AIMessage('I apologize, but I encountered an error processing your request. Please try again.')]
    };
  }
}

/**
 * Execute Tool Node - The agent's "hands"
 * Executes tools based on tool call JSON and adds results back to state
 */
async function executeTool(state: AgentState): Promise<Partial<AgentState>> {
  console.log('[ExecuteTool] Processing tool execution');

  const lastMessage = state.messages[state.messages.length - 1];
  
  if (!lastMessage || lastMessage._getType() !== 'ai') {
    console.error('[ExecuteTool] No AI message found for tool execution');
    return { messages: state.messages };
  }

  try {
    // Parse the tool call JSON
    const toolCall = JSON.parse(lastMessage.content as string);
    const toolName = toolCall.tool_call?.name;
    const parameters = toolCall.tool_call?.parameters || {};

    console.log(`[ExecuteTool] Executing tool: ${toolName} with parameters:`, parameters);

    if (!toolName || !toolRegistry[toolName as keyof typeof toolRegistry]) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    // Execute the tool
    const tool = toolRegistry[toolName as keyof typeof toolRegistry];
    const result = await tool.execute(parameters.query || '', state.userId);

    console.log(`[ExecuteTool] Tool ${toolName} completed`);

    // Add tool result as a ToolMessage
    const toolMessage = new ToolMessage({
      content: result,
      tool_call_id: toolName,
      name: toolName
    });

    return {
      messages: [...state.messages, toolMessage]
    };

  } catch (error) {
    console.error('[ExecuteTool] Error:', error);
    
    const errorMessage = new ToolMessage({
      content: `Tool execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      tool_call_id: 'error',
      name: 'error'
    });

    return {
      messages: [...state.messages, errorMessage]
    };
  }
}

/**
 * Router Function - Determines the next step based on current state
 */
function shouldContinue(state: AgentState): string {
  const lastMessage = state.messages[state.messages.length - 1];
  
  if (!lastMessage) {
    return END;
  }

  console.log(`[Router] Last message type: ${lastMessage._getType()}`);

  // If the last message is from AI, check if it's a tool call
  if (lastMessage._getType() === 'ai') {
    try {
      const content = lastMessage.content as string;
      const toolCall = JSON.parse(content);
      
      if (toolCall.tool_call && toolCall.tool_call.name) {
        console.log('[Router] Tool call detected, routing to executeTool');
        return 'executeTool';
      }
    } catch {
      // Not JSON, regular response
    }
    
    console.log('[Router] Regular AI response, ending conversation');
    return END;
  }

  // If the last message is a tool result, continue to callModel
  if (lastMessage._getType() === 'tool') {
    console.log('[Router] Tool result detected, routing to callModel');
    return 'callModel';
  }

  console.log('[Router] Default routing to callModel');
  return 'callModel';
}

/**
 * Get system prompt based on language
 */
function getSystemPrompt(language: string): string {
  const basePrompt = `You are FinanSEAL AI, a helpful financial co-pilot for Southeast Asian SMEs. You help users understand their financial data, find specific transactions, and analyze uploaded documents.

Available Tools:
1. search_documents - Search uploaded financial documents (invoices, receipts, reports)
2. get_transactions - Look up transaction data from financial records

When you need to use a tool, respond with JSON in this exact format:
{
  "tool_call": {
    "name": "search_documents",
    "parameters": {
      "query": "user's search query here"
    }
  },
  "reasoning": "Why you need to use this tool"
}

For regular responses (no tool needed), respond normally in conversational text.

Always be helpful, accurate, and focus on financial insights that benefit small businesses.`;

  const translations = {
    en: basePrompt,
    th: `${basePrompt}\n\nตอบเป็นภาษาไทยเสมอ`,
    id: `${basePrompt}\n\nSelalu jawab dalam bahasa Indonesia.`
  };

  return translations[language as keyof typeof translations] || translations.en;
}

/**
 * Create and compile the LangGraph application
 */
export function createFinancialAgent() {
  console.log('[LangGraph] Creating financial agent...');

  // Define the state graph using modern Annotation pattern
  const workflow = new StateGraph(AgentStateAnnotation);

  // Add nodes
  workflow.addNode('callModel', callModel);
  workflow.addNode('executeTool', executeTool);

  // Add edges
  workflow.addEdge("__start__", "callModel" as any);
  workflow.addConditionalEdges("callModel" as any, shouldContinue);
  workflow.addEdge("executeTool" as any, "callModel" as any);

  // Compile the graph
  const app = workflow.compile();
  console.log('[LangGraph] Financial agent compiled successfully');

  return app;
}