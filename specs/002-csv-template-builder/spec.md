# Feature Specification: CSV Template Builder

**Feature Branch**: `002-csv-template-builder`
**Created**: 2026-02-04
**Status**: Draft
**Input**: CSV Template Builder - A feature that allows users to export data from FinanSEAL (expense claims, leave records) to CSV format with pre-built templates for common systems and build-your-own-template capability.

---

## Overview

The CSV Template Builder enables FinanSEAL users to export their processed data (expense claims, leave records) in CSV format compatible with external systems like SQL Payroll, Xero, QuickBooks, BrioHR, and Kakitangan. Users can choose from pre-built templates or create custom templates with their own field mappings, column names, and data formats.

**Export Flow**: Users first select the data module (Expense Claims or Leave Records), then choose a template. Each template is module-specific - expense templates map expense fields, leave templates map leave fields. This separation ensures clean data structures aligned with how external systems import data.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Quick Export with Pre-built Template (Priority: P1)

As a finance admin, I want to export approved expense claims using a pre-built SQL Payroll template so that I can import the data directly into our payroll system without manual reformatting.

**Why this priority**: This is the most common use case - users need to quickly export data to their existing systems. Pre-built templates remove friction and deliver immediate value.

**Independent Test**: Can be fully tested by selecting a pre-built template, choosing a date range, and downloading the CSV file. Delivers immediate value by providing usable export without any setup.

**Acceptance Scenarios**:

1. **Given** I am a finance admin with approved expense claims, **When** I select "SQL Payroll" from the pre-built templates and click Export, **Then** a CSV file downloads with columns and format matching SQL Payroll's import requirements
2. **Given** I am viewing the export page, **When** I browse pre-built templates, **Then** I see templates for SQL Payroll, Xero, QuickBooks, BrioHR, and Kakitangan with descriptions of each
3. **Given** I select a pre-built template, **When** I preview the export, **Then** I see a sample of how my data will appear in the CSV format

---

### User Story 2 - Build Custom Template (Priority: P2)

As a business owner using a proprietary accounting system, I want to create my own export template by mapping FinanSEAL fields to my required column names and formats so that I can import data into my unique system.

**Why this priority**: Many businesses use custom or legacy systems. This flexibility is a key differentiator but requires P1 to work first.

**Independent Test**: Can be tested by creating a new template, mapping at least 3 fields, saving it, and using it to export data.

**Acceptance Scenarios**:

1. **Given** I am creating a custom template, **When** I drag and drop FinanSEAL fields into my column list, **Then** I can arrange them in any order I choose
2. **Given** I am mapping a field, **When** I set a custom column name, **Then** the exported CSV uses my custom name as the header
3. **Given** I have a date field, **When** I configure the date format (e.g., DD/MM/YYYY, YYYY-MM-DD, MM-DD-YYYY), **Then** dates in the export match my selected format
4. **Given** I have a currency/number field, **When** I configure decimal places and thousand separators, **Then** numbers in the export match my format
5. **Given** I have completed my template configuration, **When** I click "Preview", **Then** I see how my data will look before saving

---

### User Story 3 - Save and Reuse Custom Templates (Priority: P2)

As a recurring user, I want to save my custom templates for future use so that I don't have to recreate the mapping every time I export.

**Why this priority**: Closely tied to P2 - saving templates makes custom templates practical for regular use.

**Independent Test**: Can be tested by saving a template, logging out, logging back in, and verifying the template is still available and functional.

**Acceptance Scenarios**:

1. **Given** I have configured a custom template, **When** I click "Save Template" and provide a name, **Then** the template is saved to my account
2. **Given** I have saved templates, **When** I view the template list, **Then** I see my custom templates alongside pre-built templates
3. **Given** I have a saved template, **When** I select it and click "Edit", **Then** I can modify the field mappings and save changes
4. **Given** I have a saved template, **When** I select it and click "Delete", **Then** the template is removed after confirmation

---

### User Story 4 - Schedule Automated Exports (Priority: P3)

