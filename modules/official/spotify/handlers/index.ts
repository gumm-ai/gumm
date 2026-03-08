import type { ModuleContext } from '../../../../back/utils/brain';
import { handleNowPlaying, handleRecentlyPlayed } from './player';
import { handleTopItems, handleRecommendations } from './library';
import { handleSearch } from './search';
import {
  handlePlaylists,
  handlePlaylistTracks,
  handleCreatePlaylist,
  handleAddToPlaylist,
} from './playlists';

export {
  handleNowPlaying,
  handleRecentlyPlayed,
  handleTopItems,
  handleRecommendations,
  handleSearch,
  handlePlaylists,
  handlePlaylistTracks,
  handleCreatePlaylist,
  handleAddToPlaylist,
};

/**
 * Main handler router for Spotify module
 */
export async function routeHandler(
  toolName: string,
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  switch (toolName) {
    case 'spotify_now_playing':
      return handleNowPlaying(ctx);
    case 'spotify_recently_played':
      return handleRecentlyPlayed(ctx, args);
    case 'spotify_top_items':
      return handleTopItems(ctx, args);
    case 'spotify_search':
      return handleSearch(ctx, args);
    case 'spotify_recommendations':
      return handleRecommendations(ctx, args);
    case 'spotify_playlists':
      return handlePlaylists(ctx, args);
    case 'spotify_playlist_tracks':
      return handlePlaylistTracks(ctx, args);
    case 'spotify_create_playlist':
      return handleCreatePlaylist(ctx, args);
    case 'spotify_add_to_playlist':
      return handleAddToPlaylist(ctx, args);
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}
