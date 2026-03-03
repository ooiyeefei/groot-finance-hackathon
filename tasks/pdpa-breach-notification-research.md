# PDPA Data Breach Notification — Regulatory Research

**Date**: 2026-03-03
**Purpose**: Detailed regulatory requirements for Singapore and Malaysia mandatory data breach notification obligations, with focus on SaaS/AI provider applicability to Groot Finance.

---

## 1. Singapore PDPA — Data Breach Notification (Part VIA)

**Legislative basis**: Personal Data Protection Act 2012 (PDPA), Part VIA (Sections 26A-26E), effective **1 February 2021**. Introduced by the Personal Data Protection (Amendment) Act 2020. Subsidiary legislation: Personal Data Protection (Notification of Data Breaches) Regulations 2021 (S 64/2021).

**Sources**: DLA Piper Data Protection (dlapiperdataprotection.com), ICLG Data Protection Laws (iclg.com), PDPC official website (pdpc.gov.sg).

### 1.1 Definition of "Data Breach" (Section 26A)

A **data breach** means:

> (a) the unauthorised access, collection, use, disclosure, copying, modification or disposal of personal data; or
> (b) the loss of any storage medium or device on which personal data is stored in circumstances where the unauthorised access, collection, use, disclosure, copying, modification or disposal of the personal data is likely to occur.

**Key note**: The definition covers both actual unauthorized handling AND loss of storage media/devices where unauthorized handling is **likely** to occur (even if it has not yet been confirmed).

### 1.2 Definition of "Notifiable Data Breach" (Section 26B/26C)

A data breach is **notifiable** if it meets EITHER of these two independent grounds:

#### Ground (a): Significant Harm
The breach results in, or is likely to result in, **significant harm** to any affected individual. This ground is triggered when the breach involves **prescribed personal data** as defined in the Notification of Data Breaches Regulations 2021.

#### Ground (b): Significant Scale
The breach is of a **significant scale**, defined as affecting **500 or more individuals**, regardless of the type of personal data involved.

### 1.3 Definition of "Significant Harm" — Prescribed Personal Data

Under the Notification of Data Breaches Regulations 2021, the following categories of personal data are prescribed as likely to result in significant harm if compromised:

1. **Financial information** — financial data that is not publicly disclosed (e.g., bank account numbers, credit card details, income information)
2. **Vulnerable individual identification** — personal data that would lead to the identification of a vulnerable individual (e.g., data that could identify a minor who has been arrested for an offence)
3. **Life, accident and health insurance information** — insurance data that is not publicly disclosed
4. **Specified medical information** — including the assessment and diagnosis of HIV infection, sexually transmitted diseases, and mental health conditions
5. **Adoption records** — information related to adoption matters
6. **Private cryptographic keys** — a private key used to authenticate or digitally sign an electronic record or transaction
7. **Account access credentials** — an individual's account identifier together with any data required to access that account (e.g., username + password combinations)

**Important**: If ANY of these prescribed data types are involved in a breach, the "significant harm" ground is automatically triggered, even if the number of affected individuals is below 500.

### 1.4 Timeline: The 3-Calendar-Day Rule

#### Duty to Conduct Assessment (Section 26B)
Upon becoming aware of a data breach (or having **reasonable grounds to believe** a breach has occurred), an organisation must conduct an assessment **in a reasonable and expeditious manner** to determine whether the breach is notifiable.

The PDPC Guide recommends completing the assessment within **30 calendar days** of becoming aware of the breach, though this is guidance, not a statutory hard deadline.

#### Notification to PDPC (Section 26C)
Once the organisation concludes its assessment and determines the breach IS notifiable:

> **As soon as practicable, and in any case no later than 3 calendar days** after the day the organisation completes its assessment.

**Critical clarification**: The 3-day clock starts from the **completion of the assessment** — NOT from the date of awareness of the breach. However, the assessment itself must be done "in a reasonable and expeditious manner."

**In practice**: Awareness -> Assessment (recommended <=30 days) -> Determination that breach is notifiable -> Notification to PDPC (<=3 calendar days from determination).

#### Notification to Affected Individuals (Section 26D)
Where the significant harm ground applies:

