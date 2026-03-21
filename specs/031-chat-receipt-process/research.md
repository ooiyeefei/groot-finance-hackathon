# Research: Receipt Photo to Expense Claim via Chat

## Decision 1: Image Data Transport (Chat API)

**Decision**: Extend ChatRequestBody with `attachments` array containing S3 pre-signed upload references (not base64 inline).

**Rationale**: Base64 encoding inflates payload 33%, hitting API Gateway limits on large images. Pre-uploading to S3 via a dedicated `/api/v1/chat/upload` endpoint keeps the chat API payload small and reuses the existing Vercel OIDC → S3 pattern.

**Alternatives considered**:
- Base64 inline in JSON body — rejected: 10MB image = 13.3MB payload, exceeds Vercel serverless body limit (4.5MB)
- Multipart form data — rejected: requires rewriting SSE streaming endpoint, complicates chat hook
- Convex file storage — rejected: bandwidth budget constraints on free plan

## Decision 2: Tool Architecture (MCP-first vs Tool Factory)

**Decision**: Create `create_expense_from_receipt` as a tool-factory tool (not MCP), because it orchestrates chat-specific state (conversation context, action cards, staged messages) that doesn't map to a stateless MCP endpoint.

**Rationale**: Per CLAUDE.md, MCP-first is for tools that should be shared across chat/Slack/API. Receipt-to-claim is inherently chat-UI-bound (image upload, progress messages, interactive cards). The OCR processing itself already runs via the document processor Lambda. The tool just wires: S3 path → Lambda invoke → poll/callback → create expense claim → return action card.

**Alternatives considered**:
- MCP endpoint — rejected: chat-specific UX (staged progress, action cards) can't be expressed in MCP JSON-RPC
- Separate Next.js API route — rejected: duplicates security/context logic already in tool-factory

## Decision 3: Image Upload Endpoint

**Decision**: New API route `POST /api/v1/chat/upload` that accepts multipart file upload, validates, compresses, uploads to S3 under `chat-attachments/{businessId}/{conversationId}/{uuid}.{ext}`, returns S3 key + metadata.

**Rationale**: Separating upload from the chat message send keeps concerns clean. Upload happens before send, S3 key is included in the chat message. Reuses existing S3 upload patterns from expense claims.

**Alternatives considered**:
- Upload directly in chat hook — rejected: mixing file I/O with SSE streaming is fragile
- Convex storage — rejected: bandwidth budget

## Decision 4: Message Schema Extension

**Decision**: Store attachment metadata in the existing `metadata` field of the `messages` table (no schema change needed). Format: `metadata.attachments: Array<{ id, mimeType, filename, size, s3Path, thumbnailUrl }>`.

**Rationale**: The `metadata` field is already `v.optional(v.any())` — flexible JSON. No Convex schema migration required. Existing message queries are unaffected.

**Alternatives considered**:
- New `chat_attachments` table — rejected: over-engineering for MVP, adds join complexity
- New schema field — rejected: requires Convex deploy, migration risk

## Decision 5: OCR Processing Flow

**Decision**: Synchronous-feeling async flow: upload image → invoke document processor Lambda (async) → poll status via Convex query → return results in tool response with staged progress messages via SSE.

**Rationale**: The document processor Lambda runs 15-20s typically. The chat API already streams SSE. We can emit `status` events during processing ("Uploading receipt...", "Reading receipt...", "Extracting details...") while polling for Lambda completion.

**Alternatives considered**:
- Webhook callback — rejected: adds infra complexity, Lambda already updates Convex directly
- Gemini Vision API directly — rejected: existing Lambda pipeline has DSPy extraction with trained prompts, higher accuracy

## Decision 6: Action Card for Receipt Confirmation

**Decision**: New action card type `receipt_claim` registered in the existing card registry. Displays extracted data (merchant, amount, date, category) with Submit/Edit/Cancel buttons.

**Rationale**: Follows the existing pattern in `src/domains/chat/components/action-cards/`. Registration is one line. Buttons trigger tool calls back to the agent.

## Decision 7: Multiple Images Per Message

**Decision**: Upload each image separately to S3, pass array of S3 keys in chat message. Tool processes each independently, creating one draft claim per image. Action card shows summary if multiple.

**Rationale**: Parallel processing is simple — each image is an independent OCR job. The tool iterates the attachments array and creates claims sequentially.
