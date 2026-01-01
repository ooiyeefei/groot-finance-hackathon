/**
 * AI Category Generator for Onboarding
 *
 * Uses Gemini AI to enhance user-provided category names with metadata that improves
 * auto-categorization accuracy:
 * - vendor_patterns: Common vendor name patterns for matching
 * - ai_keywords: Keywords to help AI classify expenses
 * - category_code: Auto-generated code from category name
 * - description: Brief description of what belongs in the category
 *
 * @module ai-category-generator
 *
 * @example
 * ```typescript
 * import { generateCategoryMetadata } from '@/domains/onboarding/lib/ai-category-generator';
 *
 * const metadata = await generateCategoryMetadata(
 *   'fnb',
 *   ['Food Ingredients', 'Beverages', 'Packaging'],
 *   'cogs'
 * );
 *
 * console.log(metadata[0]);
 * // {
 * //   category_name: "Food Ingredients",
 * //   category_code: "FOOD_INGREDIENTS",
 * //   vendor_patterns: ["SYSCO", "*Foods*", "*Wholesale*", ...],
 * //   ai_keywords: ["flour", "rice", "vegetables", "meat", ...],
 * //   description: "Raw food materials used in meal preparation...",
 * //   is_active: true,
 * //   sort_order: 1
 * // }
 * ```
 */

import { GeminiService } from '@/lib/ai/ai-services/gemini-service'
import { getBusinessTypeConfig, type BusinessType } from './business-type-defaults'

/**
 * Category metadata enhanced with AI-generated patterns and keywords
 */
export interface CategoryMetadata {
  /** Original category name provided by user */
  category_name: string
  /** Auto-generated code in UPPER_SNAKE_CASE format */
  category_code: string
  /** Brief description of what belongs in this category */
  description: string
  /** Common vendor name patterns for auto-categorization (5-10 patterns) */
  vendor_patterns: string[]
  /** Keywords to help AI classify expenses (5-10 keywords) */
  ai_keywords: string[]
  /** Whether the category is active */
  is_active: boolean
  /** Sort order for display */
  sort_order: number
}

/**
 * Generate UPPER_SNAKE_CASE code from category name
 *
 * @param name - Category name (e.g., "Food Ingredients")
 * @returns Snake case code (e.g., "FOOD_INGREDIENTS")
 *
 * @example
 * ```typescript
 * generateCategoryCode("Food Ingredients"); // "FOOD_INGREDIENTS"
 * generateCategoryCode("Office Supplies & Equipment"); // "OFFICE_SUPPLIES_EQUIPMENT"
 * generateCategoryCode("Travel-Accommodation"); // "TRAVEL_ACCOMMODATION"
 * ```
 */
export function generateCategoryCode(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_') // Replace non-alphanumeric with underscore
    .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
}

/**
 * Generate fallback metadata when AI fails or returns invalid data
 *
 * @param categoryNames - Array of category names
 * @returns Array of basic category metadata without AI enhancements
 */
function generateFallbackMetadata(categoryNames: string[]): CategoryMetadata[] {
  console.log(`[AI-CategoryGenerator] Generating fallback metadata for ${categoryNames.length} categories`)

  return categoryNames.map((name, index) => ({
    category_name: name,
    category_code: generateCategoryCode(name),
    description: `${name} category`,
    vendor_patterns: [],
    ai_keywords: [name.toLowerCase()],
    is_active: true,
    sort_order: index + 1
  }))
}

/**
 * Build structured Gemini prompt for category metadata generation
 *
 * @param businessType - Business type (fnb, retail, services, manufacturing, other)
 * @param categoryNames - Array of category names to enhance
 * @param categoryType - Category type (cogs or expense)
 * @returns Formatted prompt string for Gemini
 */
