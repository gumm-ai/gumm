/**
 * LLM Provider abstraction
 *
 * Handles routing to different LLM providers (OpenRouter, Mistral).
 * Detects provider from model ID and makes appropriate API calls.
 */

export type LLMProvider = 'openrouter' | 'mistral';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey: string;
}

export interface LLMMessage {
  role: string;
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface LLMTool {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

export interface LLMRequestOptions {
  messages: LLMMessage[];
  tools?: LLMTool[];
  tool_choice?: string;
}

/**
 * Detects the LLM provider from the model ID.
 * Mistral models don't have a prefix (they're direct API).
 * OpenRouter models have a provider/model format.
 */
export function detectProvider(modelId: string): LLMProvider {
  if (
    modelId.startsWith('mistral-') ||
    modelId.startsWith('codestral') ||
    modelId.startsWith('pixtral')
  ) {
    return 'mistral';
  }
  return 'openrouter';
}

/**
 * Makes a chat completion request to the appropriate LLM provider.
 */
export async function callLLM(
  config: LLMConfig,
  options: LLMRequestOptions,
): Promise<any> {
  const payload: any = {
    model: config.model,
    messages: options.messages,
  };

  if (options.tools && options.tools.length > 0) {
    payload.tools = options.tools;
    payload.tool_choice = options.tool_choice || 'auto';
  }

  const MAX_RETRIES = 2;
  let response: any;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (config.provider === 'mistral') {
        response = await $fetch<any>(
          'https://api.mistral.ai/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: payload,
          },
        );
      } else {
        // OpenRouter
        response = await $fetch<any>(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://gumm.dev',
              'X-Title': 'Gumm',
            },
            body: payload,
          },
        );
      }
      break;
    } catch (err: any) {
      const status = err?.statusCode || err?.status || err?.response?.status;
      if (attempt < MAX_RETRIES && [502, 503, 429].includes(status)) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  return response;
}

/**
 * Gets the LLM configuration from brain settings.
 */
export async function getLLMConfig(brain: any): Promise<LLMConfig> {
  const model =
    (await brain.getConfig('llm.model')) ||
    'google/gemini-2.5-flash-preview-05-20';
  const provider = detectProvider(model);

  let apiKey: string | null = null;

  if (provider === 'mistral') {
    apiKey = await brain.getConfig('mistral.apiKey');
    if (!apiKey) {
      throw new Error(
        'Mistral API key not configured. Set it in Brain settings.',
      );
    }
  } else {
    apiKey = await brain.getConfig('openrouter.apiKey');
    if (!apiKey) {
      throw new Error(
        'OpenRouter API key not configured. Set it in Brain settings.',
      );
    }
  }

  return {
    provider,
    model,
    apiKey,
  };
}

/**
 * Returns a user-friendly provider name.
 */
export function getProviderDisplayName(provider: LLMProvider): string {
  switch (provider) {
    case 'mistral':
      return 'Mistral AI';
    case 'openrouter':
      return 'OpenRouter';
    default:
      return provider;
  }
}
