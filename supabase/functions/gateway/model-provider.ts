/**
 * Model Provider with Gemini Tumbler Integration
 *
 * Routes LLM calls through cost-optimized providers.
 * Fallback chain: Tumbler → OpenRouter → direct Gemini API
 */

import { Logger } from "../_shared/logger.ts";

export type ModelTier = 'auto' | 'fast' | 'balanced' | 'powerful';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CompletionOptions {
  messages: ChatMessage[];
  model?: ModelTier;
  temperature?: number;
  max_tokens?: number;
  stop?: string[];
  stream?: boolean;
}

interface CompletionResult {
  content: string;
  model_used: string;
  provider: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

// Model tier → actual model mapping
const MODEL_MAP: Record<ModelTier, string> = {
  fast: 'gemini-1.5-flash',
  balanced: 'gemini-1.5-pro',
  powerful: 'gemini-2.5-pro-experimental',
  auto: 'gemini-1.5-pro', // default to balanced
};

// OpenRouter model names (they use provider/model format)
const OPENROUTER_MODEL_MAP: Record<ModelTier, string> = {
  fast: 'google/gemini-flash-1.5',
  balanced: 'google/gemini-pro-1.5',
  powerful: 'google/gemini-2.5-pro-experimental',
  auto: 'google/gemini-pro-1.5',
};

export class ModelProvider {
  private tumblerUrl: string | null;
  private openrouterKey: string | null;
  private geminiKey: string | null;
  private logger: Logger;

  constructor(logger: Logger) {
    this.tumblerUrl = Deno.env.get("TUMBLER_URL") || null;
    this.openrouterKey = Deno.env.get("OPENROUTER_API_KEY") || null;
    this.geminiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY") || null;
    this.logger = logger;
  }

  /**
   * Get a chat completion through the best available provider
   */
  async complete(opts: CompletionOptions): Promise<CompletionResult> {
    const tier = opts.model || 'auto';

    // Try Tumbler first (OpenAI-compatible, cost-optimized)
    if (this.tumblerUrl) {
      try {
        return await this.logger.time(`llm:tumbler:${tier}`, () =>
          this.callTumbler(opts, tier)
        );
      } catch (error) {
        this.logger.warn("Tumbler failed, falling back to OpenRouter", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fallback to OpenRouter
    if (this.openrouterKey) {
      try {
        return await this.logger.time(`llm:openrouter:${tier}`, () =>
          this.callOpenRouter(opts, tier)
        );
      } catch (error) {
        this.logger.warn("OpenRouter failed, falling back to direct Gemini", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Final fallback: direct Gemini API
    if (this.geminiKey) {
      return await this.logger.time(`llm:gemini:${tier}`, () =>
        this.callGeminiDirect(opts, tier)
      );
    }

    throw new Error("No LLM provider configured. Set TUMBLER_URL, OPENROUTER_API_KEY, or GEMINI_API_KEY.");
  }

  /**
   * Call Tumbler (OpenAI-compatible endpoint)
   */
  private async callTumbler(opts: CompletionOptions, tier: ModelTier): Promise<CompletionResult> {
    const model = MODEL_MAP[tier];

    const response = await fetch(`${this.tumblerUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.1,
        max_tokens: opts.max_tokens ?? 2000,
        stop: opts.stop,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tumbler API error: ${response.status} ${text}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      model_used: model,
      provider: "tumbler",
      usage: data.usage,
    };
  }

  /**
   * Call OpenRouter API
   */
  private async callOpenRouter(opts: CompletionOptions, tier: ModelTier): Promise<CompletionResult> {
    const model = OPENROUTER_MODEL_MAP[tier];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.openrouterKey}`,
      },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.1,
        max_tokens: opts.max_tokens ?? 2000,
        stop: opts.stop,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${text}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      model_used: model,
      provider: "openrouter",
      usage: data.usage,
    };
  }

  /**
   * Call Gemini API directly via Google's generative AI REST endpoint
   */
  private async callGeminiDirect(opts: CompletionOptions, tier: ModelTier): Promise<CompletionResult> {
    const model = MODEL_MAP[tier];

    // Convert chat messages to Gemini format
    const contents = opts.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    // Prepend system instruction if present
    const systemMsg = opts.messages.find(m => m.role === 'system');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: systemMsg
            ? { parts: [{ text: systemMsg.content }] }
            : undefined,
          generationConfig: {
            temperature: opts.temperature ?? 0.1,
            maxOutputTokens: opts.max_tokens ?? 2000,
            stopSequences: opts.stop,
          },
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${text}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return {
      content,
      model_used: model,
      provider: "gemini-direct",
      usage: data.usageMetadata
        ? {
            prompt_tokens: data.usageMetadata.promptTokenCount || 0,
            completion_tokens: data.usageMetadata.candidatesTokenCount || 0,
          }
        : undefined,
    };
  }

  /**
   * Select the best model tier based on query complexity
   */
  static selectTier(message: string): ModelTier {
    const len = message.length;
    const hasComplexIndicators =
      /\b(analyze|research|compare|synthesize|comprehensive|detailed)\b/i.test(message);

    if (hasComplexIndicators || len > 500) return 'powerful';
    if (len > 200) return 'balanced';
    return 'fast';
  }
}
