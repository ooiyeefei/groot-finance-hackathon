# Quickstart: Receipt Photo to Expense Claim via Chat

## Prerequisites

- Node.js 20+
- Convex CLI (`npx convex`)
- AWS credentials (for S3 upload testing)
- Running `npx convex dev` from main working directory

## Setup

```bash
# 1. Switch to feature branch
git checkout 031-chat-receipt-process

# 2. Install dependencies (if any new packages added)
npm install

# 3. Start dev server
npm run dev
```

## Testing the Feature

### Manual Test Flow

1. Open chat at `http://localhost:3000/en/chat`
2. Click the attachment (paperclip) icon in chat input
3. Select a receipt image (JPEG/PNG/PDF, under 10MB)
4. Preview appears — click Send
5. Watch staged progress messages: "Uploading receipt..." → "Reading receipt..." → "Extracting details..."
6. Receipt claim action card appears with extracted data
7. Click "Submit" to submit for approval, or type corrections

### Test Images

Use receipts from `docs/test-data/receipts/` (if available) or any receipt photo from your device.

### Key Files Modified

| Layer | File | Change |
|-------|------|--------|
| Chat UI | `src/domains/chat/components/chat-window.tsx` | Image attachment input, preview, multi-file support |
| Chat Hook | `src/domains/chat/hooks/use-copilot-chat.ts` | S3 upload before send, attachments in payload |
| Upload API | `src/app/api/v1/chat/upload/route.ts` | New endpoint for image upload to S3 |
| Chat API | `src/app/api/copilotkit/route.ts` | Accept attachments, pass to agent |
| Agent Tool | `src/lib/ai/tools/receipt-claim-tool.ts` | New tool: process receipt → create claim |
| Tool Factory | `src/lib/ai/tools/tool-factory.ts` | Register new tool |
| Action Card | `src/domains/chat/components/action-cards/receipt-claim-card.tsx` | Interactive confirmation card |
| Card Registry | `src/domains/chat/components/action-cards/index.tsx` | Register new card |
| Message Renderer | `src/domains/chat/components/message-renderer.tsx` | Render image thumbnails in messages |

## Verification Checklist

- [ ] Image attachment button visible in chat input
- [ ] Preview thumbnail shows before sending
- [ ] File validation rejects >10MB and unsupported types
- [ ] Staged progress messages appear during processing
- [ ] Action card shows extracted data with correct values
- [ ] Submit button creates submitted expense claim
- [ ] Claim appears in expense claims list with receipt attached
- [ ] Multiple images in one message create multiple claims
- [ ] Duplicate receipt warning appears for same merchant+amount+date
