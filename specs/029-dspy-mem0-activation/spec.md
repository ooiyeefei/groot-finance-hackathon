# Feature Specification: DSPy Self-Improvement Activation + Mem0 Persistent Memory

**Feature Branch**: `029-dspy-mem0-activation`
**Created**: 2026-03-19
**Status**: Draft
**Input**: User description: "Activate DSPy self-improvement loop (first training run) + Wire Mem0 persistent memory into chat agent"

## Context

Groot's competitive moat is a self-improving AI agent. Two critical subsystems have been fully coded but never activated:

1. **DSPy correction-to-training pipeline** -- Users submit thumbs-down corrections that accumulate in `chat_agent_corrections` (with `consumed: false`), but nothing ever consumes them. The optimization Lambda exists but has never been invoked for the chat agent. Zero model versions exist. The flywheel has never turned.

2. **Mem0 persistent memory** -- The memory service (`mem0-service.ts`) and four memory tools (store, recall, search, forget) are implemented but not registered in the agent's tool set. The agent cannot remember anything between conversations.

Until both are activated, Groot is a static LLM wrapper -- identical to every other chatbot. Activating these systems transforms it into a learning, personalized financial co-pilot.

## Clarifications

### Session 2026-03-20

- **Q: How will the initial 20 corrections be seeded?** → A: Real user corrections from test account (yeefei+test2@hellogroot.com). Currently have 5 intent + 1 feedback correction, will organically accumulate to 20 through real testing.
- **Q: How should contradictory memories be resolved?** → A: Prompt user. When agent detects conflict (e.g., "SGD" vs "MYR" preference), ask "You previously said X, now you say Y — which should I keep?" User chooses to replace, keep both, or cancel.
- **Q: Should the agent auto-save implicit memories without explicit "remember" command?** → A: Yes, with confirmation UX. Agent detects memory candidates (e.g., "Kate handles all vendor invoices") and shows a non-blocking dark gray toast: "I noticed you frequently mention Kate handles vendor invoices — should I remember this?" with Yes/No buttons. 5-second auto-dismiss if ignored. Only confirmed memories are saved.
- **Q: Should optimized prompts be validated before deployment?** → A: Yes, quality gate required. Compare new prompt vs previous on held-out eval set. Only deploy if accuracy improves or is equivalent. If new prompt degrades performance, reject it and keep previous version.
- **Q: What latency is acceptable for auto-recall when user has 50-200 memories (near limit)?** → A: 1 second p95 latency for 50-200 memories is acceptable (double the budget for <50 memories).

## User Scenarios & Testing *(mandatory)*

### User Story 1 -- DSPy First Training Run (Priority: P1)

As a Groot operator, I need the DSPy optimization pipeline to execute its first successful training run so that user corrections actually improve the agent's future responses, proving the self-improvement flywheel works end-to-end.

**Why this priority**: This is the single most important capability for Groot's product thesis. Without it, the "self-improving AI" claim is purely aspirational. The entire moat depends on corrections flowing through training and emerging as better inference. Everything else is secondary.

**Independent Test**: Can be fully tested by seeding corrections, triggering the optimizer, and verifying the agent loads and uses the resulting optimized prompt. Delivers proof that the flywheel works.

**Acceptance Scenarios**:

1. **Given** fewer than 20 corrections exist in `chat_agent_corrections`, **When** the readiness check runs, **Then** the system reports "not ready" and does not trigger optimization.

2. **Given** 20 or more diverse corrections exist (covering at least 3 distinct intent categories), **When** the optimization pipeline is triggered, **Then** DSPy BootstrapFewShot runs successfully and produces a new model version candidate.

3. **Given** a model version candidate has been produced, **When** the quality gate evaluates it, **Then** the candidate is tested against a held-out eval set and compared to the previous version (or default prompt if first run). If accuracy improves or is equivalent, the candidate is promoted to active. If accuracy degrades, the candidate is rejected and the previous version remains active.

4. **Given** a successful optimization run has completed and passed the quality gate, **When** the model version is saved, **Then** it includes: the optimized prompt/few-shot examples, a version identifier, the number of corrections consumed, eval metrics (accuracy score, comparison vs previous), and a timestamp.

