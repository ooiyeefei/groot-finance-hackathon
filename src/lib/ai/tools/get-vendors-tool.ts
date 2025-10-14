/**
 * Get Unique Vendors Tool
 * Returns a list of unique vendor names from user's transactions
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'

export class GetVendorsTool extends BaseTool {
  getToolName(_modelType: ModelType = 'openai'): string {
    return 'get_vendors'
  }

  getDescription(_modelType: ModelType = 'openai'): string {
    return 'Get Unique Vendors List - Returns a complete list of unique vendor names from the user\'s transaction history. Use this tool when users ask for "list of vendors", "all my vendors", "what vendors do I have", or similar queries about unique vendor names. This tool provides a clean, deduplicated list of all vendors the user has transacted with.'
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
    try {
      console.log(`[GetVendorsTool] Getting unique vendors for user ${userContext.userId}`)

      // Query all transactions to get vendor names
      const { data: vendors, error } = await this.supabase
        .from('accounting_entries')
        .select('vendor_name')
        .eq('user_id', userContext.userId)
        .not('vendor_name', 'is', null)
        .not('vendor_name', 'eq', '')

      if (error) {
        console.error('[GetVendorsTool] Query error:', error)
        return {
          success: false,
          error: 'Failed to retrieve vendor information'
        }
      }

      if (!vendors || vendors.length === 0) {
        return {
          success: true,
          data: "I couldn't find any vendors in your transaction history. This might be because you haven't added any transactions yet, or your transactions don't have vendor information.",
          metadata: {
            vendorCount: 0,
            userId: userContext.userId
          }
        }
      }

      // Get unique vendor names and sort them alphabetically
      const uniqueVendorNames = [...new Set(vendors.map(v => v.vendor_name))]
        .filter(name => name && name.trim().length > 0)
        .sort()

      if (uniqueVendorNames.length === 0) {
        return {
          success: true,
          data: "I found transactions but none of them have vendor information specified.",
          metadata: {
            vendorCount: 0,
            totalTransactions: vendors.length,
            userId: userContext.userId
          }
        }
      }

      // Format the response
      const vendorList = uniqueVendorNames.map((vendor, index) => `${index + 1}. ${vendor}`).join('\n')
      
      const response = `Here are all the unique vendors from your transaction history:\n\n${vendorList}\n\nTotal: ${uniqueVendorNames.length} unique vendors found.`

      console.log(`[GetVendorsTool] Found ${uniqueVendorNames.length} unique vendors for user ${userContext.userId}`)

      return {
        success: true,
        data: response,
        metadata: {
          vendorCount: uniqueVendorNames.length,
          vendors: uniqueVendorNames,
          userId: userContext.userId
        }
      }

    } catch (error) {
      console.error('[GetVendorsTool] Execution error:', error)
      return {
        success: false,
        error: `Vendor lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  protected formatResultData(data: any[]): string {
    // This method is not used for vendors tool since we format the data directly in executeInternal
    return data.map((vendor, index) => `${index + 1}. ${vendor}`).join('\n')
  }

  /**
   * Enhanced permission check for vendor access
   */
  protected async checkUserPermissions(userContext: UserContext): Promise<boolean> {
    // Call parent permission check first
    const basePermission = await super.checkUserPermissions(userContext)
    if (!basePermission) {
      return false
    }

    try {
      // Additional check: verify user has access to transactions
      // Query by clerk_user_id since that's the actual column in users table
      const { data: userProfile, error } = await this.supabase
        .from('users')
        .select('id, home_currency, clerk_user_id')
        .eq('clerk_user_id', userContext.userId)
        .single()

      if (error || !userProfile) {
        console.error('[GetVendorsTool] User profile check failed:', error)
        return false
      }

      return true

    } catch (error) {
      console.error('[GetVendorsTool] Permission validation error:', error)
      return false
    }
  }
}