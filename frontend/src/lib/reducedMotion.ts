export function cancelOnReducedMotion(preference: MediaQueryList | undefined, cancel: () => void) {
  let active = true;
  const cancelOnce = () => {
    if (!active) return;
    active = false;
    cancel();
  };
  const onChange = (event: MediaQueryListEvent) => {
    if (event.matches) {
      preference?.removeEventListener('change', onChange);
      cancelOnce();
    }
  };

  preference?.addEventListener('change', onChange);
  return () => {
    preference?.removeEventListener('change', onChange);
    cancelOnce();
  };
}
