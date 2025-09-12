/**
 * Expense Categorizer Service
 * Intelligent expense categorization based on vendor patterns and expense data
 */

import { ExpenseCategory } from '@/types/expense-claims'
import { GeminiOCRResponse } from '@/types/gemini-ocr'

interface VendorPattern {
  category: ExpenseCategory
  keywords: string[]
  patterns: RegExp[]
  confidence_weight: number
}

interface CategorySuggestion {
  category: ExpenseCategory
  confidence: number
  reasoning: string
}

export class ExpenseCategorizer {
  private vendorPatterns: VendorPattern[]

  constructor() {
    this.vendorPatterns = this.initializeVendorPatterns()
  }

  /**
   * Enhanced categorization using both Gemini suggestion and pattern matching
   */
  categorizePexpense(
    geminiResponse: GeminiOCRResponse,
    fallbackPatterns: boolean = true
  ): CategorySuggestion {
    const geminiSuggestion = {
      category: geminiResponse.suggested_category,
      confidence: geminiResponse.category_confidence || 0,
      reasoning: geminiResponse.reasoning || 'AI-suggested category'
    }

    // If Gemini confidence is high, trust it
    if (geminiSuggestion.confidence > 0.8) {
      return geminiSuggestion
    }

    // If fallback patterns are disabled, return Gemini suggestion
    if (!fallbackPatterns) {
      return geminiSuggestion
    }

    // Use pattern matching as fallback or validation
    const patternSuggestion = this.categorizeByPatterns(
      geminiResponse.vendor_name,
      geminiResponse.description
    )

    // If patterns agree with Gemini, boost confidence
    if (patternSuggestion.category === geminiSuggestion.category) {
      return {
        category: geminiSuggestion.category,
        confidence: Math.min(geminiSuggestion.confidence + 0.2, 1.0),
        reasoning: `AI and pattern matching agree: ${patternSuggestion.reasoning}`
      }
    }

    // If pattern confidence is higher, use it
    if (patternSuggestion.confidence > geminiSuggestion.confidence + 0.1) {
      return {
        ...patternSuggestion,
        reasoning: `Pattern override: ${patternSuggestion.reasoning}`
      }
    }

    // Default to Gemini with lower confidence
    return {
      ...geminiSuggestion,
      confidence: Math.max(geminiSuggestion.confidence - 0.1, 0.1),
      reasoning: `AI suggestion with pattern uncertainty: ${geminiResponse.reasoning}`
    }
  }

  /**
   * Pattern-based categorization fallback
   */
  private categorizeByPatterns(
    vendorName: string,
    description: string
  ): CategorySuggestion {
    const text = `${vendorName} ${description}`.toLowerCase()
    
    let bestMatch: CategorySuggestion = {
      category: 'other',
      confidence: 0.1,
      reasoning: 'No clear pattern match found'
    }

    for (const pattern of this.vendorPatterns) {
      let matchScore = 0
      const matchReasons: string[] = []

      // Check keywords
      for (const keyword of pattern.keywords) {
        if (text.includes(keyword.toLowerCase())) {
          matchScore += 0.3
          matchReasons.push(keyword)
        }
      }

      // Check regex patterns
      for (const regex of pattern.patterns) {
        if (regex.test(text)) {
          matchScore += 0.4
          matchReasons.push('pattern match')
        }
      }

      // Apply category-specific weighting
      const weightedScore = matchScore * pattern.confidence_weight

      if (weightedScore > bestMatch.confidence) {
        bestMatch = {
          category: pattern.category,
          confidence: Math.min(weightedScore, 0.9), // Cap at 0.9 for pattern matching
          reasoning: `Matched: ${matchReasons.join(', ')}`
        }
      }
    }

    return bestMatch
  }

