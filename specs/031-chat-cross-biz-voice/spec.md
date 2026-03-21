# Feature Specification: Cross-Business Benchmarking, Email Integration & Voice Input

**Feature Branch**: `031-chat-cross-biz-voice`
**Created**: 2026-03-21
**Status**: Draft
**Input**: GitHub Issue #352 — Cross-business benchmarking, email integration, voice input
**Source**: https://github.com/grootdev-ai/groot-finance/issues/352

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Email Financial Reports via Chat (Priority: P1)

A business owner or finance admin tells Groot "Email this AP aging report to john@company.com" and Groot sends a professionally formatted email containing the requested financial data to the specified recipient. This is the highest-value feature because it turns Groot from an information tool into an action tool — users don't need to screenshot or copy-paste reports.

**Why this priority**: Immediate, tangible productivity gain. Every finance team currently exports/screenshots reports and manually emails them. This eliminates that friction entirely and leverages existing SES infrastructure. Q2 2026 delivery target.

**Independent Test**: Can be fully tested by asking Groot to email a report and verifying the recipient receives a formatted email with correct financial data.

**Acceptance Scenarios**:

1. **Given** a finance admin is in the chat, **When** they say "Email this AP aging report to john@company.com", **Then** Groot generates a formatted email with the AP aging data and sends it to john@company.com, confirming delivery in the chat.
2. **Given** a finance admin has just received a cash flow summary in the chat, **When** they say "Email this to the board", **Then** Groot asks for recipient email addresses and sends the previously displayed report to each recipient.
3. **Given** an employee (non-admin) is in the chat, **When** they say "Email this expense report to my manager", **Then** Groot declines with a message explaining that only finance admins and owners can send financial reports via email.
4. **Given** a finance admin requests an email, **When** the recipient email address is invalid, **Then** Groot informs the user of the invalid address and asks them to provide a correct one.
5. **Given** a finance admin says "Email the monthly P&L to cfo@company.com and controller@company.com", **When** the request is processed, **Then** both recipients receive the formatted report.

---

### User Story 2 - Voice Input for Chat (Priority: P2)

A user taps a microphone button on the mobile chat interface (or clicks one on web) and speaks their query: "Hey Groot, what is my cash flow?" The speech is transcribed to text and submitted as a normal chat message. Groot responds with text in the chat — no voice output. This makes Groot accessible hands-free and faster for mobile users.

**Why this priority**: Significant UX improvement for mobile-first SE Asian SME users who may prefer speaking over typing, especially on-the-go. Q2 2026 delivery target. Lower priority than email because it's an input convenience, not a new capability.

**Independent Test**: Can be fully tested by tapping the mic button, speaking a query, and verifying the transcribed text appears in the chat input and is processed as a normal message.

**Acceptance Scenarios**:

1. **Given** a user is on the mobile chat screen, **When** they tap the microphone button and say "What are my outstanding invoices?", **Then** the speech is transcribed to text and appears in the chat input field for the user to review and tap Send.
2. **Given** a user is on the web chat interface (supported browser), **When** they click the microphone button and speak, **Then** the speech is transcribed and processed identically to the mobile experience.
3. **Given** a user is speaking and there's background noise, **When** the transcription quality is low, **Then** the transcribed text is shown in the input field for the user to review and edit before sending.
4. **Given** a user taps the microphone button, **When** the browser or device does not support speech recognition, **Then** the system displays a clear message that voice input is not available on their current browser/device.
5. **Given** a user is recording voice input, **When** they tap the microphone button again (or a stop button), **Then** recording stops and the transcribed text is placed in the input field (not auto-submitted), allowing the user to review.

---

### User Story 3 - Compare Business Metrics to Industry Benchmarks (Priority: P3)

A business owner asks Groot "How does our COGS ratio compare to similar businesses?" and receives a percentile ranking showing where they stand relative to anonymized, aggregated data from other opted-in Groot customers in the same industry. This is Groot's network-effect feature — it becomes more valuable as more businesses use it.

