/**
 * GET /api/jobs/stream
 *
 * SSE stream for real-time background job status updates.
 * Used by the frontend Jobs page to update job cards without polling.
 */
import { listBackgroundJobs } from '../../utils/background-jobs';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const brain = useBrain();
  try {
    await brain.init();
  } catch (err: any) {
    throw createError({ statusCode: 503, message: 'Brain not ready' });
  }

  const eventStream = createEventStream(event);

  // Send initial connection acknowledgement
  await eventStream.push({
    data: JSON.stringify({ type: 'connected', timestamp: Date.now() }),
  });

  // Send current state of all active jobs on connect
  try {
    const active = await listBackgroundJobs();
    if (active.length > 0) {
      await eventStream.push({
        data: JSON.stringify({ type: 'jobs.snapshot', jobs: active }),
      });
    }
  } catch {
    // Non-fatal
  }

  // Forward job lifecycle events (job.running, job.done, job.failed, job.cancelled)
  const sseClient = (data: string) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.source === 'jobs') {
        eventStream
          .push({
            data: JSON.stringify({
              type: parsed.type,
              jobId: parsed.payload?.jobId,
              title: parsed.payload?.title,
              result: parsed.payload?.result,
              error: parsed.payload?.error,
            }),
          })
          .catch(() => {});
      }
    } catch {
      // Ignore malformed events
    }
  };

  brain.events.addSSEClient(sseClient);

  // Keepalive every 5s
  const heartbeat = setInterval(() => {
    eventStream
      .push({ data: JSON.stringify({ type: 'ping', timestamp: Date.now() }) })
      .catch(() => {});
  }, 5_000);

  eventStream.onClosed(() => {
    clearInterval(heartbeat);
    brain.events.removeSSEClient(sseClient);
  });

  return eventStream.send();
});
