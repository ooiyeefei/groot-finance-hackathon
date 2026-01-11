# Issue #128: Agentic Lambda Skeleton + Shared Rule Engine (A2)

**GitHub URL:** https://github.com/grootdev-ai/finanseal-mvp/issues/128
**Priority:** P1
**WINNING Score:** 45/60
**Status:** Open
**Created:** 2026-01-10

## Summary

Create shared infrastructure for agentic Lambdas with common patterns for rule evaluation, result storage, and manager notifications.

## Scope

- [ ] Create `src/lambda/expense-analyzer/` skeleton
- [ ] Shared rule engine interface (`RuleEvaluator`, `RuleResult`)
- [ ] Convex mutations for storing analysis results (`expense_claim_flags` table)
- [ ] Notification dispatcher (in-app + email)
- [ ] CDK stack for agentic Lambda

## New Convex Table: expense_claim_flags

```typescript
{
  expense_claim_id: Id<"expense_claims">,
  flag_type: "duplicate" | "policy_violation" | "limit_exceeded" | "anomaly",
  severity: "info" | "warning" | "critical",
  rule_id: string,
  message: string,
  details: object,
  auto_resolved: boolean,
  reviewed_by: Id<"users"> | null,
  reviewed_at: number | null,
  created_at: number
}
```

## Rule Engine Interface

```python
class RuleEvaluator:
    def evaluate(self, document: DocumentContext) -> RuleResult:
        pass

class RuleResult:
    flag_type: str
    severity: str
    message: str
    details: dict
    confidence: float
```

## Dependencies

- A1: EventBridge Integration (#127)

## Blocks

- A3: Duplicate Detection
- A4: Policy Engine
- A5: Spend Limits
- A6: Anomaly Detection

---
*Source: `.pm/gaps/2026-01-10-agentic-processing-roadmap.md`*
