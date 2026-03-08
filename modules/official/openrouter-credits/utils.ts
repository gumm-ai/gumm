import { OPENROUTER_API } from './constants';

export async function fetchBalance(apiKey: string) {
  const res = await fetch(`${OPENROUTER_API}/credits`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://gumm.dev',
      'X-Title': 'Gumm',
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data: { total_credits: number; total_usage: number };
  };
  return json?.data ?? null;
}

export async function fetchActivity(apiKey: string) {
  const res = await fetch(`${OPENROUTER_API}/activity?limit=200`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://gumm.dev',
      'X-Title': 'Gumm',
    },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data: Array<{
      model: string;
      total_cost: number;
      created_at: string;
      tokens_prompt: number;
      tokens_completion: number;
    }>;
  };
  return json?.data ?? [];
}