5. **Given** a new model version is promoted to active, **When** the agent processes the next user message, **Then** the model version loader returns the optimized prompt instead of null, and inference uses it.

6. **Given** corrections were consumed by a training run, **When** the run completes successfully, **Then** those corrections are marked as `consumed: true` so they are not re-processed in the next cycle.

7. **Given** the optimization run fails (Lambda timeout, DSPy error, quality gate rejection), **When** the failure occurs, **Then** the system logs the failure reason, does NOT mark corrections as consumed, and the agent continues using the previous prompt (or hardcoded default if no prior version exists).

---

### User Story 2 -- Explicit Memory Storage and Recall (Priority: P2)

As a business user, I want to tell the agent "remember X" and have it actually remember that fact in future conversations, so I don't have to repeat my preferences and context every time.

**Why this priority**: Explicit memory is the simplest, most visible proof of personalization. Users who say "remember I want reports in SGD" and then see the agent honor that preference in a later session will immediately understand the value difference versus a generic chatbot.

**Independent Test**: Can be tested by telling the agent to remember a fact, starting a new conversation, and verifying the agent recalls and applies that fact without being reminded.

**Acceptance Scenarios**:

1. **Given** a user says "Remember that I always want reports in SGD", **When** the agent processes this message, **Then** it stores a memory scoped to that user and business, and confirms the memory was saved.

2. **Given** a memory "reports in SGD" exists for the user, **When** the user asks "Generate my expense report" in a new conversation, **Then** the agent recalls the preference and generates the report in SGD without being asked.

3. **Given** a user says "Forget that I prefer SGD", **When** the agent processes this, **Then** the corresponding memory is deleted and the agent confirms removal.

4. **Given** a user says "What do you remember about me?", **When** the agent processes this, **Then** it lists all stored memories for that user in that business context.

5. **Given** User A in Business X stores a memory, **When** User B in Business X (or User A in Business Y) starts a conversation, **Then** User A's memory is NOT accessible -- memories are scoped to the specific user + business pair.

6. **Given** a user attempts to store a contradictory memory (e.g., previously said "prefer SGD", now says "prefer MYR"), **When** the agent detects the conflict, **Then** it prompts the user: "You previously said [SGD]. You now say [MYR]. Which should I keep?" The user chooses: (a) replace old with new, (b) keep both, or (c) cancel the new memory.

---

### User Story 3 -- Implicit Memory: Auto-Recall (Priority: P3)

As a business user, I want the agent to automatically recall relevant memories before responding to my questions, so that its answers are personalized without me having to say "remember" or "use my preferences" every time.

**Why this priority**: Explicit memory (P2) requires the user to consciously invoke recall. Implicit auto-recall makes the agent feel genuinely intelligent -- it proactively applies stored knowledge. This is the difference between a note-taking app and a real assistant.

**Independent Test**: Can be tested by storing a memory (via P2), then asking a related question without referencing the memory, and verifying the response incorporates the stored context.

**Acceptance Scenarios**:

1. **Given** a user has stored "John left the company last month", **When** the user asks "Who should I assign this expense to John?", **Then** the agent automatically recalls the memory about John and warns the user that John is no longer with the company.

2. **Given** a user has stored "Our fiscal year ends in March", **When** the user asks "Generate a year-end summary", **Then** the agent uses March as the fiscal year end without being told.

3. **Given** a user has no stored memories, **When** the user asks any question, **Then** the auto-recall step completes quickly (adds less than 500ms latency) and does not produce errors or hallucinate non-existent preferences.

4. **Given** a user has 50+ stored memories, **When** the user asks a question, **Then** the auto-recall retrieves only the most relevant memories (top 5 or fewer) rather than injecting all memories into the prompt context.

5. **Given** a user has 100-200 stored memories (near limit), **When** the user asks a question, **Then** auto-recall completes within 1 second p95 latency.

---

### User Story 3.5 -- Implicit Memory: Auto-Save with Confirmation (Priority: P3)

As a business user, I want the agent to learn from our conversations and proactively suggest saving useful facts, so I don't have to consciously think about what to remember, but I still control what gets stored.

