/**
 * HTML utilities for the web-browse module.
 * All parsing is done with regex — no external dependencies needed.
 */

/** Decode common HTML entities into plain text. */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(parseInt(code, 10)),
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) =>
      String.fromCharCode(parseInt(code, 16)),
    );
}

/** Convert raw HTML to readable plain text. */
export function stripHtml(html: string): string {
  // Remove <head> entirely
  let text = html.replace(/<head[\s\S]*?<\/head>/gi, '');
  // Remove scripts and styles
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  // Insert newlines before block-level elements
  text = text.replace(
    /<\/?(p|div|br|li|h[1-6]|tr|td|th|section|article|header|footer|nav|main|aside|blockquote|pre)[^>]*>/gi,
    '\n',
  );
  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode entities
  text = decodeHtmlEntities(text);
  // Normalize whitespace: collapse multiple blank lines
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n[ \t]*\n[ \t]*\n/g, '\n\n');
  return text.trim();
}

/** Extract the <title> of an HTML page. */
export function extractTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? decodeHtmlEntities(match[1]?.trim() ?? '') : '';
}

/**
 * Decode the real destination URL from a DuckDuckGo redirect link.
 * DDG Lite wraps URLs like: //duckduckgo.com/l/?uddg=https%3A%2F%2F...
 */
export function extractDDGUrl(href: string): string {
  try {
    const full = href.startsWith('//') ? 'https:' + href : href;
    const url = new URL(full);
    if (
      url.hostname === 'duckduckgo.com' ||
      url.hostname === 'lite.duckduckgo.com'
    ) {
      const uddg = url.searchParams.get('uddg');
      if (uddg) return decodeURIComponent(uddg);
    }
  } catch {
    // fall through — return raw href
  }
  return href;
}

/**
 * SSRF protection — returns true if the URL targets a private/internal host.
 * Blocks localhost, link-local, RFC-1918 ranges, and common internal suffixes.
 */
export function isPrivateUrl(url: URL): boolean {
  const h = url.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  // Plain hostname checks
  if (
    h === 'localhost' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.localhost')
  ) {
    return true;
  }

  // IPv4 private/reserved ranges
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (
      a === 10 || // 10.0.0.0/8
      a === 127 || // 127.0.0.0/8 loopback
      a === 0 || // 0.0.0.0/8
      (a === 192 && b === 168) || // 192.168.0.0/16
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 169 && b === 254) // 169.254.0.0/16 link-local
    ) {
      return true;
    }
  }

  // IPv6 private / ULA / link-local
  if (
    h === '::1' ||
    h.startsWith('fc') ||
    h.startsWith('fd') ||
    h.startsWith('fe80')
  ) {
    return true;
  }

  return false;
}
