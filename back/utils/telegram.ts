/**
 * Telegram Bot API helper.
 *
 * Sends messages and manages webhook configuration.
 * Bot token is stored in brain_config under `telegram.botToken`.
 */
import { eq } from 'drizzle-orm';
import { commands } from '../db/schema';

const TELEGRAM_API = 'https://api.telegram.org';

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  performer?: string;
  title?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  thumbnail?: TelegramPhotoSize;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      type: 'private' | 'group' | 'supergroup' | 'channel';
    };
    date: number;
    text?: string;
    photo?: TelegramPhotoSize[];
    voice?: TelegramVoice;
    audio?: TelegramAudio;
    document?: TelegramDocument;
    caption?: string;
  };
}

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
}

// ── Core API call ───────────────────────────────────────────────────────

async function telegramApi<T = any>(
  token: string,
  method: string,
  body?: Record<string, any>,
): Promise<T> {
  const res = await $fetch<{ ok: boolean; result: T; description?: string }>(
    `${TELEGRAM_API}/bot${token}/${method}`,
    {
      method: 'POST',
      body,
    },
  );
  if (!res.ok)
    throw new Error(res.description || `Telegram API error: ${method}`);
  return res.result;
}

// ── Public helpers ──────────────────────────────────────────────────────

/**
 * Convert LLM Markdown to Telegram-safe HTML.
 * Handles: bold, italic, code, links, and HTML-escaping.
 */
export function markdownToTelegramHtml(md: string): string {
  let html = md;

  // Escape HTML entities first (before inserting tags)
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks: ```lang\n...\n``` → <pre>...</pre>
  html = html.replace(
    /```[\w]*\n([\s\S]*?)```/g,
    (_m, code) => `<pre>${code.trim()}</pre>`,
  );

  // Inline code: `...` → <code>...</code>
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold: **text** or __text__
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  html = html.replace(/__(.+?)__/g, '<b>$1</b>');

  // Italic: *text* or _text_ (not inside words)
  html = html.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, '<i>$1</i>');
  html = html.replace(/(?<!\w)_([^_]+?)_(?!\w)/g, '<i>$1</i>');

  // Links: [text](url) → <a href="url">text</a>
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Strikethrough: ~~text~~
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');

  return html;
}

/**
 * Send a message to Telegram with Markdown→HTML conversion.
 * Falls back to plain text if the HTML is rejected by Telegram.
 */
