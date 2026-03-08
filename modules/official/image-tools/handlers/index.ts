import { handleInfo } from './info';
import { handleResize } from './resize';
import { handleConvert } from './convert';
import { handleCrop } from './crop';
import { handleRotate } from './rotate';
import { handleFilter } from './filter';

export async function routeHandler(
  toolName: string,
  args: Record<string, any>,
): Promise<string> {
  if (!args.storageKey && !args.url) {
    return 'Error: either "storageKey" or "url" must be provided to identify the source image.';
  }

  switch (toolName) {
    case 'image_info':
      return handleInfo(args);
    case 'image_resize':
      return handleResize(args);
    case 'image_convert':
      return handleConvert(args);
    case 'image_crop':
      return handleCrop(args);
    case 'image_rotate':
      return handleRotate(args);
    case 'image_filter':
      return handleFilter(args);
    default:
      return `Unknown tool: ${toolName}`;
  }
}
