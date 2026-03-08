import { storageGet, storageSet } from '../../../back/utils/storage';
import {
  FETCH_TIMEOUT_MS,
  MAX_SOURCE_SIZE,
  PROCESSED_PREFIX,
  USER_AGENT,
} from './constants';
import type { OutputFormat } from './types';

/**
 * Load an image buffer from a Gumm storage key or a remote URL.
 * Returns the buffer and the resolved storage key (URL sources are saved to a temp key).
 */
export async function loadImageBuffer(
  storageKey?: string,
  url?: string,
): Promise<{ buffer: Buffer; sourceKey: string }> {
  if (storageKey) {
    const buffer = await storageGet(storageKey);
    if (!buffer) throw new Error(`Image not found in storage: "${storageKey}"`);
    if (buffer.length > MAX_SOURCE_SIZE) {
      throw new Error(
        `Image too large (${Math.round(buffer.length / 1024 / 1024)} MB). Maximum is ${MAX_SOURCE_SIZE / 1024 / 1024} MB.`,
      );
    }
    return { buffer, sourceKey: storageKey };
  }

  if (url) {
    // SSRF protection — only allow http/https
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid URL: "${url}"`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http and https URLs are allowed.');
    }
    if (isPrivateHost(parsed.hostname)) {
      throw new Error(
        `Access denied: "${parsed.hostname}" is a private/internal address.`,
      );
    }

    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!res.ok)
      throw new Error(`Failed to fetch image: HTTP ${res.status} — ${url}`);

    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength > MAX_SOURCE_SIZE) {
      throw new Error(
        `Remote image too large (max ${MAX_SOURCE_SIZE / 1024 / 1024} MB).`,
      );
    }
    const buffer = Buffer.from(arrayBuf);

    // Save to temp storage so it can be referenced later
    const filename =
      parsed.pathname
        .split('/')
        .pop()
        ?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'image';
    const tempKey = `${PROCESSED_PREFIX}/url_${Date.now()}_${filename}`;
    await storageSet(tempKey, buffer);

    return { buffer, sourceKey: tempKey };
  }

  throw new Error('Either "storageKey" or "url" must be provided.');
}

/**
 * Generate an output storage key based on the source key and operation.
 */
export function buildOutputKey(
  sourceKey: string,
  operation: string,
  format?: OutputFormat,
): string {
  const parts = sourceKey.split('/');
  const base = parts[parts.length - 1] ?? 'image';
  const nameWithoutExt = base.replace(/\.[^.]+$/, '');
  const ext = format ?? base.split('.').pop() ?? 'jpg';
  return `${PROCESSED_PREFIX}/${operation}_${Date.now()}_${nameWithoutExt}.${ext}`;
}

/**
 * Block known private/internal IP ranges and hostnames (SSRF protection).
 */
function isPrivateHost(hostname: string): boolean {
  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return true;
  }
  // IPv4 private ranges
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return true;
    }
  }
  // IPv6 loopback / link-local
  if (
    hostname === '::1' ||
    hostname.startsWith('fe80:') ||
    hostname.startsWith('fc') ||
    hostname.startsWith('fd')
  ) {
    return true;
  }
  return false;
}