function buildGeminiPrompt(
  businessType: BusinessType,
  categoryNames: string[],
  categoryType: 'cogs' | 'expense'
): string {
  const config = getBusinessTypeConfig(businessType)
  const categoryTypeLabel = categoryType === 'cogs' ? 'Cost of Goods Sold' : 'Operating Expenses'

  const prompt = `You are a financial categorization expert for Southeast Asian SME businesses.

Business Type: ${config.label} (${businessType})
Business Description: ${config.description}
Category Type: ${categoryTypeLabel}

Generate metadata for these category names:
${categoryNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}

For each category, provide:
- vendor_patterns: 5-10 common vendor name patterns that businesses would see on receipts/invoices
  * Include wildcards (*) for flexible matching (e.g., "*Foods*", "*Supply*")
  * Include common brand names and vendor types
  * Focus on Southeast Asian vendors when relevant
- ai_keywords: 5-10 keywords that indicate this category
  * Include item names, product types, and related terms
  * Use lowercase for all keywords
  * Be specific to the business type and region
- description: Brief description (1-2 sentences) explaining what belongs in this category

Return ONLY a valid JSON array with this exact structure (no markdown, no code blocks):
[
  {
    "category_name": "exact name from input",
    "vendor_patterns": ["pattern1", "pattern2", "pattern3", "pattern4", "pattern5"],
    "ai_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
    "description": "Brief description of the category"
  }
]

Example for Food & Beverage - "Food Ingredients" category:
{
  "category_name": "Food Ingredients",
  "vendor_patterns": ["SYSCO", "*Foods*", "*Wholesale*", "Restaurant Depot", "*Supply*", "*Market*", "US FOODS", "*Distributor*"],
  "ai_keywords": ["flour", "rice", "vegetables", "meat", "seafood", "spices", "dairy", "produce"],
  "description": "Raw food materials used in meal preparation including proteins, vegetables, grains, and dairy products."
}

IMPORTANT: Return ONLY the JSON array, no other text.`

  return prompt
}

/**
 * Parse and validate Gemini JSON response
 *
 * @param content - Raw response content from Gemini
 * @param categoryNames - Original category names for validation
 * @returns Parsed category metadata array or null if invalid
 */
function parseGeminiResponse(
  content: string,
  categoryNames: string[]
): CategoryMetadata[] | null {
  try {
    // Remove markdown code blocks if present
    let cleanedContent = content.trim()
    if (cleanedContent.startsWith('```')) {
      cleanedContent = cleanedContent
        .replace(/^```(?:json)?\s*\n/, '')
        .replace(/\n```\s*$/, '')
        .trim()
    }

    const parsed = JSON.parse(cleanedContent)

    // Validate it's an array
    if (!Array.isArray(parsed)) {
      console.error(`[AI-CategoryGenerator] Response is not an array`)
      return null
    }

    // Validate each item has required fields
    const isValid = parsed.every(item =>
      typeof item.category_name === 'string' &&
      Array.isArray(item.vendor_patterns) &&
      Array.isArray(item.ai_keywords) &&
      typeof item.description === 'string'
    )

    if (!isValid) {
      console.error(`[AI-CategoryGenerator] Response missing required fields`)
      return null
    }

    // Add generated fields and ensure all categories are present
    const result: CategoryMetadata[] = []

    for (let i = 0; i < categoryNames.length; i++) {
      const name = categoryNames[i]
      const aiData = parsed.find(p => p.category_name === name)

      if (aiData) {
        result.push({
          category_name: name,
          category_code: generateCategoryCode(name),
          description: aiData.description,
          vendor_patterns: aiData.vendor_patterns || [],
          ai_keywords: aiData.ai_keywords || [],
          is_active: true,
          sort_order: i + 1
        })
      } else {
        // AI didn't return data for this category, use fallback
        console.warn(`[AI-CategoryGenerator] Missing AI data for category: ${name}`)
        result.push({
          category_name: name,
          category_code: generateCategoryCode(name),
          description: `${name} category`,
          vendor_patterns: [],
          ai_keywords: [name.toLowerCase()],
          is_active: true,
          sort_order: i + 1
        })
      }
    }

    return result
  } catch (error) {
    console.error(`[AI-CategoryGenerator] JSON parsing failed:`, error)
    return null
  }
}

