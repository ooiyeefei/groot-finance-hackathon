# Feature Specification: GL Account Code for Categories

**Feature Branch**: `001-category-gl-codes`
**Created**: 2026-03-07
**Status**: Draft
**Input**: GitHub Issue #262 - Add GL Account Code to expense/COGS categories for accounting export

## Context

Groot Finance has structured expense and COGS categories stored in business settings (`businesses.categoryConfig.expense` and `businesses.categoryConfig.cogs`). Each category has an `id`, `category_name`, `description`, `ai_keywords`, `vendor_patterns`, `is_active`, and `sort_order`.

When users export data to accounting software (Master Accounting, SQL Accounting, etc.), they must manually map each category to a Chart of Account (COA) code on the export mapping screen. With 8+ expense categories and 4+ COGS categories, this is tedious and error-prone. The mapping screen only saves these codes in the export mapping table, disconnected from the category itself.

This feature adds a `glCode` field directly to each category, pre-populated with sensible defaults, editable in business settings, and consumed by the export pipeline to eliminate manual mapping.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - GL Code Auto-fills on Export Mapping Screen (Priority: P1)

As a finance admin exporting expense claims to Master Accounting, I want the export mapping screen to auto-fill account codes from my category GL codes, so I don't have to manually type COA codes for every category on each export.

**Why this priority**: This is the primary pain point. Every export currently requires manual entry of 8+ account codes. Eliminating this saves time and reduces errors.

**Independent Test**: Create a business with categories that have `glCode` set. Go to Export → Purchases Book-Bill → mapping screen should show pre-filled account codes from `glCode` instead of empty fields.

**Acceptance Scenarios**:

1. **Given** a business has expense categories with `glCode` values set (e.g., Travel → `9120`), **When** the user opens the Purchases Book-Bill export mapping screen, **Then** the Account Codes section shows each category with its `glCode` pre-filled in the input field.

2. **Given** a category has `glCode: "9120"` and the user previously saved a different mapping (e.g., `9050`) in the export mapping table, **When** the mapping screen loads, **Then** the saved mapping (`9050`) takes priority over the `glCode` default.

3. **Given** a category has no `glCode` set (empty/null), **When** the mapping screen loads, **Then** the input field is empty (same as current behavior) and the user can type a code manually.

4. **Given** the user is on the Sales Book-Invoice mapping screen, **When** loading account codes for invoice line items, **Then** the default fallback reads from saved default in the mapping table (not from category `glCode`, since invoices use product SKUs not expense categories).

---

### User Story 2 - Edit GL Code in Business Settings (Priority: P2)

As a business owner, I want to set and edit the GL Account Code for each expense and COGS category in my business settings, so I control which accounting codes map to each category without relying on the export screen.

**Why this priority**: Users need a place to manage GL codes independent of the export flow. Business settings is the natural home since categories are already managed there.

**Independent Test**: Go to Settings → Category Management → edit a category → set/change the GL Code → save → verify it persists and shows on next visit.

**Acceptance Scenarios**:

1. **Given** the user is on the expense category settings page, **When** they view a category, **Then** they see a "GL Account Code" field showing the current value (or empty if not set).

2. **Given** the user enters `9120` in the GL Account Code field for the "Travel" category and saves, **When** they refresh the page, **Then** the field still shows `9120`.

3. **Given** the user clears the GL Account Code field and saves, **When** they next export, **Then** the mapping screen shows empty for that category (no auto-fill).

---

### User Story 3 - Pre-populate GL Codes with Sensible Defaults (Priority: P2)

As a new business owner setting up Groot Finance, I want my expense and COGS categories to come with sensible default GL codes, so I can immediately export to accounting software without manually researching COA codes.

**Why this priority**: Reduces onboarding friction. Most Malaysian SMEs use similar Chart of Account structures, so reasonable defaults work for most users.

**Independent Test**: Create a new business (or existing business without GL codes) → verify categories have default GL codes populated. For existing businesses, run a one-time migration/backfill.

**Acceptance Scenarios**:

1. **Given** a new business is created with default categories, **When** the categories are generated, **Then** each category has a `glCode` pre-populated with a sensible default based on its name.

2. **Given** an existing business has categories without `glCode` values, **When** the system detects missing GL codes, **Then** it suggests or auto-fills defaults that the user can accept or modify.

3. **Given** the default GL codes follow this mapping:

   | Category Name | Default GL Code | Rationale |
   |---------------|-----------------|-----------|
   | Travel | 9120 | Petrol, Parking & Toll |
   | Office Expenses | 9040 | Printing, Stationery and Postage |
   | Entertainment & Meal | 9050 | Consultation/Entertainment Fee |
   | IT Expenses | 9050 | Consultation Fee |
   | Subscription & Licenses | 9050 | Consultation Fee |
   | Professional Development | 9050 | Consultation Fee |
   | Client Gifts | 9050 | Consultation Fee |
   | Other (Expense) | 9050 | Consultation Fee |
   | Subcontractors (COGS) | 6010 | Purchases |
   | Software Licenses (COGS) | 6010 | Purchases |
   | Project Materials (COGS) | 6010 | Purchases |
   | Other (COGS) | 6010 | Purchases |

   **When** defaults are applied, **Then** each category gets the corresponding GL code from this table.

