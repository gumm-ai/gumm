/**
 * POST /api/agent/llm-proxy
 *
 * Server-side proxy for CLI agent LLM calls.
 * The CLI sends the chat completion payload here (without an API key),
 * and this endpoint injects the real API key and streams the response
 * back from the LLM provider.
 *
 * This avoids sending the raw API key to remote CLI agents.
 */
import { getLLMConfig, detectProvider } from '../../utils/llm-provider';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const body = await readBody(event);
  if (!body?.messages || !Array.isArray(body.messages)) {
    throw createError({ statusCode: 400, message: 'Missing messages array' });
  }

  const brain = useBrain();
  await brain.ready();

  const config = await getLLMConfig(brain);

  // Override model if the CLI specifies one
  const model = body.model || config.model;
  const provider = detectProvider(model);

  let apiUrl: string;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };

  if (provider === 'mistral') {
    apiUrl = 'https://api.mistral.ai/v1/chat/completions';
  } else {
    apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    headers['HTTP-Referer'] = 'https://gumm.dev';
    headers['X-Title'] = 'Gumm CLI';
  }

  // Build the payload — forward what the CLI sent, use server-side key
  const payload: Record<string, unknown> = {
    model,
    messages: body.messages,
    stream: true,
  };
  if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
    payload.tools = body.tools;
    payload.tool_choice = body.tool_choice || 'auto';
  }

  // Stream the response from the LLM provider back to the CLI
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw createError({
      statusCode: response.status,
      message: `LLM provider error: ${errorBody.slice(0, 500)}`,
    });
  }

  // Pass through the SSE stream
  setResponseHeader(event, 'Content-Type', 'text/event-stream');
  setResponseHeader(event, 'Cache-Control', 'no-cache');
  setResponseHeader(event, 'Connection', 'keep-alive');

  return sendStream(event, response.body as ReadableStream);
});
