import { MAX_CONTENT_LENGTH, USER_AGENT, FETCH_TIMEOUT_MS } from '../constants';
import { stripHtml, extractTitle, isPrivateUrl } from '../utils';

export async function handleFetch(url: string): Promise<string> {
  // Validate URL structure
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: "${url}"`);
  }

  // Only allow http / https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Unsupported protocol "${parsed.protocol}". Only http and https are allowed.`,
    );
  }

  // SSRF protection — block private/internal hosts
  if (isPrivateUrl(parsed)) {
    throw new Error(
      `Access denied: "${parsed.hostname}" resolves to a private or internal address.`,
    );
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  }

  const contentType = res.headers.get('content-type') ?? '';

  // Non-text content: return a description instead of binary data
  if (
    !contentType.includes('text/html') &&
    !contentType.includes('application/xhtml+xml') &&
    !contentType.includes('text/plain')
  ) {
    return JSON.stringify({
      url,
      title: '',
      content: `[Non-text content type: ${contentType}]`,
      truncated: false,
    });
  }

  const html = await res.text();
  const title = extractTitle(html);
  let content = stripHtml(html);

  const truncated = content.length > MAX_CONTENT_LENGTH;
  if (truncated) {
    content =
      content.slice(0, MAX_CONTENT_LENGTH) +
      '\n\n[Content truncated — use a more specific URL or search for a summary.]';
  }

  return JSON.stringify({ url, title, content, truncated });
}
