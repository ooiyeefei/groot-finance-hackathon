# API Contracts: UX/UI Theme Consistency & Layout Shift Prevention

**Feature**: 005-uiux-theme-cls
**Date**: 2026-01-07

## Overview

**No API contracts required.** This feature is a frontend-only refactoring that does not introduce or modify any API endpoints.

## Contract Types Not Applicable

| Contract Type | Reason |
|---------------|--------|
| REST API | No new endpoints; existing APIs unchanged |
| GraphQL | Not applicable to styling changes |
| WebSocket | Not applicable to styling changes |
| Event Schemas | No backend events affected |

## Related Documentation

For styling "contracts" (design system patterns), see:
- `src/components/ui/CLAUDE.md` - UI component standards
- `src/app/CLAUDE.md` - App-level implementation patterns
- `src/app/globals.css` - Semantic token definitions

These serve as the "interface contracts" for consistent component styling.
