# n8n Workflow Setup — Groot Finance Hackathon Demo

## Overview

n8n automates the expense approval workflow:
```
Employee submits expense → n8n receives webhook → Policy check → Auto-approve → Mock payment → Notify
```

## Environment Variables (Vercel)

```
N8N_WEBHOOK_URL=https://your-n8n.app.n8n.cloud/webhook/expense-submitted
N8N_WEBHOOK_SECRET=hackathon-demo-secret
N8N_SERVICE_USER_ID=<admin-clerk-user-id>
MINIMAX_API_KEY=<your-minimax-api-key>
MINIMAX_GROUP_ID=<your-minimax-group-id>
```

## n8n Workflow: Auto-Approve Expenses

### Node 1: Webhook Trigger
- **Type**: Webhook
- **Method**: POST
- **Path**: `/expense-submitted`
- **Authentication**: None (our app validates)
- **Response**: Immediately

### Node 2: Policy Check (IF)
- **Type**: IF
- **Condition**: `{{ $json.amount }} < 100 AND {{ $json.event }} == "expense.submitted"`
- **True**: Route to auto-approve
- **False**: Route to manual notification

### Node 3: Auto-Approve (HTTP Request)
- **Type**: HTTP Request
- **Method**: POST
- **URL**: `https://<your-vercel-app>.vercel.app/api/v1/webhooks/n8n`
- **Authentication**: Bearer Token = `hackathon-demo-secret`
- **Body (JSON)**:
```json
{
  "action": "auto_approve",
  "claimId": "={{ $json.claimId }}",
  "reason": "Auto-approved: amount under $100 policy threshold",
  "actingUserId": "<admin-clerk-user-id>"
}
```

### Node 4: Mark Reimbursed (HTTP Request)
- **Type**: HTTP Request
- **Method**: POST
- **URL**: `https://<your-vercel-app>.vercel.app/api/v1/webhooks/n8n`
- **Authentication**: Bearer Token = `hackathon-demo-secret`
- **Body (JSON)**:
```json
{
  "action": "mark_reimbursed",
  "claimId": "={{ $json.claimId }}",
  "paymentMethod": "bank_transfer",
  "actingUserId": "<admin-clerk-user-id>"
}
```

### Node 5: Wait (optional)
- **Type**: Wait
- **Duration**: 3 seconds (for demo effect — shows "processing payment")

### Node 6: Notification (optional)
- **Type**: Slack / Email
- **Message**: "Expense claim for {{ $json.amount }} {{ $json.currency }} from {{ $json.vendor }} has been auto-approved and reimbursed."

## Quick n8n Setup Steps

1. Go to https://app.n8n.cloud
2. Create new workflow "Expense Auto-Approval"
3. Add nodes in order above
4. Set webhook URL in Groot Finance env vars
5. Activate workflow
6. Test: Submit an expense under $100 → watch it auto-approve

## Demo Flow

1. **User**: Opens chat, says "I had a $45 lunch at Sushi Zen for a client meeting"
2. **Agent**: Creates expense claim, user confirms
3. **System**: Expense submitted → webhook fires to n8n
4. **n8n**: Checks policy ($45 < $100) → auto-approves → marks reimbursed
5. **Result**: Expense goes draft → submitted → approved → reimbursed in ~5 seconds
6. **Agent**: Speaks "Done! Your $45 expense at Sushi Zen has been approved and queued for reimbursement"
