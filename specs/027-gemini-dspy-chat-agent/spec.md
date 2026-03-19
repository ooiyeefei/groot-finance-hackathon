# Feature Specification: Gemini Migration + DSPy Self-Improving Chat Agent

**Feature Branch**: `027-gemini-dspy-chat-agent`
**Created**: 2026-03-19
**Status**: Draft
**Input**: Replace Qwen3-8B (Modal) with Gemini 3.1 Flash-Lite for the entire chat agent. Keep LangGraph as orchestrator, integrate 5 new DSPy self-improving modules inside LangGraph nodes. Add correction collection and wire into existing optimization pipeline.

## Clarifications

### Session 2026-03-19

- Q: Are trained DSPy models scoped per-business or global (shared across all businesses)? → A: Global shared — one model trained on pooled corrections from all businesses for faster learning. Business-specific patterns are captured via DSPy's few-shot examples without full model isolation.
- Q: Should migrating existing dspy.Assert (deprecated in DSPy 3.x) to dspy.Refine be included in this feature? → A: No — separate branch. New chat DSPy modules MUST use dspy.Refine (not Assert) since they're built fresh on DSPy 3.x. Existing modules (fee, bank recon, PO, AR, vendor, e-invoice) will be migrated in a dedicated branch.
- Q: Should the Response Quality module (MultiChainComparison) run on every query or selectively? → A: Selective — only data-heavy or multi-tool queries trigger multi-candidate comparison. Simple factual lookups use single-pass output to stay within the 6-second latency budget.
- Q: How is model degradation detected for rollback? → A: Automatic — the optimization pipeline compares new model accuracy against the previous model on a held-out validation set. If the new model scores worse, it is rejected and the previous model remains active. No manual intervention required.
- Q: How do users provide corrections for misclassified queries? → A: Structured dropdown — thumbs down on a response → pick correction type (wrong intent, wrong tool, wrong parameters) → pick correct value from predefined list. Produces clean labeled training pairs for DSPy optimization.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Instant Chat Responses (Priority: P1)

As a business user, I ask the chat assistant a financial question (e.g., "What's my revenue this month?") and receive an accurate answer within seconds, not minutes. The assistant responds immediately regardless of how long it's been since my last message.

**Why this priority**: The current 10-65 second cold start on Modal makes the chat unusable for real-time conversations. Users abandon the chat before receiving answers. Eliminating cold start is the single biggest user experience improvement.

**Independent Test**: Send a financial query after 30+ minutes of chat inactivity (cold start scenario). The response should arrive within 6 seconds with correct data.

**Acceptance Scenarios**:

1. **Given** a user has not used chat in 30+ minutes, **When** they ask "What are my outstanding invoices?", **Then** the response arrives within 6 seconds with correct invoice data from their business.
2. **Given** a user asks "Show me revenue this month", **When** the system processes the query, **Then** the intent is classified as requesting the user's own business data and the correct data retrieval tool is invoked.
3. **Given** multiple users are chatting concurrently, **When** each sends a query, **Then** each receives a response within 6 seconds regardless of other users' activity.

---

### User Story 2 - Accurate Intent Classification (Priority: P1)

As a business user, when I ask about my invoices, revenue, cash flow, expenses, or vendors, the system correctly recognizes I'm asking about my own business data (not general accounting knowledge) and retrieves the relevant information.

**Why this priority**: The current intent classifier misclassifies financial queries as "general_knowledge" instead of "personal_data", causing the system to answer with generic accounting definitions instead of querying the user's actual data. This is the most common user complaint.

**Independent Test**: Send 20 common financial queries (invoices, revenue, aging, vendor payments) and verify each is classified as requesting the user's own data with the correct tool invoked.

**Acceptance Scenarios**:

1. **Given** a user asks "How much do I owe my vendors?", **When** the intent classifier processes this, **Then** it classifies the query as requesting the user's own business data and selects the AP aging tool.
2. **Given** a user asks "What is accounts receivable?", **When** the intent classifier processes this, **Then** it classifies as general knowledge and provides a definition without querying business data.
3. **Given** a user asks an ambiguous question like "invoices", **When** the system lacks context, **Then** it asks a targeted clarification question (e.g., "Are you looking for your outstanding invoices, or do you want to understand invoice processing?").

---

### User Story 3 - Self-Improving Accuracy from Corrections (Priority: P2)

As a power user, when the chat assistant misclassifies my query or selects the wrong tool, I can correct it. These corrections are collected and used to train the system, making it smarter for all users of my business over time.

