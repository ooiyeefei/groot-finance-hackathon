/**
 * Set Budget Tool
 *
 * Enables managers to set, update, or remove monthly budget limits for expense categories.
 * Used for queries like: "Set Travel budget to RM 5000" or "Remove the Travel budget"
 *
 * Authorization: manager, finance_admin, owner
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'

interface SetBudgetParameters {
  category_name: string
  monthly_limit: number
  currency?: string
}

export class SetBudgetTool extends BaseTool {
  getToolName(_modelType: ModelType = 'openai'): string {
    return 'set_budget'
  }

  getDescription(_modelType: ModelType = 'openai'): string {
    return "Set, update, or remove a monthly budget limit for an expense category. Use when a manager says 'Set Travel budget to RM 5000' or 'Remove the Travel budget'."
  }

  getToolSchema(_modelType: ModelType = 'openai'): OpenAIToolSchema {
    return {
      type: "function",
      function: {
        name: this.getToolName(_modelType),
        description: this.getDescription(_modelType),
        parameters: {
          type: "object",
          properties: {
            category_name: {
              type: "string",
              description: "Name of the expense category (e.g., 'Travel', 'Meals', 'Office Supplies'). Case-insensitive match against existing categories."
            },
            monthly_limit: {
              type: "number",
              description: "Budget amount. Use a value greater than 0 to set/update the limit, or 0 to remove the budget limit."
            },
            currency: {
              type: "string",
              description: "ISO 4217 currency code (e.g., 'MYR', 'SGD', 'USD'). Defaults to the business home currency if not specified."
            }
          },
          required: ["category_name", "monthly_limit"]
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as SetBudgetParameters

    if (!params.category_name || typeof params.category_name !== 'string' || params.category_name.trim().length === 0) {
      return { valid: false, error: 'category_name is required and must be a non-empty string' }
    }

    if (params.monthly_limit === undefined || params.monthly_limit === null || typeof params.monthly_limit !== 'number') {
      return { valid: false, error: 'monthly_limit is required and must be a number' }
    }

    if (params.monthly_limit < 0) {
      return { valid: false, error: 'monthly_limit must be 0 (to remove) or a positive number (to set/update)' }
    }

    if (params.currency && (typeof params.currency !== 'string' || !/^[A-Z]{3}$/.test(params.currency))) {
      return { valid: false, error: 'currency must be a valid ISO 4217 currency code (e.g., MYR, SGD, USD)' }
    }

    return { valid: true }
  }

  protected async checkUserPermissions(userContext: UserContext): Promise<boolean> {
    // Only managers, finance_admins, and owners can set budgets
    const allowedRoles = ['manager', 'finance_admin', 'owner']
    if (!userContext.role || !allowedRoles.includes(userContext.role)) {
      console.warn(`[SetBudgetTool] Insufficient role: ${userContext.role}`)
      return false
    }
    return super.checkUserPermissions(userContext)
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as SetBudgetParameters

    try {
      if (!userContext.businessId || !userContext.convexUserId) {
        return { success: false, error: 'Missing business context. Please ensure you are logged into a business account.' }
      }

      // Step 1: Get all expense categories for the business
      console.log(`[SetBudgetTool] Fetching categories for business: ${userContext.businessId}`)

      const categories = await this.convex!.query(
        this.convexApi.functions.businesses.getExpenseCategories,
        { businessId: userContext.businessId as any }
      )

      if (!categories || categories.length === 0) {
        return {
          success: true,
          data: 'No expense categories found for your business. Please set up expense categories first before configuring budgets.',
          metadata: { resultsCount: 0 }
        }
      }

      // Step 2: Find category by name (case-insensitive)
      const searchName = params.category_name.trim().toLowerCase()
      const matchedCategory = categories.find(
        (cat: any) => cat.category_name.toLowerCase() === searchName
      )

      if (!matchedCategory) {
        const availableNames = categories.map((cat: any) => cat.category_name).join(', ')
        return {
          success: true,
          data: `Category "${params.category_name}" not found. Available categories: ${availableNames}`,
          metadata: { resultsCount: 0, availableCategories: categories.map((cat: any) => cat.category_name) }
        }
      }

      // Step 3: Determine the action and capture previous limit
      const previousLimit = (matchedCategory as any).budgetLimit || null
      const isRemoving = params.monthly_limit === 0
      const currency = params.currency || userContext.homeCurrency || (matchedCategory as any).budgetCurrency || 'MYR'

      console.log(`[SetBudgetTool] ${isRemoving ? 'Removing' : 'Setting'} budget for "${matchedCategory.category_name}": ${previousLimit} → ${isRemoving ? 'none' : params.monthly_limit}`)

      // Step 4: Update the category budget
      await this.convex!.mutation(
        this.convexApi.functions.businesses.updateExpenseCategory,
        {
          businessId: userContext.businessId as any,
          categoryId: matchedCategory.id,
          budgetLimit: isRemoving ? 0 : params.monthly_limit,
          budgetCurrency: isRemoving ? '' : currency,
        }
      )

      // Step 5: Build response
      let action: string
      let dataText: string

      if (isRemoving) {
        action = 'removed'
        dataText = `Budget limit removed for "${matchedCategory.category_name}".`
        if (previousLimit) {
          dataText += ` Previous limit was ${previousLimit.toFixed(2)} ${(matchedCategory as any).budgetCurrency || currency}.`
        }
      } else if (previousLimit) {
        action = 'updated'
        dataText = `Budget for "${matchedCategory.category_name}" updated from ${previousLimit.toFixed(2)} to ${params.monthly_limit.toFixed(2)} ${currency}/month.`
      } else {
        action = 'created'
        dataText = `Budget limit set for "${matchedCategory.category_name}": ${params.monthly_limit.toFixed(2)} ${currency}/month.`
      }

      // Audit log
      console.log(JSON.stringify({
        event: 'budget_update',
        userId: userContext.convexUserId,
        toolName: 'set_budget',
        categoryName: matchedCategory.category_name,
        action,
        previousLimit,
        newLimit: isRemoving ? null : params.monthly_limit,
        currency,
        timestamp: new Date().toISOString(),
      }))

      return {
        success: true,
        data: dataText,
        metadata: {
          structured: {
            action,
            categoryName: matchedCategory.category_name,
            categoryId: matchedCategory.id,
            previousLimit,
            newLimit: isRemoving ? null : params.monthly_limit,
            currency,
          },
          resultsCount: 1,
        }
      }

    } catch (error) {
      console.error('[SetBudgetTool] Execution error:', error)
      return {
        success: false,
        error: `Budget update failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  protected formatResultData(data: any[]): string {
    return data.map((item, index) => {
      return `${index + 1}. ${item.categoryName}: ${item.action} — ${item.newLimit ? `${item.newLimit} ${item.currency}/month` : 'removed'}`
    }).join('\n')
  }
}
