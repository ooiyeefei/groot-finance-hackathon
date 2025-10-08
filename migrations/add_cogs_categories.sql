-- Migration: Add custom_cogs_categories JSONB field to businesses table
-- Date: 2025-01-06
-- Description: Add COGS (Cost of Goods Sold) categories management for invoice categorization

-- Step 1: Add custom_cogs_categories JSONB column to businesses table
ALTER TABLE businesses
ADD COLUMN custom_cogs_categories JSONB DEFAULT '{"categories": []}'::JSONB;

-- Step 2: Create comprehensive default COGS categories for all existing businesses
UPDATE businesses
SET custom_cogs_categories = '{
  "categories": [
    {
      "id": "cogs-001",
      "category_code": "610-000",
      "category_name": "Purchase",
      "description": "Direct material purchases and inventory acquisitions",
      "gl_account": "610-000",
      "cost_type": "direct",
      "is_active": true,
      "sort_order": 1,
      "ai_keywords": ["material", "purchase", "supplier", "inventory", "raw material", "stock"],
      "vendor_patterns": ["supplier", "materials", "wholesale", "trading"],
      "created_at": "2024-01-15T10:00:00Z"
    },
    {
      "id": "cogs-002",
      "category_code": "611-000",
      "category_name": "IT Technical Support",
      "description": "Information technology support and technical services",
      "gl_account": "611-000",
      "cost_type": "direct",
      "is_active": true,
      "sort_order": 2,
      "ai_keywords": ["IT support", "technical", "technology", "software", "hardware", "maintenance"],
      "vendor_patterns": ["tech", "IT", "systems", "digital", "software"],
      "created_at": "2024-01-15T10:00:00Z"
    },
    {
      "id": "cogs-003",
      "category_code": "614-000",
      "category_name": "COGS - Subscription Fees",
      "description": "Software and service subscriptions directly related to product delivery",
      "gl_account": "614-000",
      "cost_type": "direct",
      "is_active": true,
      "sort_order": 3,
      "ai_keywords": ["subscription", "SaaS", "software", "license", "platform", "service"],
      "vendor_patterns": ["subscription", "software", "platform", "service"],
      "created_at": "2024-01-15T10:00:00Z"
    },
    {
      "id": "cogs-004",
      "category_code": "615-000",
      "category_name": "Wages and Benefits",
      "description": "Direct labor costs including wages and employee benefits for production",
      "gl_account": "615-000",
      "cost_type": "direct",
      "is_active": true,
      "sort_order": 4,
      "ai_keywords": ["wages", "salary", "benefits", "labor", "payroll", "employee"],
      "vendor_patterns": ["payroll", "hr", "benefits", "insurance"],
      "created_at": "2024-01-15T10:00:00Z"
    },
    {
      "id": "cogs-005",
      "category_code": "616-000",
      "category_name": "Materials",
      "description": "Raw materials and components used in production or service delivery",
      "gl_account": "616-000",
      "cost_type": "direct",
      "is_active": true,
      "sort_order": 5,
      "ai_keywords": ["materials", "components", "parts", "supplies", "ingredients", "chemicals"],
      "vendor_patterns": ["materials", "supply", "components", "chemical", "industrial"],
      "created_at": "2024-01-15T10:00:00Z"
    },
    {
      "id": "cogs-006",
      "category_code": "617-000",
      "category_name": "Subcontractor Fees",
      "description": "External contractor and subcontractor services for direct project work",
      "gl_account": "617-000",
      "cost_type": "direct",
      "is_active": true,
      "sort_order": 6,
      "ai_keywords": ["subcontractor", "contractor", "freelancer", "external", "outsourced", "consultant"],
      "vendor_patterns": ["contractor", "freelancer", "consulting", "services"],
      "created_at": "2024-01-15T10:00:00Z"
    },
    {
      "id": "cogs-007",
      "category_code": "618-000",
      "category_name": "Manufacturing Overhead",
      "description": "Indirect manufacturing costs including utilities, rent, and equipment",
      "gl_account": "618-000",
      "cost_type": "indirect",
      "is_active": true,
      "sort_order": 7,
      "ai_keywords": ["overhead", "manufacturing", "factory", "utilities", "equipment", "depreciation"],
      "vendor_patterns": ["utilities", "equipment", "machinery", "industrial"],
      "created_at": "2024-01-15T10:00:00Z"
    },
    {
      "id": "cogs-008",
      "category_code": "619-000",
      "category_name": "Direct Equipment Costs",
      "description": "Equipment purchases and leases directly used in production or service delivery",
      "gl_account": "619-000",
      "cost_type": "direct",
      "is_active": true,
      "sort_order": 8,
      "ai_keywords": ["equipment", "machinery", "tools", "hardware", "lease", "rental"],
      "vendor_patterns": ["equipment", "machinery", "tools", "lease", "rental"],
      "created_at": "2024-01-15T10:00:00Z"
    },
    {
      "id": "cogs-009",
      "category_code": "620-000",
      "category_name": "Shipping and Logistics",
      "description": "Transportation, shipping, and logistics costs for product delivery",
      "gl_account": "620-000",
      "cost_type": "direct",
      "is_active": true,
      "sort_order": 9,
      "ai_keywords": ["shipping", "logistics", "transport", "delivery", "freight", "courier"],
      "vendor_patterns": ["shipping", "logistics", "transport", "courier", "delivery"],
      "created_at": "2024-01-15T10:00:00Z"
    },
    {
      "id": "cogs-010",
      "category_code": "699-000",
      "category_name": "Other Direct Costs",
      "description": "Other miscellaneous costs directly attributable to cost of goods sold",
      "gl_account": "699-000",
      "cost_type": "direct",
      "is_active": true,
      "sort_order": 10,
      "ai_keywords": ["other", "miscellaneous", "direct", "various", "additional"],
      "vendor_patterns": ["other", "misc", "various"],
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}'::JSONB;

-- Step 3: Add index for performance on JSONB queries
CREATE INDEX IF NOT EXISTS idx_businesses_custom_cogs_categories_gin
ON businesses USING GIN (custom_cogs_categories);

-- Step 4: Add comment for documentation
COMMENT ON COLUMN businesses.custom_cogs_categories IS 'JSONB field storing business-specific Cost of Goods Sold categories for invoice categorization. Each category includes GL account codes, AI keywords, and vendor patterns for automatic categorization.';

-- Verify the migration
SELECT
    id,
    business_name,
    jsonb_array_length((custom_cogs_categories->'categories')::JSONB) as cogs_categories_count
FROM businesses
LIMIT 5;