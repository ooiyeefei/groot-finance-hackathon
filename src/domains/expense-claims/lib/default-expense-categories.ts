/**
 * Default expense categories for new businesses
 * Based on Southeast Asian SME requirements with proper AI keywords and vendor patterns
 */

export interface DefaultExpenseCategory {
  id: string
  category_name: string
  category_code: string
  description: string
  is_active: boolean
  is_default: boolean
  sort_order: number
  ai_keywords: string[]
  vendor_patterns: string[]
  tax_treatment: 'deductible' | 'non_deductible' | 'partial'
  requires_receipt: boolean
  receipt_threshold: number | null
  policy_limit: number | null
  requires_manager_approval: boolean
  created_at: string
  updated_at: string
}

export function getDefaultExpenseCategories(): DefaultExpenseCategory[] {
  const now = new Date().toISOString()

  return [
    {
      id: crypto.randomUUID(),
      category_name: "Travel",
      category_code: "TRAVEL",
      description: "Business travel, hotels, flights, accommodation expenses",
      is_active: true,
      is_default: true,
      sort_order: 1,
      ai_keywords: [
        "travel", "hotel", "flight", "accommodation", "taxi", "grab",
        "uber", "homestay", "airline", "booking"
      ],
      vendor_patterns: [
        "hotel", "homestay", "airbnb", "airlines", "grab", "uber", "taxi"
      ],
      tax_treatment: "deductible",
      requires_receipt: true,
      receipt_threshold: 50,
      policy_limit: null,
      requires_manager_approval: true,
      created_at: now,
      updated_at: now
    },
    {
      id: crypto.randomUUID(),
      category_name: "Petrol & Transportation",
      category_code: "petrol_transport",
      description: "Fuel, parking, tolls, vehicle maintenance",
      is_active: true,
      is_default: true,
      sort_order: 2,
      ai_keywords: [
        "petrol", "fuel", "gas", "parking", "toll", "touch n go",
        "tng", "vehicle", "maintenance", "repair"
      ],
      vendor_patterns: [
        "petrol", "shell", "petronas", "caltex", "esso", "bhp",
        "parking", "plus", "touch n go"
      ],
      tax_treatment: "deductible",
      requires_receipt: true,
      receipt_threshold: 30,
      policy_limit: null,
      requires_manager_approval: false,
      created_at: now,
      updated_at: now
    },
    {
      id: crypto.randomUUID(),
      category_name: "Entertainment & Meals",
      category_code: "entertainment_meals",
      description: "Business meals, client entertainment, team events",
      is_active: true,
      is_default: true,
      sort_order: 3,
      ai_keywords: [
        "restaurant", "food", "meal", "entertainment", "coffee",
        "lunch", "dinner", "catering", "event"
      ],
      vendor_patterns: [
        "restaurant", "mcdonald", "kfc", "starbucks", "coffee",
        "catering", "food court"
      ],
      tax_treatment: "deductible",
      requires_receipt: true,
      receipt_threshold: 25,
      policy_limit: null,
      requires_manager_approval: true,
      created_at: now,
      updated_at: now
    },
    {
      id: crypto.randomUUID(),
      category_name: "Office Supplies",
      category_code: "office_supplies",
      description: "Stationery, office equipment, software, subscriptions",
      is_active: true,
      is_default: true,
      sort_order: 4,
      ai_keywords: [
        "office", "supplies", "stationery", "equipment", "software",
        "subscription", "computer", "printer", "paper"
      ],
      vendor_patterns: [
        "popular", "office depot", "staples", "computer shop",
        "software", "microsoft", "adobe"
      ],
      tax_treatment: "deductible",
      requires_receipt: false,
      receipt_threshold: null,
      policy_limit: null,
      requires_manager_approval: true,
      created_at: now,
      updated_at: now
    },
    {
      id: crypto.randomUUID(),
      category_name: "Utilities & Communications",
      category_code: "utilities_comms",
      description: "Internet, phone, utilities, postal services",
      is_active: true,
      is_default: true,
      sort_order: 5,
      ai_keywords: [
        "internet", "phone", "utilities", "electricity", "water",
        "postal", "courier", "delivery"
      ],
      vendor_patterns: [
        "telekom", "maxis", "digi", "unifi", "tnb", "syabas",
        "pos laju", "gdex"
      ],
      tax_treatment: "deductible",
      requires_receipt: true,
      receipt_threshold: 100,
      policy_limit: null,
      requires_manager_approval: false,
      created_at: now,
      updated_at: now
    },
    {
      id: crypto.randomUUID(),
      category_name: "Training & Development",
      category_code: "training_development",
      description: "Employee training, courses, conferences, seminars",
      is_active: true,
      is_default: true,
      sort_order: 6,
      ai_keywords: [
        "training", "course", "seminar", "conference", "workshop",
        "certification", "learning"
      ],
      vendor_patterns: [
        "training center", "university", "college", "academy", "institute"
      ],
      tax_treatment: "deductible",
      requires_receipt: true,
      receipt_threshold: 50,
      policy_limit: null,
      requires_manager_approval: true,
      created_at: now,
      updated_at: now
    },
    {
      id: crypto.randomUUID(),
      category_name: "Marketing & Advertising",
      category_code: "marketing_advertising",
      description: "Advertising, marketing materials, promotions",
      is_active: true,
      is_default: true,
      sort_order: 7,
      ai_keywords: [
        "advertising", "marketing", "promotion", "banner", "flyer",
        "social media", "facebook", "google ads"
      ],
      vendor_patterns: [
        "advertising agency", "facebook", "google", "marketing", "printing"
      ],
      tax_treatment: "deductible",
      requires_receipt: true,
      receipt_threshold: 100,
      policy_limit: null,
      requires_manager_approval: true,
      created_at: now,
      updated_at: now
    },
    {
      id: crypto.randomUUID(),
      category_name: "Maintenance & Repairs",
      category_code: "maintenance_repairs",
      description: "Equipment maintenance, facility repairs, cleaning",
      is_active: true,
      is_default: true,
      sort_order: 8,
      ai_keywords: [
        "maintenance", "repair", "cleaning", "service", "fix",
        "replacement", "contractor"
      ],
      vendor_patterns: [
        "contractor", "maintenance", "cleaning service", "repair shop"
      ],
      tax_treatment: "deductible",
      requires_receipt: true,
      receipt_threshold: 50,
      policy_limit: null,
      requires_manager_approval: false,
      created_at: now,
      updated_at: now
    },
    {
      id: crypto.randomUUID(),
      category_name: "Other Business Expenses",
      category_code: "other_business",
      description: "Miscellaneous legitimate business expenses",
      is_active: true,
      is_default: true,
      sort_order: 9,
      ai_keywords: [
        "business", "expense", "miscellaneous", "other", "general"
      ],
      vendor_patterns: [],
      tax_treatment: "deductible",
      requires_receipt: true,
      receipt_threshold: 20,
      policy_limit: null,
      requires_manager_approval: true,
      created_at: now,
      updated_at: now
    }
  ]
}