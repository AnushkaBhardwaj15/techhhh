import { describe, expect, it, vi } from 'vitest';
import { cancelOnReducedMotion } from './reducedMotion';

describe('cancelOnReducedMotion', () => {
  it('cancels once when the preference changes to reduce and unsubscribes on cleanup', () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    const addEventListener = vi.fn((_type: string, callback: (event: MediaQueryListEvent) => void) => { listener = callback; });
    const removeEventListener = vi.fn(() => { listener = undefined; });
    const cancel = vi.fn();
    const cleanup = cancelOnReducedMotion({ addEventListener, removeEventListener } as unknown as MediaQueryList, cancel);

    listener?.({ matches: false } as MediaQueryListEvent);
    expect(cancel).not.toHaveBeenCalled();
    listener?.({ matches: true } as MediaQueryListEvent);
    expect(cancel).toHaveBeenCalledOnce();
    cleanup();
    expect(cancel).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('still cancels animation on unmount when matchMedia is unavailable', () => {
    const cancel = vi.fn();
    cancelOnReducedMotion(undefined, cancel)();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
