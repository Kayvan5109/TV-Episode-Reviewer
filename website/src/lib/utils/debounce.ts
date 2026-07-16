/**
 * Small, framework-agnostic debounce helper. Pulled out of `ShowSearchForm` so the timing logic
 * is unit-testable on its own (with `vi.useFakeTimers()`) without needing a DOM/React rendering
 * environment — this repo's Vitest config runs in the `node` environment with no React Testing
 * Library, so component-level interaction tests aren't practical here; this keeps the
 * time-sensitive part isolated and covered instead.
 *
 * Returns a wrapped function that only invokes `fn` after `delayMs` has elapsed since the *last*
 * call — every call within the window resets the timer, so a burst of calls (e.g. every keystroke)
 * collapses into a single trailing invocation with the latest arguments. `.cancel()` clears any
 * pending invocation (used on unmount / when the search query goes empty).
 */
export interface Debounced<Args extends unknown[]> {
  (...args: Args): void;
  cancel(): void;
}

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number
): Debounced<Args> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const debounced = ((...args: Args) => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      fn(...args);
    }, delayMs);
  }) as Debounced<Args>;

  debounced.cancel = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  return debounced;
}
