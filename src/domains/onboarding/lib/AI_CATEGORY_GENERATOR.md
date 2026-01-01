# AI Category Generator

> **Location**: `src/domains/onboarding/lib/ai-category-generator.ts`

AI-powered category metadata generation for the onboarding flow. Enhances user-provided category names with vendor patterns, AI keywords, and contextual descriptions to improve auto-categorization accuracy.

## Quick Start

```typescript
import { generateCategoryMetadata } from '@/domains/onboarding/lib/ai-category-generator';

// Generate metadata for Food & Beverage COGS categories
const metadata = await generateCategoryMetadata(
  'fnb',                                           // Business type
  ['Food Ingredients', 'Beverages', 'Packaging'], // Category names
  'cogs'                                          // Category type
);

console.log(metadata[0]);
// {
//   category_name: "Food Ingredients",
//   category_code: "FOOD_INGREDIENTS",
//   description: "Raw food materials used in meal preparation including proteins, vegetables, grains, and dairy products.",
//   vendor_patterns: ["SYSCO", "*Foods*", "*Wholesale*", "Restaurant Depot", "*Supply*", "*Market*"],
//   ai_keywords: ["flour", "rice", "vegetables", "meat", "seafood", "spices", "dairy", "produce"],
//   is_active: true,
//   sort_order: 1
// }
```

## API Reference

### `generateCategoryMetadata()`

Main function that generates enhanced category metadata using Gemini AI.

**Signature**:
```typescript
async function generateCategoryMetadata(
  businessType: BusinessType,
  categoryNames: string[],
  categoryType: 'cogs' | 'expense'
): Promise<CategoryMetadata[]>
```

**Parameters**:
- `businessType`: One of `'fnb'`, `'retail'`, `'services'`, `'manufacturing'`, `'other'`
- `categoryNames`: Array of category names (max 20)
- `categoryType`: Either `'cogs'` (Cost of Goods Sold) or `'expense'` (Operating Expenses)

**Returns**: Array of `CategoryMetadata` objects

**Throws**: Error if `categoryNames` exceeds 20 items

**Features**:
- ✅ AI-powered vendor pattern generation (5-10 patterns per category)
- ✅ AI keyword extraction for classification (5-10 keywords per category)
- ✅ Contextual descriptions based on business type
- ✅ Automatic fallback when AI unavailable
- ✅ Comprehensive error handling and logging

---

### `generateCategoryCode()`

Helper function to convert category names to UPPER_SNAKE_CASE format.

**Signature**:
```typescript
function generateCategoryCode(name: string): string
```

**Parameters**:
- `name`: Category name (e.g., "Food Ingredients")

**Returns**: Snake case code (e.g., "FOOD_INGREDIENTS")

**Examples**:
```typescript
generateCategoryCode("Food Ingredients")           // "FOOD_INGREDIENTS"
generateCategoryCode("Office Supplies & Equipment") // "OFFICE_SUPPLIES_EQUIPMENT"
generateCategoryCode("Travel-Accommodation")        // "TRAVEL_ACCOMMODATION"
generateCategoryCode("raw materials (imported)")    // "RAW_MATERIALS_IMPORTED"
```

---

### `CategoryMetadata` Interface

```typescript
interface CategoryMetadata {
  category_name: string;      // Original category name
  category_code: string;      // UPPER_SNAKE_CASE code
  description: string;        // Brief description (1-2 sentences)
  vendor_patterns: string[];  // Common vendor name patterns (5-10 items)
  ai_keywords: string[];      // Keywords for AI classification (5-10 items)
  is_active: boolean;         // Whether category is active (always true)
  sort_order: number;         // Display order (1-based index)
}
```

## Business Type Support

The library integrates with `business-type-defaults.ts` to provide context-aware generation:

| Business Type | Code | Example Categories |
|---------------|------|-------------------|
| Food & Beverage | `'fnb'` | Food Ingredients, Beverages, Packaging |
| Retail | `'retail'` | Merchandise, Packaging, Shipping Materials |
| Professional Services | `'services'` | Subcontractors, Software Licenses, Project Materials |
| Manufacturing | `'manufacturing'` | Raw Materials, Components, Machinery Parts |
| Other | `'other'` | Custom categories (no default suggestions) |

## Usage Examples

### Example 1: Onboarding Flow

```typescript
// During business setup, generate metadata for suggested categories
import { generateCategoryMetadata } from '@/domains/onboarding/lib/ai-category-generator';
import { getSuggestedCategories } from '@/domains/onboarding/lib/business-type-defaults';

async function setupBusinessCategories(businessType: BusinessType) {
  // Get suggested COGS categories for the business type
  const suggestedCOGS = getSuggestedCategories(businessType, 'cogs');

  // Generate AI-enhanced metadata
  const cogsMetadata = await generateCategoryMetadata(
    businessType,
    suggestedCOGS as string[],
    'cogs'
  );

  // Insert into database
  for (const category of cogsMetadata) {
    await supabase.from('business_categories').insert({
      business_id: businessId,
      name: category.category_name,
      code: category.category_code,
      description: category.description,
      vendor_patterns: category.vendor_patterns,
      ai_keywords: category.ai_keywords,
      type: 'cogs',
      is_active: true
    });
  }
}
```

