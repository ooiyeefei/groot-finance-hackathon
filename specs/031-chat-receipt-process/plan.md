# Implementation Plan: Receipt Photo to Expense Claim via Chat

**Branch**: `031-chat-receipt-process` | **Date**: 2026-03-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/031-chat-receipt-process/spec.md`

## Summary

Enable employees to send receipt photos in chat and have the AI agent automatically extract data (merchant, amount, date, category) via the existing document processor Lambda, create a draft expense claim, and present an interactive confirmation card with Submit/Edit/Cancel actions. The feature extends the chat input with image upload, adds a new agent tool for receipt processing, and adds an action card for claim confirmation.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Next.js 15.5.7, React 19.1.2
**Primary Dependencies**: Convex 1.31.3, LangGraph 0.4.5, @aws-sdk/client-s3, @aws-sdk/client-lambda
**Storage**: S3 (finanseal-bucket, `chat-attachments/` prefix), Convex (messages, expense_claims tables)
**Testing**: Manual UAT (existing pattern), `npm run build` verification
**Target Platform**: Web (desktop + mobile responsive), iOS via Capacitor
**Project Type**: Web application (Next.js + Convex backend)
**Performance Goals**: Receipt processing < 30 seconds end-to-end
**Constraints**: Convex free plan bandwidth (2GB/month), S3 upload via Vercel OIDC, max 10MB per image
**Scale/Scope**: ~50 users, ~200 receipts/month initial

## Constitution Check

*No project-specific constitution defined. Default engineering principles from CLAUDE.md apply:*
- [x] MCP-first for shared tools — N/A (this tool is chat-UI-specific, see research.md Decision 2)
- [x] Convex bandwidth budget — image storage on S3, not Convex; no new reactive queries
- [x] EventBridge-first for scheduled jobs — N/A (no scheduled component)
- [x] Least privilege security — S3 upload via existing Vercel OIDC role, Clerk auth on upload endpoint
- [x] Domain-driven design — changes within `chat` and `expense-claims` domains + shared `lib`
- [x] No new files without justification — new files are: upload API route, receipt tool, action card (all required)

## Project Structure

### Documentation (this feature)

```text
specs/031-chat-receipt-process/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Technical decisions
├── data-model.md        # Entity definitions
├── quickstart.md        # Dev setup guide
├── contracts/           # API contracts
│   └── chat-upload-api.md
├── checklists/
│   └── requirements.md  # Quality checklist
└── tasks.md             # Implementation tasks (next phase)
```

### Source Code (files to create/modify)

```text
# New files
src/app/api/v1/chat/upload/route.ts              # Image upload endpoint
src/lib/ai/tools/receipt-claim-tool.ts            # Agent tool for receipt processing
src/domains/chat/components/action-cards/receipt-claim-card.tsx  # Confirmation card
src/domains/chat/components/image-attachment-input.tsx           # File picker + preview

# Modified files
src/domains/chat/components/chat-window.tsx       # Add attachment button + preview
src/domains/chat/hooks/use-copilot-chat.ts        # Upload images before send, pass refs
src/app/api/copilotkit/route.ts                   # Accept attachments in request body
src/lib/ai/tools/tool-factory.ts                  # Register receipt-claim tool
src/domains/chat/components/action-cards/index.tsx # Register receipt card
src/domains/chat/components/message-renderer.tsx   # Render image thumbnails
src/lib/ai/langgraph-agent.ts                     # Pass attachments to tool context
```

## Complexity Tracking

No constitution violations. All changes follow existing patterns.
