# LHDN MyInvois Integration Guide

**Status**: ✅ **READY TO USE** (No CA Certificate Required)

---

## ✅ What's Already Integrated & Working

### Backend Integration Complete

**Credential Storage:**
- **Client ID**: Stored in Convex `businesses.lhdnClientId` field
- **Client Secret**: Stored securely in AWS SSM Parameter Store at `/groot-finance/businesses/{businessId}/lhdn-client-secret` (encrypted at rest with AWS KMS)

**API Endpoints:**
- `POST /api/v1/account-management/businesses/lhdn-secret` - Stores client secret to SSM
- All rejection/polling endpoints use credentials from Convex + SSM

**Lambda Functions:**
- `finanseal-lhdn-polling` - Polls LHDN every 5 minutes for received e-invoices
- Automatically reads per-business credentials from Convex (Client ID) + SSM (Client Secret)

---

## 🎯 Features Available NOW (No CA Cert Needed)

These buyer-side features work immediately after businesses connect their LHDN MyInvois account:

| Feature | Status | Requires CA Cert? |
|---------|--------|-------------------|
| **Receive e-invoices from suppliers** | ✅ LIVE | ❌ NO |
| **Reject received e-invoices (72h window)** | ✅ LIVE | ❌ NO |
| **72-hour countdown timer** | ✅ LIVE | ❌ NO |
| **Download LHDN-validated PDFs** | ✅ LIVE | ❌ NO |
| **Auto-match to expense claims** | ✅ LIVE | ❌ NO |
| **Notifications on status changes** | ✅ LIVE | ❌ NO |
| **Self-billed e-invoice issuing** | ⚠️ PARTIAL | ✅ YES (future) |

---

## 📋 Business Owner Setup Guide

### Step 1: Get LHDN Client ID & Secret

**Navigate to MyInvois Portal:**
1. Go to https://myinvois.hasil.gov.my
2. Log in with your business account
3. Navigate to **Systems** > **Manage Application**
4. Click **"Register Application"** or **"Add New Application"**

**Fill in Application Details:**
- **Application Name**: "Groot Finance" (or your preferred name)
- **Description**: "Automated e-invoice management"
- **Redirect URL**: `https://finance.hellogroot.com`

**Copy Credentials:**
- **Client ID**: Unique identifier (e.g., "ABC123DEF456...")
- **Client Secret**: Secret key (⚠️ **shown only once** - copy immediately!)

---

### Step 2: Enter Credentials in Groot Finance

**Navigate to Business Settings:**
1. Go to **Business Settings** (gear icon in sidebar)
2. Select **Business Profile** tab (owner-only)
3. Expand the **E-Invoice** section

**Enter LHDN Credentials:**
1. Paste **LHDN Client ID** into the field
2. Paste **LHDN Client Secret** into the password field
3. Click **Save Changes**

**Security:**
- Client ID stored in Convex (database)
- Client Secret stored in AWS SSM Parameter Store (encrypted)
- Never logged or exposed in frontend

---

### Step 3: Verify Connection

**Test E-Invoice Retrieval:**
1. Create an expense claim with a receipt
2. Wait 5-10 minutes (Lambda polls every 5 min)
3. Check if e-invoice appears in the E-Invoice section

**If Not Working:**
- Verify credentials are correct (re-enter if needed)
- Check LHDN MyInvois portal for API access status
- Ensure business TIN matches LHDN account

---

## 🔐 Security Architecture

### Credential Storage

```
┌─────────────────────────────────────────────────────────────┐
│ Business Owner enters credentials in Groot Finance UI       │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ├──> Client ID ──> Convex (businesses.lhdnClientId)
                  │
                  └──> Client Secret ──> AWS SSM Parameter Store
                                         /groot-finance/businesses/{id}/lhdn-client-secret
                                         (encrypted with AWS KMS)
```

### Runtime Access

```
Lambda Polling Function (every 5 min)
  │
  ├──> Read Client ID from Convex (fast, cached)
  │
  ├──> Read Client Secret from SSM (secure, encrypted)
  │
  └──> Call LHDN OAuth API
        ├──> Get access token
        └──> Poll for received e-invoices
```

**IAM Permissions:**
- Lambda execution role has `ssm:GetParameter` permission scoped to `/groot-finance/businesses/*` only
- No broad SSM access
- No hardcoded secrets in code or environment variables

---

