/**
 * GET /api/setup/models
 *
 * Fetches available models from OpenRouter API for setup.
 * NO AUTH REQUIRED - uses OpenRouter's public API.
 *
 * Returns curated list of top models with vision support,
 * plus Mistral direct API options.
 */
export default defineEventHandler(async () => {
  // Provider name mapping
  const providerMap: Record<string, string> = {
    google: 'Google',
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    'meta-llama': 'Meta',
    mistralai: 'Mistral AI',
    deepseek: 'DeepSeek',
    qwen: 'Qwen',
    cohere: 'Cohere',
    perplexity: 'Perplexity',
    microsoft: 'Microsoft',
    'x-ai': 'xAI',
    ai21: 'AI21',
    amazon: 'Amazon',
    'bytedance-seed': 'ByteDance',
  };

  // Priority providers to show first (in order)
  const priorityProviders = [
    'google',
    'anthropic',
    'openai',
    'mistralai',
    'meta-llama',
    'deepseek',
    'qwen',
  ];

  // Mistral direct API models (always included)
  const mistralModels = [
    {
      id: 'mistral-medium-latest',
      name: 'Mistral Medium',
      provider: 'Mistral AI',
      apiProvider: 'mistral',
      modalities: ['text', 'image'],
      context: '128K',
      price: '€2.00 / €6.00',
      description:
        'European alternative. Strong reasoning, native tool-calling.',
      flag: '🇪🇺',
    },
    {
      id: 'mistral-small-latest',
      name: 'Mistral Small',
      provider: 'Mistral AI',
      apiProvider: 'mistral',
      modalities: ['text', 'image'],
      context: '128K',
      price: '€0.20 / €0.60',
      description: 'Cost-effective European model. Great for everyday tasks.',
      flag: '🇪🇺',
    },
    {
      id: 'pixtral-large-latest',
      name: 'Pixtral Large',
      provider: 'Mistral AI',
      apiProvider: 'mistral',
      modalities: ['text', 'image'],
      context: '128K',
      price: '€2.00 / €6.00',
      description: 'Vision-focused model. Best for image understanding.',
      flag: '🇪🇺',
    },
  ];

  try {
    // Fetch from OpenRouter's public API (no auth required)
    const res = await $fetch<{
      data: Array<{
        id: string;
        name: string;
        description?: string;
        created?: number;
        pricing: {
          prompt: string;
          completion: string;
        };
        context_length: number;
        architecture?: {
          modality?: string;
        };
      }>;
    }>('https://openrouter.ai/api/v1/models', {
      headers: {
        'HTTP-Referer': 'https://gumm.dev',
        'X-Title': 'Gumm',
      },
    });

    if (!res?.data?.length) {
      // Fallback to Mistral only if OpenRouter fails
      return { models: mistralModels, providers: ['Mistral AI'] };
    }

    // Parse modality string
    const parseModalities = (
      modality?: string,
    ): { input: string[]; output: string[] } => {
      if (!modality) return { input: ['text'], output: ['text'] };
      const [inputStr, outputStr] = modality.split('->');
      const input = inputStr?.split('+').map((s) => s.trim()) || ['text'];
      const output = outputStr?.split('+').map((s) => s.trim()) || ['text'];
      return { input, output };
    };

    // Format price
    const formatPrice = (prompt: string, completion: string): string => {
      const promptPrice = parseFloat(prompt) * 1_000_000;
      const completionPrice = parseFloat(completion) * 1_000_000;
      if (promptPrice < 0.01 && completionPrice < 0.01) return 'Free';
      return `$${promptPrice.toFixed(2)} / $${completionPrice.toFixed(2)}`;
    };

    // Format context
    const formatContext = (length: number): string => {
      if (length >= 1_000_000) return `${(length / 1_000_000).toFixed(0)}M`;
      if (length >= 1000) return `${Math.round(length / 1000)}K`;
      return `${length}`;
    };

    // Filter and transform OpenRouter models
    const openrouterModels = res.data
      .filter((model) => {
        const mods = parseModalities(model.architecture?.modality);
        // Only models with text + image input
        return mods.input.includes('text') && mods.input.includes('image');
      })
      .map((model) => {
        const providerId = model.id.split('/')[0] ?? 'unknown';
        const mods = parseModalities(model.architecture?.modality);

        return {
          id: model.id,
          name: model.name.replace(/^[^:]+:\s*/, ''), // Remove provider prefix
          provider: providerMap[providerId] || providerId,
          providerId,
          apiProvider: 'openrouter',
          modalities: mods.input,
          context: formatContext(model.context_length),
          contextLength: model.context_length,
          price: formatPrice(model.pricing.prompt, model.pricing.completion),
          promptPrice: parseFloat(model.pricing.prompt) * 1_000_000,
          description: model.description?.slice(0, 100) || '',
          created: model.created || 0,
        };
      });

    // Sort: priority providers first, then by recency/popularity
    openrouterModels.sort((a, b) => {
      const aIdx = priorityProviders.indexOf(a.providerId);
      const bIdx = priorityProviders.indexOf(b.providerId);

      // Both in priority list - sort by priority order, then by recency
      if (aIdx !== -1 && bIdx !== -1) {
        if (aIdx !== bIdx) return aIdx - bIdx;
        return (b.created || 0) - (a.created || 0);
      }

      // Only one in priority list
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;

      // Neither in priority - sort by recency
      return (b.created || 0) - (a.created || 0);
    });

    // Take top models per provider (max 4 each for priority, 2 for others)
    const selectedModels: typeof openrouterModels = [];
    const providerCounts: Record<string, number> = {};

    for (const model of openrouterModels) {
      const maxPerProvider = priorityProviders.includes(model.providerId)
        ? 4
        : 2;
      const count = providerCounts[model.providerId] || 0;

      if (count < maxPerProvider) {
        selectedModels.push(model);
        providerCounts[model.providerId] = count + 1;
      }

      // Stop after ~30 models
      if (selectedModels.length >= 30) break;
    }

    // Mark recommended model (Gemini 2.5 Flash or latest Google model)
    const geminiFlash = selectedModels.find(
      (m) =>
        m.id.includes('gemini') &&
        m.id.includes('flash') &&
        m.id.includes('2.5'),
    );
    if (geminiFlash) {
      (geminiFlash as any).recommended = true;
    }

    // Combine OpenRouter + Mistral models
    const allModels = [...selectedModels, ...mistralModels];

    // Get unique providers
    const providers = [
      ...new Set(allModels.map((m) => m.provider)),
    ] as string[];

    return { models: allModels, providers };
  } catch (error) {
    console.warn('[setup/models] Failed to fetch from OpenRouter:', error);
    // Fallback to Mistral only
    return { models: mistralModels, providers: ['Mistral AI'] };
  }
});
