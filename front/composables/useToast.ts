/**
 * Composable for showing toast notifications from any component.
 *
 * Usage:
 *   const toast = useToast();
 *   toast('Module installed!', 'success');
 */
export function useToast() {
  const injected =
    inject<
      (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void
    >('toast');

  return (
    injected ||
    ((msg: string) => {
      console.log('[Toast]', msg);
    })
  );
}
