import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { CopyButton } from "../../components/CopyButton";

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    writable: true,
    configurable: true,
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("CopyButton", () => {
  it("renders a clipboard icon button", () => {
    render(<CopyButton text="hello" />);
    const btn = screen.getByRole("button");
    expect(btn).toBeInTheDocument();
    expect(btn.title).toBe("Copy to clipboard");
  });

  it("calls clipboard.writeText with the provided text on click", async () => {
    render(<CopyButton text="did:iota:testnet:0xabc" />);
    fireEvent.click(screen.getByRole("button"));
    expect(writeText).toHaveBeenCalledWith("did:iota:testnet:0xabc");
  });

  it("shows a checkmark and updates title after a successful copy", async () => {
    render(<CopyButton text="test" />);
    // Wrap in act + flush promises so the .then() setState runs before asserting.
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(screen.getByRole("button").title).toBe("Copied!");
  });

  it("reverts to clipboard icon after 1.5 s", async () => {
    render(<CopyButton text="test" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(screen.getByRole("button").title).toBe("Copied!");
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByRole("button").title).toBe("Copy to clipboard");
  });
});
