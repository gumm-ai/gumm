import sharp from 'sharp';
import { storageSet } from '../../../../back/utils/storage';
import { loadImageBuffer, buildOutputKey } from '../utils';
import type { OutputFormat, ImageResult } from '../types';

export async function handleConvert(
  args: Record<string, any>,
): Promise<string> {
  const { storageKey, url, format, quality = 85 } = args;

  const { buffer, sourceKey } = await loadImageBuffer(storageKey, url);

  let pipeline = sharp(buffer);

  switch (format as OutputFormat) {
    case 'jpeg':
      pipeline = pipeline.jpeg({
        quality: Math.min(100, Math.max(1, quality)),
      });
      break;
    case 'png':
      pipeline = pipeline.png();
      break;
    case 'webp':
      pipeline = pipeline.webp({
        quality: Math.min(100, Math.max(1, quality)),
      });
      break;
    case 'avif':
      pipeline = pipeline.avif({
        quality: Math.min(100, Math.max(1, quality)),
      });
      break;
    case 'tiff':
      pipeline = pipeline.tiff();
      break;
    default:
      throw new Error(
        `Unsupported format: "${format}". Supported: jpeg, png, webp, avif, tiff.`,
      );
  }

  const converted = await pipeline.toBuffer({ resolveWithObject: true });
  const outKey = buildOutputKey(sourceKey, 'convert', format as OutputFormat);
  await storageSet(outKey, converted.data);

  const result: ImageResult = {
    success: true,
    storageKey: outKey,
    width: converted.info.width,
    height: converted.info.height,
    format: converted.info.format,
    size: converted.info.size,
  };

  return JSON.stringify(result);
}
