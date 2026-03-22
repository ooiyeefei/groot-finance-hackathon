/**
 * Get Unique Vendors Tool
 * Returns a list of unique vendor names from user's transactions
 *
 * Migrated to Convex from Supabase
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { Id } from '@/convex/_generated/dataModel'
import { callMCPToolFromAgent } from './mcp-tool-wrapper'

export class GetVendorsTool extends BaseTool {
  getToolName(_modelType: ModelType = 'openai'): string {
    return 'get_vendors'
  }

  getDescription(_modelType: ModelType = 'openai'): string {
    return 'Get Unique Vendors/Suppliers List - Returns a deduplicated list of vendor/supplier names from AP (Accounts Payable) invoices. Use this tool when users ask for "list of vendors", "all my vendors", "my suppliers", "what vendors do I have". This returns business-to-business vendors/suppliers only (from incoming invoices), NOT expense claim merchants. For expense claim merchants, use get_transactions with appropriate filters.'
  }

  getToolSchema(modelType: ModelType = 'openai'): OpenAIToolSchema {
    const toolName = this.getToolName(modelType)
    const description = this.getDescription(modelType)

    return {
      type: "function",
      function: {
        name: toolName,
        description: description,
        parameters: {
          type: "object",
          properties: {
            // No parameters needed
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(_parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    // No parameters to validate
    return { valid: true }
  }

  protected async executeInternal(_parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    return callMCPToolFromAgent('get_vendors', {
      source_document_type: 'invoice',
    }, userContext)
  }

  protected formatResultData(data: any[]): string {
    // This method is not used for vendors tool since we format the data directly in executeInternal
    return data.map((vendor, index) => `${index + 1}. ${vendor}`).join('\n')
  }

  /**
   * Enhanced permission check for vendor access with business context validation
   */
  protected async checkUserPermissions(userContext: UserContext): Promise<boolean> {
    // Call parent permission check first (now includes business context validation)
    const basePermission = await super.checkUserPermissions(userContext)
    if (!basePermission) {
      return false
    }

    try {
      // SECURITY: Business context validation already performed in parent method
      // Additional check: verify user has proper business context for vendor access
      if (!userContext.businessId) {
        console.error('[GetVendorsTool] Missing business context - vendor access denied')
        return false
      }

      console.log(`[GetVendorsTool] Vendor access granted for business: ${userContext.businessId}`)
      return true

    } catch (error) {
      console.error('[GetVendorsTool] Permission validation error:', error)
      return false
    }
  }
}