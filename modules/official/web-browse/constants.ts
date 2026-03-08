/** DuckDuckGo Lite search endpoint (POST, no API key needed). */
export const DDGO_LITE_URL = 'https://lite.duckduckgo.com/lite/';

/** Maximum search results to return. */
export const MAX_RESULTS = 8;

/** Maximum characters to return when fetching a page (roughly 2k tokens). */
export const MAX_CONTENT_LENGTH = 8000;

/** HTTP timeout in milliseconds. */
export const FETCH_TIMEOUT_MS = 15000;

/** User-Agent sent with all outgoing requests. */
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