## 🚀 Deployment Status

### Production Environment

**Convex:**
- ✅ Schema deployed with `lhdnClientId` field
- ✅ Mutations deployed (`rejectReceivedDocument`)
- ✅ Queries deployed (`getByUuid`)

**AWS Infrastructure:**
- ✅ SSM Parameter Store path configured
- ✅ Lambda IAM role has SSM read permissions
- ✅ Lambda polling function deployed (5-min cron)
- ✅ API Gateway routes configured

**Frontend:**
- ✅ Business settings UI deployed
- ✅ Setup guide with collapsible instructions
- ✅ E-invoice section with countdown timer
- ✅ Links from e-invoice pages to settings

---

## 📊 Environment Differences

### Sandbox vs Production

| Environment | Portal URL | Credentials | Purpose |
|-------------|-----------|-------------|---------|
| **Sandbox** | https://preprod.myinvois.hasil.gov.my | Separate Client ID/Secret | Testing only |
| **Production** | https://myinvois.hasil.gov.my | Production Client ID/Secret | Live businesses |

**⚠️ Important**: Sandbox credentials DO NOT work in production and vice versa.

**Current Deployment**: Groot Finance production environment requires **production** LHDN credentials.

---

## 🔮 Future: Self-Billed E-Invoice Issuing

### What Requires CA Certificate

**Self-billed issuing flow:**
```
Business creates e-invoice on behalf of supplier
  ↓
Sign XML with CA certificate (digital signature)
  ↓
Submit to LHDN
```

**Not needed for buyer features** (what's implemented now):
```
Supplier creates e-invoice (signed with THEIR cert)
  ↓
LHDN validates
  ↓
Groot polls LHDN to receive (just OAuth token, no cert)
  ↓
Business reviews/rejects in Groot
```

### CA Certificate Purchase (When Needed)

**Provider Options:**
- MSC Trustgate (~RM 500-800/year)
- Digicert (~RM 1,500-2,000/year)
- Other LHDN-approved providers

**Purchase Trigger:**
- First paying customer needs self-billed issuing
- Lead time: 3-7 days to get certificate
- One-time setup: Store in AWS SSM, update Lambda

---

## 🧪 Testing Guide

### Manual UAT Checklist

**Credential Setup:**
- [ ] Enter LHDN Client ID in business settings
- [ ] Enter LHDN Client Secret in business settings
- [ ] Save and verify no errors

**E-Invoice Reception:**
- [ ] Create expense claim with receipt
- [ ] Wait 5-10 minutes for Lambda poll
- [ ] Verify e-invoice appears with "Valid" status
- [ ] Check countdown timer shows remaining time

**E-Invoice Rejection:**
- [ ] Click "Reject E-Invoice" button
- [ ] Enter rejection reason
- [ ] Verify rejection succeeds
- [ ] Check notification sent to claim submitter
- [ ] Verify status updated to "Rejected"

**72-Hour Window:**
- [ ] Verify countdown shows correctly (e.g., "48h remaining")
- [ ] Verify urgent styling when < 6 hours
- [ ] Verify reject button hidden after 72h expires

---

## 📚 Reference Links

**LHDN Official Resources:**
- MyInvois Portal: https://myinvois.hasil.gov.my
- SDK Documentation: https://sdk.myinvois.hasil.gov.my
- FAQ: https://sdk.myinvois.hasil.gov.my/faq/

**Groot Finance Internal:**
- Business Settings: `/en/business-settings?tab=business-profile`
- API Documentation: `src/app/api/v1/CLAUDE.md`
- Infrastructure: `infra/lib/document-processing-stack.ts`

---

## 🛠️ Troubleshooting

### "No e-invoices received"
1. Check LHDN credentials are entered correctly
2. Verify business TIN matches LHDN account
3. Check Lambda CloudWatch logs for polling errors
4. Ensure supplier has actually issued e-invoice

### "Rejection fails"
1. Verify within 72-hour window
2. Check LHDN API status (might be down)
3. Verify Client Secret is correct (re-enter if needed)
4. Check API route logs for error details

### "Client Secret save failed"
1. Check AWS SSM Parameter Store permissions
2. Verify IAM role attached to API route execution
3. Check CloudWatch logs for SSM errors

---

**Last Updated**: 2026-03-16
**Integration Status**: ✅ PRODUCTION READY
**Waiting For**: First business to connect LHDN account
