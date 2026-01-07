/**
 * Default COGS categories for new businesses
 * Based on Southeast Asian SME requirements with proper AI keywords and vendor patterns
 * Follows IFRS-compliant Cost of Goods Sold categorization
 */

export interface DefaultCOGSCategory {
  id: string
  category_name: string
  description: string
  cost_type: 'direct' | 'indirect'
  is_active: boolean
  ai_keywords: string[]
  vendor_patterns: string[]
  sort_order: number
  created_at: string
  updated_at: string
}

export function getDefaultCOGSCategories(): DefaultCOGSCategory[] {
  const now = new Date().toISOString()

  return [
    {
      id: crypto.randomUUID(),
      category_name: "Direct Materials",
      description: "Raw materials, inventory, components, supplies, and parts directly used in production or service delivery",
      cost_type: "direct",
      is_active: true,
      ai_keywords: [
        "materials",
        "inventory",
        "stock",
        "raw materials",
        "components",
        "supplies",
        "parts",
        "ingredients",
        "goods",
        "merchandise"
      ],
      vendor_patterns: [
        "supplier",
        "materials",
        "wholesale",
        "trading",
        "manufacturing",
        "industrial",
        "supply"
      ],
      sort_order: 1,
      created_at: now,
      updated_at: now
    },
    {
      id: crypto.randomUUID(),
      category_name: "Direct Labor",
      description: "Production wages, billable staff costs, and manufacturing labor directly attributable to goods or services produced",
      cost_type: "direct",
      is_active: true,
      ai_keywords: [
        "wages",
        "salary",
        "payroll",
        "labor",
        "production staff",
        "manufacturing wages",
        "direct labor",
        "hourly wages"
      ],
      vendor_patterns: [
        "payroll",
        "staffing",
        "temp agency",
        "labor",
        "production"
      ],
      sort_order: 2,
      created_at: now,
      updated_at: now
    },
    {
      id: crypto.randomUUID(),
      category_name: "Subcontractor & External Services",
      description: "External contractors, freelancers, and outsourced services directly related to production or service delivery",
      cost_type: "direct",
      is_active: true,
      ai_keywords: [
        "contractor",
        "subcontractor",
        "freelancer",
        "consultant",
        "outsourced",
        "external services",
        "vendor services"
      ],
      vendor_patterns: [
        "contractor",
        "consulting",
        "services",
        "freelancer",
        "outsourcing"
      ],
      sort_order: 3,
      created_at: now,
      updated_at: now
    },
    {
      id: crypto.randomUUID(),
      category_name: "Freight & Logistics",
      description: "Inbound and outbound shipping, delivery, transportation, and logistics costs directly related to product delivery",
      cost_type: "direct",
      is_active: true,
      ai_keywords: [
        "shipping",
        "freight",
        "logistics",
        "delivery",
        "transportation",
        "courier",
        "postage",
        "handling"
      ],
      vendor_patterns: [
        "shipping",
        "logistics",
        "courier",
        "freight",
        "delivery",
        "transport"
      ],
      sort_order: 4,
      created_at: now,
      updated_at: now
    },
    {
      id: crypto.randomUUID(),
      category_name: "Manufacturing & Production Overhead",
      description: "Indirect manufacturing costs including factory utilities, equipment depreciation, rent, and maintenance",
      cost_type: "indirect",
      is_active: true,
      ai_keywords: [
        "overhead",
        "utilities",
        "rent",
        "equipment",
        "machinery",
        "depreciation",
        "maintenance",
        "factory"
      ],
      vendor_patterns: [
        "utilities",
        "equipment",
        "machinery",
        "maintenance",
        "industrial",
        "factory"
      ],
      sort_order: 5,
      created_at: now,
      updated_at: now
    },
    {
      id: crypto.randomUUID(),
      category_name: "Other Direct Costs",
      description: "Miscellaneous direct costs specifically attributable to cost of goods sold (use sparingly, should be <5% of total COGS)",
      cost_type: "direct",
      is_active: true,
      ai_keywords: [
        "other",
        "miscellaneous",
        "direct",
        "various",
        "additional",
        "other direct"
      ],
      vendor_patterns: [
        "other",
        "misc",
        "various"
      ],
      sort_order: 6,
      created_at: now,
      updated_at: now
    }
  ]
}