---

### User Story 4 - Chart of Account Export Template (Priority: P3)

As a finance admin setting up Master Accounting for the first time, I want to export my expense and COGS categories as a Chart of Account text file, so I can import my custom account codes into Master Accounting before importing transactions.

**Why this priority**: Enables users to create matching COA entries in Master Accounting from Groot Finance categories. Currently Chart of Account export was removed because Groot lacked structured account data - this feature provides that structure.

**Independent Test**: Select Chart of Account export template → export → file contains category GL codes as Account Codes with correct format.

**Acceptance Scenarios**:

1. **Given** the business has expense categories with GL codes set, **When** the user exports using the "Master Accounting (Chart of Account)" template, **Then** a `.txt` file is generated with section header "Chart of Account" followed by one row per category with: Account Code (from `glCode`), Description (from `category_name`), Account Type (`EXP` for expense, `COS` for COGS), and other default fields.

2. **Given** a category has no `glCode` set, **When** the export runs, **Then** that category is excluded from the export (since it has no valid account code).

---

### Edge Cases

- What happens when two categories have the same `glCode`? This is valid in accounting (multiple categories can map to the same GL account). No error should be raised.
- What happens when a `glCode` exceeds 20 characters? The system should validate and reject codes longer than 20 characters (Master Accounting's limit).
- What happens when `glCode` contains special characters like spaces or pipes? The system should only allow alphanumeric characters and hyphens.
- What happens when a user changes a `glCode` after already exporting with the old code? The next export uses the new code. Previously saved export mappings in the mapping table take priority if they exist.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST add an optional `glCode` field to each category object in `businesses.categoryConfig.expense` and `businesses.categoryConfig.cogs` arrays.
- **FR-002**: System MUST display the `glCode` field in the category management UI (business settings) as an editable text input labeled "GL Account Code".
- **FR-003**: System MUST validate `glCode` values: max 20 characters, alphanumeric and hyphens only, optional (can be empty).
- **FR-004**: System MUST pre-populate `glCode` with sensible defaults when new categories are created, based on the category name mapping defined in User Story 3.
- **FR-005**: System MUST provide a mechanism to backfill `glCode` defaults for existing businesses that have categories without GL codes.
- **FR-006**: The export mapping screen MUST read `glCode` from categories and use them as the initial values for account code inputs when no saved mapping exists in the export mapping table.
- **FR-007**: Saved export mappings (in `export_code_mappings` table) MUST take priority over `glCode` values from categories.
- **FR-008**: System MUST re-enable the "Master Accounting (Chart of Account)" export template that generates a pipe-delimited text file from categories with `glCode` values.
- **FR-009**: The Chart of Account export MUST use `glCode` as Account Code, `category_name` as Description, `EXP` for expense categories and `COS` for COGS categories as Account Type.
- **FR-010**: The Chart of Account export MUST exclude categories that have no `glCode` set.

### Key Entities

- **Category (extended)**: Existing category objects in business settings, now with an additional `glCode` field. The `glCode` maps a business expense/COGS category to a Chart of Account code in external accounting software.
- **Chart of Account Export Record**: A derived record from a category, formatted as a Master Accounting Chart of Account import row with Account Code, Description, Account Type, Special Type, DR/CR, Currency Code.

## Assumptions

- The default GL codes are based on common Malaysian SME Chart of Account structures (compatible with Master Accounting MasterSample database). Users in different regions or with custom COA structures will need to modify the defaults.
- The `glCode` field is optional - businesses that don't use accounting software exports are not impacted.
- The backfill for existing businesses will add default GL codes only for categories that don't already have a `glCode` set. It will not overwrite existing values.
- The Chart of Account export produces the same pipe-delimited format as other Master Accounting exports (section header, pipe delimiter, no column headers).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users exporting Purchases Book-Bill see account codes auto-filled from category GL codes, reducing manual input from 8+ fields to 0 fields on repeat exports.
- **SC-002**: 100% of new businesses created after this feature have GL codes pre-populated on all default categories.
- **SC-003**: Users can edit GL codes in business settings and see the changes reflected in the next export mapping screen within the same session.
- **SC-004**: Chart of Account export generates a valid Master Accounting import file that is accepted on first import attempt for all categories with GL codes.
- **SC-005**: The GL code field is visible and editable in the category management UI within 2 clicks from the settings page.
