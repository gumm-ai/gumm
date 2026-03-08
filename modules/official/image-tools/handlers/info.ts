import sharp from 'sharp';
import { loadImageBuffer } from '../utils';
import type { ImageMetadata } from '../types';

export async function handleInfo(args: Record<string, any>): Promise<string> {
  const { storageKey, url } = args;
  const { buffer, sourceKey } = await loadImageBuffer(storageKey, url);

  const meta = await sharp(buffer).metadata();

  const result: ImageMetadata = {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    format: meta.format ?? 'unknown',
    channels: meta.channels ?? 0,
    hasAlpha: meta.hasAlpha ?? false,
    size: buffer.length,
    storageKey: sourceKey,
  };

  return JSON.stringify(result);
}