**Why this priority**: High strategic value (competitive moat, network effects) but requires critical mass of opted-in businesses to be meaningful. Q3 2026 delivery target — later than P1/P2. Also carries the most privacy/legal complexity.

**Independent Test**: Can be fully tested by opting in a business, asking a benchmarking question, and verifying the response contains percentile ranking and industry averages.

**Acceptance Scenarios**:

1. **Given** a business owner has opted in to anonymized benchmarking, **When** they ask "Compare our margins to industry", **Then** Groot returns their percentile ranking, the industry average, and actionable recommendations.
2. **Given** a business has NOT opted in, **When** the owner asks "How do we compare to others?", **Then** Groot explains the benchmarking feature, describes what data would be shared (anonymized aggregates only), and offers to enable opt-in.
3. **Given** a business is opted in but there are fewer than a minimum number of comparable businesses in the dataset, **When** a benchmarking query is made, **Then** Groot informs the user that not enough data is available yet for meaningful comparisons and provides whatever limited context it can.
4. **Given** a manager (non-owner) asks a benchmarking question, **When** the business is opted in, **Then** Groot returns the benchmarking data (read-only access is permitted for all roles within an opted-in business).
5. **Given** an owner wants to stop sharing data, **When** they say "Opt out of benchmarking", **Then** Groot confirms opt-out, removes the business from future aggregations, and confirms no historical data is retained in the aggregated pool.

---

### Edge Cases

- What happens when a user asks to email a report but hasn't generated one in the current conversation? → Groot generates the report first, then sends it.
- What happens when voice transcription returns empty text? → System discards the empty result and prompts the user to try again.
- What happens when a business opts in to benchmarking but operates in a niche industry with no peers? → System explains insufficient comparable data and suggests broadening the comparison category.
- What happens when a user dictates an email address via voice ("email this to john at company dot com")? → The transcription should be post-processed to recognize email address patterns and convert to proper format.
- What happens if the email service is temporarily unavailable? → Groot informs the user of the temporary issue and suggests trying again shortly, rather than silently failing.
- What happens when voice input is in a non-English language common in SE Asia (Malay, Mandarin)? → Initial release supports English only; system should clearly indicate supported language(s).

## Requirements *(mandatory)*

### Functional Requirements

**Email Integration**

- **FR-001**: System MUST provide a chat agent tool that sends formatted financial reports via email to specified recipients.
- **FR-002**: System MUST restrict email-sending capability to users with finance_admin or owner roles only.
- **FR-003**: System MUST generate professionally formatted HTML emails containing the requested financial data (tables, summaries, charts as appropriate).
- **FR-004**: System MUST support sending to multiple recipient email addresses in a single request.
- **FR-005**: System MUST validate recipient email addresses before attempting to send.
- **FR-005a**: System MUST display a confirmation prompt showing the recipient(s) and report type before sending, requiring explicit user approval (e.g., "Send AP Aging Report to john@company.com? ✓/✗"). No email is sent without this confirmation.
- **FR-006**: System MUST confirm successful delivery (or report failure) in the chat after sending.
- **FR-007**: System MUST log all email-sending actions for audit purposes (who sent what to whom, when).
- **FR-007a**: System MUST enforce a rate limit of 50 emails per business per day. When the limit is reached, Groot informs the user and suggests trying again tomorrow.

**Voice Input**

- **FR-008**: System MUST provide a microphone button on the mobile chat interface for speech-to-text input.
- **FR-009**: System MUST provide a microphone button on the web chat interface for supported browsers.
- **FR-010**: System MUST transcribe speech to text and place it in the chat input field for user review before submission.
- **FR-011**: System MUST display a clear visual indicator while recording is active (e.g., pulsing mic icon, recording duration).
- **FR-012**: System MUST handle unsupported browsers/devices gracefully by hiding the mic button or showing an explanatory message.
- **FR-013**: System MUST support English language transcription. Other languages are out of scope for initial release.

**Cross-Business Benchmarking**

