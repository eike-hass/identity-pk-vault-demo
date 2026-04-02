import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { retryAsync } from "../../lib/retryAsync";

describe("retryAsync", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("resolves immediately on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await retryAsync(fn, { attempts: 3, delayMs: 100 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and resolves on later success", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");
    const p = retryAsync(fn, { attempts: 3, delayMs: 100 });
    await vi.runAllTimersAsync();
    expect(await p).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws lastError after exhausting all attempts", async () => {
    const err = new Error("persistent");
    const fn = vi.fn().mockRejectedValue(err);
    const p = retryAsync(fn, { attempts: 3, delayMs: 100 });
    const assertion = expect(p).rejects.toThrow("persistent");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops early when shouldRetry returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fatal"));
    const p = retryAsync(fn, { attempts: 5, delayMs: 100, shouldRetry: () => false });
    const assertion = expect(p).rejects.toThrow("fatal");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("only retries when shouldRetry returns true for the error", async () => {
    const retryable = new Error("retryable");
    const fatal = new Error("fatal");
    const fn = vi.fn()
      .mockRejectedValueOnce(retryable)
      .mockRejectedValueOnce(fatal);
    const shouldRetry = (err: unknown) => err === retryable;
    const p = retryAsync(fn, { attempts: 5, delayMs: 100, shouldRetry });
    const assertion = expect(p).rejects.toThrow("fatal");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("respects a pre-aborted signal — never calls fn", async () => {
    const ctrl = new AbortController();
    ctrl.abort(new DOMException("aborted", "AbortError"));
    const fn = vi.fn();
    await expect(
      retryAsync(fn, { attempts: 3, delayMs: 100, signal: ctrl.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("aborts during the delay between attempts", async () => {
    const ctrl = new AbortController();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");
    const p = retryAsync(fn, { attempts: 3, delayMs: 1000, signal: ctrl.signal });
    const assertion = expect(p).rejects.toMatchObject({ name: "AbortError" });
    // Let the first attempt run and fail.
    await vi.advanceTimersByTimeAsync(0);
    // Abort while sleeping before the second attempt.
    ctrl.abort(new DOMException("aborted", "AbortError"));
    await vi.runAllTimersAsync();
    await assertion;
    // fn was called once; the second attempt never ran.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("aborts after fn resolves on a later attempt — throws abort reason", async () => {
    const ctrl = new AbortController();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockImplementation(async () => {
        ctrl.abort(new DOMException("aborted", "AbortError"));
        throw new Error("fail again");
      });
    const p = retryAsync(fn, { attempts: 5, delayMs: 0, signal: ctrl.signal });
    const assertion = expect(p).rejects.toMatchObject({ name: "AbortError" });
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("uses the correct delay between retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("x"));
    const p = retryAsync(fn, { attempts: 3, delayMs: 500 });
    const assertion = expect(p).rejects.toThrow("x");

    // After first failure, advances less than delayMs — second attempt not yet started.
    await vi.advanceTimersByTimeAsync(499);
    expect(fn).toHaveBeenCalledTimes(1);

    // Advance past the delay — second attempt fires.
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);

    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("with attempts=1 never retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("once"));
    const p = retryAsync(fn, { attempts: 1, delayMs: 100 });
    const assertion = expect(p).rejects.toThrow("once");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
