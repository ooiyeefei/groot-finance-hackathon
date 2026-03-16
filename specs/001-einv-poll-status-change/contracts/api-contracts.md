# API Contracts: E-Invoice Status Polling

No new API endpoints needed. All contracts are already defined:

## Existing Contracts (no changes)

### Lambda → Convex: Status Polling Query
```
GET convex/functions/salesInvoices:getIssuedInvoicesForStatusPolling
Response: Array<{ _id, businessId, lhdnSubmissionId, lhdnDocumentUuid, lhdnStatus, lhdnValidatedAt, invoiceNumber, journalEntryId? }>
```

### Lambda → Convex: Status Update Mutation
```
POST convex/functions/salesInvoices:updateLhdnStatusFromPoll
Body: { invoiceId, newStatus: "rejected"|"cancelled_by_buyer", reason?, timestamp }
Effect: Updates invoice + creates in-app notifications
```

### Lambda → LHDN: Submission Status Check
```
GET /api/v1.0/documentsubmissions/{submissionUid}
Headers: Authorization: Bearer {accessToken}, onbehalfof: {businessTin}
Response: LhdnSubmissionStatus (includes documentSummary[].rejectRequestDateTime, cancelDateTime, documentStatusReason)
```

## New Contract: Email Notification (Lambda → SES)

Added to Lambda polling flow after successful Convex mutation:

```
Lambda → buyer-notification-service.sendBuyerNotification({
  event: "rejection_confirmed",
  buyerEmail: (from invoice or business contact),
  invoiceNumber,
  businessName,
  amount, currency,
  reason,
  lhdnDocumentUuid
})
```

Governed by `business.einvoiceBuyerNotifications` setting. Fire-and-forget (errors logged, don't block polling).
