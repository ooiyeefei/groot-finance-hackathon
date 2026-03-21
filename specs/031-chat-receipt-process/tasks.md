# Tasks: Receipt Photo to Expense Claim via Chat

**Input**: Design documents from `/specs/031-chat-receipt-process/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — test tasks omitted. Manual UAT via quickstart.md.

**Organization**: Tasks grouped by user story. US1 and US2 are co-dependent P1 priorities (US2 is the upload capability that US1 needs). Implemented together as MVP.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1, US2, US3, US4)
- Exact file paths included

---

## Phase 1: Setup

**Purpose**: Shared infrastructure needed by all user stories

- [x] T001 Create image upload API route at `src/app/api/v1/chat/upload/route.ts` — accepts multipart/form-data, validates file type (JPEG/PNG/HEIC/PDF) and size (max 10MB), uploads to S3 under `chat-attachments/{businessId}/{conversationId}/{uuid}.{ext}`, returns attachment metadata JSON per contract. Use Clerk auth, Vercel OIDC for S3. Follow existing patterns in `src/app/api/v1/document-inbox/` for S3 upload.

- [x] T002 [P] Extend `ChatRequestBody` interface in `src/app/api/copilotkit/route.ts` — add optional `attachments: Array<{ id, s3Path, mimeType, filename, size }>` field. Pass attachments through to the LangGraph agent state. No behavior change yet — just plumbing.

- [x] T003 [P] Extend chat message persistence in `src/domains/chat/hooks/use-copilot-chat.ts` — when creating user messages via `createMessage()`, include `metadata.attachments` array with the uploaded file references. Ensure the Convex `messages` table stores attachment metadata in its existing `metadata` field.

**Checkpoint**: Upload endpoint works, chat API accepts attachments, messages can store attachment refs.

---

## Phase 2: User Story 2 — Chat Image Upload Capability (P1) 🎯 MVP

**Goal**: Employees can attach images in the chat input, preview them, and send messages with image attachments that appear in the conversation thread.

**Independent Test**: Attach an image in chat → preview appears → send → image thumbnail visible in message thread.

- [x] T004 [US2] Create `ImageAttachmentInput` component at `src/domains/chat/components/image-attachment-input.tsx` — paperclip/camera icon button that opens file picker. Accepts multiple files. Validates file type (JPEG/PNG/HEIC/PDF) and size (max 10MB) client-side before preview. Shows error toast for invalid files via sonner. Returns selected files to parent.

- [x] T005 [US2] Integrate `ImageAttachmentInput` into `src/domains/chat/components/chat-window.tsx` — add attachment button next to the textarea. When files selected: show preview thumbnails above textarea (each with X remove button). On send: upload each file to `/api/v1/chat/upload`, collect S3 refs, include in `sendMessage()` call. Clear previews after send. Disable send button during upload.

- [x] T006 [US2] Add image thumbnail rendering in `src/domains/chat/components/message-renderer.tsx` — when a user message has `metadata.attachments`, render clickable thumbnail images above the message text. Use pre-signed S3 URLs for display. Support multiple thumbnails in a grid layout.

- [x] T007 [US2] Update `src/domains/chat/hooks/use-copilot-chat.ts` `handleSendMessage` function — before calling `/api/copilotkit`, upload all attached files to `/api/v1/chat/upload` sequentially (or in parallel with Promise.all). Pass returned attachment refs in the API body. Store attachment metadata in the Convex user message.

**Checkpoint**: Image upload, preview, send, and display working in chat. No OCR processing yet.

---

## Phase 3: User Story 1 — Single Receipt Photo to Expense Claim (P1) 🎯 MVP

**Goal**: When an employee sends a receipt photo, the agent automatically processes it via OCR, creates a draft expense claim, and presents an interactive confirmation card.

**Independent Test**: Send receipt photo → see staged progress messages → see action card with extracted data → click Submit → expense claim appears in claims list.

- [x] T008 [US1] Create `ReceiptClaimTool` extending `BaseTool` at `src/lib/ai/tools/receipt-claim-tool.ts` — tool name: `create_expense_from_receipt`. Parameters: `{ attachments: Array<{ s3Path, mimeType, filename }>, businessId, userId, conversationId }`. Implementation: (1) call `invokeDocumentProcessor()` from `src/lib/lambda-invoker.ts` with `domain: 'expense_claims'` and `expectedDocumentType: 'receipt'`, (2) poll Convex for processing completion (check `expense_claims` record status changes from 'processing' to 'draft'), (3) read extracted `processingMetadata`, (4) create expense claim in 'draft' status via Convex mutation with `sourceType: 'chat'`, `sourceMessageId`, `sourceConversationId` in metadata, (5) check for duplicate receipts (same merchant + amount + date), (6) return action card data with type `receipt_claim`. Handle multiple attachments by processing each sequentially. For failed/partial OCR, return error with readable message asking user to provide missing data.

- [x] T009 [US1] Register `ReceiptClaimTool` in `src/lib/ai/tools/tool-factory.ts` — add to the tool registry in the static block. Set tool tier to 'personal' (all employees can use it). Add tool schema describing the receipt processing capability so the LLM knows when to invoke it.

- [x] T010 [US1] Add attachment detection in `src/lib/ai/langgraph-agent.ts` — in the `analyzeIntent` or `callModel` node, when the incoming message has `attachments` in state, automatically include attachment metadata in the LLM context so it knows to call `create_expense_from_receipt`. The agent should detect image attachments and proactively invoke the receipt tool without the user needing to type "process this receipt."

- [x] T011 [US1] Add staged progress SSE events in `src/app/api/copilotkit/route.ts` — when the receipt processing tool is executing, emit `status` events with phases: `uploading_receipt`, `reading_receipt`, `extracting_details`. These map to the staged progress messages the user sees. Hook into the tool execution lifecycle to emit at appropriate times.

- [x] T012 [US1] Create `ReceiptClaimCard` action card at `src/domains/chat/components/action-cards/receipt-claim-card.tsx` — renders extracted data (merchant name, amount with currency, date, category) in a card layout. Shows confidence indicator for low-confidence fields (highlight in amber). Three buttons: Submit (primary/blue), Edit (secondary/gray), Cancel (destructive/red). Submit sends "Submit expense claim {claimId}" as user message. Edit opens a simple inline correction prompt. Cancel sends "Cancel expense claim {claimId}" as user message. Follow existing action card patterns (e.g., `expense-approval-card.tsx`).

- [x] T013 [US1] Register `ReceiptClaimCard` in `src/domains/chat/components/action-cards/index.tsx` — import and call `registerActionCard('receipt_claim', ReceiptClaimCard)`. Ensure it appears in the registry so message-renderer can look it up.

- [x] T014 [US1] Add `submit_expense_claim` and `cancel_expense_claim` tool handling — either as separate lightweight tools in tool-factory or as sub-operations of the receipt-claim tool. `submit_expense_claim` changes claim status from 'draft' to 'submitted' via existing Convex mutation. `cancel_expense_claim` deletes the draft claim. Both return confirmation text for the agent to relay.

- [x] T015 [US1] Add duplicate receipt detection in `ReceiptClaimTool` — before creating the claim, query `expense_claims` for the same business where `vendorName` + `totalAmount` + `transactionDate` match. If found, return a warning in the action card data (`duplicateWarning: true`, `existingClaimId`) so the card can show "Possible duplicate of EC-2026-0032" with proceed/cancel options.

- [x] T016 [US1] Handle correction flow — when the user sends a message like "Change the amount to RM25" after a receipt claim card, the agent should detect this as a correction to the most recent draft claim. Update the claim via Convex mutation and return an updated action card. This leverages the existing LangGraph conversation context — no new tool needed, just ensure the `create_expense_from_receipt` tool can also handle update operations when a `claimId` is provided.

**Checkpoint**: Full single-receipt flow works: photo → progress → card → submit/correct/cancel.

---

## Phase 4: User Story 3 — Approval Routing After Submission (P2)

**Goal**: Chat-created expense claims integrate with the existing approval workflow. The agent confirms the approver name after submission.

**Independent Test**: Submit a chat-created claim → verify it appears in manager's approval queue → agent confirms "Submitted to [Manager Name]."

- [x] T017 [US3] Ensure `submit_expense_claim` tool (from T014) triggers existing approval routing — verify that changing status to 'submitted' via the existing Convex mutation already fires the approval routing logic (it should, since manual form submissions use the same mutation). If not, call the approval routing function explicitly. Return the approver's name in the tool response so the agent can say "Submitted to [Manager Name] for approval."

- [x] T018 [US3] Handle missing approver edge case — when no approval rules are configured for the business, the `submit_expense_claim` tool should still change status to 'submitted' but return a message indicating no approver is assigned, suggesting the employee contact their admin.

**Checkpoint**: Submitted claims route to managers. Agent confirms approver name.

---

## Phase 5: User Story 4 — Multi-Receipt Batch Submission (P3)

**Goal**: Multiple receipt photos (in one message or sequential messages) create individual claims. Employee can batch-submit all.

**Independent Test**: Send 3 receipt photos → 3 draft claims created → "submit all" → all submitted.

- [x] T019 [US4] Extend `ReceiptClaimTool` to handle multiple attachments — when `attachments` array has >1 items, process each independently (sequential Lambda invocations). Create one draft claim per receipt. Return a summary action card listing all created claims instead of individual cards.

- [x] T020 [US4] Create batch summary variant of `ReceiptClaimCard` — when action card data contains `claims: Array<{...}>` (multiple claims), render a summary table (merchant, amount, date per row) with a "Submit All" button and individual Edit buttons per row. "Submit All" sends "Submit all expense claims {claimId1},{claimId2},{claimId3}" as user message.

- [x] T021 [US4] Add `submit_all_expense_claims` handling — accept comma-separated claim IDs, submit each via existing Convex mutation. Return total amount and count in confirmation message.

**Checkpoint**: Batch receipt processing and submission works.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, error handling, and quality improvements

- [x] T022 [P] Add HEIC format handling in upload endpoint `src/app/api/v1/chat/upload/route.ts` — detect HEIC mime type, convert to JPEG before S3 upload using a lightweight converter (e.g., `heic-convert` npm package). This ensures iPhone photos work seamlessly.

- [x] T023 [P] Add loading/error states for image upload in `src/domains/chat/components/chat-window.tsx` — show upload progress indicator on thumbnails during S3 upload. Show retry button if upload fails. Disable send until all uploads complete.

- [x] T024 [P] Add foreign currency handling in `ReceiptClaimTool` — when extracted currency differs from the business's home currency, include a note in the action card: "Receipt in {currency} — home currency equivalent may need manual entry."

- [x] T025 Run `npm run build` to verify no TypeScript errors across all changes.

- [x] T026 Manual UAT following `specs/031-chat-receipt-process/quickstart.md` verification checklist.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US2 — Image Upload)**: Depends on T001 (upload endpoint) and T003 (message persistence)
- **Phase 3 (US1 — Receipt Processing)**: Depends on Phase 2 completion (needs working image upload)
- **Phase 4 (US3 — Approval Routing)**: Depends on T014 from Phase 3 (submit tool)
- **Phase 5 (US4 — Batch)**: Depends on Phase 3 completion (extends single-receipt flow)
- **Phase 6 (Polish)**: Can start after Phase 3; some tasks parallel with Phase 4/5

### User Story Dependencies

- **US2 (Image Upload)**: Foundation — no story dependencies, but needs T001 upload endpoint
- **US1 (Receipt Processing)**: Requires US2 (image upload must work first)
- **US3 (Approval Routing)**: Requires US1 (needs submit tool)
- **US4 (Batch)**: Requires US1 (extends the receipt tool)

### Parallel Opportunities

```
Phase 1: T001 → T002 [P] + T003 [P] (T002 and T003 can run in parallel after T001)
Phase 2: T004 [P] + T006 [P] (component + renderer in parallel, then T005 + T007 integrate)
Phase 3: T008 → T009 → T010 + T011 [P] → T012 [P] + T013 [P] → T014 → T015 [P] + T016 [P]
Phase 6: T022 [P] + T023 [P] + T024 [P] (all independent)
```

---

## Implementation Strategy

### MVP First (US2 + US1 combined)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Image Upload (T004-T007)
3. Complete Phase 3: Receipt Processing (T008-T016)
4. **STOP and VALIDATE**: Send a receipt photo → claim created → submit works
5. Run `npm run build` (T025)

### Incremental Delivery

1. Setup + US2 + US1 → Core flow works → **MVP deployable**
2. Add US3 (Approval) → Claims route to managers → Deploy
3. Add US4 (Batch) → Multiple receipts → Deploy
4. Polish → HEIC, error states, currency handling → Deploy

---

## Notes

- No Convex schema changes needed — uses existing `metadata` (any) field and `processingMetadata`
- No Convex deploy required for this feature (unless expense_claims mutations need updating)
- S3 path prefix: `chat-attachments/` (separate from existing `expense_claims/` prefix)
- Tool-factory (not MCP) per research.md Decision 2
- Action card pattern follows existing registry in `action-cards/index.tsx`
