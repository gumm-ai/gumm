import type { SearchResult } from '../types';
import {
  DDGO_LITE_URL,
  MAX_RESULTS,
  USER_AGENT,
  FETCH_TIMEOUT_MS,
} from '../constants';
import { decodeHtmlEntities, extractDDGUrl } from '../utils';

export async function handleSearch(
  query: string,
  maxResults = MAX_RESULTS,
): Promise<string> {
  const limit = Math.min(Math.max(1, maxResults), MAX_RESULTS);

  const body = new URLSearchParams({ q: query });

  const res = await fetch(DDGO_LITE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
      Accept: 'text/html',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Search request failed: HTTP ${res.status}`);
  }

  const html = await res.text();
  const results = parseDDGLiteResults(html, limit);

  if (results.length === 0) {
    return JSON.stringify({
      query,
      results: [],
      message: 'No results found. Try rephrasing your query.',
    });
  }

  return JSON.stringify({ query, results });
}

/**
 * Parse search results from DuckDuckGo Lite HTML.
 *
 * DDG Lite returns a table layout where each result is two consecutive <tr>s:
 *   <tr class="result-title"> → contains <a class="result-link">
 *   <tr class="result-snippet"> → contains snippet text
 */
function parseDDGLiteResults(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];

  // Extract all result-link anchors (title + URL)
  const linkRe =
    /<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  // Extract all result-snippet cells
  const snippetRe = /<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

  const links: Array<{ url: string; title: string }> = [];
  let m: RegExpExecArray | null;

  while ((m = linkRe.exec(html)) !== null && links.length < limit) {
    const rawUrl = m[1] ?? '';
    const rawTitle = m[2] ?? '';
    const url = extractDDGUrl(rawUrl);
    const title = decodeHtmlEntities(rawTitle.replace(/<[^>]+>/g, '').trim());
    if (url && title) {
      links.push({ url, title });
    }
  }

  const snippets: string[] = [];
  while ((m = snippetRe.exec(html)) !== null && snippets.length < limit) {
    const snippet = decodeHtmlEntities(
      (m[1] ?? '').replace(/<[^>]+>/g, '').trim(),
    );
    snippets.push(snippet);
  }

  for (let i = 0; i < links.length; i++) {
    results.push({
      title: links[i]!.title,
      url: links[i]!.url,
      snippet: snippets[i] ?? '',
    });
  }

  return results;
}
