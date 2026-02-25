# LHDN e-Invoice Setup & Onboarding Guide

> Last updated: 2026-02-25
> Status: Operational reference for platform setup and tenant onboarding

---

## Table of Contents

1. [Platform Setup (One-Time)](#1-platform-setup-one-time)
2. [Digital Certificate Procurement](#2-digital-certificate-procurement)
3. [Intermediary Registration on MyInvois Portal](#3-intermediary-registration-on-myinvois-portal)
4. [Per-Tenant Onboarding](#4-per-tenant-onboarding)
5. [Authentication Architecture (Hybrid Model)](#5-authentication-architecture-hybrid-model)
6. [Environment Configuration](#6-environment-configuration)
7. [Sandbox Testing with Self-Signed Certificate](#7-sandbox-testing-with-self-signed-certificate)
8. [Go-Live Checklist](#8-go-live-checklist)

---

## 1. Platform Setup (One-Time)

Groot Finance operates as an **intermediary** — submitting e-invoices on behalf of tenant businesses using a single platform credential + digital certificate. This requires three one-time setup steps:

| Step | What | Where | Cost |
|------|------|-------|------|
| 1 | Digital certificate | MCMC-licensed CA | ~RM 200-500/year |
| 2 | Intermediary registration | LHDN MyInvois Portal | Free |
| 3 | Environment variables | Vercel + AWS SSM | — |

---

## 2. Digital Certificate Procurement

### What It Is

A digital certificate is a file (`.pem` or `.pfx`) that the signing Lambda uses to cryptographically sign e-invoice documents before submitting to LHDN. Think of it like a company stamp — LHDN verifies the signature came from a legitimate Certificate Authority.

### Cost & Timeline

| Item | Details |
|------|---------|
| **Cost** | ~RM 200-500/year |
| **Timeline** | Typically 1-3 business days after purchase |
| **Validity** | 1-3 years (renewable) |
| **Covers** | All tenants — one cert for the entire platform |

### MCMC-Licensed Certificate Authorities

Only these 5 CAs are authorized by MCMC to issue LHDN-compatible certificates:

| CA | Website | Notes |
|----|---------|-------|
| **Pos Digicert Sdn Bhd** | posdigicert.com.my | Most common for LHDN e-invoicing. Recommended starting point. |
| **MSC Trustgate.Com Sdn Bhd** | msctrustgate.com | Large enterprise focus |
| **Raffcomm Technologies Sdn Bhd** | rafftech.my | |
| **TM Technology Services Sdn Bhd** | tmca.com.my | |
| **Vista Kencana Sdn Bhd** | vistakencana.com.my | |

### What to Request

When purchasing, ask for an **e-Invoice document signing certificate** with these attributes:

| Attribute | Value |
|-----------|-------|
| CN (Common Name) | Groot Finance Sdn Bhd (or your registered company name) |
| C (Country) | MY |
| OID 2.5.4.97 | Company TIN |
| OID 2.5.4.5 | Company BRN |
| Algorithm | RSA-2048 or higher, SHA-256 |
| Key Usage | Non-Repudiation |
| Enhanced Key Usage | Document Signing |

### After Purchase — Store in AWS SSM

You'll receive either a `.pfx` bundle or separate `.pem` files.

**If you receive a `.pfx` file**, extract the key and certificate first:

```bash
# Extract private key
openssl pkcs12 -in cert.pfx -out key.pem -nocerts -nodes

# Extract certificate
openssl pkcs12 -in cert.pfx -out cert.pem -clcerts -nokeys
```

**Store in AWS SSM Parameter Store** (the signing Lambda reads from these paths automatically):

```bash
# Store private key
aws ssm put-parameter \
  --name "/finanseal/production/digital-signature/private-key" \
  --type SecureString \
  --value "$(cat key.pem)" \
  --profile groot-finanseal --region us-west-2

# Store certificate
aws ssm put-parameter \
  --name "/finanseal/production/digital-signature/certificate" \
  --type SecureString \
  --value "$(cat cert.pem)" \
  --profile groot-finanseal --region us-west-2
```

No code changes needed — the Lambda (`finanseal-digital-signature:prod`) already reads from these SSM paths.

### Certificate Renewal

The signing Lambda has CloudWatch alarms that trigger 30 days before certificate expiry. When renewing:

1. Purchase renewed certificate from the same CA
2. Re-run the `aws ssm put-parameter` commands above (with `--overwrite` flag)
3. The Lambda picks up the new cert on next cold start

---

## 3. Intermediary Registration on MyInvois Portal

### Steps

1. Go to **MyInvois Portal** (preprod for sandbox, production for live)
   - Sandbox: `https://preprod-myinvois.hasil.gov.my`
   - Production: `https://myinvois.hasil.gov.my`

2. Log in with Groot Finance's company TIN

3. Navigate to **"Register ERP System"** (or "Register Intermediary")

4. Self-provision a **Client ID** and **Client Secret**

5. Store these in Vercel environment variables:
   ```
   LHDN_CLIENT_ID=<platform Client ID>
   LHDN_CLIENT_SECRET=<platform Client Secret>
   ```

### Important Notes

- Registration is self-service — no approval process required
- Separate credentials are needed for sandbox and production environments
- The Client ID/Secret are **platform-level** (Groot Finance's own), not per-tenant
- Rate limits apply: 12 RPM for token requests, 100 RPM for submissions

---

## 4. Per-Tenant Onboarding

When a tenant business wants to use LHDN e-invoicing through Groot Finance, they need to complete two steps:

### Step A: Authorize Groot Finance as Intermediary (on MyInvois Portal)

The tenant business must log in to the MyInvois Portal and authorize Groot Finance to act on their behalf:

1. Tenant logs in to **MyInvois Portal** with their own TIN
2. Navigate to **"Manage Intermediaries"** (or similar)
3. Search for Groot Finance's TIN and grant intermediary permission
4. This allows Groot Finance to submit and manage e-invoices on their behalf

**This is a one-time action per tenant.**

### Step B: Configure Business Settings (in Groot Finance app)

The tenant fills in their compliance details in **Settings → Business → e-Invoice Settings**:

| Field | Required | Example | Purpose |
|-------|----------|---------|---------|
| **LHDN TIN** | Yes | C21638015020 | Tax Identification Number — identifies the taxpayer |
| **Business Registration Number (BRN)** | Yes | 202001234567 | Company registration with SSM |
| **SST Registration Number** | If applicable | B10-1234-56789012 | Sales & Services Tax registration |
| **MSIC Code** | Yes | 62021 | Business activity code (searchable in the app) |
| **Business Address** | Yes | Full structured address | Required on all e-invoices |
| **State** | Yes | Selangor (SGR) | Malaysian state code |
| **Contact Email** | Yes | billing@company.com | Appears on e-invoices |
| **Phone Number** | Recommended | +60 12-345 6789 | Appears on e-invoices |

### For Self-Billed E-Invoices (Exempt Vendors)

If the tenant purchases from vendors who are exempt from e-invoicing (small vendors below RM1M, individuals, foreign suppliers), they also need to:

1. **Flag exempt vendors**: In Invoices → Account Payables → Vendors → Edit → check "LHDN Exempt Vendor"
2. **Optionally enable auto-generation**: In Settings → Business → "Auto-generate self-billed e-invoices for exempt vendors"

### Tenant Onboarding Checklist

```
□ Tenant authorized Groot Finance as intermediary on MyInvois Portal
□ LHDN TIN entered in Business Settings
□ BRN entered in Business Settings
□ MSIC Code selected in Business Settings
□ Full business address filled in (including state + postal code)
□ SST Registration Number (if registered for SST)
□ Contact email configured
□ (Optional) Exempt vendors flagged for self-billing
```

---

## 5. Authentication Architecture

### The Simple Version

There are only **two things** that matter:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   GROOT FINANCE (the platform) has:                                 │
│   ├── 1 Client ID + 1 Client Secret  (from MyInvois Portal)        │
│   ├── 1 Digital Certificate           (from MCMC-licensed CA)       │
│   └── These cover ALL tenants. Not per-tenant. ONE set.             │
│                                                                     │
│   EACH TENANT BUSINESS just needs to:                               │
│   ├── Authorize Groot Finance on MyInvois Portal (one-time click)   │
│   └── Fill in their TIN + BRN in Business Settings                  │
│                                                                     │
│   That's it. Tenant never touches API secrets or certificates.      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### How Submission Works

```
Tenant clicks "Submit to LHDN" in Groot Finance
    ↓
Groot Finance authenticates with its OWN Client ID/Secret
    + passes header: onbehalfof: {tenant's TIN}
    ↓
Groot Finance signs the document with its OWN digital certificate
    ↓
Groot Finance submits to LHDN API on behalf of tenant
    ↓
LHDN validates and returns result → shown to tenant in app
```

**Key point**: Groot Finance's one set of credentials works for all tenants. Each tenant just grants permission.

### Why This Is the Right Approach

| Benefit | Explanation |
|---------|-------------|
| **Security** | Tenants never handle API secrets or signing certificates |
| **Simplicity** | Tenants just authorize on MyInvois Portal — no credential management |
| **Cost** | One digital certificate (~RM200-500/year) for entire platform, not per-tenant |
| **Reliability** | Centralized pipeline with monitoring, retry logic, rate limiting |

### What About "Direct" Mode / Tenant's Own Client ID?

LHDN also allows businesses to register their own "ERP system" and get their own Client ID/Secret for direct API access. This is how standalone accounting software (like SQL Accounting desktop) works.

**For Groot Finance, this is NOT needed and NOT the default.** Here's why:

| Approach | What It Does | Who Needs It | Groot Finance? |
|----------|-------------|-------------|---------------|
| **Intermediary** (our approach) | Platform submits on behalf of tenants using ONE credential | SaaS platforms | **Yes — this is what we use** |
| **Direct** (tenant registers own ERP) | Each tenant has own credentials, manages own submissions | Standalone desktop accounting software | **No — nice-to-have only** |

The **only** scenario where a tenant's own Client ID adds value is if the tenant uses **multiple** accounting systems and wants to see ALL their e-invoices (from all sources) in one place. Groot Finance is not a full accounting ledger — we submit invoices, not aggregate records from other systems. So this is purely optional and future.

The `lhdnClientId` field in Business Settings exists for this future read-only access. It is **not required** for e-invoice submission.

### Common Confusion: Personal Taxpayer vs. Intermediary Credentials

**These are NOT the same thing:**

| Registration | Portal Section | What You Get | Use Case |
|-------------|---------------|-------------|----------|
| **Personal taxpayer** registers "my ERP" | "Register ERP System" | Client ID/Secret scoped to YOUR TIN only | Direct mode — submit only for yourself |
| **Groot Finance** registers as intermediary | "Register Intermediary" | Client ID/Secret that works with `onbehalfof` for ANY authorized tenant | Intermediary mode — submit for all tenants |

**For sandbox testing**: Register Groot Finance (or SuperScrat, whichever entity runs the platform) as an **intermediary** on the MyInvois sandbox portal. Do NOT use personal taxpayer credentials — they won't work with the `onbehalfof` header that our code uses.

Sandbox portal: `https://preprod-myinvois.hasil.gov.my`

---

## 6. Environment Configuration

### Vercel Environment Variables

| Variable | Value | Required |
|----------|-------|----------|
| `LHDN_CLIENT_ID` | Platform Client ID from MyInvois Portal | Yes |
| `LHDN_CLIENT_SECRET` | Platform Client Secret from MyInvois Portal | Yes |
| `LHDN_API_URL` | `https://preprod-api.myinvois.hasil.gov.my` (sandbox) or `https://api.myinvois.hasil.gov.my` (production) | Yes |
| `LHDN_ENVIRONMENT` | `sandbox` or `production` | Yes |
| `LHDN_AUTH_MODE` | `intermediary` (default, production) or `direct` (dev testing only) | No |
| `DIGITAL_SIGNATURE_LAMBDA_ARN` | `finanseal-digital-signature:prod` | Yes |

### AWS SSM Parameters

| Parameter Path | Type | Status | Purpose |
|---------------|------|--------|---------|
| `/finanseal/sandbox/digital-signature/private-key` | SecureString | **Stored** (self-signed) | RSA private key for sandbox testing |
| `/finanseal/sandbox/digital-signature/certificate` | SecureString | **Stored** (self-signed) | X.509 self-signed cert for sandbox testing |
| `/finanseal/production/digital-signature/private-key` | SecureString | Not yet | RSA private key from MCMC CA cert |
| `/finanseal/production/digital-signature/certificate` | SecureString | Not yet | X.509 certificate from MCMC-licensed CA |

The signing Lambda reads from `/finanseal/${LHDN_ENVIRONMENT}/digital-signature/*`. When `LHDN_ENVIRONMENT=sandbox`, it uses the sandbox params. When `production`, it uses production params.

---

## 7. Sandbox Testing with Self-Signed Certificate

LHDN sandbox accepts self-signed certificates, allowing full E2E pipeline testing without purchasing from a CA.

### Generate Self-Signed Certificate

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem \
  -days 365 -nodes \
  -subj "/CN=Groot Finance/C=MY"
```

### Store in AWS SSM (Sandbox)

```bash
aws ssm put-parameter \
  --name "/finanseal/sandbox/digital-signature/private-key" \
  --type SecureString \
  --value "$(cat key.pem)" \
  --profile groot-finanseal --region us-west-2

aws ssm put-parameter \
  --name "/finanseal/sandbox/digital-signature/certificate" \
  --type SecureString \
  --value "$(cat cert.pem)" \
  --profile groot-finanseal --region us-west-2
```

### Sandbox Environment Variables

```
LHDN_API_URL=https://preprod-api.myinvois.hasil.gov.my
LHDN_ENVIRONMENT=sandbox
```

---

## 8. Go-Live Checklist

### Platform (One-Time)

```
□ Digital certificate purchased from MCMC-licensed CA (recommend Pos Digicert)
□ Certificate + private key stored in AWS SSM (production paths)
□ Groot Finance registered as intermediary on MyInvois Portal (production)
□ Platform Client ID + Secret stored in Vercel env
□ LHDN_API_URL set to https://api.myinvois.hasil.gov.my
□ LHDN_ENVIRONMENT set to production
□ Lambda signing tested with production certificate
```

### Per-Tenant

```
□ Tenant authorized Groot Finance as intermediary on MyInvois Portal
□ Tenant compliance fields filled in Business Settings (TIN, BRN, MSIC, address)
□ Test submission in sandbox environment
□ Switch to production
```
