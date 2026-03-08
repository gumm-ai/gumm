/**
 * Web Browse module — search the web and read any page.
 *
 * Tools:
 *   - web_search: full-text web search via DuckDuckGo (no API key)
 *   - web_fetch:  fetch and read any URL as clean text
 *
 * No external API keys required. SSRF protection is built-in.
 */

export { tools } from './tools';
import { routeHandler } from './handlers';

export async function handler(
  toolName: string,
  args: Record<string, any>,
): Promise<string> {
  try {
    return await routeHandler(toolName, args);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
