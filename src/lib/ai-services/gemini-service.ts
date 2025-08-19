/**
 * Gemini AI Service
 * Implements Google Gemini API with function calling support
 */

import { GoogleGenAI, FunctionDeclaration, FunctionCallingConfigMode, HarmCategory, HarmBlockThreshold } from '@google/genai'
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
    // ULTRA-AGGRESSIVE: Try older model with potentially fewer safety restrictions
    this.model = 'gemini-1.5-flash'
    console.log(`[GeminiService] ULTRA-AGGRESSIVE model override: ${this.model} (original: ${aiConfig.gemini.model})`)
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

      // ULTRA-AGGRESSIVE: Disable ALL safety restrictions
      requestConfig.safetySettings = [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE
        }
      ]
      console.log(`[GeminiService] ULTRA-AGGRESSIVE: Disabled all safety restrictions`)

      // Add function calling if tools are provided - following @google/genai docs format
      if (tools && tools.length > 0) {
        console.log(`[GeminiService] Processing ${tools.length} tools:`, tools.map(t => t.function?.name))
        
        const functionDeclarations = tools.map(tool => 
          this.convertToolToGeminiFunctionDeclaration(tool)
        )

        // Only add function calling config if we actually have declarations
        if (functionDeclarations.length > 0) {
          // Correct structure based on @google/genai documentation:
          // tools and toolConfig should be at the same level (not nested in config)
          requestConfig.tools = [{ functionDeclarations }]
          // ULTRA-AGGRESSIVE: For analytical queries, force get_data_records tool selection
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
            requestConfig.toolConfig = {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.ANY,
                allowedFunctionNames: ['get_data_records']
              }
            }
          } else {
            requestConfig.toolConfig = {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.ANY
              }
            }
          }
          console.log(`[GeminiService] Function calling toolConfig:`, JSON.stringify(requestConfig.toolConfig, null, 2))
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
        hasToolConfig: !!requestConfig.toolConfig,
        hasSafetySettings: !!requestConfig.safetySettings
      }, null, 2))
      
      // ULTRA-AGGRESSIVE: Full request logging for debugging
      console.log(`[GeminiService] ULTRA-DEBUG - Full request config:`, JSON.stringify(requestConfig, null, 2))

      // Log the exact user query for debugging
      const lastUserMessage = geminiContents.find(content => content.role === 'user')
      const firstPart = lastUserMessage?.parts?.[0]
      const userQueryText = firstPart && 'text' in firstPart ? firstPart.text : 'No user message found'
      console.log(`[GeminiService] User query:`, userQueryText)

      // ULTRA-AGGRESSIVE: Test if function calling works at all with minimal setup
      if (tools && tools.length > 0) {
        console.log(`[GeminiService] TESTING: Attempting to force function calling...`)
        console.log(`[GeminiService] TESTING: Available functions:`, tools.map(t => t.function?.name))
        console.log(`[GeminiService] TESTING: Query that should trigger get_transactions:`, userQueryText.includes('transaction') || userQueryText.includes('invoice') || userQueryText.includes('amount') || userQueryText.includes('expense'))
      }

      const response = await this.client.models.generateContent(requestConfig)

      // Enhanced logging for debugging function calling issues
      console.log(`[GeminiService] Raw response object keys:`, Object.keys(response))
      console.log(`[GeminiService] Response candidates:`, response.candidates?.length || 0)
      if (response.promptFeedback) {
        console.log(`[GeminiService] Prompt feedback:`, JSON.stringify(response.promptFeedback, null, 2))
        if (response.promptFeedback.safetyRatings) {
          console.log(`[GeminiService] Safety ratings:`, JSON.stringify(response.promptFeedback.safetyRatings, null, 2))
        }
      }
      
      // Log the exact response text for debugging
      console.log(`[GeminiService] Response text:`, response.text || 'No text response')

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