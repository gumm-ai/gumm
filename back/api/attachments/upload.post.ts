/**
 * POST /api/attachments/upload
 *
 * Accepts a file upload (multipart form data) and stores it in Gumm storage.
 * Used by the CLI agent to upload local files so they can be sent via Telegram, etc.
 *
 * Returns: { storageKey, filename, mimeType, size }
 */
import { storageSet } from '../../utils/storage';

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

  const formData = await readMultipartFormData(event);
  if (!formData || formData.length === 0) {
    throw createError({
      statusCode: 400,
      message:
        'No file provided. Send multipart form data with a "file" field.',
    });
  }

  const filePart = formData.find((p) => p.name === 'file');
  if (!filePart || !filePart.data) {
    throw createError({
      statusCode: 400,
      message: 'Missing "file" field in multipart form data.',
    });
  }

  const originalFilename = filePart.filename || `upload_${Date.now()}`;
  // Sanitize filename
  const safeFilename = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = safeFilename.split('.').pop()?.toLowerCase() || 'bin';
  const storageKey = `attachments/cli/${Date.now()}_${safeFilename}`;

  const buffer = Buffer.from(filePart.data);
  await storageSet(storageKey, buffer);

  const mimeType = filePart.type || MIME_MAP[ext] || 'application/octet-stream';

  return {
    storageKey,
    filename: safeFilename,
    mimeType,
    size: buffer.length,
  };
});
