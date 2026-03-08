import sharp from 'sharp';
import { storageSet } from '../../../../back/utils/storage';
import { loadImageBuffer, buildOutputKey } from '../utils';
import type { FilterType, ImageResult } from '../types';

export async function handleFilter(args: Record<string, any>): Promise<string> {
  const { storageKey, url, filter, blur_sigma = 2 } = args;

  if (!filter) throw new Error('"filter" is required.');

  const { buffer, sourceKey } = await loadImageBuffer(storageKey, url);

  let pipeline = sharp(buffer);

  switch (filter as FilterType) {
    case 'grayscale':
      pipeline = pipeline.grayscale();
      break;
    case 'blur': {
      const sigma = Math.min(1000, Math.max(0.3, Number(blur_sigma)));
      pipeline = pipeline.blur(sigma);
      break;
    }
    case 'sharpen':
      pipeline = pipeline.sharpen();
      break;
    case 'negate':
      pipeline = pipeline.negate();
      break;
    case 'normalize':
      pipeline = pipeline.normalize();
      break;
    case 'flip':
      pipeline = pipeline.flip();
      break;
    case 'flop':
      pipeline = pipeline.flop();
      break;
    default:
      throw new Error(
        `Unknown filter: "${filter}". Supported: grayscale, blur, sharpen, negate, normalize, flip, flop.`,
      );
  }

  const filtered = await pipeline.toBuffer({ resolveWithObject: true });
  const outKey = buildOutputKey(sourceKey, filter as string);
  await storageSet(outKey, filtered.data);

  const result: ImageResult = {
    success: true,
    storageKey: outKey,
    width: filtered.info.width,
    height: filtered.info.height,
    format: filtered.info.format,
    size: filtered.info.size,
  };

  return JSON.stringify(result);
}
