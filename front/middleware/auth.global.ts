/**
 * Auth middleware — redirects unauthenticated users to /login.
 * On first launch, redirects everyone to /setup.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // Allow the setup page to always be accessible
  if (to.path === '/setup') return;

  // Check if first-launch setup is needed (cached per session)
  const setupChecked = useState<boolean | null>('setup-checked', () => null);
  if (setupChecked.value === null) {
    try {
      const { needsSetup } = await $fetch<{ needsSetup: boolean }>(
        '/api/setup/status',
      );
      setupChecked.value = !needsSetup;
    } catch {
      setupChecked.value = false; // assume setup needed on error
    }
  }
  if (!setupChecked.value) {
    return navigateTo('/setup');
  }

  const { loggedIn } = useUserSession();

  if (!loggedIn.value && to.path !== '/login') {
    return navigateTo('/login');
  }

  if (loggedIn.value && to.path === '/login') {
    return navigateTo('/');
  }
});