- Notification must occur **on or after** notifying the PDPC
- Must be given in **any manner that is reasonable in the circumstances**
- No specific statutory deadline, but "as soon as practicable" after PDPC notification

**Note**: Notification to individuals is ONLY required under the "significant harm" ground. If the breach is notifiable solely under the "significant scale" (500+) ground, individual notification is NOT mandatory (only PDPC notification is required).

### 1.5 Required Content — Notification to PDPC

Under the Notification of Data Breaches Regulations 2021, the notification to the PDPC must include:

1. **Date** the data breach was discovered/detected
2. **How the data breach was discovered** (circumstances of discovery)
3. **Description of the data breach** — how it occurred (nature and cause)
4. **Number of affected individuals** (known or estimated)
5. **Types/categories of personal data** affected
6. **Assessment of potential harm** to affected individuals
7. **Steps taken** to contain/remediate the breach
8. **Future remedial actions** planned to prevent recurrence
9. **Plan for informing affected individuals** — OR grounds for not notifying individuals (if applicable)
10. **Contact details** of an authorised representative who can respond to PDPC enquiries

### 1.6 Required Content — Notification to Affected Individuals

When individual notification is required (significant harm ground), it must include:

1. **Circumstances** of the data breach (how it was discovered)
2. **Types/categories of personal data** affected
3. **Description of potential harm** the individual may face
4. **Remedial actions** the organisation has taken or will take
5. **Steps the individual can take** to protect themselves (self-help measures)
6. **Contact details** of a representative who can provide further information and assistance

### 1.7 Exceptions to Individual Notification

An organisation need NOT notify affected individuals if:

1. **Remedial action** has been taken that makes significant harm to individuals no longer likely; OR
2. **Technological protection** measures (e.g., encryption) render the data unintelligible and significant harm unlikely; OR
3. **Law enforcement or PDPC** directs otherwise (e.g., notification would impede a criminal investigation)

### 1.8 Record-Keeping Obligations (Section 26E)

**This applies to ALL data breaches — not just notifiable ones.**

Under Section 26E, an organisation must maintain a record of **every data breach** that occurs, regardless of whether it meets the notifiable threshold. The record must include:

- Facts relating to the data breach
- Findings of the organisation's assessment
- Actions taken by the organisation in response

The organisation must retain these records and **produce them to the PDPC upon request**. There is no prescribed retention period in the statute, but the obligation is ongoing.

**Practical implication for Groot Finance**: Every data breach incident, even minor ones that are not notifiable, must be documented in a breach register.

### 1.9 Data Intermediary Obligations

A **data intermediary** under the PDPA is an organisation that processes personal data on behalf of another organisation (analogous to a "data processor" under GDPR).

#### Notification to the Data Controller
A data intermediary that discovers or has **credible grounds to believe** that a data breach has occurred must notify the organisation (data controller) on whose behalf it processes data **without undue delay**.

**Key points**:
- The data intermediary itself does NOT notify the PDPC or affected individuals — that obligation rests with the data controller (the organisation)
- "Without undue delay" is not further defined in statute but is expected to mean as quickly as possible under the circumstances
- The data controller remains responsible for conducting the assessment and making notifications
- Contractual obligations between controller and intermediary should specify breach notification timelines

### 1.10 Penalties for Non-Compliance

**Financial penalties** (as amended in 2020):
- Up to **10% of annual turnover in Singapore** for organisations with annual turnover exceeding SGD 10 million; OR
- Up to **SGD 1 million** (approximately USD 740,000)
- Whichever is **higher**

These penalties apply to breaches of the Protection Obligations, which include the breach notification obligations under Part VIA.

**Note**: The PDPC can also issue directions to organisations (e.g., requiring them to implement specific remedial measures, stop processing data, etc.).

---

## 2. Malaysia PDPA 2010 — Breach Notification (2024 Amendments)

**Legislative basis**: Personal Data Protection Act 2010 (Act 709), as amended by the **Personal Data Protection (Amendment) Act 2024**. Gazetted on **17 October 2024**.

**Sources**: DLA Piper Data Protection (dlapiperdataprotection.com), JPDP official portal (pdp.gov.my), DLA Piper country law analysis.

