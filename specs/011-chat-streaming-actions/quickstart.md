# Quickstart: Action-Driven Rendering & SSE Streaming

**Branch**: `011-chat-streaming-actions`

---

## Prerequisites

- FinanSEAL app running locally (`npm run dev`)
- Convex dev server running (`npx convex dev`)
- Valid `.env.local` with `CHAT_MODEL_ENDPOINT_URL` (Modal/Qwen3) and `GEMINI_API_KEY`
- Logged in with Clerk as a manager user with existing expense data

## Testing the Feature

### 1. SSE Streaming

1. Open the floating chat widget (blue button, bottom-right)
2. Type "How much did the team spend on meals in January?"
3. **Observe**: Status indicator appears immediately ("Searching transactions...")
4. **Observe**: Text streams in progressively, word by word
5. Try sending a complex query and click the **Stop** button mid-stream
6. **Observe**: Streaming stops, partial text is preserved

### 2. Action Cards

1. Ask "Are there any suspicious transactions this month?"
2. **Observe**: An anomaly card renders with color-coded severity, descriptions, and "View Transaction" links
3. Click "View Transaction" — app navigates to the expense claim detail page
4. Ask "Show me pending expenses for approval"
5. **Observe**: Expense approval card renders with Approve/Reject buttons
6. Click "Approve" — inline confirmation appears ("Approve $X from Y? Yes / Cancel")
7. Click "Yes" — card updates to show "Approved" badge

### 3. Historical Cards

1. Close the chat widget
2. Reopen it — action cards from previous messages render in their final state (e.g., "Approved" badge, not active buttons)

### 4. Dark Mode

1. Switch app to dark mode
2. Open chat, trigger an action card
3. **Observe**: Cards use semantic tokens and render correctly in dark theme

## Key Files

| File | Purpose |
|------|---------|
| `src/app/api/copilotkit/route.ts` | SSE streaming endpoint |
| `src/lib/ai/copilotkit-adapter.ts` | Agent invocation with streaming |
| `src/domains/chat/hooks/use-copilot-chat.ts` | SSE stream consumer |
| `src/domains/chat/components/message-renderer.tsx` | Action card rendering |
| `src/domains/chat/components/action-cards/` | Card components (anomaly, expense, vendor, chart) |
| `src/domains/chat/lib/action-registry.ts` | Extensible type→component map |
| `src/lib/ai/agent/config/prompts.ts` | Agent instructions for action generation |

## Build Verification

```bash
npm run build  # Must pass
```
