# Issue #75: Malaysia e-Invoice (LHDN MyInvois Integration)

**GitHub URL:** https://github.com/grootdev-ai/finanseal-mvp/issues/75
**Priority:** P1 - Market Entry
**WINNING Score:** 47/60
**Created:** 2025-12-27

## Summary
Integrate with LHDN MyInvois API for mandatory e-Invoice submission in Malaysia. **Market entry requirement** - SQL Accounting has 320K Malaysian users largely because of this capability.

## Scope
- [ ] LHDN MyInvois API integration
- [ ] e-Invoice generation from accounting entries
- [ ] Validation rules (TIN, BRN, addresses)
- [ ] Submission to LHDN
- [ ] Status tracking (pending, validated, rejected)
- [ ] Error handling and resubmission
- [ ] PDF generation with QR code

## WINNING Analysis

| Factor | Score | Rationale |
|--------|-------|-----------|
| Worth | 8/10 | Mandatory for MY businesses |
| Impact | 8/10 | Market entry requirement |
| Now | 8/10 | Regulation deadline approaching |
| Necessary | 8/10 | MY market expansion |
| Implementable | 5/10 | Government API integration |
| Notable | 8/10 | Compliance moat |

## Technical Requirements
- LHDN API authentication (OAuth 2.0)
- XML/JSON invoice format per LHDN spec
- Digital signature requirements
- Sandbox and production environments

## Regulatory Timeline
- Aug 2024: Companies with revenue >RM100M
- Jan 2025: Companies with revenue >RM25M
- Jul 2025: All businesses

## Competitor Evidence
| Competitor | e-Invoice (MY) |
|------------|----------------|
| SQL Accounting | ✅ Full support (320K users) |
| Xero | ❌ Not available |
| QuickBooks | ❌ Not available |
| Zoho | ❌ Not available |

**This is a significant opportunity to capture Malaysian market share from SQL Accounting with modern UX + e-Invoice compliance.**