**Why this priority**: Static classification rules break as users develop new query patterns. A self-improving system compounds in accuracy, reducing support burden and building a competitive moat.

**Independent Test**: Submit 5 corrections for intent misclassification, trigger the optimization pipeline, then verify the same queries are now classified correctly.

**Acceptance Scenarios**:

1. **Given** the assistant misclassifies "Show me overdue payments" as general knowledge, **When** the user provides a correction ("This should show my AP aging data"), **Then** the correction is stored with the original query, wrong classification, and correct classification.
2. **Given** 100+ corrections have been collected for a business, **When** the weekly optimization pipeline runs, **Then** the classification modules are retrained and deployed with improved accuracy.
3. **Given** optimized modules are deployed, **When** a user sends a query that was previously misclassified, **Then** it is now classified correctly based on the learned patterns.

---

### User Story 4 - Correct Tool Selection and Parameter Extraction (Priority: P2)

As a business user, when I ask a question that requires data retrieval, the system selects the right tool with the right parameters on the first attempt.

**Why this priority**: Incorrect tool selection wastes time (retry loops), returns wrong data (confusing users), and burns API costs. Accurate first-attempt tool selection directly improves response quality and speed.

**Independent Test**: Send 15 queries spanning different tool categories (invoices, transactions, vendors, team expenses, regulatory knowledge) and verify the correct tool and parameters are selected on the first call.

**Acceptance Scenarios**:

1. **Given** a user asks "Show me invoices from last month", **When** the tool selector runs, **Then** it selects the invoice retrieval tool with a date range parameter covering the previous calendar month.
2. **Given** a manager asks "How much has Sarah spent on office supplies?", **When** the parameter extractor runs, **Then** it extracts employee name "Sarah", expense category "office supplies", and passes them to the employee expenses tool.
3. **Given** a user asks a question requiring no data lookup ("What is GST?"), **When** the tool selector runs, **Then** it correctly determines no tool is needed and generates a direct response.

---

### User Story 5 - High-Quality Response Generation (Priority: P3)

As a business user, the chat responses I receive are concise, relevant, well-formatted, and include the specific numbers from my business data. The assistant doesn't hallucinate data or provide vague answers when specific data is available.

**Why this priority**: Even with correct tool selection, poor response formatting or hallucinated numbers destroy user trust. Response quality is the final mile of the user experience.

**Independent Test**: Send 10 data-retrieval queries, verify each response includes actual numbers from the database (not fabricated), is formatted readably, and directly answers the question asked.

**Acceptance Scenarios**:

1. **Given** the tool returns 5 overdue invoices totaling RM 45,230, **When** the response is generated, **Then** it states the count and total clearly (not approximate or rounded) and lists key details.
2. **Given** the tool returns no results, **When** the response is generated, **Then** it clearly states no matching data was found and suggests alternative queries rather than fabricating data.
3. **Given** a complex query with multiple data points, **When** the response is generated, **Then** it presents data in a structured format (tables or bullet points) rather than a wall of text.

---

### Edge Cases

