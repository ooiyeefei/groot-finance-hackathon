# LHDN MyInvois e-Invoice Research

> Research completed: 2026-02-25
> Status: Reference document for implementation planning

## Overview

FinanSEAL integrates with LHDN MyInvois as an **intermediary** — submitting e-invoices on behalf of multiple tenant businesses using a single platform credential + digital certificate.

---

## 1. Registration & Approval

**No formal approval process required.** The MyInvois system is open integration:

1. FinanSEAL (Groot) registers on MyInvois Portal → self-provisions Client ID / Client Secret
2. Purchase one digital certificate from a MCMC-licensed Malaysian CA (~RM 200-500/year)
3. Each tenant business grants FinanSEAL intermediary permission on MyInvois Portal

### 5 Licensed Certificate Authorities (MCMC)

| CA | Website |
|----|---------|
| Pos Digicert Sdn Bhd | posdigicert.com.my |
| MSC Trustgate.Com Sdn Bhd | msctrustgate.com |
| Raffcomm Technologies Sdn Bhd | rafftech.my |
| TM Technology Services Sdn Bhd | tmca.com.my |
| Vista Kencana Sdn Bhd | vistakencana.com.my |

Certificate requirements: CN (org name), C=MY, OID 2.5.4.97 (TIN), OID 2.5.4.5 (BRN), SHA-256, RSA, Key Usage "Non-Repudiation", Enhanced Key Usage "Document Signing".

**Recurring cost**: ~RM 200-500/year for the certificate. This is the only infrastructure cost.

---

## 2. Two Integration Models

### Model A: Direct Integration (Taxpayer Login)
- Business uses their OWN Client ID/Secret
- No `onbehalfof` header needed
- Token scoped to that business

### Model B: Intermediary (FinanSEAL's model)
- FinanSEAL uses ONE Client ID/Secret for all tenants
- `onbehalfof: {tenant_TIN}` header on each API call
- One digital certificate covers all tenants
- Each tenant must authorize FinanSEAL on MyInvois Portal

### Hybrid Approach (Recommended — like SQL Accounting)

Store both:
- FinanSEAL platform credentials (for intermediary submission)
- Tenant's own Client ID (for retrieving ALL docs, not just ones FinanSEAL submitted)

Privacy restriction: Intermediary can only see docs it submitted. Tenant's own credentials see everything.

---

## 3. Customer Onboarding Flow

Each tenant business must:

1. **Register on MyInvois Portal** — mytax.hasil.gov.my → MyInvois → accept terms
2. **Register ERP & Get Credentials** — creates "ERP" entry → gets Client ID + Secret 1 + Secret 2
3. **Authorize FinanSEAL as Intermediary** — add intermediary with FinanSEAL's TIN/BRN, grant permissions (submit, cancel, reject, view)
4. **Configure in FinanSEAL** — enter TIN, BRN, MSIC code, SST registration in Business Settings

---

## 4. Three Distinct E-Invoice Flows

### Flow 1: Sales Invoice Submission (Issuing to Customers)
- Document type: `01` Invoice, `02` Credit Note, `03` Debit Note
- FinanSEAL acts as intermediary → builds UBL doc → signs → submits to LHDN
- Uses: ERP registration, Client ID, digital certificate, `onbehalfof` header

### Flow 2: Expense Claim from E-Invoice Merchant (Receiving)
- Merchant (Shell, Grab, restaurants) submits e-invoice to LHDN
- Employee uploads receipt → platform detects QR code → requests e-invoice from merchant
- FinanSEAL pulls received e-invoices from LHDN API → auto-attaches to expense claims
- **Merchant submits to LHDN, not FinanSEAL**

### Flow 3: Self-Billed E-Invoice (Exempt Vendor Purchases)
- Document type: `11` Self-Billed Invoice
- When buying from exempt vendors (below RM1M), individuals, or foreign suppliers
- The buyer's company creates & submits e-invoice on behalf of seller
- Uses same intermediary pipeline as Flow 1

---

## 5. E-Invoice Submission Technical Flow

### Step 1: Prepare UBL 2.1 JSON document
### Step 2: Digital Signature (8-step LHDN workflow)
- Strip UBLExtensions & Signature → minify → SHA-256 hash → RSA-SHA256 sign → embed XAdES signature
### Step 3: Authenticate
- `POST /connect/token` with Client ID/Secret + `onbehalfof` header
- JWT valid 60 minutes — cache and reuse
### Step 4: Submit
- `POST /api/v1.0/documentsubmissions/`
- Batch: up to 100 docs, 5MB total, 300KB per doc
### Step 5: Poll for validation
- `GET /api/v1.0/documentsubmissions/{submissionUid}` every 3-5 seconds
- 8 validators: Structure, Core Fields, Signature, Taxpayer TIN, Referenced Docs, Codes, Duplicates, Currency
### Step 6: Store results
- Valid → `lhdnLongId` returned for QR code
- Invalid → validation errors returned
### Step 7: Generate QR code
- URL: `https://myinvois.hasil.gov.my/{longId}/share`
- Client-side generation, embed on PDF

---

## 6. Post-Submission Data (What to Store)

