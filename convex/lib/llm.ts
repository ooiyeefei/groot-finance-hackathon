/**
 * LLM Helper — Reusable function for calling the OpenAI-compatible Qwen3 endpoint
 * from Convex internalActions.
 *
 * Uses standard fetch() to call the Modal-hosted Qwen3-8B endpoint.
 * Env vars: CHAT_MODEL_ENDPOINT_URL, CHAT_MODEL_MODEL_ID (set via `npx convex env set`)
 */

interface CallLLMOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * Call the LLM with a system + user prompt and return the assistant's text response.
 * Returns empty string on any failure (network, parsing, missing env).
 */
export async function callLLM(options: CallLLMOptions): Promise<string> {
  const endpointUrl = process.env.CHAT_MODEL_ENDPOINT_URL;
  const modelId = process.env.CHAT_MODEL_MODEL_ID;

  if (!endpointUrl || !modelId) {
    console.warn("[LLM] Missing CHAT_MODEL_ENDPOINT_URL or CHAT_MODEL_MODEL_ID env vars");
    return "";
  }

  try {
    const response = await fetch(`${endpointUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: options.systemPrompt },
          { role: "user", content: options.userPrompt },
        ],
        max_tokens: options.maxTokens ?? 500,
        temperature: options.temperature ?? 0.3,
      }),
    });

    if (!response.ok) {
      console.error(`[LLM] HTTP ${response.status}: ${await response.text()}`);
      return "";
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content ?? "";

    // Strip markdown code fences if present (LLMs sometimes wrap JSON in ```json...```)
    return content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  } catch (error) {
    console.error("[LLM] Call failed:", error);
    return "";
  }
}

/**
 * Call the LLM and parse the response as JSON.
 * Returns null on any failure (network, parsing, invalid JSON).
 */
export async function callLLMJson<T = unknown>(options: CallLLMOptions): Promise<T | null> {
  const raw = await callLLM(options);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    console.error("[LLM] Failed to parse JSON response:", raw.slice(0, 200));
    return null;
  }
}
