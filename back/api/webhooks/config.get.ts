/**
 * GET /api/webhooks/config
 *
 * Returns webhook configuration info for the dashboard.
 */

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const brain = useBrain();
  await brain.ready();

  const hasSecret = !!(await brain.getConfig('webhooks.secret'));

  return {
    enabled: true,
    baseUrl: '/api/webhooks/',
    hasSecret,
    examples: [
      {
        name: 'n8n',
        url: '/api/webhooks/n8n',
        description: 'n8n workflow triggers',
      },
      {
        name: 'Custom',
        url: '/api/webhooks/custom/your-name',
        description: 'Custom automation endpoint',
      },
      {
        name: 'Notify',
        url: '/api/webhooks/notify',
        description: 'Generic notifications',
      },
    ],
    authentication: hasSecret
      ? 'Add X-Webhook-Secret header or ?secret= query param'
      : 'No authentication configured (set webhooks.secret in brain config)',
  };
});
