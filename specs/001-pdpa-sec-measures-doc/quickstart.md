# Quickstart: Security Measures Document Maintenance

**Feature**: 001-pdpa-sec-measures-doc
**Date**: 2026-03-03

## What This Is

`docs/compliance/security-measures.md` is a structured inventory of all security controls in the Groot Finance codebase. It serves two purposes:
1. **Compliance audits** — auditors verify PDPA adherence
2. **Customer questionnaires** — sales team extracts answers for enterprise security questionnaires

## How to Add a New Security Control

1. **Identify the domain** — which of the 8 sections does the control belong to?
   - Authentication & Identity
   - Authorization & Access Control
   - Encryption & Secure Storage
   - Infrastructure Security
   - Audit & Monitoring
   - Code Security & Headers
   - Data Protection & Privacy
   - Payment Security

2. **Add the control entry** using this format:
   ```markdown
   #### [Control Name]

   [Human-readable description — what it does and why. No code.]

   **Implementation**: `file/path.ts → SymbolName`
   **Status**: Implemented
   ```

3. **If it uses a third-party provider**, add the provider line:
   ```markdown
   **Provider**: [Name] ([Certification]) | [security page URL]
   ```

4. **Update the Version History** at the bottom of the document:
   ```markdown
   | YYYY-MM-DD | [Your Name] | Added [control name] to [domain] |
   ```

## How to Update an Existing Control

1. Find the control in the relevant domain section
2. Update the description, code reference, or status as needed
3. **Do NOT change the code reference format** — always use `file/path.ts → SymbolName` (no line numbers)
4. Update the Version History

## How to Mark a Control as Planned

If a control is not yet implemented but is on the roadmap:
1. Add it to the **Planned Controls** section at the bottom (not within a domain section)
2. Use `**Status**: Planned` instead of `Implemented`
3. Move it to the correct domain section once implemented

## When to Update

Update the document when any of these changes occur:
- New Lambda function with IAM policy added
- New CDK stack or resource created
- Authentication or authorization logic changed
- New audit event type added
- New third-party provider integrated
- Encryption or secret management approach changed
- Data deletion or anonymization logic changed

## Document Rules

- **Never share externally** — this document is for internal reference only
- **No line numbers** in code references — they go stale on every commit
- **Human-readable descriptions** — write for someone who doesn't read code
- **Code references required** — every control must point to its implementation
- **Keep it current** — an outdated security document is worse than no document
