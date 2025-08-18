/**
 * Gemini AI Service
 * Implements Google Gemini API with function calling support
 */

import { GoogleGenAI, FunctionDeclaration, FunctionCallingConfigMode } from '@google/genai'
import { aiConfig } from '../config/ai-config'
import { OpenAIToolSchema } from '../tools/base-tool'

export interface GeminiMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_call_id?: string
}

export interface GeminiResponse {
  success: boolean
  content?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  error?: string
}

export class GeminiService {
  private client: GoogleGenAI
  private model: string

  constructor() {
    this.client = new GoogleGenAI({ apiKey: aiConfig.gemini.apiKey })
    this.model = aiConfig.gemini.model
  }

  /**
   * Convert OpenAI tool schema to Gemini function declaration
   */
  private convertToolToGeminiFunctionDeclaration(toolSchema: OpenAIToolSchema): FunctionDeclaration {
    return {
      name: toolSchema.function.name,
      description: toolSchema.function.description,
      parametersJsonSchema: {
        type: 'object',
        properties: toolSchema.function.parameters.properties,
        required: toolSchema.function.parameters.required || []
      }
    }
  }

  /**
   * Convert messages to Gemini format
   */
  private convertMessagesToGemini(messages: GeminiMessage[], systemPrompt?: string) {
    const geminiContents = []
    
    for (const message of messages) {
      if (message.role === 'system') {
        // System messages are handled separately in Gemini
        continue
      }
      
      const parts = []
      
      if (message.role === 'user') {
        parts.push({ text: message.content })
        geminiContents.push({ role: 'user', parts })
      } else if (message.role === 'assistant') {
        parts.push({ text: message.content })
        geminiContents.push({ role: 'model', parts })
      } else if (message.role === 'tool' && message.tool_call_id) {
        // Convert tool response to function response
        parts.push({
          functionResponse: {
            name: message.tool_call_id,
            response: { output: message.content }
          }
        })
        geminiContents.push({ role: 'function', parts })
      }
    }
    
    return geminiContents
  }

  /**
   * Generate content with function calling support
   */
  async generateContent(
    messages: GeminiMessage[],
    systemPrompt?: string,
    tools?: OpenAIToolSchema[]
  ): Promise<GeminiResponse> {
    try {
      console.log(`[GeminiService] Generating content with ${this.model}`)
      
      // Convert messages to Gemini format
      const geminiContents = this.convertMessagesToGemini(messages, systemPrompt)
      
      // Prepare the request - following @google/genai documentation structure
      const requestConfig: any = {
        model: this.model,
        contents: geminiContents
      }

      // Add system instruction if provided
      if (systemPrompt) {
        requestConfig.systemInstruction = { parts: [{ text: systemPrompt }] }
      }

      // Add function calling if tools are provided - following @google/genai docs format
      if (tools && tools.length > 0) {
        console.log(`[GeminiService] Processing ${tools.length} tools:`, tools.map(t => t.function?.name))
        
        const functionDeclarations = tools.map(tool => 
          this.convertToolToGeminiFunctionDeclaration(tool)
        )

        // Only add function calling config if we actually have declarations
        if (functionDeclarations.length > 0) {
          // Correct structure based on @google/genai documentation:
          // tools and config should be at the same level
          requestConfig.tools = [{ functionDeclarations }]
          requestConfig.config = {
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.AUTO
              }
            }
          }
          console.log(`[GeminiService] Function calling config:`, JSON.stringify(requestConfig.config, null, 2))
          console.log(`[GeminiService] Tools array:`, JSON.stringify(requestConfig.tools, null, 2))
          console.log(`[GeminiService] Using ${functionDeclarations.length} function declarations:`, functionDeclarations.map(f => f.name))
        } else {
          console.warn(`[GeminiService] No valid function declarations generated from ${tools.length} tools`)
        }
      }

      console.log(`[GeminiService] Final request structure:`, JSON.stringify({
        model: requestConfig.model,
        hasContents: !!requestConfig.contents,
        hasSystemInstruction: !!requestConfig.systemInstruction,
        hasTools: !!requestConfig.tools,
        hasConfig: !!requestConfig.config
      }, null, 2))

      const response = await this.client.models.generateContent(requestConfig)

      // Check for function calls
      if (response.functionCalls && response.functionCalls.length > 0) {
        console.log(`[GeminiService] Function calls detected: ${response.functionCalls.length}`)
        
        const tool_calls = response.functionCalls.map((call, index) => ({
          id: call.id || `call_${index}`,
          type: 'function' as const,
          function: {
            name: call.name || '',
            arguments: JSON.stringify(call.args || {})
          }
        }))

        return {
          success: true,
          tool_calls
        }
      }

      // Return text response
      const content = response.text || 'I apologize, but I cannot process your request right now.'
      
      console.log(`[GeminiService] Text response generated`)
      
      return {
        success: true,
        content
      }

    } catch (error) {
      console.error('[GeminiService] Error generating content:', error)
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  }

  /**
   * Health check for Gemini service
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
      })
      
      return { healthy: true }
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}