### 2.1 The Amendment Introducing Mandatory Breach Notification

The Personal Data Protection (Amendment) Act 2024 introduced **Section 12B**, establishing mandatory data breach notification obligations for the first time. Prior to this amendment, Malaysia had no mandatory breach notification requirement — only a voluntary reporting mechanism (which has since been discontinued).

**Key legislative timeline**:
- Passed by Parliament: July 2024 (Dewan Rakyat on 16 July, Dewan Negara on 31 July)
- Royal Assent: October 2024
- Gazetted: **17 October 2024**

### 2.2 Effective Date

**1 June 2025** — This is the effective date for the breach notification provisions (Section 12B) along with DPO appointment requirements and data portability provisions.

Other amendment provisions have earlier effective dates:
- 1 January 2025: Administrative amendments (Sections 7, 11, 13, 14)
- 1 April 2025: Security principle amendments, processing obligations, cross-border transfer changes
- **1 June 2025: Breach notification, DPO appointment, data portability**

### 2.3 Notification Timeline

#### To the Commissioner (Section 12B)
Data users (controllers) must notify the Commissioner **"as soon as possible"** if they have reason to believe a personal data breach has occurred.

**Critical note**: Unlike Singapore's precise "3 calendar days" rule, Malaysia uses the phrase **"as soon as possible"** without specifying a defined hour or day limit. This is deliberately vague and expected to be clarified by subsidiary guidelines.

#### To Data Subjects
Where the breach causes or is likely to cause **"significant harm"** to the data subject, notification must be given **"without unnecessary delay."**

**Important**: The Commissioner's Public Consultation Paper No. 01/2024 (issued 19 August 2024) proposes further guidelines on the manner, form, timeframe, and applicable exemptions. The **Personal Data Breach Notification Guidelines** were expected to be published in early 2025, before the 1 June 2025 effective date. As of March 2026, these should be finalized — check JPDP portal for latest version.

### 2.4 Who Must Be Notified

1. **The Commissioner** (JPDP/Personal Data Protection Commissioner) — for ALL notifiable breaches
2. **Affected data subjects** — only when the breach causes or is likely to cause **significant harm** to the data subject

### 2.5 Notification Threshold

