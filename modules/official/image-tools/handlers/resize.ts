import sharp from 'sharp';
import { storageSet } from '../../../../back/utils/storage';
import { loadImageBuffer, buildOutputKey } from '../utils';
import type { FitMode, ImageResult } from '../types';

export async function handleResize(args: Record<string, any>): Promise<string> {
  const { storageKey, url, width, height, fit = 'cover' } = args;

  if (!width && !height) {
    throw new Error('At least one of "width" or "height" must be provided.');
  }

  const { buffer, sourceKey } = await loadImageBuffer(storageKey, url);

  const resized = await sharp(buffer)
    .resize({
      width: width ? Math.round(width) : undefined,
      height: height ? Math.round(height) : undefined,
      fit: (fit as FitMode) ?? 'cover',
      withoutEnlargement: false,
    })
    .toBuffer({ resolveWithObject: true });

  const outKey = buildOutputKey(sourceKey, 'resize');
  await storageSet(outKey, resized.data);

  const result: ImageResult = {
    success: true,
    storageKey: outKey,
    width: resized.info.width,
    height: resized.info.height,
    format: resized.info.format,
    size: resized.info.size,
  };

  return JSON.stringify(result);
}
