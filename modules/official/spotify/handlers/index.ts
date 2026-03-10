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
import {
  handlePlay,
  handlePause,
  handleNext,
  handlePrevious,
  handleVolume,
  handleShuffle,
  handleRepeat,
  handleDevices,
  handleQueue,
} from './playback';

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
  handlePlay,
  handlePause,
  handleNext,
  handlePrevious,
  handleVolume,
  handleShuffle,
  handleRepeat,
  handleDevices,
  handleQueue,
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
    case 'spotify_play':
      return handlePlay(ctx, args);
    case 'spotify_pause':
      return handlePause(ctx);
    case 'spotify_next':
      return handleNext(ctx);
    case 'spotify_previous':
      return handlePrevious(ctx);
    case 'spotify_volume':
      return handleVolume(ctx, args);
    case 'spotify_shuffle':
      return handleShuffle(ctx, args);
    case 'spotify_repeat':
      return handleRepeat(ctx, args);
    case 'spotify_devices':
      return handleDevices(ctx);
    case 'spotify_queue':
      return handleQueue(ctx, args);
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}
