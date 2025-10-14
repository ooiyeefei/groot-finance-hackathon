/**
 * Gemini AI Service
 * Implements Google Gemini API with function calling support
 */

import { GoogleGenAI } from '@google/genai'
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
    const apiKey = process.env.GEMINI_API_KEY || aiConfig.gemini.apiKey
    console.log(`[GeminiService] API Key loaded:`, apiKey ? `${apiKey.substring(0, 10)}...` : 'NO API KEY')
    
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('GEMINI_API_KEY not found in environment variables')
    }
    
    this.client = new GoogleGenAI({ apiKey })
    // Use Gemini 2.5 Flash for better performance and speed
    this.model = aiConfig.gemini.model
    console.log(`[GeminiService] Using model: ${this.model}`)
  }

  /**
   * Convert OpenAI tool schema to Gemini function declaration
   */
  private convertToolToGeminiFunctionDeclaration(toolSchema: OpenAIToolSchema): any {
    return {
      name: toolSchema.function.name,
      description: toolSchema.function.description,
      parameters: {
        type: 'OBJECT',
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
      
      // Prepare the model configuration
      const modelConfig: any = {
        model: this.model
      }

      // Prepare the generation request
      const generationRequest: any = {
        contents: geminiContents
      }

      // Add system instruction if provided
      if (systemPrompt) {
        generationRequest.systemInstruction = { parts: [{ text: systemPrompt }] }
      }

      // Disable safety restrictions for business document processing
      generationRequest.safetySettings = [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_NONE'
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_NONE'
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_NONE'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_NONE'
        }
      ]
      console.log(`[GeminiService] Safety restrictions disabled for document processing`)

      // Add function calling if tools are provided - following @google/genai docs format
      if (tools && tools.length > 0) {
        console.log(`[GeminiService] Processing ${tools.length} tools:`, tools.map(t => t.function?.name))
        
        const functionDeclarations = tools.map(tool => 
          this.convertToolToGeminiFunctionDeclaration(tool)
        )

        // Only add function calling config if we actually have declarations
        if (functionDeclarations.length > 0) {
          // Correct structure based on @google/genai documentation:
          // tools and toolConfig should be at the same level
          generationRequest.tools = [{ functionDeclarations }]
          
          // For analytical queries, force get_data_records tool selection
          const userMessage = geminiContents.find(content => content.role === 'user')
          const firstPart = userMessage?.parts?.[0]
          const userQueryText = (firstPart && 'text' in firstPart) ? firstPart.text : ''
          const isAnalyticalQuery = userQueryText.toLowerCase().includes('highest') || 
                                   userQueryText.toLowerCase().includes('largest') || 
                                   userQueryText.toLowerCase().includes('biggest') ||
                                   userQueryText.toLowerCase().includes('maximum') ||
                                   userQueryText.toLowerCase().includes('value') ||
                                   userQueryText.toLowerCase().includes('amount') ||
                                   userQueryText.toLowerCase().includes('total') ||
                                   userQueryText.toLowerCase().includes('average') ||
                                   userQueryText.toLowerCase().includes('records')
          
          if (isAnalyticalQuery && tools.some(t => t.function?.name === 'get_data_records')) {
            console.log(`[GeminiService] FORCING get_data_records for analytical query: ${userQueryText}`)
            generationRequest.toolConfig = {
              functionCallingConfig: {
                mode: 'ANY',
                allowedFunctionNames: ['get_data_records']
              }
            }
          } else {
            generationRequest.toolConfig = {
              functionCallingConfig: {
                mode: 'ANY'
              }
            }
          }
          console.log(`[GeminiService] Function calling enabled with ${functionDeclarations.length} functions`)
          console.log(`[GeminiService] Using ${functionDeclarations.length} function declarations:`, functionDeclarations.map(f => f.name))
        } else {
          console.warn(`[GeminiService] No valid function declarations generated from ${tools.length} tools`)
        }
      }

      console.log(`[GeminiService] Request ready - Model: ${modelConfig.model}, Tools: ${!!generationRequest.tools}`)
      
      // Log only essential request info for debugging
      const lastUserMessage = geminiContents.find(content => content.role === 'user')
      const firstPart = lastUserMessage?.parts?.[0]
      const userQueryText = firstPart && 'text' in firstPart ? firstPart.text : 'No user message found'
      console.log(`[GeminiService] Processing query (${userQueryText.length} chars)`)

      // Test function calling setup
      if (tools && tools.length > 0) {
        console.log(`[GeminiService] Function calling setup - Available functions:`, tools.map(t => t.function?.name))
        console.log(`[GeminiService] Query analysis - Contains financial keywords:`, 
          userQueryText.includes('transaction') || userQueryText.includes('invoice') || 
          userQueryText.includes('amount') || userQueryText.includes('expense'))
      }

      // Correct API call using new SDK pattern
      const response = await this.client.models.generateContent({
        model: this.model,
        ...generationRequest
      })

      // Basic response validation
      console.log(`[GeminiService] Response received - Candidates: ${response.candidates?.length || 0}`)
      if (response.promptFeedback?.blockReason) {
        console.warn(`[GeminiService] Content blocked: ${response.promptFeedback.blockReason}`)
      }
      
      // Log response summary for debugging
      const responseText = response.text || 'No text response'
      console.log(`[GeminiService] Response generated (${responseText.length} chars)`)

      // Check for function calls
      const functionCalls = response.functionCalls || []
      if (functionCalls.length > 0) {
        console.log(`[GeminiService] Function calls detected: ${functionCalls.length}`)
        
        const tool_calls = functionCalls.map((call, index) => ({
          id: `call_${index}`,
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
      const content = responseText || 'I apologize, but I cannot process your request right now.'
      
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