### Example 2: Custom Category Creation

```typescript
// User creates a custom category, enhance it with AI
async function createCustomCategory(categoryName: string, businessType: BusinessType) {
  const [metadata] = await generateCategoryMetadata(
    businessType,
    [categoryName],
    'expense'
  );

  return await supabase.from('business_categories').insert({
    business_id: businessId,
    name: metadata.category_name,
    code: metadata.category_code,
    description: metadata.description,
    vendor_patterns: metadata.vendor_patterns,
    ai_keywords: metadata.ai_keywords,
    type: 'expense'
  });
}
```

### Example 3: Batch Processing

```typescript
// Process multiple categories in one API call (max 20)
const cogsCategories = ['Food Ingredients', 'Beverages', 'Packaging'];
const expenseCategories = ['Staff Meals', 'Kitchen Equipment', 'Cleaning'];

const [cogsMetadata, expenseMetadata] = await Promise.all([
  generateCategoryMetadata('fnb', cogsCategories, 'cogs'),
  generateCategoryMetadata('fnb', expenseCategories, 'expense')
]);
```

## Error Handling

The library includes comprehensive error handling with automatic fallback:

```typescript
try {
  const metadata = await generateCategoryMetadata('fnb', categories, 'cogs');
  // AI-enhanced metadata returned
} catch (error) {
  // Error is logged, fallback metadata returned automatically
  // Fallback includes: category_name, category_code, basic description
  // No vendor_patterns or ai_keywords in fallback
}
```

**Fallback Behavior**:
- Returns basic metadata with generated category codes
- Empty `vendor_patterns` array
- Single `ai_keywords` entry (lowercase category name)
- Generic description

**Edge Cases Handled**:
- ✅ Empty input array → Returns empty array
- ✅ More than 20 categories → Throws descriptive error
- ✅ Gemini API failure → Uses fallback
- ✅ Invalid JSON response → Uses fallback
- ✅ Missing category in response → Uses fallback for that item

## Performance

| Scenario | Typical Time |
|----------|-------------|
| 3-5 categories (AI) | 1-2 seconds |
| 10-15 categories (AI) | 2-3 seconds |
| Fallback mode | <10ms |
| Max batch (20 categories) | 3-5 seconds |

**Recommendations**:
- Keep batches under 10 categories for best UX
- Use batch processing for initial setup (up to 20)
- Consider caching common patterns for repeat generation

## Logging

All operations are logged with `[AI-CategoryGenerator]` prefix:

```
[AI-CategoryGenerator] Starting generation for 3 categories
[AI-CategoryGenerator] Business Type: fnb, Category Type: cogs
[AI-CategoryGenerator] Prompt built (1245 chars)
[AI-CategoryGenerator] Gemini response received in 1847ms
[AI-CategoryGenerator] ✅ Successfully generated metadata for 3 categories in 1847ms
[AI-CategoryGenerator] - Food Ingredients: 8 patterns, 8 keywords
[AI-CategoryGenerator] - Beverages: 7 patterns, 9 keywords
[AI-CategoryGenerator] - Packaging: 6 patterns, 7 keywords
```

## Testing

Unit tests are available at `src/domains/onboarding/lib/__tests__/ai-category-generator.test.ts`.

**Run tests**:
```bash
npm test -- ai-category-generator
```

**Note**: Integration tests requiring live API keys are marked as `.skip()`. Enable them by removing `.skip()` and setting valid `GEMINI_API_KEY` in environment.

## Integration Checklist

When integrating this library:

- [ ] Set `GEMINI_API_KEY` environment variable
- [ ] Create API endpoint (e.g., `/api/v1/onboarding/generate-category-metadata`)
- [ ] Add UI loading states for AI generation
- [ ] Handle fallback gracefully in UI (show warning if no vendor patterns)
- [ ] Add retry mechanism for API failures
- [ ] Consider caching common category patterns
- [ ] Track usage metrics (success rate, generation time, fallback usage)

## Dependencies

- `@/lib/ai/ai-services/gemini-service` - Gemini AI integration
- `@/domains/onboarding/lib/business-type-defaults` - Business type context

**Environment Variables**:
- `GEMINI_API_KEY` - Required for AI generation (uses fallback if missing)

## Roadmap

Future enhancements:
- [ ] Cache layer for common category patterns
- [ ] Admin approval workflow for AI-generated patterns
- [ ] Multi-language support for keywords and descriptions
- [ ] Industry-specific pattern libraries
- [ ] A/B testing for pattern effectiveness
- [ ] Pattern quality scoring and feedback loop
