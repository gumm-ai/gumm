import type { ModuleContext } from '../../../../back/utils/brain';
import { getToken, getUserId, igPost } from '../utils';

export async function postImage(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  if (!args.imageUrl?.trim())
    return 'imageUrl is required (must be a public URL).';

  const [token, userId] = await Promise.all([getToken(ctx), getUserId(ctx)]);

  // Step 1: Create media container
  const containerBody: Record<string, any> = {
    image_url: args.imageUrl.trim(),
  };
  if (args.caption) containerBody['caption'] = args.caption.trim();

  const container = await igPost<{ id: string }>(
    `/${userId}/media`,
    token,
    containerBody,
  );

  if (!container.id) {
    return 'Failed to create Instagram media container.';
  }

  // Step 2: Publish
  const published = await igPost<{ id: string }>(
    `/${userId}/media_publish`,
    token,
    { creation_id: container.id },
  );

  const postId = published.id;
  return `Photo published on Instagram! 📸\nMedia ID: ${postId}`;
}

export async function postCarousel(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const imageUrls: string[] = args.imageUrls ?? [];
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    return 'Carousel requires between 2 and 10 images.';
  }

  const [token, userId] = await Promise.all([getToken(ctx), getUserId(ctx)]);

  // Step 1: Create individual item containers
  const itemIds: string[] = [];
  for (const url of imageUrls) {
    const item = await igPost<{ id: string }>(`/${userId}/media`, token, {
      image_url: url,
      is_carousel_item: true,
    });
    if (!item.id) return `Failed to create container for image: ${url}`;
    itemIds.push(item.id);
  }

  // Step 2: Create carousel container
  const carouselBody: Record<string, any> = {
    media_type: 'CAROUSEL',
    children: itemIds.join(','),
  };
  if (args.caption) carouselBody['caption'] = args.caption.trim();

  const carousel = await igPost<{ id: string }>(
    `/${userId}/media`,
    token,
    carouselBody,
  );

  if (!carousel.id) return 'Failed to create carousel container.';

  // Step 3: Publish
  const published = await igPost<{ id: string }>(
    `/${userId}/media_publish`,
    token,
    { creation_id: carousel.id },
  );

  return `Carousel published on Instagram! 🖼️\nMedia ID: ${published.id}`;
}

export async function replyComment(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  if (!args.commentId) return 'commentId is required.';
  if (!args.text?.trim()) return 'Reply text is required.';

  const token = await getToken(ctx);

  await igPost(`/${args.commentId}/replies`, token, {
    message: args.text.trim(),
  });

  return 'Comment reply posted on Instagram! 💬';
}
