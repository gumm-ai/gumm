/**
 * GET /api/attachments/:path
 *
 * Serves files from Gumm storage. Requires authentication.
 * Only serves files under the `attachments/` prefix for safety.
 */
import { storageGet, storageInfo } from '../../utils/storage';

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  zip: 'application/zip',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
};

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const pathParam = getRouterParam(event, 'path');
  if (!pathParam) {
    throw createError({ statusCode: 400, message: 'Path is required' });
  }

  // Only serve files under attachments/ prefix
  const storageKey = `attachments/${pathParam}`;

  const info = await storageInfo(storageKey);
  if (!info) {
    throw createError({ statusCode: 404, message: 'File not found' });
  }

  const data = await storageGet(storageKey);
  if (!data) {
    throw createError({ statusCode: 404, message: 'File not found' });
  }

  const ext = pathParam.split('.').pop()?.toLowerCase() || '';
  const contentType = MIME_MAP[ext] || 'application/octet-stream';

  setResponseHeaders(event, {
    'Content-Type': contentType,
    'Content-Length': String(data.length),
    'Cache-Control': 'private, max-age=3600',
  });

  return data;
});