The proposed framework distinguishes between breaches involving:
- **Significant harm** to data subjects (triggers individual notification)
- **Significant scale** (potentially defined similarly to Singapore's 500+ threshold)

**Note**: The exact threshold definitions are expected to be detailed in the Personal Data Breach Notification Guidelines. The primary Act uses the phrase "causes or is likely to cause any significant harm" without prescribing specific data categories (unlike Singapore's exhaustive list).

### 2.6 Required Information — Notification to Commissioner

The specific fields required in the notification to the Commissioner are to be prescribed in subsidiary regulations/guidelines. Based on the Public Consultation Paper No. 01/2024, the expected requirements include:

1. Description of the nature of the breach
2. Date/time of the breach (if known) and date of discovery
3. Types of personal data affected
4. Number of affected data subjects (known or estimated)
5. Description of likely consequences
6. Description of measures taken or proposed to address the breach
7. Contact details of the data user's DPO or representative

**Portal**: Notifications are submitted through the JPDP portal system. The **"Lapor DBN"** (Data Breach Notification reporting) feature is accessible at **pdp.gov.my**. Direct contact: 03-7456 3888, aduan@pdp.gov.my.

### 2.7 Required Information — Notification to Data Subjects

When individual notification is required (significant harm likely), the expected required content includes:

1. Nature of the data breach
2. Types of personal data affected
3. Likely consequences of the breach for the individual
4. Steps taken by the data user to address the breach
5. Steps the individual can take to protect themselves
6. Contact information for further enquiries

### 2.8 Penalties for Non-Compliance

The original PDPA 2010 imposes **criminal penalties** for violations of data protection principles:

**General penalty provisions under the PDPA 2010**:
- Non-compliance with data protection principles: fine up to **RM 300,000** (approximately USD 63,000) and/or imprisonment up to **2 years**
- For certain provisions: fine up to **RM 500,000** (approximately USD 105,000) and/or imprisonment up to **3 years**

**Director/officer liability**: Directors, CEOs, managers, and similar officers face **joint and several liability** for non-compliance by the corporate body, subject to a **due diligence defence** (proving they exercised reasonable due diligence to ensure compliance).

**2024 Amendment additions**:
- The Amendment Act strengthens enforcement powers
- Specific penalties for breach notification non-compliance under Section 12B are expected to be prescribed in subsidiary legislation
- The Commissioner may impose compound notices for violations
- The Amendment Act also introduces provisions for civil enforcement (not just criminal)

**Note**: The 2024 Amendment reportedly increases maximum penalties, but specific updated amounts for breach notification failures may be in the subsidiary regulations.

### 2.9 Data Processor Obligations

Under the original PDPA 2010, data processors had **no direct obligations** — all duties were imposed on data users (controllers) only.

The 2024 Amendment changes this significantly:

1. **Direct Security Principle obligations** (effective 1 April 2025): Data processors now have **direct obligations** to comply with the Security Principle. This means processors are directly responsible for implementing adequate security measures.

2. **No direct breach notification duty**: Data processors are NOT directly required to notify the Commissioner or data subjects under Section 12B. However, data users (controllers) are expected to **contractually impose obligations on their data processors to promptly notify them** about any data breach.

3. **Contractual requirements**: The proposed guidelines suggest controllers must include breach notification clauses in processor contracts specifying:
   - Obligation to notify the controller promptly upon discovering a breach
   - Cooperation obligations during assessment and remediation
   - Information sharing requirements

### 2.10 Data Protection Officer (DPO) Requirement

Also effective **1 June 2025**: Mandatory appointment of a DPO for data users and data processors conducting **"large scale"** processing. Factors determining large scale include:
- Volume of data processed
- Number of data subjects
- Duration and permanence of processing
- Geographic scope

One DPO may serve multiple entities within the same corporate group.

---

## 3. AI / SaaS Provider Specific Requirements

### 3.1 Groot Finance's Classification Under Each Act

#### Singapore PDPA
Groot Finance is likely classified as **BOTH**:

- **An "organisation"** (data controller) for personal data it collects directly from its own users (account information, authentication data, usage data)
- **A "data intermediary"** (data processor) for personal data it processes on behalf of its SME customers (financial data, expense claims, invoices, employee information belonging to the SME's staff)

**Key implication**: For data processed on behalf of SME customers, Groot Finance must:
- Notify the SME customer (data controller) of any breach **without undue delay**
- The SME customer then determines whether to notify the PDPC and affected individuals
- For data where Groot Finance IS the controller (its own user accounts), Groot Finance bears the full notification obligation

#### Malaysia PDPA
Similarly, Groot Finance would be:

- **A "data user"** (controller) for data it collects and determines the purpose of processing
- **A "data processor"** for data processed on behalf of Malaysian SME customers

Under the 2024 Amendment, as a data processor, Groot Finance has **direct Security Principle obligations** (effective April 2025) and should contractually commit to prompt breach notification to its controller customers.

### 3.2 Additional SaaS/AI Provider Obligations

Neither the Singapore PDPA nor the Malaysia PDPA contains **SaaS-specific or AI-specific provisions** for breach notification. However, general principles create additional practical obligations:

1. **Written contracts**: Both jurisdictions expect written data processing agreements between controllers and processors. These should address:
   - Security measures
   - Audit rights
   - Breach notification procedures and timelines
   - Sub-processor engagement conditions
   - Data retention and deletion

2. **Security obligations**: As a SaaS provider, Groot Finance must implement security measures commensurate with the sensitivity of the data processed. This includes:
   - Encryption at rest and in transit
   - Access controls and authentication
   - Logging and monitoring
   - Regular security assessments

3. **AI-specific considerations**: While not codified in breach notification law specifically, the use of AI models (Qwen3) to process personal data introduces considerations:
   - Model training data — ensure no personal data leakage into model weights
   - Input/output logging — if conversations contain personal data, those logs are subject to the same breach notification rules
   - Third-party AI model providers are sub-processors in the chain

### 3.3 Cross-Border Data Transfer Implications

#### Singapore
- No specific cross-border restrictions on breach notification itself
- The Transfer Limitation Obligation (Section 26) requires adequate protection for personal data transferred outside Singapore
- Organisations remain liable for data processed by overseas intermediaries

#### Malaysia (Post-April 2025)
- The whitelist regime has been eliminated
- Transfers permitted to countries with **"substantially similar laws or equivalent levels of protection"**
- **Transfer Impact Assessments** are proposed
- Mechanisms: Binding Corporate Rules, Standard Contractual Clauses
- Exceptions: consent, contract performance, vital interests, due diligence assurances

**For Groot Finance**: Since data is processed through US-based services (Convex, AWS us-west-2, Clerk, Stripe), cross-border transfer compliance is essential. Breach notification obligations persist regardless of where the data is physically located.

### 3.4 Sub-Processor Chain Obligations

Groot Finance uses multiple sub-processors:
- **Clerk** (authentication — US-based)
- **Stripe** (payments — US-based)
- **Convex** (database — US-based)
- **AWS** (Lambda, S3, SES — US regions)
- **Modal** (AI model hosting — Qwen3)

**Under both jurisdictions**:
- Groot Finance remains responsible for the actions of its sub-processors
- Each sub-processor should be contractually bound to notify Groot Finance promptly of any breach
- Groot Finance must conduct due diligence on each sub-processor's security practices
- The breach notification chain is: Sub-processor -> Groot Finance -> SME Customer (controller) -> Regulator/Individuals

---

## 4. Comparison Table: Singapore vs Malaysia (Strictest Standard)

| Aspect | Singapore PDPA (Part VIA) | Malaysia PDPA (Section 12B) | Strictest Standard |
|--------|--------------------------|---------------------------|-------------------|
| **Effective date** | 1 February 2021 | 1 June 2025 | Both apply in their respective jurisdictions |
| **Definition of breach** | Unauthorised access/collection/use/disclosure/copying/modification/disposal of personal data; OR loss of storage medium where unauthorised access is likely | Expected to follow similar definition; specifics in guidelines | Singapore (more precisely defined in statute) |
| **Notification trigger — significant harm** | Breach involves prescribed personal data types (7 categories listed in Regulations) | Breach causes or is likely to cause "significant harm" (categories TBD in guidelines) | Singapore (more specific — enumerated categories) |
| **Notification trigger — significant scale** | 500 or more individuals | "Significant scale" (threshold TBD in guidelines; likely similar) | Singapore (clearly defined: 500+) |
| **Timeline to notify regulator** | **3 calendar days** from completion of assessment | **"As soon as possible"** (no defined limit) | **Malaysia is stricter** in theory (immediate), but **Singapore is more enforceable** (specific deadline). Apply BOTH: notify within 3 calendar days to satisfy Singapore, but begin notification process immediately per Malaysia. |
| **Assessment period** | "Reasonable and expeditious" (PDPC recommends 30 days max) | Not specified (implied to be immediate given "as soon as possible") | Malaysia (more urgency implied) |
| **Timeline to notify individuals** | After notifying PDPC; "as soon as practicable" | "Without unnecessary delay" | Comparable — both require prompt notification after regulator notice |
| **When individual notification required** | Only for significant harm ground (not for 500+ ground alone) | Only when significant harm likely | Comparable |
| **Required fields — regulator notification** | 10 specified fields (see Section 1.5) | Expected 7+ fields (see Section 2.6) | Singapore (more fields explicitly required in statute) |
| **Required fields — individual notification** | 6 specified fields (see Section 1.6) | Expected 6 fields (see Section 2.7) | Comparable |
| **Exceptions to individual notification** | 3 grounds (remedial action, encryption, law enforcement) | Expected in guidelines | Singapore (explicitly codified) |
| **Record-keeping** | **ALL breaches** must be documented (Section 26E), produced on request | Not explicitly required in statute for non-notifiable breaches (pending guidelines) | **Singapore (stricter — all breaches, not just notifiable)** |
| **Penalties — financial** | Up to 10% of SG turnover OR SGD 1 million, whichever is higher | Up to RM 300,000-500,000 fine (criminal) | **Singapore (significantly higher: ~SGD 1M+ vs ~RM 500K)** |
| **Penalties — imprisonment** | N/A (financial penalties only under PDPA) | Up to 2-3 years imprisonment | **Malaysia (includes imprisonment)** |
| **Director liability** | Organisation liable (directors not personally liable under PDPA financial penalties) | Joint and several liability for directors/officers (due diligence defence available) | **Malaysia (personal director liability)** |
| **Data processor/intermediary obligations** | Must notify controller "without undue delay" | No direct breach notification duty; must comply with Security Principle directly; contractual notification expected | Singapore (statutory notification duty on intermediary) |
| **DPO requirement** | Not mandatory (but recommended) | Mandatory for large-scale processing (from 1 June 2025) | **Malaysia (mandatory DPO)** |

### Recommended Compliance Approach for Groot Finance

To satisfy **both** jurisdictions simultaneously, adopt the **strictest** standard from each:

1. **Document ALL breaches** (Singapore Section 26E requirement)
2. **Begin assessment immediately** upon awareness (Malaysia urgency)
3. **Complete assessment within 30 days** (Singapore PDPC guidance)
4. **Notify regulator within 3 calendar days** of assessment completion (Singapore) — but also "as soon as possible" for Malaysia
5. **Notify affected individuals** for significant harm breaches, after regulator notification
6. **Include all 10 Singapore-required fields** in regulator notification (covers both jurisdictions)
7. **Maintain breach register** with all 6 individual notification fields ready
8. **Appoint a DPO** (mandatory for Malaysia if large-scale)
9. **Contractually bind all sub-processors** (Clerk, Stripe, Convex, AWS, Modal) to prompt breach notification
10. **Conduct cross-border transfer assessments** for Malaysia compliance

---

## 5. Source URLs

### Singapore PDPA
- DLA Piper Data Protection — Singapore Breach Notification: https://www.dlapiperdataprotection.com/index.html?t=breach-notification&c=SG
- ICLG Data Protection — Singapore: https://iclg.com/practice-areas/data-protection-laws-and-regulations/singapore
- PDPC Official Website: https://www.pdpc.gov.sg
- PDPA 2012 (Legislation): https://sso.agc.gov.sg/Act/PDPA2012
- Notification of Data Breaches Regulations 2021: https://sso.agc.gov.sg/SL/PDPA2012-S64-2021

### Malaysia PDPA
- DLA Piper Data Protection — Malaysia: https://www.dlapiperdataprotection.com/index.html?t=law&c=MY
- DLA Piper Data Protection — Malaysia Breach: https://www.dlapiperdataprotection.com/index.html?t=breach-notification&c=MY
- JPDP Official Portal: https://www.pdp.gov.my/jpdpv2/
- JPDP Data Breach Notification (Lapor DBN): https://www.pdp.gov.my/jpdpv2/data-breach-notification/

### Cross-Reference
- DLA Piper Data Protection — Malaysia Enforcement: https://www.dlapiperdataprotection.com/index.html?t=enforcement&c=MY
- DLA Piper Data Protection — Malaysia Authority: https://www.dlapiperdataprotection.com/index.html?t=authority&c=MY

---

## 6. Open Questions / Items Requiring Verification

1. **Malaysia breach notification guidelines**: The Personal Data Breach Notification Guidelines (expected early 2025) should now be published. Check JPDP portal (pdp.gov.my) for the final version, which will define:
   - Exact timeframe for "as soon as possible"
   - Whether a specific hour limit (e.g., 72 hours) is imposed
   - Exact "significant harm" categories
   - Exact "significant scale" threshold number
   - Specific notification form fields

2. **Malaysia penalty amounts for breach notification**: Section 12B-specific penalties may be in subsidiary legislation. Verify current amounts.

3. **Singapore Section 26E retention period**: While the statute requires record-keeping, no specific retention period is prescribed. The PDPC may have updated guidance.

4. **Malaysia DBN portal specifics**: The Lapor DBN online form fields should be verified by checking the actual portal at pdp.gov.my.

5. **Groot Finance DPO requirement**: Assess whether Groot Finance meets the "large scale" processing threshold under Malaysia's 2024 Amendment to determine if DPO appointment is mandatory.
