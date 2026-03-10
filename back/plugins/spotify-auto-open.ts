/**
 * Spotify Auto-Open Plugin
 *
 * Listens for 'spotify:open_app' events and automatically opens Spotify
 * on a connected CLI device so playback can start.
 */
import { createAgentTask, isCliAgentConnected } from '../utils/agent-tasks';

export default defineNitroPlugin(() => {
  const brain = useBrain();

  brain.events.on('open_app', async (event) => {
    const payload = event.payload as { app?: string } | undefined;
    if (payload?.app !== 'spotify') return;

    console.log('[SpotifyAutoOpen] Received open_app event for Spotify');

    if (!isCliAgentConnected()) {
      console.warn('[SpotifyAutoOpen] No CLI agent connected, cannot open Spotify');
      return;
    }

    try {
      await createAgentTask({
        prompt: 'Open the Spotify application on this computer. Use the open_application tool with app name "Spotify". Do NOT play any music — just open the app so it registers as an available device.',
        channel: 'web',
      });
      console.log('[SpotifyAutoOpen] Created CLI task to open Spotify');
    } catch (err: any) {
      console.error('[SpotifyAutoOpen] Failed to create CLI task:', err.message);
    }
  });

  console.log('[SpotifyAutoOpen] Plugin loaded');
});
