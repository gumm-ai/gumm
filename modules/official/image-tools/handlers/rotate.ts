import sharp from 'sharp';
import { storageSet } from '../../../../back/utils/storage';
import { loadImageBuffer, buildOutputKey } from '../utils';
import type { ImageResult } from '../types';

export async function handleRotate(args: Record<string, any>): Promise<string> {
  const { storageKey, url, angle, background = 'transparent' } = args;

  if (angle == null) throw new Error('"angle" is required.');

  const { buffer, sourceKey } = await loadImageBuffer(storageKey, url);

  const rotated = await sharp(buffer)
    .rotate(Math.round(angle), { background })
    .toBuffer({ resolveWithObject: true });

  const outKey = buildOutputKey(sourceKey, 'rotate');
  await storageSet(outKey, rotated.data);

  const result: ImageResult = {
    success: true,
    storageKey: outKey,
    width: rotated.info.width,
    height: rotated.info.height,
    format: rotated.info.format,
    size: rotated.info.size,
  };

  return JSON.stringify(result);
}