- What happens when the Gemini API is temporarily unavailable? The system should return a user-friendly error message without exposing internal error details.
- What happens when a user sends a query in a non-English language (Malay, Chinese)? The system should respond in the same language with correct financial terminology.
- What happens when correction volume is below the training threshold (< 100 corrections)? The optimization pipeline should skip training and log the reason, not fail.
- What happens when a user rapidly sends 10+ messages? The system should handle concurrent requests gracefully without mixing up responses.
- What happens during the optimization pipeline execution — are live queries affected? Training should not impact real-time chat performance.
- What happens when a newly-optimized model performs worse than the previous version? The system should support rollback to the last known-good model.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST replace Qwen3-8B (Modal) with Gemini 3.1 Flash-Lite as the language model for all chat agent LLM calls (intent classification, tool selection, response generation, guardrail classification).
- **FR-002**: System MUST retain the existing LangGraph graph structure (nodes, edges, routing, circuit breaker) as the orchestration framework.
- **FR-003**: System MUST integrate a DSPy Intent Classifier module into the intent analysis node, replacing the current LLM-based classification while preserving the Tier 1 deterministic regex fast-path.
- **FR-004**: System MUST integrate a DSPy Tool Selector module that selects the appropriate tool based on classified intent, user role (RBAC permissions), and available tools for that role.
- **FR-005**: System MUST integrate a DSPy Parameter Extractor module that extracts structured parameters (dates, names, categories, amounts) from user queries for the selected tool.
- **FR-006**: System MUST integrate a DSPy Response Quality module that evaluates response quality by comparing multiple candidate formulations and selecting the best one. This module runs selectively — only on data-heavy or multi-tool queries. Simple factual lookups use single-pass output to preserve the 6-second latency target.
- **FR-007**: System MUST integrate a DSPy Clarification Judge module that determines when a query is ambiguous and generates targeted clarification questions.
- **FR-008**: System MUST collect user corrections via a structured UI: thumbs-down button → correction type dropdown (intent misclassification, tool selection error, parameter extraction error) → correct value selection from a predefined list. This produces clean labeled pairs (wrong → correct) for DSPy training.
- **FR-009**: System MUST wire correction data into the existing weekly optimization pipeline using the same safeguards: minimum correction volume (100+ pooled across all businesses), minimum query diversity, and new-data-only gating. Corrections from all businesses are pooled into a single global training set.
- **FR-010**: System MUST support multiple optimization strategies (MIPROv2, BootstrapFewShot, SIMBA, KNNFewShot, BetterTogether) selectable per module type.
- **FR-011**: System MUST maintain the existing 3-tier RBAC enforcement during tool selection (Employee: 5 tools, Manager: 7 tools, Finance Admin/Owner: all 13 tools).
- **FR-012**: System MUST preserve multi-language support (English, Malay, Chinese) for query understanding and response generation.
- **FR-013**: System MUST handle model API failures gracefully with user-friendly error messages and automatic retry with backoff.
- **FR-014**: System MUST version trained model artifacts with automatic quality gating — the optimization pipeline compares new model accuracy against the previous model on a held-out validation set and rejects the new model if it scores worse. The previous model remains active without manual intervention.
- **FR-015**: All new DSPy chat modules MUST use `dspy.Refine` (not the deprecated `dspy.Assert`) for constraint enforcement, compatible with DSPy 3.x.

**Out of scope**: Migrating existing DSPy modules (fee classification, bank recon, PO matching, AR matching, vendor matching, e-invoice instruction guard) from `dspy.Assert` to `dspy.Refine` — this will be a separate branch.

### Key Entities

- **Chat Correction**: A record of a user correcting the system's behavior. Captures the original query, the system's incorrect output (classification, tool choice, or extracted parameters), the user's correction, and metadata (user, business, timestamp, correction type). Corrections are pooled globally across all businesses for training. Business ID is retained for audit but not used for model isolation.
- **DSPy Module Version**: A versioned artifact representing a trained DSPy module. Includes the module type (intent classifier, tool selector, parameter extractor, response quality, clarification judge), the optimizer used, training metrics (accuracy before/after), and a reference to the stored model weights. Supports rollback to previous versions.
- **Optimization Run**: A record of a training pipeline execution. Captures which modules were trained, how many corrections were consumed, the optimizer used, before/after accuracy metrics, and success/failure status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 95% of chat responses arrive within 6 seconds end-to-end, including after periods of inactivity (zero cold start penalty).
- **SC-002**: Intent classification accuracy for financial queries (revenue, invoices, cash flow, AP/AR, expenses) reaches 95%+, measured by correctly routing to user's own data vs general knowledge.
- **SC-003**: Correct tool is selected on the first attempt for 90%+ of queries, measured by user correction rate dropping below 10%.
- **SC-004**: First query after any idle period responds within the same time envelope (< 6 seconds) as subsequent queries.
- **SC-005**: After collecting 100+ corrections and running one optimization cycle, measurable accuracy improvement is observed on previously-misclassified query patterns.
- **SC-006**: All existing chat features (RBAC enforcement, multi-language support, topic guardrails, tool execution, conversation memory) continue to function identically after migration with zero feature regression.
- **SC-007**: Weekly optimization pipeline completes successfully for all new modules with the same reliability as the existing optimization jobs.

## Assumptions

- Gemini 3.1 Flash-Lite API is generally available and provides sufficient throughput for concurrent chat users without rate limiting issues at current scale.
- The existing DSPy optimization infrastructure (Lambda function, S3 model storage, weekly cron schedule) can be extended to handle additional module types without requiring separate infrastructure.
- The Tier 1 deterministic regex fast-path for intent classification will continue to handle 60-80% of financial queries, with DSPy only processing the remaining 20-40%.
- Correction collection uses a structured inline UI (thumbs-down → correction type dropdown → correct value picker) and does not require a dedicated design phase.
- The existing weekly cron schedule (Sundays, staggered hourly) has sufficient time slots for additional optimization jobs alongside the existing 4.
- Model artifacts can be stored in the existing S3 bucket with the same versioning pattern used for fee classification models.
