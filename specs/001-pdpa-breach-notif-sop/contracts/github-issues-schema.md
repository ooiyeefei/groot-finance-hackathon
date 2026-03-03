# Contract: GitHub Issues Incident Register

**Feature Branch**: `001-pdpa-breach-notif-sop`
**Date**: 2026-03-03

> Since this feature produces a documentation deliverable (not API endpoints), the "contract" defines the GitHub Issues schema used for the incident register. This schema ensures consistent incident logging that satisfies SG PDPA Section 26E record-keeping requirements.

## Issue Template File

**Path**: `.github/ISSUE_TEMPLATE/breach-incident.yml`

This YAML-based issue template will be created in the repository to standardize incident logging.

```yaml
name: Breach Incident Report
description: Log a security incident or suspected data breach (PDPA compliance)
title: "[BREACH] "
labels: ["type:breach-incident"]
body:
  - type: markdown
    attributes:
      value: |
        ## PDPA Breach Incident Report
        Complete all fields. This form satisfies SG PDPA Section 26E record-keeping requirements.
        **Do not delete or skip sections** — all fields must be documented for regulatory compliance.

  - type: input
    id: detection-date
    attributes:
      label: Date/time detected
      placeholder: "YYYY-MM-DD HH:MM (UTC+8)"
    validations:
      required: true

  - type: dropdown
    id: detection-method
    attributes:
      label: How detected
      options:
        - CloudWatch Alarm
        - Sentry Alert
        - Clerk Suspicious Activity
        - AWS GuardDuty
        - User Report (admin@hellogroot.com)
        - Internal Audit
        - Third-party Notification
        - Other
    validations:
      required: true

  - type: input
    id: detected-by
    attributes:
      label: Detected by
      placeholder: "Name or system"
    validations:
      required: true

  - type: dropdown
    id: severity
    attributes:
      label: Severity Classification
      options:
        - P1 Critical — Personal data exposed/exfiltrated
        - P2 High — Unauthorized access detected
        - P3 Medium — Near-miss, anomalous pattern
        - P4 Low — Minor vulnerability, no exposure
    validations:
      required: true

  - type: textarea
    id: severity-rationale
    attributes:
      label: Severity rationale
      placeholder: "Explain why this severity level was chosen"
    validations:
      required: true

  - type: dropdown
    id: is-data-breach
    attributes:
      label: Data breach per legal definition?
      description: "Unauthorised access/collection/use/disclosure/modification/disposal of personal data, or loss of storage medium where unauthorised access is likely"
      options:
        - "Yes"
        - "No"
        - Under investigation
    validations:
      required: true

  - type: checkboxes
    id: prescribed-data
    attributes:
      label: SG prescribed personal data categories involved
      options:
        - label: "#1 Non-public financial information"
        - label: "#2 Vulnerable individual identification data"
        - label: "#3 Life/accident/health insurance information"
        - label: "#4 Medical information (HIV/STD/mental health)"
        - label: "#5 Adoption records"
        - label: "#6 Private cryptographic keys"
        - label: "#7 Account access credentials (username + password)"
        - label: None of the above

  - type: input
    id: individuals-affected
    attributes:
      label: Estimated individuals affected
      placeholder: "Number or 'Under investigation'"
    validations:
      required: true

  - type: dropdown
    id: jurisdiction
    attributes:
      label: Jurisdictions affected
      options:
        - Malaysia only
        - Singapore only
        - Both (MY + SG)
        - Unknown (assume both)
    validations:
      required: true

  - type: input
    id: assessment-date
    attributes:
      label: Assessment completion date
      placeholder: "YYYY-MM-DD or 'In progress'"
    validations:
      required: true

  - type: textarea
    id: notification-decisions
    attributes:
      label: Notification decisions
      description: "Document whether regulator, individual, and/or customer notification is required, and why"
      placeholder: |
        - Regulator notification required?: Yes (MY) / Yes (SG) / Yes (both) / No
        - Rationale:
        - Individual notification required?: Yes / No
        - Customer notification required?: Yes (intermediary) / No / N/A
    validations:
      required: true

  - type: textarea
    id: data-affected
    attributes:
      label: Data affected
      description: "Categories of personal data involved"
    validations:
      required: true

  - type: textarea
    id: containment
    attributes:
      label: Containment actions
    validations:
      required: true

  - type: textarea
    id: remedial
    attributes:
      label: Remedial actions
      description: "Corrective measures taken or planned"
    validations:
      required: true

  - type: textarea
    id: evidence
    attributes:
      label: Evidence preserved
      description: "Links to logs, screenshots, exports"
    validations:
      required: true

  - type: textarea
    id: post-incident
    attributes:
      label: Post-incident review
      description: "Link to review document when complete, or 'Pending'"
      placeholder: "Pending"
    validations:
      required: false
```

## Label Definitions

These labels should be created in the `grootdev-ai/groot-finance` repository.

| Label | Color | Description | Auto-apply |
|-------|-------|-------------|------------|
| `type:breach-incident` | `#000000` | Breach incident report | Template default |
| `breach:P1-critical` | `#d73a49` | Personal data exposed/exfiltrated | Manual |
| `breach:P2-high` | `#e36209` | Unauthorized access detected | Manual |
| `breach:P3-medium` | `#fbca04` | Near-miss, anomalous access | Manual |
| `breach:P4-low` | `#0e8a16` | Minor vulnerability, no exposure | Manual |
| `jurisdiction:MY` | `#1d76db` | Malaysia data subjects affected | Manual |
| `jurisdiction:SG` | `#5319e7` | Singapore data subjects affected | Manual |
| `jurisdiction:both` | `#006b75` | Both jurisdictions affected | Manual |
| `status:assessing` | `#bfdadc` | Breach assessment in progress | Manual |
| `status:investigating` | `#c5def5` | Active investigation | Manual |
| `status:contained` | `#bfd4f2` | Breach contained | Manual |
| `status:resolved` | `#0e8a16` | Fully resolved | Manual |
| `status:false-alarm` | `#e4e669` | Determined non-breach | Manual |
| `notified:regulator` | `#d93f0b` | Regulatory notification sent | Manual |
| `notified:individuals` | `#d93f0b` | Affected individuals notified | Manual |
| `notified:customer` | `#d93f0b` | SME customer notified | Manual |

## Compliance Mapping

| SG Section 26E Requirement | GitHub Issues Field |
|---------------------------|---------------------|
| Facts of the breach | Issue body (all fields) |
| Assessment findings | `is-data-breach`, `prescribed-data`, `individuals-affected`, `jurisdiction` |
| Actions taken | `containment`, `remedial`, `notification-decisions` |
| Producible to PDPC on request | Export via GitHub API or `gh issue list --label type:breach-incident` |