  /**
   * Initialize vendor patterns for Southeast Asian businesses
   */
  private initializeVendorPatterns(): VendorPattern[] {
    return [
      // Travel & Accommodation
      {
        category: 'travel_accommodation',
        keywords: [
          'hotel', 'motel', 'resort', 'inn', 'lodge', 'hostel',
          'airlines', 'flight', 'airport', 'taxi', 'grab', 'uber',
          'bus', 'train', 'mrt', 'lrt', 'transport', 'travel',
          'agoda', 'booking', 'expedia', 'airbnb', 'scoot', 'jetstar',
          'singapore airlines', 'malaysia airlines', 'thai airways',
          'accommodation', 'stay', 'nights'
        ],
        patterns: [
          /\b(hotel|resort|inn)\s+\w+/i,
          /\b(flight|airline)\s+\w+/i,
          /\btaxi\s+(fare|ride)/i,
          /\bairport\s+(taxi|transfer)/i
        ],
        confidence_weight: 1.0
      },

      // Petrol & Automotive
      {
        category: 'petrol',
        keywords: [
          'petron', 'shell', 'esso', 'caltex', 'mobil', 'bp',
          'fuel', 'petrol', 'gasoline', 'diesel', 'gas station',
          'service station', 'automotive', 'car wash',
          'tyre', 'tire', 'workshop', 'mechanic', 'oil change'
        ],
        patterns: [
          /\b(petrol|fuel|gas)\s+(station|pump)/i,
          /\blitre?s?\s+(petrol|fuel)/i,
          /\b(shell|petron|esso|caltex|mobil|bp)\b/i
        ],
        confidence_weight: 1.0
      },

      // Toll & Parking (part of transport)
      {
        category: 'petrol',
        keywords: [
          'toll', 'erp', 'parking', 'carpark', 'viaduct',
          'expressway', 'highway', 'plus', 'touch n go',
          'cashcard', 'parking fee', 'gantry', 'road charge',
          'electronic road pricing'
        ],
        patterns: [
          /\b(toll|erp)\s+(charge|fee|payment)/i,
          /\bparking\s+(fee|charge|lot)/i,
          /\btouch\s+n\s+go/i,
          /\belectronic\s+road\s+pricing/i
        ],
        confidence_weight: 1.0
      },

      // Entertainment & Dining
      {
        category: 'entertainment',
        keywords: [
          'restaurant', 'cafe', 'coffee', 'dining', 'food court',
          'hawker', 'kopitiam', 'bar', 'pub', 'ktv', 'karaoke',
          'cinema', 'movie', 'theatre', 'entertainment',
          'starbucks', 'mcdonald', 'kfc', 'pizza hut', 'subway',
          'team building', 'client dinner', 'business meal'
        ],
        patterns: [
          /\b(restaurant|cafe|dining)\b/i,
          /\b(client|business)\s+(meal|dinner|lunch)/i,
          /\bteam\s+building/i,
          /\b(food|dining)\s+(court|establishment)/i
        ],
        confidence_weight: 0.8 // Lower weight as many receipts are food
      },

      // Other/General Business
      {
        category: 'other',
        keywords: [
          'office', 'stationery', 'supplies', 'equipment',
          'software', 'license', 'subscription', 'internet',
          'phone', 'telecommunications', 'printing', 'courier',
          'fedex', 'dhl', 'pos', 'singpost', 'medical', 'pharmacy'
        ],
        patterns: [
          /\boffice\s+(supplies|equipment)/i,
          /\bsoftware\s+(license|subscription)/i,
          /\btelecommunication/i,
          /\bcourier\s+(service|delivery)/i
        ],
        confidence_weight: 0.6 // Lower confidence for catch-all
      }
    ]
  }

  /**
   * Get category description for user display
   */
  getCategoryDescription(category: ExpenseCategory): string {
    const descriptions: Record<ExpenseCategory, string> = {
      travel_accommodation: 'Travel, accommodation, and business trips',
      petrol: 'Fuel, automotive, parking, and transport costs',
      toll: 'Highway tolls, road charges, and parking fees',
      entertainment: 'Client meals, business dining, and entertainment',
      other: 'Other legitimate business expenses'
    }

    return descriptions[category] || 'Unknown expense category'
  }

  /**
   * Validate category against business rules
   */
  validateCategory(
    category: ExpenseCategory,
    amount: number,
    currency: string = 'SGD'
  ): { isValid: boolean; warnings: string[] } {
    const warnings: string[] = []

    // Amount-based validation (convert to SGD equivalent for rules)
    const sgdAmount = this.convertToSGD(amount, currency)

    // High-value transaction warnings
    if (sgdAmount > 500) {
      if (category === 'entertainment') {
        warnings.push('High-value entertainment expense may require manager approval')
      }
      if (category === 'other' && sgdAmount > 1000) {
        warnings.push('High-value miscellaneous expense requires detailed justification')
      }
    }

    // Category-specific validations
    switch (category) {
      case 'petrol':
        if (sgdAmount > 300) {
          warnings.push('High fuel expense - may require fuel card verification')
        }
        break
    }

    return {
      isValid: warnings.length === 0,
      warnings
    }
  }

  /**
   * Simple currency conversion for validation (rough estimates)
   */
  private convertToSGD(amount: number, currency: string): number {
    const exchangeRates: Record<string, number> = {
      SGD: 1.0,
      USD: 1.35,
      EUR: 1.45,
      MYR: 0.30,
      THB: 0.037,
      IDR: 0.000088,
      CNY: 0.19,
      VND: 0.000054,
      PHP: 0.024
    }

    return amount * (exchangeRates[currency] || 1.0)
  }
}

/**
 * Factory function to create ExpenseCategorizer instance
 */
export function createExpenseCategorizer(): ExpenseCategorizer {
  return new ExpenseCategorizer()
}