export async function telegramSendMarkdown(
  token: string,
  chatId: number | string,
  text: string,
) {
  const html = markdownToTelegramHtml(text);
  try {
    return await telegramApi(token, 'sendMessage', {
      chat_id: chatId,
      text: html,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch {
    // HTML rejected — send as plain text
    return await telegramApi(token, 'sendMessage', {
      chat_id: chatId,
      text,
    });
  }
}

export async function telegramSendMessage(
  token: string,
  chatId: number | string,
  text: string,
  parseMode: 'Markdown' | 'HTML' | '' = 'Markdown',
) {
  return telegramApi(token, 'sendMessage', {
    chat_id: chatId,
    text,
    ...(parseMode ? { parse_mode: parseMode } : {}),
  });
}

export async function telegramSendChatAction(
  token: string,
  chatId: number | string,
  action = 'typing',
) {
  return telegramApi(token, 'sendChatAction', {
    chat_id: chatId,
    action,
  });
}

export async function telegramSetWebhook(token: string, url: string) {
  return telegramApi(token, 'setWebhook', {
    url,
    allowed_updates: ['message'],
  });
}

export async function telegramDeleteWebhook(token: string) {
  return telegramApi(token, 'deleteWebhook', { drop_pending_updates: true });
}

export async function telegramGetMe(token: string): Promise<TelegramBotInfo> {
  return telegramApi<TelegramBotInfo>(token, 'getMe');
}

export async function telegramGetWebhookInfo(token: string) {
  return telegramApi(token, 'getWebhookInfo');
}

export async function telegramGetUpdates(
  token: string,
  offset?: number,
  timeout = 30,
): Promise<TelegramUpdate[]> {
  return telegramApi<TelegramUpdate[]>(token, 'getUpdates', {
    offset,
    timeout,
    allowed_updates: ['message'],
  });
}

// ── Photo helpers ───────────────────────────────────────────────────────

/**
 * Get the file path for a Telegram file, needed to build the download URL.
 */
export async function telegramGetFile(
  token: string,
  fileId: string,
): Promise<{ file_path: string }> {
  return telegramApi<{ file_path: string }>(token, 'getFile', {
    file_id: fileId,
  });
}

/**
 * Download a Telegram photo and return it as a base64 data URI.
 * Picks the largest resolution from the photo array.
 */
export async function telegramDownloadPhotoAsBase64(
  token: string,
  photos: TelegramPhotoSize[],
): Promise<string | null> {
  if (!photos.length) return null;

  // Telegram sends multiple sizes; pick the largest
  const best = photos.reduce((a, b) =>
    a.width * a.height >= b.width * b.height ? a : b,
  );

  try {
    const file = await telegramGetFile(token, best.file_id);
    const url = `${TELEGRAM_API}/file/bot${token}/${file.file_path}`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    // Detect mime type from file path
    const ext = file.file_path.split('.').pop()?.toLowerCase() || 'jpg';
    const mime =
      ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';

    return `data:${mime};base64,${base64}`;
  } catch (err) {
    console.error('[Telegram] Failed to download photo:', err);
    return null;
  }
}

// ── Audio helpers ────────────────────────────────────────────────────────

/**
 * Download a Telegram file (voice/audio) and return it as base64 with format info.
 */
export async function telegramDownloadAudioAsBase64(
  token: string,
  fileId: string,
): Promise<{ base64: string; format: string } | null> {
  try {
    const file = await telegramGetFile(token, fileId);
    const url = `${TELEGRAM_API}/file/bot${token}/${file.file_path}`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    const ext = file.file_path.split('.').pop()?.toLowerCase() || 'ogg';
    const formatMap: Record<string, string> = {
      oga: 'ogg',
      ogg: 'ogg',
      mp3: 'mp3',
      wav: 'wav',
      flac: 'flac',
      webm: 'webm',
      m4a: 'mp4',
    };
    const format = formatMap[ext] || 'ogg';

    return { base64, format };
  } catch (err) {
    console.error('[Telegram] Failed to download audio:', err);
    return null;
  }
}

// ── File storage helper ──────────────────────────────────────────────────

/**
 * Download a Telegram file and persist it to Gumm storage.
 * Returns the storageKey and detected metadata.
 */
export async function telegramDownloadFileToStorage(
  token: string,
  fileId: string,
  filenameHint?: string,
): Promise<{
  storageKey: string;
  filename: string;
  mimeType: string;
  size: number;
} | null> {
  try {
    const file = await telegramGetFile(token, fileId);
    const url = `${TELEGRAM_API}/file/bot${token}/${file.file_path}`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());

    const ext = file.file_path.split('.').pop()?.toLowerCase() || 'bin';
    const basename = filenameHint
      ? filenameHint.replace(/[^a-zA-Z0-9._-]/g, '_')
      : `${Date.now()}.${ext}`;
    const storageKey = `attachments/telegram/${basename}`;

    const { storageSet } = await import('./storage');
    await storageSet(storageKey, buffer);

    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      mp3: 'audio/mpeg',
      ogg: 'audio/ogg',
      oga: 'audio/ogg',
      wav: 'audio/wav',
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      zip: 'application/zip',
      txt: 'text/plain',
      csv: 'text/csv',
      json: 'application/json',
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';

    return { storageKey, filename: basename, mimeType, size: buffer.length };
  } catch (err) {
    console.error('[Telegram] Failed to download file to storage:', err);
    return null;
  }
}

// ── Send file helpers ───────────────────────────────────────────────────

/**
 * Send a photo to a Telegram chat from a Buffer.
 */
export async function telegramSendPhoto(
  token: string,
  chatId: number | string,
  photo: Buffer,
  filename: string,
  caption?: string,
) {
  const formData = new FormData();
  formData.append('chat_id', String(chatId));
  formData.append('photo', new Blob([photo]), filename);
  if (caption) formData.append('caption', caption);

  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendPhoto`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram sendPhoto error: ${err}`);
  }
  return res.json();
}

/**
 * Send a document to a Telegram chat from a Buffer.
 */
export async function telegramSendDocument(
  token: string,
  chatId: number | string,
  document: Buffer,
  filename: string,
  caption?: string,
) {
  const formData = new FormData();
  formData.append('chat_id', String(chatId));
  formData.append('document', new Blob([document]), filename);
  if (caption) formData.append('caption', caption);

  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendDocument`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram sendDocument error: ${err}`);
  }
  return res.json();
}

// ── Token helper ────────────────────────────────────────────────────────

export async function getTelegramToken(): Promise<string | null> {
  // Prefer environment variable (set by setup-server.sh)
  const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (envToken) return envToken;

  // Fallback to brain config (for manual setup via dashboard)
  try {
    const brain = useBrain();
    await brain.ready();
    return await brain.getConfig('telegram.botToken');
  } catch {
    return null;
  }
}

export async function getTelegramAllowedChats(): Promise<number[]> {
  // Prefer environment variable (set by setup-server.sh)
  const envChatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (envChatId) {
    return envChatId.split(',').map(Number).filter(Boolean);
  }

  // Fallback to brain config
  try {
    const brain = useBrain();
    await brain.ready();
    const raw = await brain.getConfig('telegram.allowedChatIds');
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(Number);
    return String(raw).split(',').map(Number).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Register slash commands in the Telegram bot menu (setMyCommands).
 * Syncs all enabled commands from the DB so they appear in the autocomplete UI.
 */
export async function syncCommandsWithTelegram(): Promise<void> {
  const token = await getTelegramToken();
  if (!token) return;

  try {
    const db = useDrizzle();
    const enabledCommands = await db
      .select({
        name: commands.name,
        shortDescription: commands.shortDescription,
      })
      .from(commands)
      .where(eq(commands.enabled, true));

    const telegramCommands = enabledCommands.map((cmd) => ({
      command: cmd.name.slice(0, 32),
      description: (cmd.shortDescription || cmd.name).slice(0, 256),
    }));

    await telegramApi(token, 'setMyCommands', {
      commands: telegramCommands,
    });

    console.log(
      `[Telegram] Synced ${telegramCommands.length} commands to bot menu.`,
    );
  } catch (err: any) {
    console.warn('[Telegram] Failed to sync commands:', err.message);
  }
}
