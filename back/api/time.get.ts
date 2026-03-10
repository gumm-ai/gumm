export default defineEventHandler(async () => {
  const brain = useBrain();
  await brain.ready();

  const userTimezone = (await brain.getConfig('brain.timezone')) || 'UTC';
  const now = new Date();

  const serverTimeUtc = now.toISOString();
  const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const serverOffset = now.getTimezoneOffset();

  const userTime = new Intl.DateTimeFormat('en-US', {
    timeZone: userTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);

  const userTimeFull = new Intl.DateTimeFormat('en-CA', {
    timeZone: userTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now).replace(',', '');

  return {
    serverTimeUtc,
    serverTimezone,
    serverOffsetMinutes: serverOffset,
    userTimezone,
    userTime,
    userTimeFull,
  };
});
