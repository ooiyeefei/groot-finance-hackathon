/**
 * Topic Guardrail and Off-Topic Handler Nodes
 */

import { AIMessage } from "@langchain/core/messages";
import { AgentState } from '../types';
import { aiConfig } from '../../config/ai-config';

/**
 * Topic Guardrail Node - MANDATORY first step
 * Uses LLM to classify if the query is financial/business-related
 * Bypasses guardrail for clarification responses to avoid blocking legitimate follow-ups
 */
export async function topicGuardrail(state: AgentState): Promise<Partial<AgentState>> {
  console.log('[TopicGuardrail] Validating topic relevance');

  // Get the last user message
  const lastMessage = state.messages[state.messages.length - 1];
  if (!lastMessage || lastMessage._getType() !== 'human') {
    console.log('[TopicGuardrail] No human message found, allowing by default');
    return {
      isTopicAllowed: true,
      isClarificationResponse: false
    };
  }

  const userQuery = typeof lastMessage.content === 'string' ? lastMessage.content : '';

  // Skip guardrail for very short responses (likely clarification answers)
  if (userQuery.length < 10) {
    console.log('[TopicGuardrail] Short response detected, likely clarification - allowing');
    return {
      isTopicAllowed: true,
      isClarificationResponse: true
    };
  }

  // FAST-PATH: Skip LLM guardrail for queries that are obviously financial/business-related.
  // This saves 1-2s of Gemini API latency per query, critical for staying under Vercel's
  // function timeout. The intent-node has its own deterministic fast-path with the same pattern.
  const FINANCIAL_FAST_PATH = /\b(revenue|cash\s*flow|runway|burn\s*rate|invoices?|aging|owe|suppliers?|vendors?|outstanding|receivable|payable|AP\b|AR\b|overdue|expenses?|spending|transactions?|income|budget|profit|loss|balance|how\s+much|show\s+me|what('s|\s+is)\s+(our|my|the|total)|gst|sst|tax|accounting|bookkeeping|compliance|myinvois|e-?invoice|receipt|payment|salary|payroll)\b/i;
  if (FINANCIAL_FAST_PATH.test(userQuery)) {
    console.log('[TopicGuardrail] FAST-PATH: Financial/business query detected, skipping LLM guardrail');
    return {
      isTopicAllowed: true,
      isClarificationResponse: false
    };
  }

  try {
    // Build context-aware topic classification prompt
    const topicClassificationPrompt = `You are a topic classification system for a financial co-pilot chatbot designed for Southeast Asian SMEs.

CLASSIFICATION RULES:
1. ALLOWED topics (respond with "ALLOWED"):
   - Tax, GST, VAT regulations and requirements for Singapore, Malaysia, Thailand, Indonesia
   - Business setup, incorporation, compliance procedures
   - Financial analysis, transactions, expenses, accounting questions
   - Employee expense claims, team spending, vendor analysis, manager queries about staff expenses
   - Cross-border commerce, import/export business regulations
   - Invoice processing, document management for business
   - Regulatory compliance, licensing requirements for business
   - Business banking, payments, currency conversion for business
   - Business operations and management (NOT general geography or tourism)

2. NOT ALLOWED topics (respond with "BLOCKED"):
   - Personal conversations, casual chat, jokes, entertainment
   - Non-business advice (health, relationships, travel for leisure)
   - Geography questions (locations, capitals, tourism info)
   - Technical support unrelated to finance/business
   - Entertainment, sports, politics, news, current events
   - Academic subjects unrelated to business
   - Creative writing, storytelling
   - General AI capabilities or meta-discussions
   - General knowledge questions not related to business/finance

3. CLARIFICATION responses (respond with "CLARIFICATION"):
   - Short answers to previous business questions
   - Simple confirmations like "Yes", "No", "Singapore", "Sole Proprietorship"
   - Providing additional details asked for in business context
   - Follow-up answers to clarification questions

IMPORTANT: Consider conversation context. If this appears to be answering a clarification question about business/finance, classify as CLARIFICATION.

EXAMPLES TO BLOCK:
- "where is singapore?" → BLOCKED (geography, not business)
- "tell me a joke" → BLOCKED (entertainment)
- "what's the weather like?" → BLOCKED (not business-related)

EXAMPLES TO ALLOW:
- "What are GST requirements in Singapore?" → ALLOWED (business tax question)
- "How do I register a company in Malaysia?" → ALLOWED (business setup)
- "What's my transaction history?" → ALLOWED (personal financial data)
- "How much did John claim for Starbucks?" → ALLOWED (employee expense query)
- "Show me Sarah's travel expenses" → ALLOWED (team expense management)
- "What did my team spend last month?" → ALLOWED (team financial analysis)
- "Analyze expenses by vendor" → ALLOWED (business analytics)
- "Show employee expense claims" → ALLOWED (manager expense oversight)

User Query: "${userQuery}"

Respond with exactly one word: ALLOWED, BLOCKED, or CLARIFICATION`;

    // Build headers conditionally
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (typeof aiConfig.chat.apiKey === 'string' && aiConfig.chat.apiKey.length > 0) {
      headers['Authorization'] = `Bearer ${aiConfig.chat.apiKey}`;
    }

    const response = await fetch(`${aiConfig.chat.endpointUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: aiConfig.chat.modelId,
        messages: [
          { role: 'system', content: topicClassificationPrompt }
        ],
        max_tokens: 10,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      console.error('[TopicGuardrail] LLM API error, allowing by default');
      return {
        isTopicAllowed: true,
        isClarificationResponse: false
      };
    }

    const result = await response.json();
    const classification = result.choices?.[0]?.message?.content?.trim().toUpperCase();

    console.log(`[TopicGuardrail] Classification result: ${classification} for query: "${userQuery.substring(0, 50)}..."`);

    if (classification === 'BLOCKED') {
      return {
        isTopicAllowed: false,
        isClarificationResponse: false
      };
    } else if (classification === 'CLARIFICATION') {
      return {
        isTopicAllowed: true,
        isClarificationResponse: true
      };
    } else {
      // ALLOWED or any other response defaults to allowed
      return {
        isTopicAllowed: true,
        isClarificationResponse: false
      };
    }

  } catch (error) {
    console.error('[TopicGuardrail] Error during topic classification:', error);
    // Fail open - allow by default on errors to avoid blocking legitimate queries
    return {
      isTopicAllowed: true,
      isClarificationResponse: false
    };
  }
}

/**
 * Off-Topic Handler Node
 * Provides multi-language rejection messages for off-topic queries
 */
export async function handleOffTopic(state: AgentState): Promise<Partial<AgentState>> {
  console.log('[HandleOffTopic] Generating off-topic rejection message');

  const language = state.language || 'en';

  const rejectionMessages = {
    en: "I'm a financial co-pilot designed to help Southeast Asian SMEs with tax, compliance, and business questions. I can assist with:\n\n• GST/VAT questions for Singapore, Malaysia, Thailand, Indonesia\n• Business setup and incorporation\n• Financial analysis and transaction management\n• Cross-border commerce and regulations\n• Invoice processing and document management\n\nPlease ask me something related to your business or financial needs!",

    th: "ฉันเป็นโคไพล็อตด้านการเงินที่ออกแบบมาเพื่อช่วยเหลือ SMEs ในเอเชียตะวันออกเฉียงใต้เรื่องภาษี การปฏิบัติตามกฎระเบียบ และคำถามทางธุรกิจ ฉันสามารถช่วยได้ในเรื่อง:\n\n• คำถามเกี่ยวกับ GST/VAT สำหรับสิงคโปร์ มาเลเซีย ไทย อินโดนีเซีย\n• การจัดตั้งธุรกิจและการจดทะเบียน\n• การวิเคราะห์ทางการเงินและการจัดการธุรกรรม\n• การค้าข้ามแดนและกฎระเบียบ\n• การประมวลผลใบแจ้งหนี้และการจัดการเอกสาร\n\nกรุณาถามฉันเกี่ยวกับความต้องการทางธุรกิจหรือการเงินของคุณ!",

    id: "Saya adalah kopilot keuangan yang dirancang untuk membantu UKM Asia Tenggara dengan pertanyaan pajak, kepatuhan, dan bisnis. Saya dapat membantu dengan:\n\n• Pertanyaan GST/PPN untuk Singapura, Malaysia, Thailand, Indonesia\n• Pendirian bisnis dan pendirian badan hukum\n• Analisis keuangan dan manajemen transaksi\n• Perdagangan lintas batas dan regulasi\n• Pemrosesan faktur dan manajemen dokumen\n\nSilakan tanyakan sesuatu yang berkaitan dengan kebutuhan bisnis atau keuangan Anda!"
  };

  const message = rejectionMessages[language as keyof typeof rejectionMessages] || rejectionMessages.en;

  return {
    messages: [...state.messages, new AIMessage(message)],
    currentPhase: 'completed'
  };
}