/**
 * Generate category metadata using Gemini AI
 *
 * Takes user-provided category names and enhances them with AI-generated metadata
 * to improve auto-categorization accuracy. Includes comprehensive fallback logic.
 *
 * @param businessType - Business type (fnb, retail, services, manufacturing, other)
 * @param categoryNames - Array of category names to enhance (max 20)
 * @param categoryType - Category type (cogs or expense)
 * @returns Promise resolving to array of enhanced category metadata
 *
 * @throws Error if categoryNames exceeds 20 items
 *
 * @example
 * ```typescript
 * // Generate metadata for Food & Beverage COGS categories
 * const metadata = await generateCategoryMetadata(
 *   'fnb',
 *   ['Food Ingredients', 'Beverages', 'Packaging Materials'],
 *   'cogs'
 * );
 *
 * // Use metadata to create categories in database
 * for (const data of metadata) {
 *   await createCategory({
 *     name: data.category_name,
 *     code: data.category_code,
 *     description: data.description,
 *     vendor_patterns: data.vendor_patterns,
 *     ai_keywords: data.ai_keywords,
 *     type: 'cogs'
 *   });
 * }
 * ```
 */
export async function generateCategoryMetadata(
  businessType: BusinessType,
  categoryNames: string[],
  categoryType: 'cogs' | 'expense'
): Promise<CategoryMetadata[]> {
  const startTime = Date.now()
  console.log(`[AI-CategoryGenerator] Starting generation for ${categoryNames.length} categories`)
  console.log(`[AI-CategoryGenerator] Business Type: ${businessType}, Category Type: ${categoryType}`)

  // Validate input
  if (!categoryNames || categoryNames.length === 0) {
    console.warn(`[AI-CategoryGenerator] Empty category names array, returning empty result`)
    return []
  }

  if (categoryNames.length > 20) {
    throw new Error(`Cannot process more than 20 categories at once (received ${categoryNames.length})`)
  }

  try {
    // Initialize Gemini service
    const gemini = new GeminiService()

    // Build prompt
    const prompt = buildGeminiPrompt(businessType, categoryNames, categoryType)
    console.log(`[AI-CategoryGenerator] Prompt built (${prompt.length} chars)`)

    // Call Gemini API
    const response = await gemini.generateContent(
      [{ role: 'user', content: prompt }],
      'You are a financial categorization expert. Always return valid JSON arrays with no additional text or formatting.'
    )

    const elapsed = Date.now() - startTime
    console.log(`[AI-CategoryGenerator] Gemini response received in ${elapsed}ms`)

    // Check for API errors
    if (!response.success || !response.content) {
      console.error(`[AI-CategoryGenerator] Gemini API error:`, response.error)
      console.warn(`[AI-CategoryGenerator] Falling back to basic metadata`)
      return generateFallbackMetadata(categoryNames)
    }

    // Parse and validate response
    const metadata = parseGeminiResponse(response.content, categoryNames)

    if (!metadata) {
      console.warn(`[AI-CategoryGenerator] Failed to parse Gemini response, using fallback`)
      console.log(`[AI-CategoryGenerator] Raw response:`, response.content)
      return generateFallbackMetadata(categoryNames)
    }

    console.log(`[AI-CategoryGenerator] ✅ Successfully generated metadata for ${metadata.length} categories in ${elapsed}ms`)

    // Log summary of generated data
    for (const item of metadata) {
      console.log(`[AI-CategoryGenerator] - ${item.category_name}: ${item.vendor_patterns.length} patterns, ${item.ai_keywords.length} keywords`)
    }

    return metadata

  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`[AI-CategoryGenerator] Unexpected error after ${elapsed}ms:`, error)
    console.warn(`[AI-CategoryGenerator] Falling back to basic metadata`)
    return generateFallbackMetadata(categoryNames)
  }
}
