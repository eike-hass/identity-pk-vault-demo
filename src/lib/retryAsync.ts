/** Resolves after `ms` milliseconds, aborting early if the signal fires. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const id = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(id); reject(signal.reason); }, { once: true });
  });
}

/**
 * Retries an async operation up to `attempts` times, waiting `delayMs`
 * between each attempt. Only retries when `shouldRetry` returns true for
 * the thrown error (defaults to always retry). Aborts immediately if the
 * optional `signal` is triggered.
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  options: {
    attempts: number;
    delayMs: number;
    shouldRetry?: (err: unknown) => boolean;
    signal?: AbortSignal;
  },
): Promise<T> {
  const { attempts, delayMs, shouldRetry = () => true, signal } = options;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal?.aborted) throw signal.reason;
    try {
      return await fn();
    } catch (err) {
      if (signal?.aborted) throw signal.reason;
      lastError = err;
      if (attempt < attempts && shouldRetry(err)) {
        await sleep(delayMs, signal);
        continue;
      }
      break;
    }
  }
  throw lastError;
}