As a finance manager, I want to schedule automatic exports on a daily, weekly, or monthly basis so that I receive fresh data without manual intervention.

**Why this priority**: Automation is valuable but requires core export functionality (P1, P2) to be solid first.

**Independent Test**: Can be tested by creating a schedule, waiting for the scheduled time, and verifying the export was generated and delivered.

**Acceptance Scenarios**:

1. **Given** I have selected a template, **When** I click "Schedule Export", **Then** I can choose frequency (daily, weekly, monthly) and time
2. **Given** I have set up a weekly schedule, **When** the scheduled time arrives, **Then** the export runs automatically and I receive a notification
3. **Given** I have scheduled exports, **When** I view my schedules, **Then** I see all active schedules with next run time and can enable/disable them
4. **Given** a scheduled export completes, **When** I check my export history, **Then** I see the scheduled export with status (success/failed)

---

### User Story 5 - Export History and Re-download (Priority: P3)

As a user, I want to view my export history and re-download previous exports so that I can retrieve files I may have lost or need again.

**Why this priority**: History provides convenience and audit capability but is not required for core export functionality.

**Independent Test**: Can be tested by running an export, navigating to history, and successfully re-downloading the same file.

**Acceptance Scenarios**:

1. **Given** I have completed exports, **When** I view export history, **Then** I see a list of past exports with date, template used, record count, and status
2. **Given** I am viewing an export in history, **When** I click "Download", **Then** I receive the same CSV file that was originally generated
3. **Given** I am viewing export history, **When** I filter by date range or template, **Then** I see only matching exports
4. **Given** exports older than 90 days, **When** I view history, **Then** I see them marked as "Archived" with option to request re-generation

---

### Edge Cases

- What happens when the selected data range has no records? → Show message "No records found for selected criteria" and prevent export
- What happens when a required field in the template has no data? → Export with empty cell; warn user in preview
- What happens when export file exceeds size limit? → Split into multiple files with sequential naming
- What happens when scheduled export fails (e.g., no data)? → Send notification with failure reason; retry once after 1 hour
- What happens when a pre-built template is updated? → User's saved version is preserved; option to "Update to latest version"
- What happens when a field is removed from FinanSEAL but exists in saved template? → Mark field as "Unavailable" in template editor; exclude from export with warning

---

## Requirements *(mandatory)*

### Functional Requirements

**Core Export**
- **FR-001**: System MUST provide pre-built export templates for: SQL Payroll, Xero, QuickBooks, BrioHR, and Kakitangan
- **FR-002**: System MUST allow users to preview export data before downloading
- **FR-003**: System MUST support exporting expense claims data including: employee info, claim date, amount, category, description, status, approval date
- **FR-004**: System MUST support exporting leave records data including: employee info, leave type, start date, end date, days taken, status, approval date
- **FR-005**: System MUST allow filtering export data by date range, status, employee, and category/leave type

**Custom Templates**
- **FR-006**: System MUST allow users to create custom export templates with user-defined column names
- **FR-007**: System MUST allow users to select which FinanSEAL fields to include in export
- **FR-008**: System MUST allow users to arrange column order via drag-and-drop or manual ordering
- **FR-009**: System MUST support date format configuration (minimum: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD)
- **FR-010**: System MUST support number format configuration (decimal places: 0-4, thousand separator: comma/none)
- **FR-011**: System MUST allow users to save custom templates with a unique name
- **FR-012**: System MUST allow users to edit and delete their saved custom templates
- **FR-012a**: System MUST allow users to clone any pre-built template as a starting point for a custom template
- **FR-013**: System MUST store custom templates per-business (shared among business members with appropriate permissions)

**Scheduled Exports**
- **FR-014**: System MUST allow users to schedule exports on daily, weekly (select day), or monthly (select date) frequency
- **FR-015**: System MUST send notification (in-app + email) when scheduled export completes or fails, containing a secure download link to the file in Export History
- **FR-016**: System MUST allow users to view, enable/disable, and delete scheduled exports
- **FR-017**: System MUST retry failed scheduled exports once after 1 hour

