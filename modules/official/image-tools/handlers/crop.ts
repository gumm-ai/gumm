import sharp from 'sharp';
import { storageSet } from '../../../../back/utils/storage';
import { loadImageBuffer, buildOutputKey } from '../utils';
import type { ImageResult } from '../types';

export async function handleCrop(args: Record<string, any>): Promise<string> {
  const { storageKey, url, left, top, width, height } = args;

  if (left == null || top == null || !width || !height) {
    throw new Error('"left", "top", "width", and "height" are all required.');
  }

  const { buffer, sourceKey } = await loadImageBuffer(storageKey, url);

  const cropped = await sharp(buffer)
    .extract({
      left: Math.max(0, Math.round(left)),
      top: Math.max(0, Math.round(top)),
      width: Math.round(width),
      height: Math.round(height),
    })
    .toBuffer({ resolveWithObject: true });

  const outKey = buildOutputKey(sourceKey, 'crop');
  await storageSet(outKey, cropped.data);

  const result: ImageResult = {
    success: true,
    storageKey: outKey,
    width: cropped.info.width,
    height: cropped.info.height,
    format: cropped.info.format,
    size: cropped.info.size,
  };

  return JSON.stringify(result);
}
