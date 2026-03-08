/**
 * Security Check Plugin — runs at server startup.
 *
 * Verifies that critical environment variables are properly set.
 * Aborts startup with a clear error message if any check fails,
 * preventing a misconfigured instance from going online silently.
 */
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig();
  const sessionPassword: string = (config.session as any)?.password ?? '';

  if (!sessionPassword || sessionPassword.length < 32) {
    console.error(
      '[SECURITY] FATAL: NUXT_SESSION_PASSWORD is not set or is shorter than 32 characters.',
    );
    console.error(
      '[SECURITY] Sessions cannot be signed securely. Set NUXT_SESSION_PASSWORD in your .env file.',
    );
    console.error('[SECURITY] Generate one with: openssl rand -base64 32');
    process.exit(1);
  }

  console.log('[Security] Startup checks passed.');
});