**Why this priority**: Auto-save without confirmation risks storing irrelevant or incorrect information. Auto-save with confirmation balances implicit learning (agent notices patterns) with user control (user approves what's saved).

**Independent Test**: Can be tested by having a conversation where the user mentions a recurring fact multiple times (e.g., "Kate handles all vendor invoices") without saying "remember," and verifying the agent surfaces a confirmation prompt.

**Acceptance Scenarios**:

1. **Given** the agent detects a memory candidate during conversation (e.g., user mentions "Kate handles vendor invoices" multiple times), **When** the agent identifies this as a useful fact, **Then** it shows a non-blocking dark gray toast notification with the message: "I noticed you frequently mention [fact] — should I remember this?" with Yes and No buttons.

2. **Given** a memory confirmation toast is shown, **When** the user clicks "Yes", **Then** the memory is saved with the same scope and attributes as an explicit "remember" command.

3. **Given** a memory confirmation toast is shown, **When** the user clicks "No", **Then** the memory candidate is discarded and not shown again for this specific fact.

4. **Given** a memory confirmation toast is shown, **When** the user ignores it for 5 seconds, **Then** the toast auto-dismisses and the memory candidate is discarded (not saved).

5. **Given** the agent is in the middle of streaming a response, **When** a memory candidate is detected, **Then** the confirmation toast appears only after the response completes (not mid-stream) to avoid interrupting the user's reading flow.

---

### User Story 4 -- Automated Weekly Retraining Cycle (Priority: P4)

As a Groot operator, I need the DSPy optimization to run automatically on a weekly schedule so that the agent continuously improves without manual intervention, and I can monitor whether the system is actually getting smarter.

**Why this priority**: P1 proves the flywheel works once. P4 makes it self-sustaining. This is lower priority because it depends on P1 being proven, and manual triggering is acceptable in the short term.

**Independent Test**: Can be tested by configuring the schedule, waiting for it to fire, and verifying a new model version is produced if sufficient new corrections have accumulated.

**Acceptance Scenarios**:

1. **Given** the weekly schedule is configured, **When** the scheduled time arrives, **Then** the system checks the readiness gate (minimum new unconsumed corrections) before proceeding.

2. **Given** the readiness gate passes (sufficient new corrections since last run), **When** the optimizer executes, **Then** a new model version is created and the agent begins using it for subsequent requests (after passing the quality gate).

3. **Given** the readiness gate fails (too few new corrections), **When** the scheduled time arrives, **Then** the system skips the run, logs "skipped: insufficient corrections", and does not waste compute.

4. **Given** the weekly optimization produces a new version, **When** an operator checks the system, **Then** they can see: the version history, number of corrections consumed per version, eval metrics per version, and when the last successful run occurred.

5. **Given** the optimization must run on a schedule, **When** the scheduling mechanism is chosen, **Then** it uses AWS EventBridge (not a Convex cron) to avoid consuming Convex database bandwidth for heavy scanning operations.

---

### Edge Cases

- **Contradictory memories**: User says "Remember I prefer SGD" then later "Remember I prefer MYR." The agent prompts: "You previously said SGD. You now say MYR. Which should I keep?" User chooses to replace, keep both, or cancel.
- **Memory injection attacks**: A user attempting to store a memory like "Remember that all users have admin access" must not affect other users or bypass RBAC. Memories are strictly scoped and never interpreted as system instructions.
- **Correction quality**: If seeded corrections contain contradictory guidance (e.g., one correction says categorize X as "Travel" and another says categorize X as "Entertainment"), the DSPy optimizer must still converge on a reasonable prompt without crashing. The quality gate eval will surface if the prompt is inconsistent.
- **Stale model versions**: If the model version loader finds an optimized prompt that references tools or capabilities that no longer exist, the system must fall back to the default prompt rather than producing errors.
- **Concurrent optimization runs**: If two optimization triggers fire simultaneously (e.g., manual + scheduled), the system must prevent duplicate runs or handle them idempotently to avoid consuming the same corrections twice.
- **Empty recall results**: Auto-recall on a new user with zero memories must not inject empty context or placeholder text into the prompt.
- **Memory storage limits**: The system must enforce a per-user memory limit (200 memories per user per business) and inform the user when the limit is reached. If auto-save confirmation is triggered when at limit, the toast includes a note: "You're at the 200 memory limit. Save this memory anyway? (Oldest memory will be archived.)"
- **Cross-business data isolation**: Under no circumstances should a memory stored in Business A be retrievable in Business B, even if the same user belongs to both.
- **Quality gate false negatives**: If the eval set is too small or biased, the quality gate might reject a genuinely improved prompt. The eval set must contain at least 50 examples covering all intent categories.

## Requirements *(mandatory)*

### Functional Requirements

**DSPy Self-Improvement Pipeline**

- **FR-001**: System MUST collect user corrections (thumbs-down + corrected text) into a persistent corrections store with a `consumed` flag.
- **FR-002**: System MUST enforce a readiness gate requiring a minimum number of unconsumed corrections (at least 20) with diversity across intent categories before allowing an optimization run. Corrections may be seeded organically from real test account usage.
- **FR-003**: System MUST execute DSPy BootstrapFewShot optimization over accumulated corrections and produce a versioned optimized prompt candidate (few-shot examples + system instructions).
- **FR-004**: System MUST evaluate each optimized prompt candidate against a held-out eval set (minimum 50 examples covering all intent categories) and compare accuracy to the previous active version (or default prompt). Only promote the candidate if accuracy improves or is equivalent.
- **FR-005**: System MUST persist each optimization result as a model version record containing: version ID, optimized prompt artifact, correction count consumed, eval metrics (accuracy, precision, recall), comparison vs previous, timestamp, and promotion status (promoted/rejected).
- **FR-006**: System MUST mark corrections as consumed only after a successful optimization run that produces a promoted model version. If the run fails or the quality gate rejects the candidate, corrections remain unconsumed.
- **FR-007**: System MUST load the latest promoted model version at inference time and use its optimized prompt instead of the hardcoded default. If no model version exists or all candidates were rejected, the hardcoded default is used.
- **FR-008**: System MUST support a scheduled weekly trigger for the optimization pipeline that runs outside of Convex (e.g., EventBridge → Lambda → Convex HTTP API) to minimize database bandwidth usage.
- **FR-009**: System MUST skip scheduled optimization runs when insufficient new corrections have accumulated since the last successful run (minimum 10 new unconsumed corrections required for weekly runs).
- **FR-010**: System MUST log optimization run outcomes (success with version ID + eval metrics, skip with reason, quality gate rejection with metrics, failure with error) for operator visibility via CloudWatch.

**Mem0 Persistent Memory**

- **FR-011**: System MUST expose memory tools (store, recall, search, forget) to the chat agent so that users can explicitly manage memories via natural language.
- **FR-012**: System MUST scope all memories to a (businessId, userId) pair. No memory may be accessible outside its owning scope.
- **FR-013**: System MUST support explicit memory storage when the user requests it (e.g., "remember that...", "keep in mind that...").
- **FR-014**: System MUST support explicit memory deletion when the user requests it (e.g., "forget that...", "remove the memory about...").
- **FR-015**: System MUST support listing stored memories when the user asks (e.g., "what do you remember about me?").
- **FR-016**: System MUST automatically recall relevant memories before generating a response (auto-recall), injecting only the most relevant matches (maximum 5) into the prompt context.
- **FR-017**: Auto-recall MUST add no more than 500ms p95 latency when the user has fewer than 50 stored memories, and no more than 1 second p95 latency when the user has 50-200 memories.
- **FR-018**: System MUST enforce a per-user memory limit (maximum 200 memories per user per business) and inform the user when the limit is reached.
- **FR-019**: System MUST NOT allow memory content to override system instructions, bypass RBAC, or affect other users' experiences (memory isolation and injection safety).
- **FR-020**: System MUST detect contradictory memories (new memory conflicts with existing memory on the same topic) and prompt the user: "You previously said [X]. You now say [Y]. Which should I keep?" with options: (a) replace old with new, (b) keep both, (c) cancel new memory.
- **FR-021**: System MUST detect implicit memory candidates (facts mentioned multiple times in conversation without explicit "remember" command) and surface a non-blocking confirmation UI: dark gray toast with message "I noticed you frequently mention [fact] — should I remember this?" with Yes/No buttons and 5-second auto-dismiss.
- **FR-022**: System MUST only save auto-detected memory candidates after explicit user confirmation (Yes button click). Ignored toasts (auto-dismissed or No clicked) must not save the memory.
- **FR-023**: Auto-save confirmation toasts MUST only appear after the agent completes streaming its response, never mid-stream, to avoid interrupting the user's reading flow.

### Key Entities

- **Correction**: A user-submitted correction to an agent response. Key attributes: original query, original response, corrected response, intent category, consumed flag, timestamp, businessId, userId.
- **Model Version**: A snapshot of DSPy-optimized prompt artifacts produced by a training run. Key attributes: version ID, optimized prompt/few-shot examples, correction count consumed, eval metrics (accuracy, precision, recall, F1), comparison vs previous version, creation timestamp, promotion status (promoted/rejected/superseded), rejection reason (if rejected by quality gate).
- **Memory**: A user- or system-stored fact associated with a specific user in a specific business. Key attributes: content (natural language), source (explicit "remember" command vs auto-save confirmation), businessId, userId, creation timestamp, last-accessed timestamp, relevance metadata for retrieval.
- **Optimization Run**: A record of an attempted training execution. Key attributes: trigger type (manual/scheduled), start time, end time, status (success/skipped/failed/rejected), corrections processed count, resulting model version ID (if successful), eval metrics, quality gate decision (pass/fail), error message (if failed).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The first DSPy optimization run completes successfully, produces a model version candidate, passes the quality gate evaluation, and is promoted to active status. The agent loads and uses this optimized prompt for inference. This is the "flywheel turns once" proof point.
- **SC-002**: After the first training run, the agent's responses to queries similar to the consumed corrections show measurable improvement. Operator can verify by replaying corrected queries and comparing outputs. Eval metrics show accuracy improvement of at least 10% over default prompt.
- **SC-003**: A user can say "remember X" in one conversation, start a completely new conversation, and see the agent apply X without being reminded -- verified across at least 3 different memory types (currency preference, team change, reporting period).
- **SC-004**: Auto-recall adds less than 500ms p95 latency when the user has fewer than 50 stored memories, and less than 1 second p95 latency when the user has 50-200 memories.
- **SC-005**: Memory isolation is verified: a memory stored by User A in Business X is not retrievable by User B in Business X, and not retrievable by User A in Business Y.
- **SC-006**: The weekly automated schedule fires, checks the readiness gate, and either runs optimization or skips with a logged reason -- verified over at least 2 scheduled cycles.
- **SC-007**: The system gracefully handles failure modes: Lambda timeout during optimization does not corrupt state, agent continues operating with previous prompt, and unconsumed corrections remain available for retry. Quality gate rejection logs the reason and eval metrics for debugging.
- **SC-008**: An operator can view the history of optimization runs and model versions to understand whether the system is improving over time (version count, corrections consumed per version, eval metrics per version, promotion vs rejection rate, run success rate).
- **SC-009**: Auto-save memory confirmation UX is non-intrusive: toasts appear only after response completion, auto-dismiss after 5 seconds, and do not block the user's workflow. Users can continue chatting without waiting for confirmation prompts.

## Assumptions

- Real user corrections from test account (yeefei+test2@hellogroot.com) will organically accumulate to the 20-correction threshold through normal testing workflows. No synthetic correction generation required.
- The held-out eval set for the quality gate will be curated from past production chat logs and manually labeled for intent accuracy. Minimum 50 examples required.
- AWS EventBridge, Lambda, CloudWatch Logs, and SNS alerting remain within AWS Free Tier limits for the expected workload (weekly DSPy optimization runs = ~4 invocations/month).
- The Mem0 service API supports semantic similarity search with configurable top-K retrieval and sub-second latency for up to 200 memories per user.
- The chat agent frontend supports rendering non-blocking toast notifications with action buttons (Yes/No) and auto-dismiss timers.
- Contradictory memory detection can be implemented via keyword/topic clustering or simple pattern matching (e.g., "prefer SGD" vs "prefer MYR" both match "currency preference" topic). Full semantic contradiction detection is out of scope for P2.