- **FR-014**: System MUST provide an opt-in mechanism for businesses to participate in anonymized benchmarking. Only users with owner or finance_admin roles can toggle opt-in/out.
- **FR-015**: System MUST aggregate only anonymized statistical data (averages, percentiles, distributions) — never expose individual business data.
- **FR-016**: System MUST provide a chat agent tool that returns percentile ranking, industry average, and recommendations when a user asks a benchmarking question. Initial supported metrics: gross margin, COGS ratio, operating expense ratio, AR days outstanding, and AP days outstanding.
- **FR-017**: System MUST require a minimum number of comparable businesses before returning benchmarking results (to prevent de-anonymization).
- **FR-018**: System MUST allow businesses to opt out at any time, with confirmation that their data is removed from future aggregations.
- **FR-019**: System MUST categorize businesses by industry/sector to ensure benchmarking comparisons are meaningful.

### Key Entities

- **Email Report**: A formatted financial report sent via email — contains report type, generated data, recipient(s), sender business, timestamp, and delivery status.
- **Voice Transcript**: The text output of speech-to-text conversion — associated with a user session, contains raw transcript text and confidence score.
- **Benchmarking Opt-In**: A business's participation status in the anonymized data pool — tracks opt-in date, industry category, and active/inactive status.
- **Industry Benchmark**: An aggregated statistical snapshot for a given metric within an industry category — contains metric name, percentile distribution, average, median, sample size, and period.

## Clarifications

### Session 2026-03-21

- Q: Should email recipients be restricted (internal only, allowlist) or unrestricted? → A: Any email address is allowed, but the system must require explicit user confirmation (showing recipient + report type) before sending. Prevents accidental data exfiltration while maintaining flexibility for external stakeholders (auditors, board members).
- Q: Should voice transcription auto-submit or require user review before sending? → A: Always review-first. Transcribed text appears in the input field; user must tap Send. Speech-to-text can misrecognize financial terms, and users can't un-send a garbled query.
- Q: Who can toggle benchmarking opt-in/out? → A: Both owner and finance_admin roles can opt-in and opt-out. No restriction to owner-only.
- Q: Should there be a per-business daily email sending limit? → A: Yes, 50 emails per business per day. Sufficient for legitimate SME use, prevents abuse/runaway costs.
- Q: Which financial metrics are available for benchmarking at launch? → A: Curated initial set of 5: gross margin, COGS ratio, operating expense ratio, AR days outstanding, AP days outstanding. Expand later based on user demand.

## Assumptions

- The existing SES infrastructure (SystemEmail CDK stack) is sufficient for sending report emails without additional AWS setup.
- Speech-to-text on mobile will use the device's native capabilities (Capacitor plugin) and web will use the Web Speech API, both of which are mature enough for production use.
- Groot already has access to the financial metrics needed for benchmarking (COGS ratio, margins, etc.) through existing reporting tools.
- The minimum viable number of businesses for meaningful benchmarking is approximately 10 per industry category.
- English is sufficient for voice input in the initial release, given that Groot's primary market (Malaysian SMEs) operates largely in English for financial contexts.
- Benchmarking data will be refreshed periodically (e.g., weekly or monthly), not in real-time.
- Voice input does not require wake-word detection ("Hey Groot") — the user explicitly taps a button to start recording.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can request and send a financial report via email in under 30 seconds through a single chat interaction.
- **SC-002**: 95% of voice transcriptions in a quiet environment are accurate enough that the user does not need to edit the text before sending.
- **SC-003**: Benchmarking queries return percentile ranking and industry averages within 5 seconds for opted-in businesses.
- **SC-004**: Zero individual business data points are exposed through the benchmarking feature (verified by privacy audit).
- **SC-005**: Email delivery success rate is above 98% for valid recipient addresses.
- **SC-006**: Voice input feature is available on at least 90% of mobile devices used by existing Groot users.
- **SC-007**: At least 20% of active businesses opt in to benchmarking within 3 months of launch.
- **SC-008**: Users who use voice input send at least 30% more chat messages per session compared to text-only input.