### On sales_invoices (already in schema):
- `lhdnSubmissionId` — 26-char submission UID
- `lhdnDocumentUuid` — 26-char document UUID
- `lhdnLongId` — for QR code generation
- `lhdnStatus` — pending → submitted → valid/invalid → cancelled
- `lhdnSubmittedAt`, `lhdnValidatedAt` — timestamps
- `lhdnValidationErrors` — [{code, message, target?}]
- `lhdnDocumentHash` — SHA256 hash

### On expense_claims (NOT YET in schema — needs adding):
- For Flow 2 (merchant-issued): `lhdnReceivedDocumentUuid`, `lhdnReceivedLongId`, `einvoiceAttached`
- For Flow 3 (self-billed): same fields as sales_invoices

---

## 7. Two Different QR Codes

| QR Code | What It Is | Where It Appears |
|---------|-----------|-----------------|
| Merchant's buyer-info QR | Link to merchant's form to collect buyer TIN/company info | On paper receipt at POS |
| LHDN validation QR | `https://myinvois.hasil.gov.my/{longId}/share` — public verification | On validated e-invoice |

---

## 8. Expense Claims: AI Browser Agent for Merchant Forms

### Problem
Each merchant POS vendor has a different buyer-info form. Building per-merchant adapters is unsustainable.

### Solution: Stagehand + Browserbase + Gemini

**Decision**: Use Stagehand (TypeScript AI browser SDK) + Browserbase (cloud browser) + Gemini Flash (LLM reasoning).

**Why Stagehand over Browser-Use**: TypeScript-native (matches our stack), deploys alongside Next.js, shares types/utils.

**Why Browserbase over self-hosted**: Zero infra, stealth browser (anti-bot), free tier sufficient for early stage.

### Optimized Expense Claim Flow
1. Employee creates expense claim → uploads receipt photo
2. OCR extracts vendor, amount, date (existing)
3. QR detection extracts merchant form URL from receipt image (new)
4. AI browser agent visits merchant URL → auto-fills company info from Business Settings → submits
5. FinanSEAL polls LHDN received docs API → matches to expense claim → auto-attaches e-invoice
6. (Optional) Platform emails copy of e-invoice to business user

### Browserbase Tier Plan
- **Now (development)**: Free tier — 1 concurrent browser, 1 hr/mo
- **First users**: Free tier still sufficient (~30-60 form fills/mo)
- **Growth**: Developer plan $20/mo — 100 hrs/mo (~3000 form fills)

### Note on timing
Merchant e-invoice issuance is async — some merchants take hours or days to issue. User won't perceive platform delay.

---

## 9. API Reference

### Environments

| Environment | API Base URL |
|-------------|-------------|
| Sandbox | `https://preprod-api.myinvois.hasil.gov.my` |
| Production | `https://api.myinvois.hasil.gov.my` |

### Key Endpoints

| API | Method | Path | Rate Limit |
|-----|--------|------|------------|
| Get Token | POST | `/connect/token` | 12 RPM |
| Validate TIN | GET | `/api/v1.0/taxpayer/validate/{tin}` | 60 RPM |
| Submit Documents | POST | `/api/v1.0/documentsubmissions/` | 100 RPM |
| Get Submission Status | GET | `/api/v1.0/documentsubmissions/{uid}` | 300 RPM |
| Get Recent Received | GET | `/api/v1.0/documents/recent?InvoiceDirection=Received` | 60 RPM |
| Search Documents | GET | `/api/v1.0/documents/search` | 60 RPM |
| Get Document | GET | `/api/v1.0/documents/{uuid}/raw` | 60 RPM |
| Cancel Document | PUT | `/api/v1.0/documents/state/{uuid}/state` | 12 RPM |
| Reject Document | PUT | `/api/v1.0/documents/state/{uuid}/state` | 12 RPM |
| Taxpayer QR Info | GET | `/api/v1.0/taxpayers/qrcodeinfo/{qrCodeText}` | 60 RPM |

---

## 10. Mandate Timeline (as of Feb 2026)

| Revenue Threshold | Mandatory Date | Status |
|-------------------|---------------|--------|
| Above RM100M | 1 Aug 2024 | Active |
| RM25-100M | 1 Jan 2025 | Active |
| RM5-25M | 1 Jul 2025 | Active |
| RM1-5M | 1 Jan 2026 | Active |
| Below RM1M | Exempted | — |

---

## 11. Existing Codebase Status

### Built:
- Schema fields for LHDN on `sales_invoices` and `businesses` and `customers`
- Business profile settings UI (TIN, BRN, MSIC, SST, LHDN Client ID)
- Digital signature Lambda infrastructure (AWS CDK)
- SSM credential storage for certificates
- LHDN status constants
- LHDN submit button placeholder (Coming Soon)
- MSIC codes database (32KB)
- Malaysian state codes, country codes

### Not Built:
- UBL 2.1 JSON document generator
- LHDN API client (OAuth, submission, polling)
- LHDN submission UI (beyond placeholder)
- QR code generation (from longId)
- Expense claims e-invoice fields in schema
- Self-billed e-invoice generation
- QR detection from receipt images
- AI browser agent for merchant form filling
- LHDN received documents polling & matching
