/**
 * Composable for real-time Server-Sent Events from the Brain.
 *
 * Connects to /api/brain/events/stream and dispatches events
 * to registered listeners. Auto-reconnects on disconnect.
 *
 * Usage:
 *   const { events, connected } = useEventStream();
 *   watch(events, (ev) => { console.log('New event:', ev); });
 */

export interface BrainEvent {
  source: string;
  type: string;
  payload: unknown;
  timestamp: number;
}

export function useEventStream() {
  const connected = ref(false);
  const lastEvent = ref<BrainEvent | null>(null);
  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (eventSource) return;

    eventSource = new EventSource('/api/brain/events/stream');

    eventSource.onopen = () => {
      connected.value = true;
    };

    eventSource.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'connected') return; // initial handshake
        lastEvent.value = data as BrainEvent;
      } catch {
        // ignore unparseable messages
      }
    };

    eventSource.onerror = () => {
      connected.value = false;
      eventSource?.close();
      eventSource = null;
      // Auto-reconnect after 5s
      reconnectTimer = setTimeout(connect, 5000);
    };
  }

  function disconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    eventSource?.close();
    eventSource = null;
    connected.value = false;
  }

  onMounted(connect);
  onBeforeUnmount(disconnect);

  return { connected, lastEvent };
}
