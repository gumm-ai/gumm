import type { ModuleContext } from '../../../../back/utils/brain';
import { spotifyFetch } from '../utils';

/**
 * Resolve a device ID to use for playback.
 * Retries up to maxAttempts times (2s apart) so Spotify has time to
 * register after being freshly launched.
 * Emits an event to open Spotify app if no devices found on first attempt.
 */
async function resolveDeviceId(
  ctx: ModuleContext,
  preferredDeviceId?: string,
  maxAttempts = 5,
): Promise<string | null> {
  let requestedOpen = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 2000));
    }
    const data = await spotifyFetch(ctx, '/me/player/devices');
    const devices: any[] = data?.devices ?? [];

    // No devices found — request to open Spotify app on first attempt
    if (devices.length === 0) {
      if (!requestedOpen) {
        ctx.log.info('No Spotify device found, requesting app open...');
        await ctx.events.emit('open_app', { app: 'spotify' });
        requestedOpen = true;
      }
      continue;
    }

    // 1. Use explicitly requested device
    if (preferredDeviceId) {
      const found = devices.find((d) => d.id === preferredDeviceId);
      if (found) return found.id;
    }

    // 2. Currently active device
    const active = devices.find((d) => d.is_active);
    if (active) return active.id;

    // 3. First Computer/Smartphone device (i.e. the app that was just opened)
    const computer = devices.find((d) =>
      ['Computer', 'Smartphone'].includes(d.type),
    );
    if (computer) return computer.id;

    // 4. Any device
    return devices[0].id;
  }
  return null;
}

/**
 * Start or resume playback. Can play a specific URI or resume current track.
 * Automatically waits for a device to become available (e.g. after Spotify just opened).
 */
export async function handlePlay(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const { uri, deviceId: requestedDeviceId } = args;

  // Resolve device — retry loop handles the case where Spotify just launched
  const deviceId = await resolveDeviceId(ctx, requestedDeviceId);
  if (!deviceId) {
    return JSON.stringify({
      status: 'error',
      message:
        'No Spotify device found. Make sure the Spotify app is open and try again.',
    });
  }

  const query = `?device_id=${deviceId}`;
  const body: Record<string, any> = {};

  if (uri) {
    // Determine if this is a track URI or a context URI (album/playlist/artist)
    if (uri.startsWith('spotify:track:')) {
      body.uris = [uri];
    } else {
      body.context_uri = uri;
    }
  }

  await spotifyFetch(ctx, `/me/player/play${query}`, {
    method: 'PUT',
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });

  return JSON.stringify({
    status: 'playing',
    message: uri ? `Now playing: ${uri}` : 'Playback resumed.',
  });
}

/**
 * Pause playback
 */
export async function handlePause(ctx: ModuleContext): Promise<string> {
  await spotifyFetch(ctx, '/me/player/pause', { method: 'PUT' });
  return JSON.stringify({ status: 'paused', message: 'Playback paused.' });
}

/**
 * Skip to next track
 */
export async function handleNext(ctx: ModuleContext): Promise<string> {
  await spotifyFetch(ctx, '/me/player/next', { method: 'POST' });
  return JSON.stringify({
    status: 'skipped',
    message: 'Skipped to next track.',
  });
}

/**
 * Go back to previous track
 */
export async function handlePrevious(ctx: ModuleContext): Promise<string> {
  await spotifyFetch(ctx, '/me/player/previous', { method: 'POST' });
  return JSON.stringify({
    status: 'previous',
    message: 'Went back to previous track.',
  });
}

/**
 * Set volume (0-100)
 */
export async function handleVolume(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const volume = Math.max(0, Math.min(100, Math.round(args.volume)));
  await spotifyFetch(ctx, `/me/player/volume?volume_percent=${volume}`, {
    method: 'PUT',
  });
  return JSON.stringify({
    status: 'ok',
    volume,
    message: `Volume set to ${volume}%.`,
  });
}

/**
 * Toggle shuffle mode
 */
export async function handleShuffle(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const state = !!args.state;
  await spotifyFetch(ctx, `/me/player/shuffle?state=${state}`, {
    method: 'PUT',
  });
  return JSON.stringify({
    status: 'ok',
    shuffle: state,
    message: `Shuffle ${state ? 'enabled' : 'disabled'}.`,
  });
}

/**
 * Set repeat mode: off, track, or context
 */
export async function handleRepeat(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const state = args.state || 'off';
  await spotifyFetch(ctx, `/me/player/repeat?state=${state}`, {
    method: 'PUT',
  });
  return JSON.stringify({
    status: 'ok',
    repeat: state,
    message: `Repeat set to ${state}.`,
  });
}

/**
 * List available playback devices
 */
export async function handleDevices(ctx: ModuleContext): Promise<string> {
  const data = await spotifyFetch(ctx, '/me/player/devices');
  const devices = (data?.devices || []).map((d: any) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    isActive: d.is_active,
    volume: d.volume_percent,
  }));
  return JSON.stringify({ devices });
}

/**
 * Add a track to playback queue
 */
export async function handleQueue(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const { uri } = args;
  await spotifyFetch(ctx, `/me/player/queue?uri=${encodeURIComponent(uri)}`, {
    method: 'POST',
  });
  return JSON.stringify({
    status: 'queued',
    message: `Added ${uri} to queue.`,
  });
}
