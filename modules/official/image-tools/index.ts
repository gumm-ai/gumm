/**
 * Image Tools module — resize, crop, convert, rotate, filter images.
 *
 * Tools:
 *   - image_info    : get metadata (width, height, format, size, channels)
 *   - image_resize  : resize with fit mode (cover/contain/fill/inside/outside)
 *   - image_convert : convert format (jpeg, png, webp, avif, tiff) with quality
 *   - image_crop    : extract a rectangular region
 *   - image_rotate  : rotate by degrees (clockwise)
 *   - image_filter  : apply a filter (grayscale, blur, sharpen, negate, normalize, flip, flop)
 *
 * Images are loaded from Gumm storage (storageKey) or downloaded from a URL.
 * Processed images are saved back to Gumm storage and the new key is returned.
 */

export { tools } from './tools';
import { routeHandler } from './handlers';

export async function handler(
  toolName: string,
  args: Record<string, any>,
): Promise<string> {
  try {
    return await routeHandler(toolName, args);
  } catch (err) {
    return JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