**Export History**
- **FR-018**: System MUST maintain export history for 90 days
- **FR-019**: System MUST allow users to re-download exports from history
- **FR-020**: System MUST display export metadata: date, template name, record count, file size, status
- **FR-021**: System MUST allow filtering export history by date range and template

**Permissions**
- **FR-022**: System MUST restrict template creation/editing to finance_admin and owner roles
- **FR-023**: System MUST enforce role-based data access in exports: Employees can export only their own records; Managers can export their direct reports' records; Finance Admins and Owners can export all business records

### Key Entities

- **Export Template**: Represents a saved export configuration. Attributes: name, type (pre-built/custom), module (expense/leave), field mappings, date format, number format, created by, business ID
- **Field Mapping**: Represents a single column in the export. Attributes: source field (FinanSEAL field name), target column name, display order, format options
- **Export Schedule**: Represents a scheduled export job. Attributes: template ID, frequency, schedule details (day/time), enabled status, last run, next run, created by
- **Export History**: Represents a completed export. Attributes: template used, date generated, record count, file size, file storage reference, status, generated by (user or schedule)

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete a pre-built template export in under 1 minute (from selecting template to download)
- **SC-002**: Users can create and save a custom template with 5+ field mappings in under 5 minutes
- **SC-003**: 90% of scheduled exports complete successfully without manual intervention
- **SC-004**: Export history loads within 2 seconds showing up to 100 past exports
- **SC-005**: Pre-built template exports are compatible with target systems (validated by successful import test for each supported system)
- **SC-006**: 80% of users who need export functionality use templates (vs manual data extraction) within 30 days of launch
- **SC-007**: Support tickets related to "data export" or "getting data out" reduce by 60% within 60 days of launch

---

## Assumptions

1. **File Format**: All exports are CSV format with UTF-8 encoding (no Excel or PDF in initial release)
2. **Export Limits**: Maximum 10,000 records per export; larger datasets must be split by date range
3. **Storage Retention**: Export files retained for 90 days; older files archived and available on request
4. **Notification Channel**: Export notifications sent via in-app notification and email
5. **Pre-built Template Updates**: Pre-built templates may be updated by FinanSEAL; users notified of changes
6. **Time Zone**: All dates/times in exports use the business's configured time zone
7. **Currency**: Currency values exported as numbers; currency code available as separate field if needed

---

## Out of Scope

- Direct API integration with external systems (push exports)
- Real-time sync with external systems
- Excel (.xlsx) or PDF export formats
- Export of invoice/accounting data (future module)
- Import functionality (bringing data into FinanSEAL)
- Webhook notifications for export completion

---

## UI Navigation

The CSV Template Builder is accessed via a **new sidebar page called "Reporting & Exports"**. This page consolidates:
- Existing Management Reports (moved from Manager Approvals → Reports tab)
- CSV Template Builder (pre-built and custom templates)
- Export History
- Scheduled Exports management

This separation follows single-responsibility design: "Manager Approvals" focuses on approval workflows, while "Reporting & Exports" handles all data extraction and reporting needs.

---

## Clarifications

### Session 2026-02-04

- Q: Should CSV Template Builder be a new tab in Manager Approvals, or a new sidebar page? → A: New sidebar page "Reporting & Exports" - consolidates reports and exports in one location
- Q: How should expense claims and leave records be handled in exports? → A: Separate exports per module - user selects module first, then template
- Q: How should scheduled export files be delivered? → A: Notification with secure download link (in-app + email) pointing to Export History
- Q: Can users modify pre-built templates? → A: Clone to customize - users can clone a pre-built template as starting point for custom template
- Q: What data can each role access in exports? → A: Role-based scope - Employees: own records; Managers: team records; Admins/Owners: all business records

---

## Dependencies

- Existing expense claims data and approval workflow
- Existing leave management data and approval workflow
- User authentication and business membership system
- File storage service for export files
- Notification service for export completion alerts
- Background job processing for scheduled exports
