import type { ModuleContext } from '../../../../back/utils/brain';
import { handleSearch } from './search';
import { handleTrending } from './trending';
import {
  handlePlaylists,
  handlePlaylistItems,
  handleLikedMusic,
  handleCreatePlaylist,
  handleAddToPlaylist,
} from './playlists';
import { handleVideoDetails, handleRelated } from './videos';

export {
  handleSearch,
  handleTrending,
  handlePlaylists,
  handlePlaylistItems,
  handleLikedMusic,
  handleCreatePlaylist,
  handleAddToPlaylist,
  handleVideoDetails,
  handleRelated,
};

/**
 * Main handler router for YouTube Music module
 */
export async function routeHandler(
  toolName: string,
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  switch (toolName) {
    case 'ytmusic_search':
      return handleSearch(ctx, args);
    case 'ytmusic_trending':
      return handleTrending(ctx, args);
    case 'ytmusic_playlists':
      return handlePlaylists(ctx, args);
    case 'ytmusic_playlist_items':
      return handlePlaylistItems(ctx, args);
    case 'ytmusic_liked_music':
      return handleLikedMusic(ctx, args);
    case 'ytmusic_create_playlist':
      return handleCreatePlaylist(ctx, args);
    case 'ytmusic_add_to_playlist':
      return handleAddToPlaylist(ctx, args);
    case 'ytmusic_video_details':
      return handleVideoDetails(ctx, args);
    case 'ytmusic_related':
      return handleRelated(ctx, args);
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}
